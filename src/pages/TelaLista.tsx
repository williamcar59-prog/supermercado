// Tela da lista em andamento: agrupada por categoria, com total e progresso.

import { useMemo, useState } from 'react'
import { ItemModal } from '../components/ItemModal'
import { useLista } from '../app/ListaContext'
import { useToast } from '../app/Toast'
import { brl } from '../lib/format'
import { CATEGORIAS, ORDEM_CATEGORIAS } from '../lib/categorias'
import type { Item, Lista } from '../types'

type Editando = { modo: 'novo' } | { modo: 'editar'; item: Item } | null

/** Agrupa os itens da lista por categoria, na ordem fixa do catálogo. */
function porCategoria(lista: Lista) {
  const grupos = new Map<string, Item[]>()
  for (const item of lista.itens) {
    const arr = grupos.get(item.categoria) ?? []
    arr.push(item)
    grupos.set(item.categoria, arr)
  }
  return ORDEM_CATEGORIAS.filter((c) => grupos.has(c)).map(
    (c) => ({ categoria: c, itens: grupos.get(c)! }),
  )
}

export function TelaLista() {
  const { lista, adicionarItem, restaurarItem, atualizarItem, removerItem, alternarItem, renomearLista, concluirLista, garantirLista } = useLista()
  const { mostrar } = useToast()
  const [editando, setEditando] = useState<Editando>(null)

  // Nome da lista: edição local, commit no blur/Enter — assim dá para limpar o
  // campo sem o estado "Minha lista" pular na cara do usuário a cada tecla.
  const [nomeRascunho, setNomeRascunho] = useState<string | null>(null)
  const nomeAtual = nomeRascunho ?? lista?.nome ?? ''
  const commitNome = () => {
    if (nomeRascunho === null) return
    renomearLista(nomeRascunho)
    setNomeRascunho(null)
  }

  const grupos = useMemo(() => (lista ? porCategoria(lista) : []), [lista])

  // Total estimado: só soma quem tem preço cadastrado.
  const { total, semPreco } = useMemo(() => {
    let t = 0
    let s = 0
    for (const i of lista?.itens ?? []) {
      if (i.precoUnitario != null) t += i.precoUnitario * i.quantidade
      else s++
    }
    return { total: t, semPreco: s }
  }, [lista])

  const marcados = lista?.itens.filter((i) => i.marcado).length ?? 0
  const totalItens = lista?.itens.length ?? 0
  const progresso = totalItens ? Math.round((marcados / totalItens) * 100) : 0

  if (!lista) {
    return (
      <div className="vazio">
        <p className="vazio-icone">🛒</p>
        <h2>Nenhuma lista em andamento</h2>
        <p>As listas concluídas ficam no histórico.</p>
        <button type="button" className="btn" onClick={garantirLista}>
          Criar nova lista
        </button>
      </div>
    )
  }

  const excluir = (item: Item) => {
    const indice = lista.itens.findIndex((i) => i.id === item.id)
    removerItem(item.id)
    mostrar(`"${item.nome}" removido`, {
      rotulo: 'Desfazer',
      aoClicar: () => restaurarItem(item, indice),
    })
  }

  return (
    <div className="tela">
      <header className="lista-cabecalho">
        <input
          className="lista-nome"
          value={nomeAtual}
          aria-label="Nome da lista"
          onChange={(e) => setNomeRascunho(e.target.value)}
          onBlur={commitNome}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        <div className="lista-progresso">
          <div className="barra">
            <div className="barra-preenchido" style={{ width: `${progresso}%` }} />
          </div>
          <span className="lista-contagem">
            {marcados}/{totalItens} no carrinho
          </span>
        </div>
      </header>

      {totalItens === 0 ? (
        <div className="vazio vazio-inline">
          <p className="vazio-icone">📝</p>
          <h2>Lista vazia</h2>
          <p>Toque em <strong>+</strong> para adicionar o primeiro produto.</p>
        </div>
      ) : (
        <div className="grupos">
          {grupos.map(({ categoria, itens }) => (
            <section key={categoria} className="grupo">
              <h3 className="grupo-titulo">
                {CATEGORIAS[categoria].icone} {CATEGORIAS[categoria].rotulo}
              </h3>
              <ul className="itens">
                {itens.map((item) => (
                  <li key={item.id} className={item.marcado ? 'item marcado' : 'item'}>
                    <button
                      type="button"
                      className="item-caixa"
                      aria-label={item.marcado ? `Desmarcar ${item.nome}` : `Marcar ${item.nome}`}
                      onClick={() => alternarItem(item.id)}
                    >
                      {item.marcado && '✓'}
                    </button>
                    <div className="item-info" onClick={() => setEditando({ modo: 'editar', item })}>
                      <span className="item-nome">{item.nome}</span>
                      <span className="item-detalhe">
                        {item.quantidade} {item.unidade}
                        {item.precoUnitario != null && <> · {brl(item.precoUnitario * item.quantidade)}</>}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="item-acao"
                      aria-label={`Excluir ${item.nome}`}
                      title="Excluir"
                      onClick={() => excluir(item)}
                    >
                      🗑
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {totalItens > 0 && (
        <footer className="lista-rodape">
          <div className="total">
            <span>Total estimado</span>
            <strong>{brl(total)}</strong>
          </div>
          {semPreco > 0 && <span className="total-nota">{semPreco} sem preço cadastrado</span>}
          <button
            type="button"
            className="btn"
            disabled={marcados === 0}
            title={marcados === 0 ? 'Marque pelo menos um item' : undefined}
            onClick={() => {
              concluirLista()
              mostrar('Lista concluída! Vá no histórico para repetir.')
            }}
          >
            Concluir compras ✓
          </button>
        </footer>
      )}

      <button
        type="button"
        className="flutuante"
        aria-label="Adicionar produto"
        title="Adicionar produto"
        onClick={() => setEditando({ modo: 'novo' })}
      >
        ＋
      </button>

      {editando && (
        <ItemModal
          itemExistente={editando.modo === 'editar' ? editando.item : undefined}
          aoFechar={() => setEditando(null)}
          aoSalvar={(dados) => {
            if (editando.modo === 'editar') atualizarItem(editando.item.id, dados)
            else adicionarItem(dados)
            setEditando(null)
            mostrar(editando.modo === 'editar' ? 'Produto atualizado' : 'Produto adicionado')
          }}
        />
      )}
    </div>
  )
}
