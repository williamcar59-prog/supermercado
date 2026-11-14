// Avisos rápidos para o usuário (toast). Contexto pequeno, separado do de dados.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface Toast {
  id: number
  texto: string
  acao?: { rotulo: string; aoClicar: () => void }
}

interface ToastCtx {
  mostrar: (texto: string, acao?: Toast['acao']) => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [atual, setAtual] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mostrar = useCallback((texto: string, acao?: Toast['acao']) => {
    if (timer.current) clearTimeout(timer.current)
    setAtual({ id: Date.now(), texto, acao })
    timer.current = setTimeout(() => setAtual(null), acao ? 6000 : 3000)
  }, [])

  return (
    <Ctx.Provider value={{ mostrar }}>
      {children}
      {atual && (
        <div className="toast" role="status" key={atual.id}>
          <span>{atual.texto}</span>
          {atual.acao && (
            <button type="button" className="toast-acao" onClick={atual.acao.aoClicar}>
              {atual.acao.rotulo}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  )
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>')
  return ctx
}
