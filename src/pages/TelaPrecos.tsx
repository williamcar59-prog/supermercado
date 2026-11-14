// Tela "onde sua lista sai mais barata": cruza a lista ativa com a base de
// preços e responde em um toque — quanto, em qual loja, e o que ainda falta.

import { useEffect, useMemo, useState } from 'react'
import { useLista } from '../app/ListaContext'
import { cruzar, type LojaCarrinho } from '../lib/carrinho'
import { pontuarComparacao, promocaoAtiva } from '../lib/comparar'
import { regiaoSalva } from '../lib/geoloc'
import { baseCompleta, EVENTO_NUVEM, filaPendente } from '../lib/nuvem'
import { brl, diaMes } from '../lib/format'

/** Cobre X de N itens — barra mini de cobertura. */
function Cobertura({ cobertos, total }: { cobertos: number; total: number }) {
  const pct = total ? Math.round((cobertos / total) * 100) : 0
  return (
    <div className="cobertura" title={`${cobertos} de ${total} itens com preço`}>
      <div className="barra">
        <div className="barra-preenchido" style={{ width: `${pct}%` }} />
      </div>
      <small>
        {cobertos}/{total} itens
      </small>
    </div>
  )
}

function CardLoja({ loja, destaque, totalItens }: { loja: LojaCarrinho; destaque: boolean; totalItens: number }) {
  const [aberto, setAberto] = useState(false)
  const lista = aberto ? loja.cobertos : loja.cobertos.slice(0, 4)
  return (
    <section className={destaque ? 'loja-card destaque' : 'loja-card'}>
      <header className="loja-card-topo">
        <div>
          <strong>{destaque ? '🏆 ' : ''}{loja.loja}</strong>
          <div className="loja-card-total">
            <b>{brl(loja.total)}</b> no carrinho
          </div>
        </div>
        <Cobertura cobertos={loja.cobertos.length} total={totalItens} />
      </header>
      <ul className="loja-card-itens">
        {lista.map(({ item, preco, subtotal }) => (
          <li key={item.id}>
            <span>
              {item.nome}
              {item.marca ? <small className="item-marca"> {item.marca}</small> : null}
              {promocaoAtiva(preco) && <small className="item-promo"> 🔥</small>}
            </span>
            <span className="valor">{brl(subtotal)}</span>
          </li>
        ))}
      </ul>
      {loja.cobertos.length > 4 && (
        <button type="button" className="link" onClick={() => setAberto((a) => !a)}>
          {aberto ? 'mostrar menos' : `ver mais ${loja.cobertos.length - 4} itens`}
        </button>
      )}
    </section>
  )
}

export function TelaPrecos() {
  const { lista } = useLista()
  // Aba desmonta ao trocar de aba → este estado relê a base toda vez que abre.
  const [precos, setPrecos] = useState(() => baseCompleta(regiaoSalva()?.cidade))

  // Base compartilhada baixou → recarrega local + comunidade.
  useEffect(() => {
    const releu = () => setPrecos(baseCompleta(regiaoSalva()?.cidade))
    window.addEventListener(EVENTO_NUVEM, releu)
    return () => window.removeEventListener(EVENTO_NUVEM, releu)
  }, [])

  const cruzamento = useMemo(
    () => (lista ? cruzar(lista.itens, precos) : null),
    [lista, precos],
  )

  // Promoções 🔥 que interessam aos itens desta lista (mesma régua da busca).
  const promocoes = useMemo(
    () =>
      lista
        ? precos.filter(
            (p) =>
              promocaoAtiva(p) &&
              lista.itens.some((i) => pontuarComparacao(i.nome, p.produto) >= 0.5),
          )
        : [],
    [lista, precos],
  )

  const daComunidade = precos.filter((p) => p.fonte === 'comunidade').length
  const pendentes = filaPendente()

  if (!lista || lista.itens.length === 0) {
    return (
      <div className="vazio">
        <p className="vazio-icone">💰</p>
        <h2>Nada para comparar ainda</h2>
        <p>Adicione produtos na aba Lista e registre preços — a comparação aparece aqui.</p>
      </div>
    )
  }

  const c = cruzamento!

  if (c.lojas.length === 0) {
    return (
      <div className="vazio">
        <p className="vazio-icone">🏷</p>
        <h2>Sem preços na sua base</h2>
        <p>
          Ao adicionar um produto, toque em <strong>🔍 Buscar preço</strong> e use ou registre um
          valor — a comparação entre lojas aparece aqui automaticamente.
        </p>
      </div>
    )
  }

  const { maisBarata, maisCara, economia } = c
  const coberturaPct = c.totalItens ? Math.round((c.coberturaMax / c.totalItens) * 100) : 0

  return (
    <div className="tela tela-precos">
      {/* ------------------------------------------------- resumo em destaque */}
      <section className="resumo">
        {maisBarata && maisCara && economia > 0 ? (
          <>
            <p className="resumo-frase">
              Sua lista sai <strong>{brl(maisBarata.total)}</strong> no{' '}
              <strong>{maisBarata.loja}</strong>
            </p>
            <p className="resumo-economia">
              🎉 Economia de <b>{brl(economia)}</b> em relação a {maisCara.loja} — com os mesmos{' '}
              {c.coberturaMax} itens
            </p>
          </>
        ) : maisBarata ? (
          <>
            <p className="resumo-frase">
              Sua lista sai <strong>{brl(maisBarata.total)}</strong> no{' '}
              <strong>{maisBarata.loja}</strong>
            </p>
            <p className="resumo-economia">
              Única loja com preços para os mesmos {c.coberturaMax} itens — registre preços em outra
              loja para poder comparar.
            </p>
          </>
        ) : null}
        <p className="resumo-nota">
          Cobertura: {c.coberturaMax} de {c.totalItens} itens comparáveis ({coberturaPct}%)
        </p>
        {(daComunidade > 0 || pendentes > 0) && (
          <p className="resumo-nota">
            {daComunidade > 0 && <>👥 {daComunidade} preço(s) vieram da comunidade. </>}
            {pendentes > 0 && <>📤 {pendentes} registro(s) aguardando envio.</>}
          </p>
        )}
      </section>

      {/* ------------------------------------------------- 🔥 promoções ativas */}
      {promocoes.length > 0 && (
        <section className="grupo">
          <h3 className="grupo-titulo">🔥 Promoções ativas ({promocoes.length})</h3>
          <ul className="precos">
            {promocoes.map((p) => (
              <li key={p.id} className="preco-linha promo-linha">
                <div className="loja-info">
                  <strong>{brl(p.valor)} 🔥</strong>
                  <span className="loja-detalhe">
                    {p.produto}
                    {p.marca ? ` · ${p.marca}` : ''} · {p.loja} ·{' '}
                    {p.cidade ? `${p.cidade}${p.uf ? '/' + p.uf : ''} · ` : ''}válida até{' '}
                    {diaMes(p.validade ?? '')}
                  </span>
                </div>
                <span className="preco-origem">
                  {p.fonte === 'comunidade' ? '👥' : '👤'}
                </span>
              </li>
            ))}
          </ul>
          <p className="busca-status">
            Registradas por quem comprou — o 🔥 some sozinho quando a validade passa.
          </p>
        </section>
      )}

      {/* --------------------------------------------------------- ranking */}
      <section className="grupo">
        <h3 className="grupo-titulo">🏪 Loja por loja</h3>
        <div className="lojas-cards">
          {c.lojas.map((l) => (
            <CardLoja
              key={l.chave}
              loja={l}
              destaque={l.chave === maisBarata?.chave}
              totalItens={c.totalItens}
            />
          ))}
        </div>
        <p className="busca-status">
          A comparação de vencedor considera só lojas que cobrem a mesma quantidade de itens.
        </p>
      </section>

      {/* -------------------------------------------------------- faltando */}
      {c.faltando.length > 0 && (
        <section className="grupo">
          <h3 className="grupo-titulo">❔ Sem preço na base ({c.faltando.length})</h3>
          <div className="chips">
            {c.faltando.map((i) => (
              <span key={i.id} className="chip chip-neutro">
                {i.nome}
              </span>
            ))}
          </div>
          <p className="busca-status">
            Toque no produto na aba <strong>Lista</strong> → <strong>🔍 Buscar preço</strong> para
            cobrir estas lacunas.
          </p>
        </section>
      )}
    </div>
  )
}
