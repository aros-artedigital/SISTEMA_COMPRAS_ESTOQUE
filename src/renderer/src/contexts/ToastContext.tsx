import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

type TipoToast = 'sucesso' | 'erro' | 'aviso' | 'info'

interface Toast {
  id: number
  tipo: TipoToast
  mensagem: string
}

export type Notificar = (tipo: TipoToast, mensagem: string) => void

const ToastContext = createContext<Notificar | null>(null)

const estilos: Record<TipoToast, { cls: string; Icone: typeof Info }> = {
  sucesso: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icone: CheckCircle2 },
  erro: { cls: 'border-red-200 bg-red-50 text-red-800', Icone: XCircle },
  aviso: { cls: 'border-amber-200 bg-amber-50 text-amber-800', Icone: AlertTriangle },
  info: { cls: 'border-blue-200 bg-blue-50 text-blue-800', Icone: Info }
}

let proximo = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const fechar = (id: number): void => setToasts((t) => t.filter((x) => x.id !== id))

  const notificar = useCallback<Notificar>((tipo, mensagem) => {
    const id = proximo++
    setToasts((t) => [...t, { id, tipo, mensagem }])
    setTimeout(() => fechar(id), 4000)
  }, [])

  return (
    <ToastContext.Provider value={notificar}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => {
          const { cls, Icone } = estilos[t.tipo]
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-md ${cls}`}
            >
              <Icone size={18} className="mt-0.5 shrink-0" />
              <span className="flex-1">{t.mensagem}</span>
              <button onClick={() => fechar(t.id)} className="opacity-60 hover:opacity-100" aria-label="Fechar">
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): Notificar {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
