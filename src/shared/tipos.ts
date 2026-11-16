import type { Recurso } from './permissoes'
import type { IdTema } from './temas'
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
  /** Perfil "Personalizado": permissões escolhidas pelo administrador (null = as do perfil). */
  permissoes: Recurso[] | null
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
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
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
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  ativo: boolean
}

export type StatusCompra = 'rascunho' | 'pedido' | 'recebida' | 'cancelada'

export interface ItemCompra {
  produtoId: number
  quantidade: number
  valorUnitario: number
  /** Quanto já chegou (recebimento parcial). Ausente = 0. */
  quantidadeRecebida?: number
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
  /** Peça usada numa ordem de serviço. */
  osId?: number
  /** Esta movimentação é o estorno da movimentação indicada. */
  estornoDe?: number
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

// ---------- Ordens de serviço ----------

export type StatusOS = 'aberta' | 'em_analise' | 'aguardando_aprovacao' | 'em_execucao' | 'pronta' | 'entregue' | 'cancelada'

export interface ItemOS {
  /** Peça sai do estoque (produto); serviço é mão de obra (descrição livre). */
  tipo: 'peca' | 'servico'
  produtoId: number | null
  descricao: string
  quantidade: number
  valorUnitario: number
}

export interface HistoricoOS {
  em: string // ISO com hora
  status: StatusOS
  usuario: string
  observacao: string
}

export interface OrdemServico {
  id: number
  numero: string
  clienteId: number
  status: StatusOS
  dataEntrada: string // ISO com hora
  /** Previsão de entrega (yyyy-mm-dd). */
  previsao: string | null
  tecnicoId: number | null
  equipTipo: string
  equipMarca: string
  equipModelo: string
  /** Número de série ou IMEI. */
  equipSerie: string
  acessorios: string
  estadoFisico: string
  defeito: string
  diagnostico: string
  laudo: string
  observacao: string
  desconto: number
  garantiaDias: number
  /** As peças já saíram do estoque (OS pronta ou entregue). */
  estoqueBaixado: boolean
  concluidaEm: string | null
  entregueEm: string | null
  usuarioId: number
  itens: ItemOS[]
  historico: HistoricoOS[]
}

export interface Configuracoes {
  nomeEmpresa: string
  cnpj: string
  telefone: string
  email: string
  endereco: string
  /** CEP da empresa (o endereço é montado pela busca de CEP ou digitado). */
  cep: string
  estoqueMinimoPadrao: number
  alertarEstoqueMinimo: boolean
  prefixoCompra: string
  /** Como o preço de custo muda ao receber uma compra. */
  custoAoReceber: 'medio' | 'ultimo' | 'manter'
  /** Tema de cores da empresa (ver shared/temas.ts). */
  tema: IdTema
  /** Usadas quando o tema é "personalizado" (hex, ex.: #2563eb). */
  corPrincipal: string
  corSecundaria: string
}
