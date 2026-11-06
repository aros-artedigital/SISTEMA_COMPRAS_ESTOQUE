import {
  ArrowLeftRight,
  Boxes,
  FileBarChart,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Tags,
  Truck,
  UserCog,
  Users,
  type LucideIcon
} from 'lucide-react'
import type { Recurso } from '@shared/permissoes'

export interface ItemMenu {
  caminho: string
  titulo: string
  icone: LucideIcon
  recurso: Recurso
}

export interface GrupoMenu {
  titulo?: string
  itens: ItemMenu[]
}

export const menu: GrupoMenu[] = [
  {
    itens: [
      { caminho: '/', titulo: 'Início', icone: LayoutDashboard, recurso: 'dashboard' },
      { caminho: '/vendas', titulo: 'Vendas', icone: Receipt, recurso: 'vendas' }
    ]
  },
  {
    titulo: 'Estoque',
    itens: [
      { caminho: '/produtos', titulo: 'Produtos', icone: Package, recurso: 'produtos' },
      { caminho: '/categorias', titulo: 'Categorias e Unidades', icone: Tags, recurso: 'cadastros' },
      { caminho: '/estoque', titulo: 'Movimentações', icone: ArrowLeftRight, recurso: 'estoque' }
    ]
  },
  {
    titulo: 'Compras',
    itens: [
      { caminho: '/compras', titulo: 'Compras', icone: ShoppingCart, recurso: 'compras' },
      { caminho: '/fornecedores', titulo: 'Fornecedores', icone: Truck, recurso: 'fornecedores' }
    ]
  },
  {
    titulo: 'Cadastros',
    itens: [
      { caminho: '/clientes', titulo: 'Clientes', icone: Users, recurso: 'clientes' },
      { caminho: '/usuarios', titulo: 'Usuários', icone: UserCog, recurso: 'usuarios' }
    ]
  },
  {
    titulo: 'Sistema',
    itens: [
      { caminho: '/relatorios', titulo: 'Relatórios', icone: FileBarChart, recurso: 'relatorios' },
      { caminho: '/configuracoes', titulo: 'Configurações', icone: Settings, recurso: 'configuracoes' }
    ]
  }
]

export const iconeMarca = Boxes

/** Título exibido na barra superior para cada rota. */
export const titulos: Record<string, string> = {
  '/': 'Início',
  '/vendas': 'Vendas',
  '/produtos': 'Produtos',
  '/categorias': 'Categorias e Unidades',
  '/estoque': 'Movimentações de Estoque',
  '/compras': 'Compras',
  '/fornecedores': 'Fornecedores',
  '/clientes': 'Clientes',
  '/usuarios': 'Usuários',
  '/relatorios': 'Relatórios',
  '/configuracoes': 'Configurações',
  '/perfil': 'Meu Perfil'
}
