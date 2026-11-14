// Nuvem: base colaborativa de preços via Supabase (REST + RLS).
//
// O que torna "automático" (escolha do usuário, v0.4.0):
//   1) quem REGISTRA um preço → o registro entra numa fila local e é enviado
//      para a base compartilhada (mesmo offline: a fila espera a rede);
//   2) quem BUSCA → baixa a base compartilhada no boot e mescla com a local.
//
// Segredos: só `VITE_*` (público por design, vai no bundle) — a proteção de
// verdade é a RLS do banco (função `registrar_preco` com validação + limite
// diário por aparelho). Ver `supabase/schema.sql` e manual 05.
//
// Sem .env configurado, tudo isto é silenciosamente DESLIGADO: app 100% local.

import type { Preco } from '../types'
import { carregarPrecos } from './api'
import { dataIso, dataIsoValida, normalizarNome } from './format'

// Vite substitui no build (define); fora do build (testes) o typeof segura.
declare const __NUVEM_URL__: string
declare const __NUVEM_ANON__: string

const CHAVE_DISPOSITIVO = 'supermercado:dispositivo:v1'
const CHAVE_FILA = 'supermercado:filaenvio:v1'
const CHAVE_CACHE = 'supermercado:precosnuvem:v1'

/** Máximo de envios pendentes (fila nunca estoura o localStorage). */
const LIMITE_FILA = 200
/** Cache baixado vale por quanto tempo antes de rebaixar no próximo boot. */
const IDADE_CACHE_MS = 7 * 24 * 60 * 60 * 1000

function envUrl(): string {
  return typeof __NUVEM_URL__ === 'string' ? __NUVEM_URL__ : ''
}
function envAnon(): string {
  return typeof __NUVEM_ANON__ === 'string' ? __NUVEM_ANON__ : ''
}

/** A nuvem está configurada (.env + build)? Se não, nada aqui roda. */
export function nuvemConfigurada(): boolean {
  return Boolean(envUrl() && envAnon())
}

function lerJson<T>(chave: string, padrao: T): T {
  try {
    const bruto = localStorage.getItem(chave)
    if (!bruto) return padrao
    return JSON.parse(bruto) as T
  } catch {
    return padrao
  }
}

function gravarJson(chave: string, valor: unknown): void {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch (erro) {
    console.error('Falha ao gravar na nuvem (localStorage)', erro)
  }
}

// ------------------------------------------------------------ dispositivo

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Fallback em contexto inseguro (http em LAN): UUID v4 manual.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Id anônimo e estável deste aparelho (sem login, sem e-mail).
 * Devolve null só se o armazenamento estiver indisponível — nesse caso não
 * enviamos (o servidor exige um id para o limite diário por aparelho).
 */
export function dispositivoId(): string | null {
  try {
    let id = localStorage.getItem(CHAVE_DISPOSITIVO)
    if (!id) {
      id = uuidv4()
      localStorage.setItem(CHAVE_DISPOSITIVO, id)
    }
    return id
  } catch {
    return null
  }
}

// --------------------------------------------------------------- validação

/** Um preço a enviar para a base compartilhada. */
export interface Envio {
  qid: string
  produto: string
  produtoNorm: string
  loja: string
  lojaNorm: string
  valor: number
  /** Marca quando quem registrou soube informar (opcional). */
  marca?: string
  /** Validade da promoção 🔥 (ISO yyyy-mm-dd, opcional). */
  validade?: string
  cidade?: string
  cidadeNorm?: string
  uf?: string
  adicionadoEm: number
}

/** Máximo de caracteres na marca (evita lixo gigante na base). */
const LIMITE_MARCA = 60

/**
 * Espelho cliente das regras do banco. Devolve a mensagem de erro ou null.
 * Mesmo errando por aqui, o servidor valida de novo (a regra mora no banco).
 */
export function validarEnvio(e: Omit<Envio, 'qid' | 'adicionadoEm'>): string | null {
  if (!e.produto.trim() || normalizarNome(e.produto).length < 3) return 'produto muito curto'
  if (!e.loja.trim() || normalizarNome(e.loja).length < 2) return 'loja inválida'
  if (!Number.isFinite(e.valor) || e.valor <= 0 || e.valor > 100000) return 'valor implausível'
  if (e.marca !== undefined) {
    if (typeof e.marca !== 'string') return 'marca inválida'
    if (e.marca.trim().length > LIMITE_MARCA) return 'marca longa demais'
  }
  if (e.validade !== undefined) {
    // Espelho da regra do banco: data ISO real, não passada e máx 90 dias.
    if (!dataIsoValida(e.validade)) return 'validade inválida'
    if (e.validade < dataIso()) return 'validade já passou'
    if (e.validade > dataIso(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)))
      return 'validade longa demais (máx 90 dias)'
  }
  if (e.cidade !== undefined && typeof e.cidade !== 'string') return 'cidade inválida'
  return null
}

// ------------------------------------------------------------------- fila

function lerFila(): Envio[] {
  const fila = lerJson<Envio[]>(CHAVE_FILA, [])
  return Array.isArray(fila) ? fila.filter((e) => e && typeof e.produto === 'string') : []
}

/**
 * Enfileira um registro para envio automático. Valida antes; cap a 200
 * entradas (descarta a mais antiga). false = recusado (não enche a fila).
 */
export function enfileirar(dados: Omit<Envio, 'qid' | 'adicionadoEm'>): boolean {
  if (validarEnvio(dados)) return false
  const fila = lerFila()
  const envio: Envio = { ...dados, qid: uuidv4(), adicionadoEm: Date.now() }
  fila.push(envio)
  while (fila.length > LIMITE_FILA) {
    fila.shift()
    console.warn('Fila de envio cheia: descartado o registro mais antigo')
  }
  gravarJson(CHAVE_FILA, fila)
  return true
}

/** Quantos envios estão esperando rede/servidor. */
export function filaPendente(): number {
  return lerFila().length
}

let processando = false

/**
 * Envia a fila na ordem, um a um. Para na PRIMEIRA falha transitória e
 * mantém o restante (offline → tenta no próximo boot/online).
 * Rejeição de validação do servidor (400/422) é descartada — reenviar não resolve.
 * Devolve quantos foram aceitos.
 */
export async function processarFila(): Promise<number> {
  if (processando || !nuvemConfigurada()) return 0
  processando = true
  let enviados = 0
  try {
    const dispositivo = dispositivoId()
    if (!dispositivo) return 0
    for (;;) {
      const fila = lerFila()
      if (!fila.length) break
      const envio = fila[0]
      let acao: 'remover' | 'parar' = 'parar'
      try {
        const r = await fetch(`${envUrl()}/rest/v1/rpc/registrar_preco`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: envAnon(),
            Authorization: `Bearer ${envAnon()}`,
          },
          body: JSON.stringify({
            p_produto: envio.produto,
            p_produto_norm: envio.produtoNorm,
            p_loja: envio.loja,
            p_loja_norm: envio.lojaNorm,
            p_valor: envio.valor,
            p_marca: envio.marca ?? null,
            p_validade: envio.validade ?? null,
            p_cidade: envio.cidade ?? null,
            p_cidade_norm: envio.cidadeNorm ?? '',
            p_uf: envio.uf ?? null,
            p_dispositivo: dispositivo,
          }),
        })
        if (r.ok) {
          acao = 'remover'
          enviados++
        } else if (r.status === 400 || r.status === 422) {
          // Servidor rejeitou de vez (validação) — reenviar nunca vai passar.
          console.warn(`Envio recusado pelo servidor (${r.status}), descartado:`, envio.produto)
          acao = 'remover'
        } else {
          // 401/403/404 (schema não rodou)/429/5xx → tenta depois.
          console.warn(`Nuvem indisponível (${r.status}) — envio fica na fila.`)
        }
      } catch {
        // Sem rede: mantém e tenta na próxima sincronização.
      }
      if (acao === 'remover') {
        // Re-lê antes de gravar: um envio novo pode ter entrado nesse meio-tempo.
        gravarJson(CHAVE_FILA, lerFila().filter((e) => e.qid !== envio.qid))
      } else {
        break
      }
    }
  } finally {
    processando = false
  }
  return enviados
}

// ---------------------------------------------------------------- download

/** Conversão pura das linhas do Supabase em Preco — testada com fixture. */
export function linhasParaPrecos(bruto: unknown): Preco[] {
  if (!Array.isArray(bruto)) return []
  const out: Preco[] = []
  for (const r of bruto as Array<Record<string, unknown>>) {
    const produto = typeof r.produto === 'string' ? r.produto.trim() : ''
    const loja = typeof r.loja === 'string' ? r.loja.trim() : ''
    const valor = typeof r.valor === 'number' ? r.valor : Number(r.valor)
    const ts = Date.parse(typeof r.atualizado_em === 'string' ? r.atualizado_em : '')
    if (!produto || !loja || !Number.isFinite(valor) || valor <= 0 || !Number.isFinite(ts)) continue
    out.push({
      id: typeof r.id === 'string' ? r.id : `${produto}|${loja}`,
      produto,
      loja,
      valor,
      marca: typeof r.marca === 'string' && r.marca.trim() ? r.marca.trim() : undefined,
      validade: dataIsoValida(r.validade) ? r.validade : undefined,
      cidade: typeof r.cidade === 'string' && r.cidade ? r.cidade : undefined,
      uf: typeof r.uf === 'string' && r.uf ? r.uf : undefined,
      registradoPor: 'comunidade',
      fonte: 'comunidade',
      atualizadoEm: ts,
    })
  }
  return out
}

interface CacheNuvem {
  em: number
  itens: Preco[]
}

/** Cache local da base compartilhada (o app lê daqui — funciona offline). */
export function carregarCompartilhados(): Preco[] {
  const cache = lerJson<CacheNuvem>(CHAVE_CACHE, { em: 0, itens: [] })
  return Array.isArray(cache.itens) ? cache.itens : []
}

/**
 * Baixa a base compartilhada (preços atualizados nos últimos 90 dias) e grava
 * o cache. Nunca apaga cache bom por uma resposta vazia/errada (lição manual).
 */
export async function baixarPrecos(): Promise<Preco[] | null> {
  if (!nuvemConfigurada()) return null
  const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  try {
    const url =
      `${envUrl()}/rest/v1/precos?select=id,produto,loja,valor,marca,validade,cidade,uf,atualizado_em` +
      `&atualizado_em=gt.${desde}&order=atualizado_em.desc&limit=1000`
    const r = await fetch(url, {
      headers: { apikey: envAnon(), Authorization: `Bearer ${envAnon()}` },
    })
    if (!r.ok) {
      console.warn(`Nuvem: download falhou (${r.status}) — mantendo cache atual.`)
      return null
    }
    const linhas = await r.json()
    const itens = linhasParaPrecos(linhas)
    const atual = carregarCompartilhados()
    if (!itens.length && atual.length) return atual // vazio ≠ apague tudo
    gravarJson(CHAVE_CACHE, { em: Date.now(), itens })
    return itens
  } catch {
    return null
  }
}

/** O cache está velho (ou nunca baixou)? */
export function cacheDesatualizado(): boolean {
  const cache = lerJson<CacheNuvem>(CHAVE_CACHE, { em: 0, itens: [] })
  return Date.now() - (cache.em ?? 0) > IDADE_CACHE_MS
}

// ------------------------------------------------------------------- merge

/**
 * Junta base local + compartilhada, UMA entrada por produto+loja:
 *   1) registro da SUA cidade vence (preço de perto importa mais);
 *   2) senão, o mais recente;
 *   3) empate → o local (você confia mais no que viu).
 * Nunca perde um registro que só existe num dos lados.
 */
export function mesclarPrecos(local: Preco[], remotos: Preco[], cidadeAtual?: string): Preco[] {
  interface Candidato {
    p: Preco
    local: boolean
    mesmaCidade: boolean
  }
  const grupos = new Map<string, Candidato[]>()
  // Chave inclui a MARCA (mesma lógica do registro local): marcas diferentes
  // do mesmo produto na mesma loja são preços distintos.
  const chave = (p: Preco) =>
    `${normalizarNome(p.produto)}|${normalizarNome(p.loja)}|${p.marca ? normalizarNome(p.marca) : ''}`
  const cidadeNorm = cidadeAtual ? normalizarNome(cidadeAtual) : ''

  const add = (p: Preco, eLocal: boolean) => {
    const mesmaCidade = Boolean(cidadeNorm && p.cidade && normalizarNome(p.cidade) === cidadeNorm)
    const k = chave(p)
    const lista = grupos.get(k) ?? []
    lista.push({ p, local: eLocal, mesmaCidade })
    grupos.set(k, lista)
  }
  for (const p of local) add(p, true)
  for (const p of remotos) add(p, false)

  const vencedor = (atual: Candidato, o: Candidato): Candidato => {
    if (o.mesmaCidade !== atual.mesmaCidade) return o.mesmaCidade ? o : atual
    if (o.p.atualizadoEm !== atual.p.atualizadoEm) return o.p.atualizadoEm > atual.p.atualizadoEm ? o : atual
    if (o.local !== atual.local) return o.local ? o : atual
    return atual
  }

  const out: Preco[] = []
  for (const lista of grupos.values()) {
    let melhor = lista[0]
    for (let i = 1; i < lista.length; i++) melhor = vencedor(melhor, lista[i])
    out.push(melhor.p)
  }
  return out
}

/** Base completa para busca/comparação: local + cache da nuvem. */
export function baseCompleta(cidadeAtual?: string): Preco[] {
  return mesclarPrecos(carregarPrecos(), carregarCompartilhados(), cidadeAtual)
}

// ------------------------------------------------------- sincronização

/** Aviso para as telas relerem a base (evento de browser; sem-op fora dele). */
export const EVENTO_NUVEM = 'supermercado:nuvem'

/**
 * Boot/rede: envia o que acumulou E baixa o que a comunidade registrou.
 * Silenciosa — nunca trava a UI (falha = fica para a próxima).
 */
export async function sincronizarNuvem(): Promise<void> {
  if (!nuvemConfigurada()) return
  await processarFila()
  const baixados = await baixarPrecos()
  if (baixados && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENTO_NUVEM))
  }
}
