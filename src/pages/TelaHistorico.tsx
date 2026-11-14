// Histórico: listas concluídas, com total, repetição e exclusão.

import { useMemo } from 'react'
import { useLista } from '../app/ListaContext'
import { useToast } from '../app/Toast'
import { brl, dataCurta } from '../lib/format'

export function TelaHistorico() {
  const { historico, repetirLista, removerDoHistorico } = useLista()
  const { mostrar } = useToast()

  // Pré-calcula o total de cada lista do histórico (só quem tem preço).
  const comTotal = useMemo(
    () =>
      historico.map((l) => ({
        lista: l,
        total: l.itens.reduce((s, i) => s + (i.precoUnitario != null ? i.precoUnitario * i.quantidade : 0), 0),
        semPreco: l.itens.filter((i) => i.precoUnitario == null).length,
      })),
    [historico],
  )

  if (historico.length === 0) {
    return (
      <div className="vazio">
        <p className="vazio-icone">🗂</p>
        <h2>Nada no histórico ainda</h2>
        <p>Quando você concluir uma lista, ela aparece aqui — e pode ser repetida em um toque.</p>
      </div>
    )
  }

  return (
    <div className="tela">
      <h2 className="tela-titulo">Histórico</h2>
      <ul className="historico">
        {comTotal.map(({ lista, total, semPreco }) => (
          <li key={lista.id} className="historico-card">
            <div className="historico-info">
              <strong>{lista.nome}</strong>
              <span className="historico-detalhe">
                {lista.concluidaEm ? dataCurta(lista.concluidaEm) : '—'} · {lista.itens.length} itens
                {total > 0 && <> · {brl(total)}</>}
                {semPreco > 0 && <span className="historico-nota"> ({semPreco} sem preço)</span>}
              </span>
            </div>
            <div className="historico-acoes">
              <button
                type="button"
                className="btn btn-pequeno"
                onClick={() => {
                  repetirLista(lista.id)
                  mostrar('Lista copiada para o carrinho 🛒')
                }}
              >
                Repetir
              </button>
              <button
                type="button"
                className="item-acao"
                aria-label={`Excluir ${lista.nome} do histórico`}
                title="Excluir do histórico"
                onClick={() => {
                  removerDoHistorico(lista.id)
                  mostrar('Removido do histórico')
                }}
              >
                🗑
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
