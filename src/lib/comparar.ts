// Busca de preço: base própria (colaborativa) + comparação em um toque.
//
// Honestidade por design (testado em 13/11/2026):
// - iFood/99 NÃO têm API pública de preços nem URL de busca → abrimos o site
//   e copiamos o nome do produto para o usuário colar lá;
// - Mercado Livre API bloqueou busca anônima (403) → tentamos do navegador
//   com timeout e caímos para os links se falhar;
// - Google Shopping/Buscapé/Zoom não têm API grátis → abrimos a busca pronta.

import type { Preco } from '../types'
import { carregarPrecos, salvarPrecos } from './api'
import { dataIso, dataIsoValida, normalizarNome } from './format'
import { enfileirar, nuvemConfigurada, processarFila } from './nuvem'

export interface Destino {
  id: string
  nome: string
  icone: string
  url: string
  tipo: 'comparador' | 'entrega'
}

export interface PrecoML {
  titulo: string
  preco: number
  moeda: string
  usado: boolean
  url: string
}

const q = (texto: string) => encodeURIComponent(texto.trim())

/** Onde ver VALORES já na hora (comparam preço de verdade). */
export function destinosDeComparacao(nome: string): Destino[] {
  const termo = q(nome)
  return [
    { id: 'gshopping', nome: 'Google Shopping', icone: '🛒', url: `https://www.google.com/search?tbm=shop&q=${termo}`, tipo: 'comparador' },
    { id: 'mercadolivre', nome: 'Mercado Livre', icone: '💛', url: `https://lista.mercadolivre.com.br/${termo}`, tipo: 'comparador' },
    { id: 'buscape', nome: 'Buscapé', icone: '🔎', url: `https://www.buscape.com.br/search?q=${termo}`, tipo: 'comparador' },
    { id: 'zoom', nome: 'Zoom', icone: '🔍', url: `https://www.zoom.com.br/search?q=${termo}`, tipo: 'comparador' },
  ]
}

/**
 * Aplicativos de entrega — não existe busca pública, então o app abre o site
 * e copia o nome do produto para colar. O preço visto lá vira registro na
 * base (fluxo "registrar o que vi"), é ele que passa a informar o valor.
 */
export function destinosDeEntrega(nome: string): Destino[] {
  void nome // o termo é copiado para a área de transferência na hora de abrir
  return [
    { id: 'ifood', nome: 'iFood', icone: '❤️', url: 'https://www.ifood.com.br/', tipo: 'entrega' },
    { id: '99compras', nome: '99Compras', icone: '🟩', url: 'https://99app.com/99compras/', tipo: 'entrega' },
    { id: 'rappi', nome: 'Rappi', icone: '💜', url: 'https://www.rappi.com.br/', tipo: 'entrega' },
  ]
}

// ------------------------------------------------- base própria (colaborativa)

/**
 * Quão parecido está o nome com um item da base. 0 = nada a ver;
 * >= 0.5 (metade dos termos batem) já serve como sugestão honesta.
 */
export function pontuarComparacao(busca: string, candidato: string): number {
  const alvo = normalizarNome(busca)
  const alheio = normalizarNome(candidato)
  if (!alvo || !alheio) return 0
  if (alheio.includes(alvo) || alvo.includes(alheio)) return 1
  const termos = alvo.split(' ').filter((t) => t.length > 1)
  if (!termos.length) return 0
  const batem = termos.filter((t) => alheio.includes(t)).length
  return batem / termos.length
}

/** Registros da base parecidos com o produto, melhor primeiro.
 *
 * Ordem (v0.5): relevância do nome → **marca pedida em destaque** → MENOR preço
 * (o "melhor preço" vem primeiro) → mais recente. Passando `marca`, quem bate
 * com ela ganha o desempate — mas os outros continuam aparecendo (escolha do
 * usuário: destacar, não filtrar).
 */
export function combinarPrecos(
  nome: string,
  base: Preco[] = carregarPrecos(),
  marca?: string,
): Preco[] {
  const marcaNorm = marca?.trim() ? normalizarNome(marca) : ''
  const bateMarca = (p: Preco) =>
    Boolean(marcaNorm && p.marca && normalizarNome(p.marca) === marcaNorm)
  return base
    .map((p) => ({ p, nota: pontuarComparacao(nome, p.produto) }))
    .filter((x) => x.nota >= 0.5)
    .sort(
      (a, b) =>
        b.nota - a.nota ||
        Number(bateMarca(b.p)) - Number(bateMarca(a.p)) ||
        a.p.valor - b.p.valor ||
        b.p.atualizadoEm - a.p.atualizadoEm,
    )
    .map((x) => x.p)
}

/**
 * A promoção ainda está ATIVA hoje? (validade preenchida e ainda não passou).
 * Pura e comparável em teste: passa `hoje` para simular vencimento.
 * A data de HOJE conta como ativa (último dia de oferta é dia de oferta).
 */
export function promocaoAtiva(p: Preco, hoje: string = dataIso(new Date())): boolean {
  return Boolean(dataIsoValida(p.validade) && (p.validade as string) >= hoje)
}

/**
 * Registra um preço que o usuário viu (no iFood, no mercado, em qualquer app).
 * Grava local na hora; se a nuvem estiver configurada, entra NA FILA de envio
 * automático para a base compartilhada (offline? espera a rede — nada se perde).
 * Com `validade`, o registro vira promoção 🔥 ativa até aquela data.
 */
export function registrarPreco(dados: Omit<Preco, 'id' | 'atualizadoEm'>): Preco {
  const base = carregarPrecos()
  // Chave = produto + loja + MARCA: "Café Pilão no Assaí" e "Café 3 Corações
  // no Assaí" são preços DIFERENTes e não podem se sobrescrever.
  const chave = (p: { produto: string; loja: string; marca?: string }) =>
    `${normalizarNome(p.produto)}|${normalizarNome(p.loja)}|${p.marca ? normalizarNome(p.marca) : ''}`
  const existente = base.find((p) => chave(p) === chave(dados))
  const novo: Preco = {
    ...dados,
    id: existente?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    atualizadoEm: Date.now(),
    fonte: 'proprio',
    // Só guarda validade que passa nas regras do banco (ISO, não passada,
    // ≤90 dias) — fora disso vira "preço normal" e o envio NÃO é recusado.
    validade:
      dataIsoValida(dados.validade) &&
      (dados.validade as string) >= dataIso() &&
      (dados.validade as string) <= dataIso(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000))
        ? dados.validade
        : undefined,
  }
  const restantes = base.filter((p) => chave(p) !== chave(novo))
  restantes.push(novo)
  salvarPrecos(restantes)

  // Compartilhamento P2P (v0.4): local primeiro, nuvem em segundo plano.
  enfileirar({
    produto: novo.produto,
    produtoNorm: normalizarNome(novo.produto),
    loja: novo.loja,
    lojaNorm: normalizarNome(novo.loja),
    valor: novo.valor,
    marca: novo.marca,
    validade: novo.validade,
    cidade: novo.cidade,
    cidadeNorm: novo.cidade ? normalizarNome(novo.cidade) : '',
    uf: novo.uf,
  })
  if (nuvemConfigurada()) void processarFila()

  return novo
}

// ------------------------------------------------------- Mercado Livre (tentativa)

/** Parse puro da resposta do ML — testado com fixture. */
export function parseML(bruto: unknown): PrecoML[] {
  const corpo = bruto as { results?: unknown } | null
  const lista = corpo?.results
  if (!Array.isArray(lista)) return []
  const out: PrecoML[] = []
  for (const r of lista as Array<Record<string, unknown>>) {
    const titulo = typeof r.title === 'string' ? r.title : ''
    const preco = typeof r.price === 'number' ? r.price : NaN
    if (!titulo || !Number.isFinite(preco)) continue
    out.push({
      titulo,
      preco,
      moeda: typeof r.currency_id === 'string' ? r.currency_id : 'BRL',
      usado: r.condition === 'used',
      url: typeof r.permalink === 'string' ? r.permalink : 'https://lista.mercadolivre.com.br/',
    })
  }
  return out.slice(0, 5)
}

/**
 * Tenta preços reais do Mercado Livre direto do navegador.
 * Se a API recusar (403/anon) ou demorar, devolve null — quem chama mostra
 * os links de comparação e segue o app. Nunca derruba a tela por causa disso.
 */
export async function buscarPrecosML(nome: string, timeoutMs = 6000): Promise<PrecoML[] | null> {
  const termo = nome.trim()
  if (!termo) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${q(termo)}&limit=5`, {
      signal: ctrl.signal,
    })
    if (!r.ok) return null
    const dados = await r.json()
    const out = parseML(dados)
    return out.length ? out : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
