// Formulário de item (novo ou edição) — modal único reaproveitado.

import { useEffect, useState } from 'react'
import { BuscaPreco } from './BuscaPreco'
import { CATEGORIAS, ORDEM_CATEGORIAS, UNIDADES_LISTA } from '../lib/categorias'
import type { Categoria, Item, Unidade } from '../types'

interface Props {
  /** Se veio, é edição; se não, é novo item. */
  itemExistente?: Item
  aoSalvar: (dados: Omit<Item, 'id' | 'marcado' | 'criadoEm'>) => void
  aoFechar: () => void
}

export function ItemModal({ itemExistente, aoSalvar, aoFechar }: Props) {
  const [nome, setNome] = useState(itemExistente?.nome ?? '')
  const [quantidade, setQuantidade] = useState(String(itemExistente?.quantidade ?? 1))
  const [unidade, setUnidade] = useState<Unidade>(itemExistente?.unidade ?? 'un')
  const [categoria, setCategoria] = useState<Categoria>(itemExistente?.categoria ?? 'outros')
  const [preco, setPreco] = useState(itemExistente?.precoUnitario != null ? String(itemExistente.precoUnitario) : '')
  const [marca, setMarca] = useState(itemExistente?.marca ?? '')
  const [erro, setErro] = useState('')
  const [buscando, setBuscando] = useState(false)

  // Esc fecha (convenção de modal) — e o fundo escurece o resto do app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aoFechar])

  const salvar = () => {
    if (!nome.trim()) {
      setErro('Dê um nome para o produto.')
      return
    }
    const qtd = Number(quantidade.replace(',', '.'))
    if (!Number.isFinite(qtd) || qtd <= 0) {
      setErro('Quantidade deve ser maior que zero.')
      return
    }
    const precoNum = preco.trim() ? Number(preco.replace(',', '.')) : undefined
    if (precoNum !== undefined && (!Number.isFinite(precoNum) || precoNum < 0)) {
      setErro('Preço inválido.')
      return
    }
    aoSalvar({
      nome: nome.trim(),
      quantidade: qtd,
      unidade,
      categoria,
      precoUnitario: precoNum !== undefined && Number.isFinite(precoNum) ? precoNum : undefined,
      marca: marca.trim() || undefined,
    })
  }

  return (
    <div className="modal-fundo" onClick={aoFechar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={itemExistente ? 'Editar produto' : 'Novo produto'}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{itemExistente ? 'Editar produto' : 'Novo produto'}</h2>

        <label className="campo">
          <span>Produto *</span>
          <input
            autoFocus
            value={nome}
            onChange={(e) => {
              setNome(e.target.value)
              setErro('')
            }}
            placeholder="Ex.: Arroz tipo 1"
          />
        </label>

        <label className="campo">
          <span>Marca (opcional)</span>
          <input
            value={marca}
            onChange={(e) => {
              setMarca(e.target.value)
              setErro('')
            }}
            placeholder="Ex.: Pilão, 3 Corações, Tio João…"
          />
        </label>

        <div className="campo-linha">
          <label className="campo">
            <span>Quantidade *</span>
            <input
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => {
                setQuantidade(e.target.value)
                setErro('')
              }}
            />
          </label>
          <label className="campo">
            <span>Unidade</span>
            <select value={unidade} onChange={(e) => setUnidade(e.target.value as Unidade)}>
              {UNIDADES_LISTA.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="campo">
          <span>Categoria</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
            {ORDEM_CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {CATEGORIAS[c].icone} {CATEGORIAS[c].rotulo}
              </option>
            ))}
          </select>
        </label>

        <label className="campo">
          <span>Preço unitário (opcional, R$)</span>
          <input
            inputMode="decimal"
            value={preco}
            onChange={(e) => {
              setPreco(e.target.value)
              setErro('')
            }}
            placeholder="Ex.: 24,90"
          />
        </label>

        <button
          type="button"
          className="btn-busca"
          aria-expanded={buscando}
          onClick={() => setBuscando((b) => !b)}
        >
          {buscando ? '▾ Fechar busca' : '🔍 Buscar preço e lojas próximas'}
        </button>

        {buscando && (
          <BuscaPreco
            nome={nome}
            marca={marca.trim() || undefined}
            onUsarPreco={(valor) => {
              setPreco(valor.toFixed(2).replace('.', ','))
              setErro('')
            }}
          />
        )}

        {erro && <p className="erro">{erro}</p>}

        <div className="modal-acoes">
          <button type="button" className="btn-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="btn" onClick={salvar}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
