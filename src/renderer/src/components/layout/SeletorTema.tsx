import { useEffect, useRef, useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { definirTema, useTema, type Tema } from '@/lib/tema'

const opcoes: { tema: Tema; rotulo: string; icone: typeof Sun }[] = [
  { tema: 'claro', rotulo: 'Claro', icone: Sun },
  { tema: 'escuro', rotulo: 'Escuro', icone: Moon },
  { tema: 'automatico', rotulo: 'Automático (igual ao Windows)', icone: Monitor }
]

/** Botão da barra superior para escolher o tema (claro, escuro ou automático). */
export function SeletorTema() {
  const { tema, escuro } = useTema()
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
        title="Tema da tela (Ctrl+Shift+D alterna claro/escuro)"
        aria-label="Tema da tela"
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        <Icone size={18} />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-superficie py-1 shadow-lg">
          {opcoes.map(({ tema: t, rotulo, icone: I }) => (
            <button
              key={t}
              role="menuitemradio"
              aria-checked={tema === t}
              onClick={() => {
                definirTema(t)
                setAberto(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <I size={16} className="text-slate-500" />
              <span className="flex-1">{rotulo}</span>
              {tema === t && <Check size={16} className="text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
