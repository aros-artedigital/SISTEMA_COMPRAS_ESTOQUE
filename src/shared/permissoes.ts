import type { Perfil } from '@shared/tipos'

export type Recurso =
  | 'dashboard'
  | 'produtos'
  | 'cadastros'
  | 'compras'
  | 'estoque'
  | 'fornecedores'
  | 'clientes'
  | 'usuarios'
  | 'configuracoes'

const permissoes: Record<Perfil, Recurso[]> = {
  admin: ['dashboard', 'produtos', 'cadastros', 'compras', 'estoque', 'fornecedores', 'clientes', 'usuarios', 'configuracoes'],
  gerente: ['dashboard', 'produtos', 'cadastros', 'compras', 'estoque', 'fornecedores', 'clientes'],
  operador: ['dashboard', 'produtos', 'estoque', 'clientes']
}

export function pode(perfil: Perfil, recurso: Recurso): boolean {
  return permissoes[perfil].includes(recurso)
}

export const nomePerfil: Record<Perfil, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  operador: 'Operador'
}
