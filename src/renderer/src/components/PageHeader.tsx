import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { iconeDaTela } from './layout/navegacao'

/** Título da tela, com o ícone do menu (ou outro, via `icone`). */
export function PageHeader({ titulo, subtitulo, acoes, icone }: { titulo: string; subtitulo?: string; acoes?: ReactNode; icone?: LucideIcon }) {
  const { pathname } = useLocation()
  const Icone = icone ?? iconeDaTela(pathname)
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-4">
        {Icone && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600" aria-hidden="true">
            <Icone size={24} />
          </span>
        )}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-sm text-slate-500">{subtitulo}</p>}
        </div>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  )
}

/** Barra de filtros acima das tabelas. */
export function Filtros({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-3">{children}</div>
}
