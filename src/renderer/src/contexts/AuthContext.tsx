import { createContext, useContext, useState, type ReactNode } from 'react'
import { getDb, useDb } from '@/data/store'
import { pode as podePerfil, type Recurso } from '@/lib/permissoes'
import type { Usuario } from '@/types'

interface AuthValue {
  usuario: Usuario | null
  entrar: (login: string, senha: string) => string | null
  sair: () => void
  pode: (recurso: Recurso) => boolean
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuarioId, setUsuarioId] = useState<number | null>(null)
  const { usuarios } = useDb()
  // Sempre lê do store para refletir edições no próprio perfil.
  const usuario = usuarios.find((u) => u.id === usuarioId && u.ativo) ?? null

  /** Retorna mensagem de erro ou null em caso de sucesso. */
  function entrar(login: string, senha: string): string | null {
    const u = getDb().usuarios.find((x) => x.login === login.trim().toLowerCase())
    if (!u || u.senha !== senha) return 'Login ou senha inválidos.'
    if (!u.ativo) return 'Usuário inativo. Procure o administrador.'
    setUsuarioId(u.id)
    return null
  }

  const value: AuthValue = {
    usuario,
    entrar,
    sair: () => setUsuarioId(null),
    pode: (recurso) => (usuario ? podePerfil(usuario.perfil, recurso) : false)
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
