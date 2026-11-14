// Busca integrada ao adicionar produto: lojas perto de mim (GPS), preços da
// base, tentativa de preço real do Mercado Livre e atalhos para comparar/entrega.
//
// Padrão de estado: nada de setState síncrono dentro de efeito — o que dá para
// derivar é derivado (precosBase, buscandoMl); o que é I/O vira promessa.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../app/Toast'
import {
  buscarPrecosML,
  combinarPrecos,
  destinosDeComparacao,
  destinosDeEntrega,
  promocaoAtiva,
  registrarPreco,
  type PrecoML,
} from '../lib/comparar'
import {
  coordenadaSalva,
  geocodificar,
  obterGps,
  regiaoDaCoordenada,
  regiaoSalva,
  salvarCoordenada,
  type Coordenada,
} from '../lib/geoloc'
import { buscarLojas, buscarMaisLojas, mesclarLojas, type LojaProxima } from '../lib/lojas'
import { buscarOfertas, type ResultadoOfertas } from '../lib/ofertas'
import { baseCompleta, EVENTO_NUVEM, nuvemConfigurada } from '../lib/nuvem'
import { brl, dataCurta, dataIso, dataIsoValida, diaMes, normalizarNome } from '../lib/format'
import type { Preco } from '../types'

type EstadoGps = 'ocioso' | 'buscando' | 'ok' | 'negado' | 'indisponivel' | 'tempo'

/** Limites do campo de validade 🔥 — no módulo: calcula uma vez no load
 * (lint de pureza: sem Date.now dentro do render; muda só na virada do dia). */
const VALIDADE_MIN = dataIso()
const VALIDADE_MAX = dataIso(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000))

interface Props {
  /** Nome do produto no momento — alimenta a busca. */
  nome: string
  /** Marca escolhida no item (opcional) — destaca os preços dessa marca. */
  marca?: string
  /** Usuário escolheu um preço: preenche o campo no formulário. */
  onUsarPreco: (valor: number) => void
}

export function BuscaPreco({ nome, marca, onUsarPreco }: Props) {
  const { mostrar } = useToast()

  // GPS começa do cache (evita pedir de novo a cada item).
  const [coord, setCoord] = useState<Coordenada | null>(() => coordenadaSalva())
  const [gps, setGps] = useState<EstadoGps>(() => (coordenadaSalva() ? 'ok' : 'buscando'))
  const [lojasEstado, setLojasEstado] = useState<{ chave: string; itens: LojaProxima[] }>({
    chave: '',
    itens: [],
  })
  const [cidade, setCidade] = useState('')

  const [precosSalvos, setPrecosSalvos] = useState<Preco[]>(() =>
    baseCompleta(regiaoSalva()?.cidade),
  )
  const [registroML, setRegistroML] = useState<{ nome: string; dados: PrecoML[] | null } | null>(null)

  const [regValor, setRegValor] = useState('')
  const [regLoja, setRegLoja] = useState('')
  const [regMarca, setRegMarca] = useState(marca ?? '')
  /** Validade da promoção 🔥 (yyyy-mm-dd; vazio = preço normal). */
  const [regValidade, setRegValidade] = useState('')
  const [registrando, setRegistrando] = useState(false)

  /** Ofertas da web (Google Shopping via Edge Function) — por termo. */
  const [ofertasEstado, setOfertasEstado] = useState<{ termo: string; res: ResultadoOfertas } | null>(null)

  const nomeLimpo = nome.trim()
  const chaveCoord = coord ? `${coord.lat},${coord.lon}` : ''

  // ------------------------------------------------------------- derivados
  const precosBase: Preco[] = useMemo(
    () => (nomeLimpo ? combinarPrecos(nomeLimpo, precosSalvos, marca) : []),
    [nomeLimpo, precosSalvos, marca],
  )
  /** Melhor preço do resultado (a lista já vem ordenada: relevância → marca → valor). */
  const melhorPreco = precosBase[0]
  /** Promoções 🔥 entre os resultados (mostradas na seção própria, sem repetir embaixo). */
  const promocoesAtivas = useMemo(() => precosBase.filter((p) => promocaoAtiva(p)), [precosBase])
  /** O resto da base (promoções válidas já apareceram lá em cima). */
  const precosNormais = useMemo(() => precosBase.filter((p) => !promocaoAtiva(p)), [precosBase])
  /** Marca pedida em forma de chave de comparação (destaque nas ofertas da web). */
  const marcaNorm = marca?.trim() ? normalizarNome(marca) : ''
  /** Ainda não terminou a busca deste nome? */
  const buscandoMl = Boolean(nomeLimpo) && registroML?.nome !== nomeLimpo
  const mlDados: PrecoML[] | null = registroML?.nome === nomeLimpo ? registroML.dados : null
  /** Carregando = existe coordenada e os lojas ainda não são dela. */
  const lojasCarregando = Boolean(chaveCoord) && lojasEstado.chave !== chaveCoord
  const lojas = lojasEstado.itens

  // ------------------------------------------------------------------ lojas
  const ultimoPedido = useRef('')
  const carregarLojas = useCallback(async (c: Coordenada, chave: string) => {
    ultimoPedido.current = chave
    const primeiro = await buscarLojas(c)
    let todos = primeiro
    // Nominatim limita a 1 req/s: só se a primeira onda veio vazia, busca o
    // termo alternativo "mercado" e mistura sem duplicar.
    if (primeiro.length < 3) {
      const segundo = await buscarMaisLojas(c)
      todos = mesclarLojas(primeiro, segundo)
    }
    // Só grava se este ainda é o pedido mais recente (resposta atrasada de
    // uma coordenada antiga não pode sobrescrever a atual).
    if (ultimoPedido.current === chave) {
      setLojasEstado({ chave, itens: todos })
    }
  }, [])

  // GPS: o efeito só dispara promessas. Mudou a coordenada (inicial, do GPS ou
  // atualização manual) → este efeito recarrega as lojas sozinho.
  useEffect(() => {
    let vivo = true
    if (coord) {
      void carregarLojas(coord, chaveCoord)
    } else {
      void obterGps().then((r) => {
        if (!vivo) return
        if (r.ok) {
          salvarCoordenada(r.coord)
          setCoord(r.coord)
          setGps('ok')
        } else {
          setGps(r.motivo)
        }
      })
    }
    return () => {
      vivo = false
    }
  }, [coord, chaveCoord, carregarLojas])

  // Mercado Livre: uma tentativa por nome, resultado guardado com o nome junto.
  useEffect(() => {
    if (!nomeLimpo || registroML?.nome === nomeLimpo) return
    let vivo = true
    void buscarPrecosML(nomeLimpo).then((dados) => {
      if (vivo) setRegistroML({ nome: nomeLimpo, dados })
    })
    return () => {
      vivo = false
    }
  }, [nomeLimpo, registroML])

  // Base compartilhada: a nuvem terminou de baixar → relê local + comunidade.
  useEffect(() => {
    const releu = () => setPrecosSalvos(baseCompleta(regiaoSalva()?.cidade))
    window.addEventListener(EVENTO_NUVEM, releu)
    return () => window.removeEventListener(EVENTO_NUVEM, releu)
  }, [])

  // Ofertas da web: uma tentativa por termo (o cliente cacheia 24 h; a
  // Edge Function cacheia 72 h — cota do SerpAPI não estoura com repetição).
  useEffect(() => {
    if (!nomeLimpo || !nuvemConfigurada() || ofertasEstado?.termo === nomeLimpo) return
    let vivo = true
    void buscarOfertas(nomeLimpo).then((res) => {
      if (vivo) setOfertasEstado({ termo: nomeLimpo, res })
    })
    return () => {
      vivo = false
    }
  }, [nomeLimpo, ofertasEstado])

  // --------------------------------------------------------------- ações
  const atualizarGps = () => {
    setGps('buscando')
    void obterGps().then((r) => {
      if (r.ok) {
        salvarCoordenada(r.coord)
        setCoord(r.coord)
        setGps('ok')
      } else {
        setGps(r.motivo)
      }
    })
  }

  const buscarPorCidade = async () => {
    if (!cidade.trim()) return
    setGps('buscando')
    const c = await geocodificar(cidade)
    if (c) {
      salvarCoordenada(c)
      setCoord(c)
      setGps('ok')
    } else {
      setGps('indisponivel')
      mostrar('Não achei essa cidade — tente "Campinas, SP"')
    }
  }

  const copiarEabrir = async (url: string) => {
    try {
      if (nomeLimpo && navigator.clipboard) {
        await navigator.clipboard.writeText(nomeLimpo)
        mostrar(`"${nomeLimpo}" copiado — cole na busca do app`)
      }
    } catch {
      /* área de transferência indisponível: segue mesmo assim */
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const salvarRegistro = async () => {
    const valor = Number(regValor.replace(',', '.'))
    if (!nomeLimpo) return mostrar('Digite o nome do produto primeiro')
    if (!Number.isFinite(valor) || valor <= 0) return mostrar('Valor inválido')
    if (!regLoja.trim()) return mostrar('Informe onde você viu o preço')
    // Validade (v0.6): espelho das regras do banco — ISO, não passada, ≤90 dias.
    if (regValidade) {
      if (!dataIsoValida(regValidade) || regValidade < dataIso()) return mostrar('Validade inválida')
      if (regValidade > dataIso(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)))
        return mostrar('Validade máxima: 90 dias')
    }

    // Cidade/UF do registro (para o preço compartilhado chegar à sua região).
    // Cache primeiro; senão, reverse geocoding do GPS — e falha não trava nada.
    const regiao =
      regiaoSalva() ?? (coord ? await regiaoDaCoordenada(coord) : null)

    registrarPreco({
      produto: nomeLimpo,
      loja: regLoja.trim(),
      valor,
      marca: regMarca.trim() || undefined,
      validade: regValidade || undefined,
      registradoPor: 'eu',
      cidade: regiao?.cidade,
      uf: regiao?.uf || undefined,
    })
    setPrecosSalvos(baseCompleta(regiao?.cidade))
    setRegValor('')
    setRegLoja('')
    setRegValidade('')
    setRegistrando(false)
    if (regValidade) {
      mostrar(
        nuvemConfigurada()
          ? 'Promoção 🔥 registrada e compartilhada com a comunidade ✓'
          : 'Promoção 🔥 registrada na sua base ✓',
      )
    } else {
      mostrar(
        nuvemConfigurada()
          ? 'Preço registrado e compartilhado com a comunidade ✓'
          : 'Preço registrado na sua base ✓',
      )
    }
  }

  // Comparadores levam produto + marca na busca (quem tem marca, acha preço da marca).
  const termoBusca = [nomeLimpo, regMarca.trim() || marca?.trim()].filter(Boolean).join(' ')
  const comparadores = destinosDeComparacao(termoBusca || 'produto')
  const entregas = destinosDeEntrega(nomeLimpo)

  const textoGps: Record<EstadoGps, string> = {
    ocioso: '',
    buscando: '📍 Localizando você…',
    ok: '📍 Você está aqui — mostrando lojas em volta',
    negado: '📍 Localização negada. Use a busca por cidade ↓',
    indisponivel: '📍 GPS indisponível neste contexto (http/lan). Use a busca por cidade ↓',
    tempo: '📍 O GPS demorou. Tente de novo ou use a busca por cidade ↓',
  }

  return (
    <div className="busca">
      {/* ---------------------------------------------------- lojas por GPS */}
      <section className="busca-secao">
        <h4>📍 Onde encontrar perto de você</h4>

        {gps !== 'ok' && <p className="busca-status">{textoGps[gps]}</p>}

        {(gps === 'negado' || gps === 'indisponivel' || gps === 'tempo') && (
          <div className="busca-cidade">
            <input
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder='Sua cidade — ex.: "Campinas, SP"'
              aria-label="Buscar lojas por cidade"
            />
            <button type="button" className="btn btn-pequeno" onClick={() => void buscarPorCidade()}>
              Buscar
            </button>
          </div>
        )}

        {gps === 'ok' && (
          <div className="busca-cabecalho-lojas">
            <span className="busca-status">{lojasCarregando ? 'Procurando mercados…' : textoGps.ok}</span>
            <button type="button" className="link" onClick={atualizarGps}>
              atualizar
            </button>
          </div>
        )}

        {lojas.length > 0 && (
          <ul className="lojas">
            {lojas.slice(0, 6).map((l) => (
              <li key={l.id} className="loja">
                <div className="loja-info">
                  <strong>{l.nome}</strong>
                  <span className="loja-detalhe">
                    {l.distanciaKm < 1
                      ? `${Math.round(l.distanciaKm * 1000)} m`
                      : `${l.distanciaKm.toFixed(1).replace('.', ',')} km`}
                    {l.horario && <> · {l.horario}</>}
                    {l.telefone && <> · 📞 {l.telefone}</>}
                  </span>
                </div>
                <a
                  className="btn btn-pequeno"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🗺 Rota
                </a>
              </li>
            ))}
          </ul>
        )}

        {gps === 'ok' && !lojasCarregando && lojas.length === 0 && (
          <p className="busca-status">Nenhum mercado encontrado nesta região no mapa.</p>
        )}
      </section>

      {/* ------------------------------------------------ 🔥 promoções ativas */}
      {promocoesAtivas.length > 0 && (
        <section className="busca-secao">
          <h4>🔥 Promoções ativas ({promocoesAtivas.length})</h4>
          <ul className="precos">
            {promocoesAtivas.map((p) => {
              const daMarca = Boolean(marcaNorm && p.marca && normalizarNome(p.marca) === marcaNorm)
              return (
                <li key={p.id} className="preco-linha promo-linha">
                  <div className="loja-info">
                    <strong>
                      {brl(p.valor)} 🔥{daMarca && <> ⭐</>}
                    </strong>
                    <span className="loja-detalhe">
                      {p.marca ? `${p.marca} · ` : ''}
                      {p.fonte === 'comunidade' ? '👥 comunidade' : '👤 você'} · {p.loja} ·{' '}
                      {p.cidade ? `${p.cidade}${p.uf ? '/' + p.uf : ''} · ` : ''}válida até{' '}
                      {diaMes(p.validade ?? '')}
                    </span>
                  </div>
                  <button type="button" className="btn btn-pequeno" onClick={() => onUsarPreco(p.valor)}>
                    Usar
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="busca-status">
            Registradas por quem comprou (você ou a comunidade) — o 🔥 some sozinho quando a
            validade passa.
          </p>
        </section>
      )}

      {/* -------------------------------------------- 🌐 ofertas da web (SerpAPI) */}
      {nomeLimpo && ofertasEstado?.termo === nomeLimpo && ofertasEstado.res.itens.length > 0 && (
        <section className="busca-secao">
          <h4>🌐 Ofertas na web (Google Shopping)</h4>
          <ul className="precos">
            {ofertasEstado.res.itens.map((o, i) => {
              const daMarca = Boolean(marcaNorm && normalizarNome(o.titulo).includes(marcaNorm))
              return (
                <li key={`${o.link}-${i}`} className={daMarca ? 'preco-linha destaque-marca' : 'preco-linha'}>
                  <div className="loja-info">
                    <strong>
                      {o.valor ? brl(o.valor) : '—'}
                      {daMarca && <> ⭐</>}
                    </strong>
                    <span className="loja-detalhe">
                      {o.loja} · {o.titulo.slice(0, 48)}
                    </span>
                  </div>
                  <span className="preco-acoes">
                    {o.valor != null && (
                      <button type="button" className="btn btn-pequeno" onClick={() => onUsarPreco(o.valor!)}>
                        Usar
                      </button>
                    )}
                    {o.link && (
                      <a className="link" href={o.link} target="_blank" rel="noopener noreferrer">
                        ver oferta
                      </a>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {nomeLimpo && ofertasEstado?.termo === nomeLimpo && ofertasEstado.res.motivo === 'limite' && (
        <p className="busca-status">
          🚦 Buscas de hoje no Google Shopping acabaram (limite diário) — volta amanhã. A base
          colaborativa continua ↓.
        </p>
      )}

      {/* ------------------------------------------------------ preços */}
      <section className="busca-secao">
        <h4>💰 Preços encontrados</h4>

        {!nomeLimpo && <p className="busca-status">Digite o nome do produto para buscar preços.</p>}

        {nomeLimpo && precosBase.length === 0 && buscandoMl && (
          <p className="busca-status">Procurando preço real no Mercado Livre…</p>
        )}

        {precosBase.length > 0 && melhorPreco && (
          <p className="busca-status busca-melhor">
            🏆 Melhor preço: <strong>{brl(melhorPreco.valor)}</strong> no {melhorPreco.loja}
            {melhorPreco.marca ? ` (${melhorPreco.marca})` : ''}
            {promocaoAtiva(melhorPreco) && ' 🔥'}
            {melhorPreco.cidade ? ` · ${melhorPreco.cidade}${melhorPreco.uf ? '/' + melhorPreco.uf : ''}` : ''}
          </p>
        )}

        {precosNormais.length > 0 && (
          <ul className="precos">
            {precosNormais.map((p) => {
              const daMarca = Boolean(
                marca && p.marca && p.marca.trim().toLowerCase() === marca.trim().toLowerCase(),
              )
              return (
                <li key={p.id} className={daMarca ? 'preco-linha destaque-marca' : 'preco-linha'}>
                  <div className="loja-info">
                    <strong>
                      {brl(p.valor)}
                      {daMarca && <> ⭐</>}
                    </strong>
                    <span className="loja-detalhe">
                      {p.marca ? `${p.marca} · ` : ''}
                      {p.fonte === 'comunidade' ? '👥 comunidade' : '👤 você'} · {p.loja} ·{' '}
                      {p.cidade ? `${p.cidade}${p.uf ? '/' + p.uf : ''} · ` : ''}registrado{' '}
                      {dataCurta(p.atualizadoEm)}
                    </span>
                  </div>
                  <button type="button" className="btn btn-pequeno" onClick={() => onUsarPreco(p.valor)}>
                    Usar
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {mlDados && mlDados.length > 0 && (
          <ul className="precos">
            {mlDados.map((m, i) => (
              <li key={`${m.url}-${i}`} className="preco-linha">
                <div className="loja-info">
                  <strong>{brl(m.preco)}</strong>
                  <span className="loja-detalhe">
                    Mercado Livre {m.usado ? '· usado' : '· novo'} · {m.titulo.slice(0, 42)}
                  </span>
                </div>
                <span className="preco-acoes">
                  <button type="button" className="btn btn-pequeno" onClick={() => onUsarPreco(m.preco)}>
                    Usar
                  </button>
                  <a className="link" href={m.url} target="_blank" rel="noopener noreferrer">
                    abrir
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}

        {nomeLimpo && !buscandoMl && mlDados === null && precosBase.length === 0 && (
          <p className="busca-status">
            Sem preço na sua base ainda. Veja nos comparadores abaixo e registre o que achar ↓
          </p>
        )}

        {!registrando ? (
          <button type="button" className="btn-secundario btn-pequeno" onClick={() => setRegistrando(true)}>
            ＋ Registrar o preço que eu vi
          </button>
        ) : (
          <div className="registro">
            <label className="campo">
              <span>Valor (R$) *</span>
              <input
                inputMode="decimal"
                value={regValor}
                onChange={(e) => setRegValor(e.target.value)}
                placeholder="Ex.: 24,90"
                autoFocus
              />
            </label>
            <label className="campo">
              <span>Onde você viu? *</span>
              <input
                value={regLoja}
                onChange={(e) => setRegLoja(e.target.value)}
                placeholder="Ex.: iFood, Assaí, Carrefour…"
              />
            </label>
            <label className="campo">
              <span>Marca (opcional)</span>
              <input
                value={regMarca}
                onChange={(e) => setRegMarca(e.target.value)}
                placeholder="Ex.: Pilão, 3 Corações…"
              />
            </label>
            <label className="campo">
              <span>🔥 Promoção ativa até (opcional)</span>
              <input
                type="date"
                value={regValidade}
                min={VALIDADE_MIN}
                max={VALIDADE_MAX}
                onChange={(e) => setRegValidade(e.target.value)}
              />
            </label>
            <div className="modal-acoes">
              <button type="button" className="btn-secundario btn-pequeno" onClick={() => setRegistrando(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-pequeno" onClick={salvarRegistro}>
                {regValidade ? 'Salvar promoção 🔥' : 'Salvar preço'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ------------------------------------------- comparadores e entrega */}
      <section className="busca-secao">
        <h4>🛒 Comparar agora</h4>
        <div className="chips">
          {comparadores.map((d) => (
            <a key={d.id} className="chip" href={d.url} target="_blank" rel="noopener noreferrer">
              {d.icone} {d.nome}
            </a>
          ))}
        </div>
      </section>

      <section className="busca-secao">
        <h4>📱 Aplicativos de entrega</h4>
        <p className="busca-status">
          Eles não expõem preço em busca aberta: abrimos o app e copiamos o nome do produto para você colar —
          e o preço que vir lá você registra acima, passando a valer pra sempre.
        </p>
        <div className="chips">
          {entregas.map((d) => (
            <button key={d.id} type="button" className="chip" onClick={() => void copiarEabrir(d.url)}>
              {d.icone} {d.nome}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
