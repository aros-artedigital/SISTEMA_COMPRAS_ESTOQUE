import { createContext, useContext, useState, type ReactNode } from 'react'
import { chamar, ErroApp } from '@/data/api'
import { limpar, recarregar, useDb } from '@/data/store'
import { pode as podePerfil, type Recurso } from '@shared/permissoes'
import type { Usuario } from '@shared/tipos'

interface AuthValue {
  usuario: Usuario | null
  /** Retorna mensagem de erro ou null em caso de sucesso. */
  entrar: (login: string, senha: string) => Promise<string | null>
  sair: () => Promise<void>
  pode: (recurso: Recurso) => boolean
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [logado, setLogado] = useState<Usuario | null>(null)
  const { usuarios } = useDb()
  // Lê do store para refletir edições no próprio perfil; a sessão real fica no processo principal.
  const usuario = logado ? (usuarios.find((u) => u.id === logado.id) ?? logado) : null

  async function entrar(login: string, senha: string): Promise<string | null> {
    try {
      const u = await chamar('auth:entrar', login, senha)
      await recarregar()
      setLogado(u)
      return null
    } catch (e) {
      return e instanceof ErroApp ? e.message : 'Não foi possível entrar. Tente novamente.'
    }
  }

  async function sair(): Promise<void> {
    await chamar('auth:sair').catch(() => undefined)
    setLogado(null)
    limpar()
  }

  const value: AuthValue = {
    usuario,
    entrar,
    sair,
    pode: (recurso) => (usuario ? podePerfil(usuario.perfil, recurso) : false)
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
