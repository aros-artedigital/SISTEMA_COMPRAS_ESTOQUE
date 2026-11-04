import type { LucideIcon } from 'lucide-react'

interface Props {
  titulo: string
  valor: string
  detalhe?: string
  icone: LucideIcon
  corIcone?: string
}

export function StatCard({ titulo, valor, detalhe, icone: Icone, corIcone = 'bg-blue-50 text-blue-600' }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{titulo}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${corIcone}`}>
          <Icone size={18} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-slate-500">{detalhe}</p>}
    </div>
  )
}
