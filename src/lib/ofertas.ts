// Ofertas ativas na WEB (Google Shopping) via Edge Function `promocoes`.
//
// Fluxo (v0.6): app → Edge Function no Supabase (com apikey) → SerpAPI →
// cache 72 h lá → JSON aqui. A chave da API NUNCA passa por este arquivo.
//
// Regras de sobrevivência: falhou (sem chave, cota, rede) → devolve motivo e
// a tela simplesmente NÃO mostra a seção — a base colaborativa + comparadores
// continuam valendo. Nunca lança exceção pra cima.

import { normalizarNome } from './format'
import { nuvemConfigurada } from './nuvem'

export interface Oferta {
  titulo: string
  valor?: number
  loja: string
  link: string
  thumb?: string
}

/** Por que não há ofertas (para a UI decidir se mostra algo ou fica quieta). */
export type MotivoOferta = 'sem-nuvem' | 'sem-chave' | 'limite' | 'erro'

export interface ResultadoOfertas {
  termo: string
  itens: Oferta[]
  motivo?: MotivoOferta
  doCache: boolean
}

const CHAVE_CACHE = 'supermercado:ofertas:v1'
/** Cache local por quanto tempo (a resposta do servidor já vem com 72 h). */
const IDADE_CACHE_MS = 24 * 60 * 60 * 1000
/** Teto de itens exibidos. */
const LIMITE = 8

/**
 * Parse puro da resposta — aceita o formato da Edge Function (`{ itens }`)
 * ou o cru do SerpAPI (`shopping_results`) para não depender de um formato só.
 * Testado com fixture.
 */
export function parseOfertas(bruto: unknown): Oferta[] {
  const corpo = bruto as { itens?: unknown; shopping_results?: unknown } | null
  const lista = Array.isArray(corpo?.itens)
    ? corpo?.itens
    : Array.isArray(corpo?.shopping_results)
      ? corpo?.shopping_results
      : []
  const out: Oferta[] = []
  for (const x of lista as Array<Record<string, unknown>>) {
    const titulo = typeof x.titulo === 'string' ? x.titulo : typeof x.title === 'string' ? x.title : ''
    const loja = typeof x.loja === 'string' && x.loja ? x.loja : typeof x.source === 'string' ? x.source : ''
    const link = typeof x.link === 'string' ? x.link : ''
    const valorBruto = x.valor ?? x.extracted_price ?? x.price
    const valor = typeof valorBruto === 'number' && Number.isFinite(valorBruto) ? valorBruto : undefined
    if (!titulo || !loja) continue
    out.push({
      titulo,
      valor,
      loja,
      link,
      thumb: typeof x.thumb === 'string' ? x.thumb : typeof x.thumbnail === 'string' ? x.thumbnail : undefined,
    })
    if (out.length >= LIMITE) break
  }
  return out
}

// ------------------------------------------------------------------ cache

interface CacheOfertas {
  [termoNorm: string]: { em: number; itens: Oferta[] }
}

function lerCache(): CacheOfertas {
  try {
    const bruto = localStorage.getItem(CHAVE_CACHE)
    const obj = bruto ? (JSON.parse(bruto) as CacheOfertas) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

/** Ofertas em cache do termo, se ainda frescas. Pura no tempo (teste injeta `agora`). */
export function cacheDeOfertas(termo: string, agora: number = Date.now()): Oferta[] | null {
  const entrada = lerCache()[normalizarNome(termo)]
  if (!entrada || !Array.isArray(entrada.itens)) return null
  if (agora - (entrada.em ?? 0) > IDADE_CACHE_MS) return null
  return entrada.itens
}

export function gravarCacheOfertas(termo: string, itens: Oferta[]): void {
  try {
    const cache = lerCache()
    cache[normalizarNome(termo)] = { em: Date.now(), itens }
    localStorage.setItem(CHAVE_CACHE, JSON.stringify(cache))
  } catch {
    /* quota cheia: só não guarda — a próxima busca refaz */
  }
}

// ------------------------------------------------------------------ busca

/**
 * Busca ofertas do termo na Edge Function (com cache local de 24 h).
 * Não lança: qualquer problema vira `motivo` para a tela decidir.
 */
export async function buscarOfertas(termo: string, timeoutMs = 9000): Promise<ResultadoOfertas> {
  const t = termo.trim()
  if (t.length < 3) return { termo: t, itens: [], motivo: 'erro', doCache: false }
  if (!nuvemConfigurada()) return { termo: t, itens: [], motivo: 'sem-nuvem', doCache: false }

  const gelado = cacheDeOfertas(t)
  if (gelado) return { termo: t, itens: gelado, doCache: true }

  const envUrl = typeof __NUVEM_URL__ === 'string' ? __NUVEM_URL__ : ''
  const anon = typeof __NUVEM_ANON__ === 'string' ? __NUVEM_ANON__ : ''
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(`${envUrl}/functions/v1/promocoes?q=${encodeURIComponent(t)}`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      signal: ctrl.signal,
    })
    if (r.status === 429) return { termo: t, itens: [], motivo: 'limite', doCache: false }
    if (r.status === 503) return { termo: t, itens: [], motivo: 'sem-chave', doCache: false }
    if (!r.ok) return { termo: t, itens: [], motivo: 'erro', doCache: false }
    const itens = parseOfertas(await r.json())
    if (itens.length) gravarCacheOfertas(t, itens)
    return { termo: t, itens, doCache: false }
  } catch {
    return { termo: t, itens: [], motivo: 'erro', doCache: false }
  } finally {
    clearTimeout(timer)
  }
}

declare const __NUVEM_URL__: string
declare const __NUVEM_ANON__: string
