// Cruzamento "lista × base de preços": para CADA loja, quanto sairia o carrinho
// e onde sua lista sai mais barata. Funções puras — a tela só renderiza.
//
// Regra de honestidade: a comparação de "mais barata" só vale entre lojas que
// cobrem a MESMA quantidade de itens (comparar total de loja que cobre 3 com
// total de loja que cobre 8 seria mentira estatística).

import type { Item, Preco } from '../types'
import { combinarPrecos } from './comparar'
import { normalizarNome } from './format'

export interface ItemCoberto {
  item: Item
  preco: Preco
  /** preço × quantidade do item na lista */
  subtotal: number
}

export interface LojaCarrinho {
  /** Nome exibido (como foi registrado por último). */
  loja: string
  /** Chave normalizada (mesma loja com acento/caixa diferente = mesma). */
  chave: string
  /** Soma dos itens cobertos POR ESTA LOJA. */
  total: number
  cobertos: ItemCoberto[]
}

export interface Cruzamento {
  /** Lojas com pelo menos 1 item coberto, do mais barato para o mais caro. */
  lojas: LojaCarrinho[]
  totalItens: number
  /** Maior cobertura alcançada por uma loja (base da comparação justa). */
  coberturaMax: number
  /** Lojas que cobrem a cobertura máxima — as elegíveis para o ranking. */
  elegiveis: LojaCarrinho[]
  maisBarata: LojaCarrinho | null
  maisCara: LojaCarrinho | null
  /** Quanto se economiza indo na mais barata em vez da mais cara (elegíveis). */
  economia: number
  /** Itens que NENHUMA loja da base cobre (com nome). */
  faltando: Item[]
}

/**
 * Cruza os itens da lista com a base de preços.
 *
 * - Cada item casa com os registros parecidos (mesmo critério de `combinarPrecos`);
 * - para uma mesma loja, vale o MENOR preço encontrado para aquele item;
 * - "loja" é agrupada por nome normalizado (Assaí ≠ ASSAI? → é a mesma);
 * - ranking final só entre lojas de cobertura igual (ver topo do arquivo).
 */
export function cruzar(itens: Item[], base: Preco[]): Cruzamento {
  const porLoja = new Map<string, LojaCarrinho>()
  const faltando: Item[] = []

  for (const item of itens) {
    const candidatos = combinarPrecos(item.nome, base, item.marca)
    if (!candidatos.length) {
      faltando.push(item)
      continue
    }
    // Melhor preço por loja para ESTE item.
    const melhorPorLoja = new Map<string, Preco>()
    for (const p of candidatos) {
      const chave = normalizarNome(p.loja)
      const atual = melhorPorLoja.get(chave)
      if (!atual || p.valor < atual.valor) melhorPorLoja.set(chave, p)
    }
    for (const [chave, preco] of melhorPorLoja) {
      let loja = porLoja.get(chave)
      if (!loja) {
        loja = { loja: preco.loja, chave, total: 0, cobertos: [] }
        porLoja.set(chave, loja)
      }
      const subtotal = preco.valor * item.quantidade
      loja.total += subtotal
      loja.cobertos.push({ item, preco, subtotal })
    }
  }

  const lojas = [...porLoja.values()].sort((a, b) => a.total - b.total)
  const totalItens = itens.length
  const coberturaMax = lojas.reduce((m, l) => Math.max(m, l.cobertos.length), 0)
  const elegiveis = lojas.filter((l) => l.cobertos.length === coberturaMax)
  const maisBarata = elegiveis[0] ?? null
  const maisCara = elegiveis[elegiveis.length - 1] ?? null
  const economia = maisBarata && maisCara ? maisCara.total - maisBarata.total : 0

  return {
    lojas,
    totalItens,
    coberturaMax,
    elegiveis,
    maisBarata,
    maisCara,
    economia,
    faltando,
  }
}
