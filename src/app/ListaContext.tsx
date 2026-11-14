// Estado da lista de compras. Contexto pequeno, sem re-render global à toa.
//
// Regra importante (manual — lição 3): a gravação acontece NO EVENTO, síncrona,
// e nunca dentro do updater do setState — senão uma leitura logo em seguida
// (ex.: recarregar o histórico) veria o storage desatualizado.
// `listaRef` é o espelho do estado atual para os callbacks não ficarem velhos.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import * as api from '../lib/api'
import { listaDemo, precosDemo } from '../data/demo'
import { uid } from '../lib/format'
import type { Item, Lista } from '../types'

interface ListaCtx {
  lista: Lista | null
  historico: Lista[]
  /** Garante uma lista em andamento (cria se não houver) e devolve o id. */
  garantirLista: () => Lista
  adicionarItem: (dados: Omit<Item, 'id' | 'marcado' | 'criadoEm'>) => void
  /** Reinsere um item já existente na posição original (usado pelo "Desfazer"). */
  restaurarItem: (item: Item, indice: number) => void
  atualizarItem: (id: string, dados: Partial<Item>) => void
  removerItem: (id: string) => void
  alternarItem: (id: string) => void
  renomearLista: (nome: string) => void
  concluirLista: () => void
  repetirLista: (idHistorico: string) => void
  removerDoHistorico: (id: string) => void
}

const Ctx = createContext<ListaCtx | null>(null)

export function ListaProvider({ children }: { children: ReactNode }) {
  // Inicialização síncrona: localStorage não é assíncrono, não precisa de efeito.
  // (StrictMode roda o inicializador duas vezes — semearSePreciso é idempotente pelo flag.)
  const [lista, setLista] = useState<Lista | null>(() => {
    api.semearSePreciso(listaDemo())
    api.semearPrecosSePreciso(precosDemo())
    return api.carregarListaAtiva()
  })
  const [historico, setHistorico] = useState<Lista[]>(() => api.carregarHistorico())

  // Espelho síncrono do estado: os callbacks abaixo leem daqui, sempre atual.
  const listaRef = useRef<Lista | null>(lista)

  /** Grava a lista nova no storage E atualiza estado + ref, tudo no mesmo turno. */
  const gravar = useCallback((nova: Lista | null) => {
    if (nova) api.salvarLista(nova)
    listaRef.current = nova
    setLista(nova)
  }, [])

  /** Aplica uma mutação na lista em andamento (grava síncrono no evento). */
  const aplicar = useCallback(
    (mutar: (atual: Lista) => Lista) => {
      const atual = listaRef.current
      if (!atual) return
      gravar(mutar(atual))
    },
    [gravar],
  )

  const garantirLista = useCallback((): Lista => {
    const existente = api.carregarListaAtiva()
    if (existente) {
      listaRef.current = existente
      setLista(existente)
      return existente
    }
    const nova: Lista = {
      id: uid(),
      nome: 'Nova lista',
      itens: [],
      criadoEm: Date.now(),
      atualizadoEm: Date.now(),
    }
    gravar(nova)
    return nova
  }, [gravar])

  const adicionarItem = useCallback(
    (dados: Omit<Item, 'id' | 'marcado' | 'criadoEm'>) => {
      aplicar((atual) => ({
        ...atual,
        itens: [...atual.itens, { ...dados, id: uid(), marcado: false, criadoEm: Date.now() }],
      }))
    },
    [aplicar],
  )

  const restaurarItem = useCallback(
    (item: Item, indice: number) => {
      aplicar((atual) => {
        const itens = [...atual.itens]
        itens.splice(Math.max(0, Math.min(indice, itens.length)), 0, item)
        return { ...atual, itens }
      })
    },
    [aplicar],
  )

  const atualizarItem = useCallback(
    (id: string, dados: Partial<Item>) => {
      aplicar((atual) => ({
        ...atual,
        itens: atual.itens.map((i) => (i.id === id ? { ...i, ...dados } : i)),
      }))
    },
    [aplicar],
  )

  const removerItem = useCallback(
    (id: string) => {
      aplicar((atual) => ({ ...atual, itens: atual.itens.filter((i) => i.id !== id) }))
    },
    [aplicar],
  )

  const alternarItem = useCallback(
    (id: string) => {
      aplicar((atual) => ({
        ...atual,
        itens: atual.itens.map((i) => (i.id === id ? { ...i, marcado: !i.marcado } : i)),
      }))
    },
    [aplicar],
  )

  const renomearLista = useCallback(
    (nome: string) => {
      aplicar((atual) => ({ ...atual, nome: nome.trim() || 'Minha lista' }))
    },
    [aplicar],
  )

  const concluirLista = useCallback(() => {
    const atual = listaRef.current
    if (!atual) return
    // 1) grava síncrono (aqui o storage já está pronto para a leitura abaixo);
    api.salvarLista({ ...atual, concluidaEm: Date.now() })
    // 2) então zera a ativa e RELÊ o histórico — que enxerga a lista concluída.
    listaRef.current = null
    setLista(null)
    setHistorico(api.carregarHistorico())
  }, [])

  const repetirLista = useCallback((idHistorico: string) => {
    const origem = api.carregarHistorico().find((l) => l.id === idHistorico)
    if (!origem) return
    // Itens voltam a "pendente" — a lista é nova, o histórico continua intacto.
    const nova: Lista = {
      id: uid(),
      nome: origem.nome,
      itens: origem.itens.map((i) => ({ ...i, id: uid(), marcado: false })),
      criadoEm: Date.now(),
      atualizadoEm: Date.now(),
    }
    api.salvarLista(nova)
    listaRef.current = nova
    setLista(nova)
    setHistorico(api.carregarHistorico())
  }, [])

  const removerDoHistorico = useCallback((id: string) => {
    api.removerLista(id)
    setHistorico(api.carregarHistorico())
  }, [])

  const valor: ListaCtx = {
    lista,
    historico,
    garantirLista,
    adicionarItem,
    restaurarItem,
    atualizarItem,
    removerItem,
    alternarItem,
    renomearLista,
    concluirLista,
    repetirLista,
    removerDoHistorico,
  }

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useLista(): ListaCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLista precisa estar dentro de <ListaProvider>')
  return ctx
}
