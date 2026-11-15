import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

type TipoToast = 'sucesso' | 'erro' | 'aviso' | 'info'

export interface AcaoToast {
  rotulo: string
  executar: () => void
}

interface Toast {
  id: number
  tipo: TipoToast
  mensagem: string
  acao?: AcaoToast
}

export type Notificar = (tipo: TipoToast, mensagem: string, acao?: AcaoToast) => void

const ToastContext = createContext<Notificar | null>(null)

const estilos: Record<TipoToast, { titulo: string; faixa: string; icone: string; barra: string; Icone: typeof Info; duracao: number }> = {
  sucesso: { titulo: 'Tudo certo', faixa: 'border-l-emerald-500', icone: 'bg-emerald-100 text-emerald-600', barra: 'bg-emerald-500', Icone: CheckCircle2, duracao: 4000 },
  erro: { titulo: 'Não foi possível concluir', faixa: 'border-l-red-500', icone: 'bg-red-100 text-red-600', barra: 'bg-red-500', Icone: XCircle, duracao: 8000 },
  aviso: { titulo: 'Atenção', faixa: 'border-l-amber-500', icone: 'bg-amber-100 text-amber-600', barra: 'bg-amber-500', Icone: AlertTriangle, duracao: 7000 },
  info: { titulo: 'Informação', faixa: 'border-l-blue-500', icone: 'bg-blue-100 text-blue-600', barra: 'bg-blue-500', Icone: Info, duracao: 5000 }
}

let proximo = 1

/**
 * Mensagens rápidas do sistema (canto superior direito): sucesso, erro, atenção e informação.
 * Somem sozinhas (a barrinha mostra o tempo); passar o mouse por cima pausa.
 * Formulários com campos inválidos também avisam aqui (evento "formulario-invalido" do useForm).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const fechar = useCallback((id: number): void => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const notificar = useCallback<Notificar>((tipo, mensagem, acao) => {
    const id = proximo++
    // No máximo 4 na tela; a mesma mensagem repetida não empilha.
    setToasts((t) => [...t.filter((x) => x.mensagem !== mensagem).slice(-3), { id, tipo, mensagem, acao }])
  }, [])

  useEffect(() => {
    const invalido = (e: Event): void => {
      const n = (e as CustomEvent<number>).detail
      notificar('aviso', n > 1 ? `Verifique os ${n} campos destacados em vermelho.` : 'Verifique o campo destacado em vermelho.')
    }
    window.addEventListener('formulario-invalido', invalido)
    return () => window.removeEventListener('formulario-invalido', invalido)
  }, [notificar])

  return (
    <ToastContext.Provider value={notificar}>
      {children}
      <div className="pointer-events-none fixed right-4 top-20 z-[80] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <ItemToast key={t.id} toast={t} onFechar={() => fechar(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ItemToast({ toast: t, onFechar }: { toast: Toast; onFechar: () => void }) {
  const { titulo, faixa, icone, barra, Icone, duracao } = estilos[t.tipo]
  const tempo = t.acao ? Math.max(duracao, 8000) : duracao
  const [pausado, setPausado] = useState(false)
  const restante = useRef(tempo)
  const inicio = useRef(Date.now())

  useEffect(() => {
    if (pausado) return
    inicio.current = Date.now()
    const timer = setTimeout(onFechar, restante.current)
    return () => {
      clearTimeout(timer)
      restante.current -= Date.now() - inicio.current
    }
  }, [pausado, onFechar])

  return (
    <div
      role={t.tipo === 'erro' ? 'alert' : 'status'}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      className={`toast-entrada pointer-events-auto relative overflow-hidden rounded-xl border border-l-4 border-slate-200 bg-superficie shadow-lg ${faixa}`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${icone}`}>
          <Icone size={18} />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-slate-800">{titulo}</p>
          <p className="mt-0.5 break-words text-slate-600">{t.mensagem}</p>
          {t.acao && (
            <button
              onClick={() => {
                t.acao?.executar()
                onFechar()
              }}
              className="mt-1.5 font-semibold text-blue-600 underline underline-offset-2 hover:no-underline"
            >
              {t.acao.rotulo}
            </button>
          )}
        </div>
        <button onClick={onFechar} className="rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar">
          <X size={16} />
        </button>
      </div>
      <span
        className={`toast-tempo absolute bottom-0 left-0 h-0.5 ${barra}`}
        style={{ animationDuration: `${tempo}ms`, animationPlayState: pausado ? 'paused' : 'running' }}
      />
    </div>
  )
}

export function useToast(): Notificar {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
