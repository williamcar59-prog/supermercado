// Categorias e unidades: rótulos de exibição em um lugar só.

import type { Categoria, Unidade } from '../types'

export const ORDEM_CATEGORIAS: Categoria[] = [
  'hortifruti',
  'padaria',
  'carnes',
  'laticinios',
  'mercearia',
  'bebidas',
  'limpeza',
  'higiene',
  'outros',
]

export const CATEGORIAS: Record<Categoria, { rotulo: string; icone: string }> = {
  hortifruti: { rotulo: 'Hortifrúti', icone: '🥬' },
  padaria: { rotulo: 'Padaria', icone: '🍞' },
  carnes: { rotulo: 'Carnes', icone: '🥩' },
  laticinios: { rotulo: 'Laticínios', icone: '🧀' },
  mercearia: { rotulo: 'Mercearia', icone: '🥫' },
  bebidas: { rotulo: 'Bebidas', icone: '🥤' },
  limpeza: { rotulo: 'Limpeza', icone: '🧴' },
  higiene: { rotulo: 'Higiene', icone: '🧼' },
  outros: { rotulo: 'Outros', icone: '📦' },
}

export const UNIDADES: Record<Unidade, string> = {
  un: 'un',
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'mL',
  pct: 'pct',
  cx: 'cx',
}

export const UNIDADES_LISTA = Object.keys(UNIDADES) as Unidade[]
