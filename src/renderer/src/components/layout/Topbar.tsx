import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, Keyboard, LogOut, UserCircle } from 'lucide-react'
import { SeletorTema } from './SeletorTema'
import { useAuth } from '@/contexts/AuthContext'
import { useDb } from '@/data/store'
import { nomePerfil } from '@shared/permissoes'
import { titulos } from './navegacao'
import { IndicadorSync } from './IndicadorSync'

export function Topbar() {
  const { pathname } = useLocation()
  const { usuario, sair } = useAuth()
  const { configuracoes } = useDb()
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fora = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  if (!usuario) return null
  const iniciais = usuario.nome
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-superficie px-6">
      <span className="font-semibold text-slate-800">{titulos[pathname] ?? ''}</span>

      <div className="flex items-center gap-4">
        <IndicadorSync />
        <SeletorTema />
        <button
          onClick={() => window.dispatchEvent(new Event('abrir-atalhos'))}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          title="Atalhos de teclado (F1)"
          aria-label="Atalhos de teclado"
        >
          <Keyboard size={18} />
        </button>
        <span className="hidden text-sm text-slate-600 xl:inline">{configuracoes.nomeEmpresa}</span>
        <div className="relative" ref={ref}>
          <button
            onClick={() => setAberto((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
            aria-haspopup="menu"
            aria-expanded={aberto}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">{iniciais}</span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-medium text-slate-800">{usuario.nome}</span>
              <span className="block text-xs text-slate-500">{nomePerfil[usuario.perfil]}</span>
            </span>
            <ChevronDown size={16} className="text-slate-400" />
          </button>

          {aberto && (
            <div role="menu" className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-superficie py-1 shadow-lg">
              <Link
                to="/perfil"
                onClick={() => setAberto(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <UserCircle size={16} /> Meu perfil
              </Link>
              <button onClick={sair} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                <LogOut size={16} /> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
