// Modelos do domínio, compartilhados entre o processo principal e a interface.
// No banco as colunas usam snake_case; os mapeamentos ficam em src/main/servicos.

export type Perfil = 'admin' | 'gerente' | 'operador'

/** Usuário como a interface enxerga: o hash da senha nunca sai do processo principal. */
export interface Usuario {
  id: number
  nome: string
  email: string
  login: string
  perfil: Perfil
  ativo: boolean
}

export interface Categoria {
  id: number
  nome: string
  descricao: string
}

export interface Unidade {
  id: number
  sigla: string
  nome: string
}

export interface Produto {
  id: number
  codigo: string
  codigoBarras: string
  nome: string
  categoriaId: number
  unidadeId: number
  precoCusto: number
  precoVenda: number
  estoque: number
  estoqueMinimo: number
  ativo: boolean
}

export interface Fornecedor {
  id: number
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  telefone: string
  email: string
  cidade: string
  uf: string
  ativo: boolean
}

export interface Cliente {
  id: number
  nome: string
  tipo: 'PF' | 'PJ'
  documento: string
  telefone: string
  email: string
  cidade: string
  uf: string
  ativo: boolean
}

export type StatusCompra = 'rascunho' | 'pedido' | 'recebida' | 'cancelada'

export interface ItemCompra {
  produtoId: number
  quantidade: number
  valorUnitario: number
}

export interface Compra {
  id: number
  numero: string
  fornecedorId: number
  data: string // ISO yyyy-mm-dd
  status: StatusCompra
  itens: ItemCompra[]
  observacao: string
}

export type TipoMovimentacao = 'entrada' | 'saida' | 'ajuste'

export interface Movimentacao {
  id: number
  data: string // ISO com hora
  produtoId: number
  tipo: TipoMovimentacao
  quantidade: number // ajuste: diferença aplicada (pode ser negativa)
  saldoApos: number
  motivo: string
  usuarioId: number
  compraId?: number
  vendaId?: number
}

export type FormaPagamento = 'dinheiro' | 'pix' | 'debito' | 'credito' | 'boleto' | 'outro'
export type StatusVenda = 'concluida' | 'cancelada'

export interface ItemVenda {
  produtoId: number
  quantidade: number
  valorUnitario: number
}

export interface Venda {
  id: number
  numero: string
  /** null = consumidor final (venda de balcão sem cadastro). */
  clienteId: number | null
  data: string // ISO com hora
  status: StatusVenda
  formaPagamento: FormaPagamento
  desconto: number
  observacao: string
  usuarioId: number
  canceladaEm: string | null
  motivoCancelamento: string
  itens: ItemVenda[]
}

export interface Configuracoes {
  nomeEmpresa: string
  cnpj: string
  telefone: string
  email: string
  endereco: string
  estoqueMinimoPadrao: number
  alertarEstoqueMinimo: boolean
  prefixoCompra: string
}
