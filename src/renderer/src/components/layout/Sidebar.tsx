import { NavLink } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { iconeMarca as Marca, menu } from './navegacao'

export function Sidebar() {
  const { pode } = useAuth()

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-slate-200">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Marca size={20} />
        </div>
        <span className="whitespace-nowrap text-base font-bold text-white">Estoque e Compras</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {menu.map((grupo, i) => {
          const itens = grupo.itens.filter((item) => pode(item.recurso))
          if (itens.length === 0) return null
          return (
            <div key={grupo.titulo ?? i} className="mt-3 first:mt-0">
              {grupo.titulo && (
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{grupo.titulo}</p>
              )}
              {itens.map(({ caminho, titulo, icone: Icone }) => (
                <NavLink
                  key={caminho}
                  to={caminho}
                  end={caminho === '/'}
                  className={({ isActive }) =>
                    `mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      isActive ? 'bg-blue-600 font-medium text-white shadow' : 'text-slate-300 hover:bg-sidebar-hover hover:text-white'
                    }`
                  }
                >
                  <Icone size={18} />
                  {titulo}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border px-5 py-3 text-[11px] text-slate-400">Versão 0.3.0 · banco local</div>
    </aside>
  )
}
