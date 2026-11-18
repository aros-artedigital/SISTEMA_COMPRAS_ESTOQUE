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
  /** Animando a saída (some do DOM logo depois). */
  saindo?: boolean
}

/** Duração da animação de saída (igual ao CSS .toast-saindo). */
const SAIDA_MS = 300

export type Notificar = (tipo: TipoToast, mensagem: string, acao?: AcaoToast) => void

const ToastContext = createContext<Notificar | null>(null)

// As cores, o vidro e as animações ficam no index.css (classes .toast-*).
const estilos: Record<TipoToast, { titulo: string; Icone: typeof Info; duracao: number }> = {
  sucesso: { titulo: 'Tudo certo', Icone: CheckCircle2, duracao: 4000 },
  erro: { titulo: 'Não foi possível concluir', Icone: XCircle, duracao: 8000 },
  aviso: { titulo: 'Atenção', Icone: AlertTriangle, duracao: 7000 },
  info: { titulo: 'Informação', Icone: Info, duracao: 5000 }
}

let proximo = 1

/**
 * Mensagens rápidas do sistema (canto superior direito): sucesso, erro, atenção e informação.
 * Somem sozinhas (a barrinha mostra o tempo); passar o mouse por cima pausa.
 * Formulários com campos inválidos também avisam aqui (evento "formulario-invalido" do useForm).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  // Primeiro anima a saída; depois tira da lista.
  const fechar = useCallback((id: number): void => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, saindo: true } : x)))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), SAIDA_MS)
  }, [])

  const notificar = useCallback<Notificar>((tipo, mensagem, acao) => {
    const id = proximo++
    // No máximo 4 na tela; a mesma mensagem repetida não empilha.
    setToasts((t) => [...t.filter((x) => x.mensagem !== mensagem && !x.saindo).slice(-3), { id, tipo, mensagem, acao }])
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
      <div className="pointer-events-none fixed right-4 top-20 z-[80] flex w-96 max-w-[calc(100vw-2rem)] flex-col">
        {toasts.map((t) => (
          // A linha da grade "fecha" (1fr → 0fr) na saída: as mensagens de baixo sobem com suavidade.
          <div key={t.id} className={`grid transition-[grid-template-rows] duration-300 ease-out ${t.saindo ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}>
            <div className={`min-h-0 ${t.saindo ? 'overflow-hidden' : ''}`}>
              <ItemToast toast={t} onFechar={() => fechar(t.id)} />
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ItemToast({ toast: t, onFechar }: { toast: Toast; onFechar: () => void }) {
  const { titulo, Icone, duracao } = estilos[t.tipo]
  const tempo = t.acao ? Math.max(duracao, 8000) : duracao
  const [pausado, setPausado] = useState(false)
  const restante = useRef(tempo)
  const inicio = useRef(Date.now())

  useEffect(() => {
    if (pausado || t.saindo) return
    inicio.current = Date.now()
    const timer = setTimeout(onFechar, restante.current)
    return () => {
      clearTimeout(timer)
      restante.current -= Date.now() - inicio.current
    }
  }, [pausado, onFechar, t.saindo])

  return (
    <div className="pb-2">
      <div
        role={t.tipo === 'erro' ? 'alert' : 'status'}
        onMouseEnter={() => setPausado(true)}
        onMouseLeave={() => setPausado(false)}
        className={`toast toast-${t.tipo} ${t.saindo ? 'toast-saindo' : 'toast-entrando'} pointer-events-auto relative rounded-2xl`}
      >
        {/* Halo de luz ao surgir (fora do recorte, para se espalhar em volta) */}
        <span aria-hidden className="toast-halo pointer-events-none absolute -inset-px rounded-2xl" />
        <div className="relative overflow-hidden rounded-2xl">
          <span aria-hidden className="toast-tinta pointer-events-none absolute inset-0" />
          <span aria-hidden className="toast-brilho pointer-events-none absolute inset-y-0 left-0 w-1/3" />
          <div className="relative flex items-start gap-3 px-4 py-3">
            <span className="toast-icone flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
              <Icone size={19} />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-slate-900">{titulo}</p>
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
            <button onClick={onFechar} className="rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-500/10 hover:text-slate-700" aria-label="Fechar">
              <X size={16} />
            </button>
          </div>
          <span
            className="toast-tempo toast-barra absolute bottom-0 left-0 h-[3px] rounded-full"
            style={{ animationDuration: `${tempo}ms`, animationPlayState: pausado ? 'paused' : 'running' }}
          />
        </div>
      </div>
    </div>
  )
}

export function useToast(): Notificar {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
