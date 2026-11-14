// Shell do app: abas Lista / Histórico + rodapé com versão visível.

import { useEffect, useState } from 'react'
import { ListaProvider } from './app/ListaContext'
import { Pwa } from './app/Pwa'
import { ToastProvider } from './app/Toast'
import { sincronizarNuvem } from './lib/nuvem'
import { TelaLista } from './pages/TelaLista'
import { TelaPrecos } from './pages/TelaPrecos'
import { TelaHistorico } from './pages/TelaHistorico'

type Aba = 'lista' | 'precos' | 'historico'

declare const __VERSAO__: string
declare const __BUILD__: string

function conteudo() {
  // typeof protege em contexto sem o define (ex.: teste importado fora do Vite).
  const versao = typeof __VERSAO__ !== 'undefined' ? __VERSAO__ : '0.0.0'
  const build = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev'
  return { versao, build }
}

function Shell() {
  const [aba, setAba] = useState<Aba>('lista')
  const { versao, build } = conteudo()

  // Base compartilhada (v0.4): no boot, envia o que acumulou e baixa o que a
  // comunidade registrou; ao religar a rede, tenta de novo. Silencioso — sem
  // nuvem configurada, sincronizarNuvem() é um no-op.
  useEffect(() => {
    void sincronizarNuvem()
    const aoVoltarRede = () => void sincronizarNuvem()
    window.addEventListener('online', aoVoltarRede)
    return () => window.removeEventListener('online', aoVoltarRede)
  }, [])

  return (
    <div className="app">
      <header className="topo">
        <span className="topo-logo">🛒</span>
        <div>
          <h1 className="topo-titulo">SuperMercado</h1>
          <p className="topo-sub">Lista de compras</p>
        </div>
      </header>

      <nav className="abas" role="tablist" aria-label="Seções">
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'lista'}
          className={aba === 'lista' ? 'aba ativa' : 'aba'}
          onClick={() => setAba('lista')}
        >
          🛒 Lista
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'precos'}
          className={aba === 'precos' ? 'aba ativa' : 'aba'}
          onClick={() => setAba('precos')}
        >
          💰 Preços
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'historico'}
          className={aba === 'historico' ? 'aba ativa' : 'aba'}
          onClick={() => setAba('historico')}
        >
          🗂 Histórico
        </button>
      </nav>

      <Pwa />

      <main className="conteudo">
        {aba === 'lista' ? <TelaLista /> : aba === 'precos' ? <TelaPrecos /> : <TelaHistorico />}
      </main>

      <footer className="rodape" title={`Build: ${build}`}>
        v{versao} · dados guardados neste aparelho
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <ListaProvider>
        <Shell />
      </ListaProvider>
    </ToastProvider>
  )
}
