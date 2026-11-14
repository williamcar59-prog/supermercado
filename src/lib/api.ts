// Camada de dados ÚNICA do app. (Manual 03 — "todo acesso a dados passa por um arquivo só")
//
// Hoje: localStorage (MVP sem backend, sem login, custo zero).
// Amanhã: trocar o corpo das funções por Supabase — as assinaturas não mudam.
//
// Convenção: quem chama nunca vê o formato guardado; este arquivo normaliza.

import type { Item, Lista, Preco } from '../types'
import { dataIsoValida, uid } from './format'

const CHAVE_LISTAS = 'supermercado:listas:v1'
const CHAVE_PRECOS = 'supermercado:precos:v1'
const CHAVE_SEMEOU = 'supermercado:semeou:v1'
const CHAVE_SEMEOU_PRECOS = 'supermercado:semeouprecos:v1'

// ---------------------------------------------------------------- utilidades

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
    // Quota cheia / modo privado: não derruba o app, só avisa no console.
    console.error('Falha ao gravar em localStorage', erro)
  }
}

/** Normalização: o que veio do storage pode ter vindo de uma versão antiga. */
function normalizarItem(bruto: Partial<Item>): Item | null {
  if (!bruto || typeof bruto.nome !== 'string' || !bruto.nome.trim()) return null
  const qtd = Number(bruto.quantidade)
  return {
    id: typeof bruto.id === 'string' ? bruto.id : uid(),
    nome: bruto.nome.trim(),
    quantidade: Number.isFinite(qtd) && qtd > 0 ? qtd : 1,
    unidade: (bruto.unidade ?? 'un') as Item['unidade'],
    categoria: (bruto.categoria ?? 'outros') as Item['categoria'],
    precoUnitario:
      typeof bruto.precoUnitario === 'number' && Number.isFinite(bruto.precoUnitario)
        ? bruto.precoUnitario
        : undefined,
    // Marca (v0.5): SEM este campo aqui, a normalização reconstruiria o objeto
    // sem ele e o dado sumiria na releitura (lição: quem normaliza campo a campo
    // tem que declarar TODO campo novo).
    marca: typeof bruto.marca === 'string' && bruto.marca.trim() ? bruto.marca.trim() : undefined,
    marcado: Boolean(bruto.marcado),
    criadoEm: typeof bruto.criadoEm === 'number' ? bruto.criadoEm : Date.now(),
  }
}

function normalizarLista(bruto: Partial<Lista>): Lista | null {
  if (!bruto || typeof bruto.id !== 'string' || typeof bruto.nome !== 'string') return null
  const itens = Array.isArray(bruto.itens)
    ? bruto.itens.map(normalizarItem).filter((i): i is Item => i !== null)
    : []
  return {
    id: bruto.id,
    nome: bruto.nome.trim() || 'Minha lista',
    itens,
    criadoEm: typeof bruto.criadoEm === 'number' ? bruto.criadoEm : Date.now(),
    atualizadoEm: typeof bruto.atualizadoEm === 'number' ? bruto.atualizadoEm : Date.now(),
    concluidaEm: typeof bruto.concluidaEm === 'number' ? bruto.concluidaEm : undefined,
  }
}

// ------------------------------------------------------------------- listas

/**
 * Primeira abertura do app: coloca a lista de demonstração UMA vez só.
 * O flag `semeou` garante que ela não volta depois de o usuário apagar tudo.
 */
export function semearSePreciso(demo: Lista): void {
  try {
    if (localStorage.getItem(CHAVE_SEMEOU)) return
    localStorage.setItem(CHAVE_SEMEOU, '1')
    if (localStorage.getItem(CHAVE_LISTAS)) return // já tem dados: não embaralha
    gravarJson(CHAVE_LISTAS, [demo])
  } catch (erro) {
    console.error('Falha ao semear dados de demonstração', erro)
  }
}

function carregarTodas(): Lista[] {
  return lerJson<Lista[]>(CHAVE_LISTAS, [])
    .map(normalizarLista)
    .filter((l): l is Lista => l !== null)
}

/** Lista em andamento (a mais recente sem concluidaEm) ou null. */
export function carregarListaAtiva(): Lista | null {
  const ativas = carregarTodas().filter((l) => !l.concluidaEm)
  if (!ativas.length) return null
  return ativas.sort((a, b) => b.atualizadoEm - a.atualizadoEm)[0]
}

/** Histórico: listas concluídas, mais recente primeiro. */
export function carregarHistorico(): Lista[] {
  return carregarTodas()
    .filter((l) => typeof l.concluidaEm === 'number')
    .sort((a, b) => (b.concluidaEm ?? 0) - (a.concluidaEm ?? 0))
}

/** Grava a lista inteira. O resto do app monta o objeto; este arquivo só persiste. */
export function salvarLista(lista: Lista): void {
  const outras = carregarTodas().filter((l) => l.id !== lista.id)
  outras.push({ ...lista, atualizadoEm: Date.now() })
  gravarJson(CHAVE_LISTAS, outras)
}

/** Remove a lista (usado para apagar do histórico). */
export function removerLista(id: string): void {
  gravarJson(
    CHAVE_LISTAS,
    carregarTodas().filter((l) => l.id !== id),
  )
}

// ------------------------------------------------------------------- preços
// Base de preços colaborativa (produto + loja), alimentada pela busca.

/**
 * Preços de demonstração da aba 💰: semeia UMA vez (flag própria) e só se a
 * base estiver vazia — se o usuário já registrou preços de verdade, não mistura;
 * se apagou depois, o flag impede de ressuscitar (lição da semente de lista).
 */
export function semearPrecosSePreciso(precos: Preco[]): void {
  try {
    if (localStorage.getItem(CHAVE_SEMEOU_PRECOS)) return
    localStorage.setItem(CHAVE_SEMEOU_PRECOS, '1')
    if (carregarPrecos().length) return // base já tem dado de verdade
    gravarJson(CHAVE_PRECOS, precos)
  } catch (erro) {
    console.error('Falha ao semear preços de demonstração', erro)
  }
}

export function carregarPrecos(): Preco[] {
  const bruto = lerJson<Preco[]>(CHAVE_PRECOS, [])
  if (!Array.isArray(bruto)) return []
  return bruto
    .filter((p) => p && typeof p.produto === 'string' && typeof p.valor === 'number')
    .map((p) =>
      // Validade só passa se for data ISO de verdade — lixo não vira "promoção".
      p.validade && !dataIsoValida(p.validade) ? { ...p, validade: undefined } : p,
    )
}

export function salvarPrecos(precos: Preco[]): void {
  gravarJson(CHAVE_PRECOS, precos)
}
