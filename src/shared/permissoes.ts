import type { Perfil } from '@shared/tipos'

export type Recurso =
  | 'dashboard'
  | 'produtos'
  | 'cadastros'
  | 'compras'
  | 'estoque'
  | 'fornecedores'
  | 'clientes'
  | 'vendas'
  | 'vendasCancelar'
  | 'inventarioConcluir'
  | 'relatorios'
  | 'usuarios'
  | 'configuracoes'

const permissoes: Record<Perfil, Recurso[]> = {
  admin: ['dashboard', 'vendas', 'vendasCancelar', 'inventarioConcluir', 'produtos', 'cadastros', 'compras', 'estoque', 'fornecedores', 'clientes', 'relatorios', 'usuarios', 'configuracoes'],
  gerente: ['dashboard', 'vendas', 'vendasCancelar', 'inventarioConcluir', 'produtos', 'cadastros', 'compras', 'estoque', 'fornecedores', 'clientes', 'relatorios'],
  operador: ['dashboard', 'vendas', 'produtos', 'estoque', 'clientes']
}

export function pode(perfil: Perfil, recurso: Recurso): boolean {
  return permissoes[perfil].includes(recurso)
}

export const nomePerfil: Record<Perfil, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  operador: 'Operador'
}
