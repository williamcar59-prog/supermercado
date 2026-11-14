// Um único lugar com os tipos do app. (Manual03 — "types.ts")

export type Categoria =
  | 'hortifruti'
  | 'padaria'
  | 'carnes'
  | 'laticinios'
  | 'mercearia'
  | 'bebidas'
  | 'limpeza'
  | 'higiene'
  | 'outros'

export type Unidade = 'un' | 'kg' | 'g' | 'l' | 'ml' | 'pct' | 'cx'

/** Item da lista de compras. */
export interface Item {
  id: string
  nome: string
  quantidade: number
  unidade: Unidade
  categoria: Categoria
  /** Preço unitário estimado (opcional). Alimenta o total e a comparação de lojas da Fase 3. */
  precoUnitario?: number
  /** Marca escolhida (opcional, v0.5) — entra na base de preços e vira destaque nas buscas. */
  marca?: string
  marcado: boolean
  criadoEm: number
}

/** Uma lista de compras. Só existe UMA em andamento por vez. */
export interface Lista {
  id: string
  nome: string
  itens: Item[]
  criadoEm: number
  atualizadoEm: number
  /** Preenchido quando a lista é concluída → vai para o histórico. */
  concluidaEm?: number
}

/**
 * Preço cadastrado à mão — sua ou da comunidade.
 * Sem scraping: a fonte é a pessoa que comprou (colaborativa).
 */
export interface Preco {
  id: string
  produto: string
  loja: string
  valor: number
  /** Validade da oferta (ISO yyyy-mm-dd). Preenchida = promoção 🔥 ATIVA até essa data (v0.6). */
  validade?: string
  registradoPor: string
  atualizadoEm: number
  /** Onde o preço foi visto (quando há GPS) — ajuda quem busca na mesma cidade. */
  cidade?: string
  /** Sigla UF. */
  uf?: string
  /** Marca do produto, quando quem registrou soube informar (v0.5). */
  marca?: string
  /** 'proprio' = gravou este aparelho; 'comunidade' = veio da nuvem. */
  fonte?: 'proprio' | 'comunidade'
}
