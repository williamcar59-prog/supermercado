// Registro do service worker + aviso "nova versão" (prompt, nunca força) +
// botão "Instalar app" (beforeinstallprompt) + dica de instalação no iOS.
//
// Por que registro nosso e não o automático do plugin (injectRegister: false):
// queremos CONTROLAR o aviso de atualização — ver manual 04.

import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** Evento nativo do Chrome/Edge/Android que libera o botão de instalação. */
interface EventoInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** iOS (Safari) não dispara beforeinstallprompt: a dica é manual. */
function ehIosDescasado(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const jaAbriuComoApp = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  return ios && !jaAbriuComoApp
}

export function Pwa() {
  const [precisaAtualizar, setPrecisaAtualizar] = useState(false)
  const [eventoInstalar, setEventoInstalar] = useState<EventoInstalar | null>(null)
  // Dica do iOS não depende do SW (Safari não tem beforeinstallprompt de jeito nenhum).
  const [dicaIos] = useState(ehIosDescasado)
  const atualizarSw = useRef<((recarregar?: boolean) => Promise<void>) | null>(null)

  // Botão instalar: só existe quando o navegador ofereceu o evento.
  useEffect(() => {
    const capturar = (e: Event) => {
      e.preventDefault() // senão o Chrome mostra a barra própria e some com o evento
      setEventoInstalar(e as EventoInstalar)
    }
    const instalado = () => setEventoInstalar(null)
    window.addEventListener('beforeinstallprompt', capturar)
    window.addEventListener('appinstalled', instalado)
    return () => {
      window.removeEventListener('beforeinstallprompt', capturar)
      window.removeEventListener('appinstalled', instalado)
    }
  }, [])

  // Registro do SW (uma vez, dura a vida da página — sem cleanup que
  // pudesse recarregar). Versão nova chega pelo onNeedRefresh.
  useEffect(() => {
    atualizarSw.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setPrecisaAtualizar(true),
    })
  }, [])

  const instalar = async () => {
    if (!eventoInstalar) return
    await eventoInstalar.prompt()
    const { outcome } = await eventoInstalar.userChoice
    if (outcome === 'accepted') setEventoInstalar(null)
  }

  if (!precisaAtualizar && !eventoInstalar && !dicaIos) return null

  return (
    <div className="pwa-barra" role="status">
      {precisaAtualizar ? (
        <>
          <span>🔄 Nova versão disponível</span>
          <button
            type="button"
            className="btn btn-pequeno"
            onClick={() => void atualizarSw.current?.(true)}
          >
            Atualizar
          </button>
        </>
      ) : eventoInstalar ? (
        <>
          <span>📲 Instale o SuperMercado no seu aparelho</span>
          <button type="button" className="btn btn-pequeno" onClick={() => void instalar()}>
            Instalar
          </button>
        </>
      ) : (
        <span>
          📲 No iPhone: ➡️ <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>
        </span>
      )}
    </div>
  )
}
