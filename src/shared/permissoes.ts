import type { Perfil } from '@shared/tipos'

// Permissões. Cada usuário tem um perfil (Administrador, Gerente, Operador) ou, no perfil
// "Personalizado", uma lista própria de permissões marcada pelo administrador.
// A regra vale nos dois lados: a interface esconde o que não pode, e o processo principal recusa.

export type Recurso =
  | 'dashboard'
  | 'vendas'
  | 'vendasCancelar'
  | 'caixa'
  | 'financeiro'
  | 'financeiroEditar'
  | 'financeiroExcluir'
  | 'produtos'
  | 'produtosEditar'
  | 'produtosExcluir'
  | 'cadastros'
  | 'cadastrosEditar'
  | 'cadastrosExcluir'
  | 'estoque'
  | 'inventarioConcluir'
  | 'estoqueEstornar'
  | 'compras'
  | 'comprasEditar'
  | 'comprasExcluir'
  | 'fornecedores'
  | 'fornecedoresEditar'
  | 'fornecedoresExcluir'
  | 'clientes'
  | 'clientesEditar'
  | 'clientesExcluir'
  | 'os'
  | 'osEditar'
  | 'osExcluir'
  | 'osSenha'
  | 'relatorios'
  | 'usuarios'
  | 'configuracoes'
  | 'auditoria'

export const TODOS_RECURSOS: Recurso[] = [
  'dashboard',
  'vendas',
  'vendasCancelar',
  'caixa',
  'financeiro',
  'financeiroEditar',
  'financeiroExcluir',
  'produtos',
  'produtosEditar',
  'produtosExcluir',
  'cadastros',
  'cadastrosEditar',
  'cadastrosExcluir',
  'estoque',
  'inventarioConcluir',
  'estoqueEstornar',
  'compras',
  'comprasEditar',
  'comprasExcluir',
  'fornecedores',
  'fornecedoresEditar',
  'fornecedoresExcluir',
  'clientes',
  'clientesEditar',
  'clientesExcluir',
  'os',
  'osEditar',
  'osExcluir',
  'osSenha',
  'relatorios',
  'usuarios',
  'configuracoes',
  'auditoria'
]

/** Só administradores: não entram no perfil personalizado (evita que alguém se dê mais acesso). */
export const SO_ADMIN: Recurso[] = ['usuarios', 'configuracoes', 'auditoria']

/** Áreas com "ver / cadastrar e editar / excluir" separados. */
export type Area = 'produtos' | 'cadastros' | 'compras' | 'fornecedores' | 'clientes' | 'os' | 'financeiro'
export const editar = (a: Area): Recurso => `${a}Editar` as Recurso
export const excluir = (a: Area): Recurso => `${a}Excluir` as Recurso
const area = (a: Area): Recurso[] => [a, editar(a), excluir(a)]

const permissoes: Record<Perfil, Recurso[]> = {
  admin: TODOS_RECURSOS,
  gerente: TODOS_RECURSOS.filter((r) => !SO_ADMIN.includes(r)),
  operador: ['dashboard', 'vendas', 'caixa', ...area('produtos'), 'estoque', ...area('clientes'), 'os', 'osEditar']
}

/** Permissões de um perfil padrão. */
export function podePerfil(perfil: Perfil, recurso: Recurso): boolean {
  return permissoes[perfil].includes(recurso)
}

export const permissoesDoPerfil = (perfil: Perfil): Recurso[] => [...permissoes[perfil]]

/** Usuário com perfil padrão ou personalizado (permissoes preenchido). */
export function pode(u: { perfil: Perfil; permissoes?: Recurso[] | null }, recurso: Recurso): boolean {
  if (u.permissoes) return u.permissoes.includes(recurso) && !SO_ADMIN.includes(recurso)
  return podePerfil(u.perfil, recurso)
}

/** Lista guardada no banco → só permissões conhecidas e permitidas no personalizado. */
export function limparPermissoes(lista: unknown): Recurso[] | null {
  if (!Array.isArray(lista)) return null
  const validas = lista.filter((r): r is Recurso => TODOS_RECURSOS.includes(r as Recurso) && !SO_ADMIN.includes(r as Recurso))
  // "Editar" e "excluir" sem "ver" não fazem sentido: a tela nem abriria.
  return validas.filter((r) => {
    const base = r.replace(/(Editar|Excluir)$/, '') as Recurso
    return base === r || validas.includes(base)
  })
}

export const nomePerfil: Record<Perfil, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  operador: 'Operador'
}

export const nomeDoUsuarioPerfil = (u: { perfil: Perfil; permissoes?: Recurso[] | null }): string => (u.permissoes ? 'Personalizado' : nomePerfil[u.perfil])

/** Grupos da tela de permissões: cada linha é uma tela, com as ações possíveis. */
export const GRUPOS_PERMISSAO: { tela: string; ver: Recurso; editar?: Recurso; excluir?: Recurso; extras?: { recurso: Recurso; nome: string }[] }[] = [
  { tela: 'Início (painel)', ver: 'dashboard' },
  { tela: 'Vendas', ver: 'vendas', extras: [{ recurso: 'vendasCancelar', nome: 'Cancelar vendas' }] },
  { tela: 'Caixa', ver: 'caixa' },
  { tela: 'Contas a receber e a pagar', ver: 'financeiro', editar: 'financeiroEditar', excluir: 'financeiroExcluir' },
  { tela: 'Ordens de Serviço', ver: 'os', editar: 'osEditar', excluir: 'osExcluir', extras: [{ recurso: 'osSenha', nome: 'Ver senha do equipamento' }] },
  { tela: 'Produtos', ver: 'produtos', editar: 'produtosEditar', excluir: 'produtosExcluir' },
  { tela: 'Categorias e Unidades', ver: 'cadastros', editar: 'cadastrosEditar', excluir: 'cadastrosExcluir' },
  {
    tela: 'Movimentações e Inventário',
    ver: 'estoque',
    extras: [
      { recurso: 'inventarioConcluir', nome: 'Concluir inventário' },
      { recurso: 'estoqueEstornar', nome: 'Estornar movimentação' }
    ]
  },
  { tela: 'Compras', ver: 'compras', editar: 'comprasEditar', excluir: 'comprasExcluir' },
  { tela: 'Fornecedores', ver: 'fornecedores', editar: 'fornecedoresEditar', excluir: 'fornecedoresExcluir' },
  { tela: 'Clientes', ver: 'clientes', editar: 'clientesEditar', excluir: 'clientesExcluir' },
  { tela: 'Relatórios', ver: 'relatorios' },
  { tela: 'Usuários', ver: 'usuarios' },
  { tela: 'Configurações', ver: 'configuracoes' },
  { tela: 'Auditoria', ver: 'auditoria' }
]

/** Nome de cada permissão (auditoria, mensagens). */
export function nomeRecurso(r: Recurso): string {
  for (const g of GRUPOS_PERMISSAO) {
    if (g.ver === r) return g.tela
    if (g.editar === r) return `${g.tela}: cadastrar e editar`
    if (g.excluir === r) return `${g.tela}: excluir`
    const extra = g.extras?.find((e) => e.recurso === r)
    if (extra) return extra.nome
  }
  return r
}
