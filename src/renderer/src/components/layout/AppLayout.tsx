import { Navigate, Outlet } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import type { Recurso } from '@/lib/permissoes'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppLayout() {
  const { usuario } = useAuth()
  if (!usuario) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto px-8 py-7">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

/** Bloqueia a rota se o perfil do usuário não tiver acesso ao recurso. */
export function Protegido({ recurso, children }: { recurso: Recurso; children: JSX.Element }) {
  const { pode } = useAuth()
  if (pode(recurso)) return children
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <ShieldOff size={48} className="mb-4 text-slate-300" />
      <h1 className="text-xl font-semibold text-slate-800">Acesso negado</h1>
      <p className="mt-1 text-sm text-slate-500">Seu perfil não tem permissão para acessar esta tela.</p>
    </div>
  )
}
