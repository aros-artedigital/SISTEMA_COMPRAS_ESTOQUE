import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { definirFonte, definirModo, useAparencia, type Fonte, type Modo } from '@/lib/tema'

const modos: { modo: Modo; rotulo: string; icone: typeof Sun }[] = [
  { modo: 'claro', rotulo: 'Claro', icone: Sun },
  { modo: 'escuro', rotulo: 'Escuro', icone: Moon },
  { modo: 'automatico', rotulo: 'Automático (igual ao Windows)', icone: Monitor }
]
const fontes: { fonte: Fonte; rotulo: string; amostra: string }[] = [
  { fonte: 'pequena', rotulo: 'Pequena', amostra: 'text-xs' },
  { fonte: 'normal', rotulo: 'Normal', amostra: 'text-sm' },
  { fonte: 'grande', rotulo: 'Grande', amostra: 'text-base' }
]

/** Botão da barra superior: modo claro/escuro e tamanho da letra (escolhas de cada computador). */
export function MenuAparencia() {
  const { modo, escuro, fonte } = useAparencia()
  const { pode } = useAuth()
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fora = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const Icone = escuro ? Moon : Sun
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        title="Aparência: claro/escuro e tamanho da letra (Ctrl+Shift+D alterna claro/escuro)"
        aria-label="Tema da tela"
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        <Icone size={18} />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-lg border border-slate-200 bg-superficie py-1 shadow-lg">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Modo</p>
          {modos.map(({ modo: m, rotulo, icone: I }) => (
            <button
              key={m}
              role="menuitemradio"
              aria-checked={modo === m}
              onClick={() => definirModo(m)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <I size={16} className="text-slate-500" />
              <span className="flex-1">{rotulo}</span>
              {modo === m && <Check size={16} className="text-blue-600" />}
            </button>
          ))}

          <p className="mt-1 border-t border-slate-100 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tamanho da letra</p>
          <div className="grid grid-cols-3 gap-1.5 px-3 pb-2" role="group" aria-label="Tamanho da letra">
            {fontes.map(({ fonte: f, rotulo, amostra }) => (
              <button
                key={f}
                role="menuitemradio"
                aria-checked={fonte === f}
                onClick={() => definirFonte(f)}
                className={`flex flex-col items-center rounded-lg border px-2 py-1.5 ${
                  fonte === f ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className={`font-semibold leading-tight ${amostra}`}>Aa</span>
                <span className="text-[11px]">{rotulo}</span>
              </button>
            ))}
          </div>

          {pode('configuracoes') && (
            <Link
              to="/configuracoes?aba=aparencia"
              onClick={() => setAberto(false)}
              className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-sm text-blue-600 hover:bg-slate-50"
            >
              <Palette size={16} /> Cores e tema da empresa...
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
