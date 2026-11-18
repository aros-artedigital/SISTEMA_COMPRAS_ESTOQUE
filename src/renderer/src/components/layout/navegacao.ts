import {
  ArrowLeftRight,
  ClipboardCheck,
  Boxes,
  FileBarChart,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Tags,
  Truck,
  UserCircle,
  UserCog,
  Users,
  Wallet,
  Wrench,
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
      { caminho: '/vendas', titulo: 'Vendas', icone: Receipt, recurso: 'vendas' },
      { caminho: '/os', titulo: 'Ordens de Serviço', icone: Wrench, recurso: 'os' }
    ]
  },
  {
    titulo: 'Financeiro',
    itens: [
      { caminho: '/caixa', titulo: 'Caixa', icone: Wallet, recurso: 'caixa' },
      { caminho: '/financeiro/receber', titulo: 'Contas a receber', icone: HandCoins, recurso: 'financeiro' },
      { caminho: '/financeiro/pagar', titulo: 'Contas a pagar', icone: Landmark, recurso: 'financeiro' },
      { caminho: '/financeiro/fluxo', titulo: 'Fluxo de caixa', icone: TrendingUp, recurso: 'financeiro' }
    ]
  },
  {
    titulo: 'Estoque',
    itens: [
      { caminho: '/produtos', titulo: 'Produtos', icone: Package, recurso: 'produtos' },
      { caminho: '/categorias', titulo: 'Categorias e Unidades', icone: Tags, recurso: 'cadastros' },
      { caminho: '/estoque', titulo: 'Movimentações', icone: ArrowLeftRight, recurso: 'estoque' },
      { caminho: '/inventario', titulo: 'Inventário', icone: ClipboardCheck, recurso: 'estoque' }
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
      { caminho: '/auditoria', titulo: 'Auditoria', icone: ShieldCheck, recurso: 'auditoria' },
      { caminho: '/configuracoes', titulo: 'Configurações', icone: Settings, recurso: 'configuracoes' }
    ]
  }
]

export const iconeMarca = Boxes

/** Ícone da tela (o mesmo do menu), usado no título de cada página. */
export function iconeDaTela(caminho: string): LucideIcon | undefined {
  if (caminho === '/perfil') return UserCircle
  for (const g of menu) for (const item of g.itens) if (item.caminho === caminho) return item.icone
  return undefined
}
