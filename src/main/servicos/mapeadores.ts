import type {
  Categoria,
  Cliente,
  Compra,
  Fornecedor,
  ItemCompra,
  Movimentacao,
  Produto,
  Unidade,
  Usuario,
  Venda,
  ItemVenda,
  OrdemServico,
  ItemOS,
  HistoricoOS,
  PagamentoOS,
  AssinaturaOS,
  FotoOS,
  Conta,
  BaixaConta
} from '@shared/tipos'
import { limparPermissoes } from '@shared/permissoes'

// Conversão das linhas do SQLite (snake_case, 0/1) para os modelos do domínio.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Linha = Record<string, any>

export const usuario = (r: Linha): Usuario => ({
  id: r.id,
  nome: r.nome,
  email: r.email,
  login: r.login,
  perfil: r.perfil,
  permissoes: r.perfil === 'admin' || !r.permissoes ? null : limparPermissoes(lerJson(r.permissoes)),
  ativo: !!r.ativo
})

function lerJson(v: string): unknown {
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

export const categoria = (r: Linha): Categoria => ({ id: r.id, nome: r.nome, descricao: r.descricao })

export const unidade = (r: Linha): Unidade => ({ id: r.id, sigla: r.sigla, nome: r.nome })

export const produto = (r: Linha): Produto => ({
  id: r.id,
  codigo: r.codigo,
  codigoBarras: r.codigo_barras,
  nome: r.nome,
  categoriaId: r.categoria_id,
  unidadeId: r.unidade_id,
  precoCusto: r.preco_custo,
  precoVenda: r.preco_venda,
  estoque: r.estoque,
  estoqueMinimo: r.estoque_minimo,
  ativo: !!r.ativo
})

export const fornecedor = (r: Linha): Fornecedor => ({
  id: r.id,
  razaoSocial: r.razao_social,
  nomeFantasia: r.nome_fantasia,
  cnpj: r.cnpj,
  telefone: r.telefone,
  email: r.email,
  cep: r.cep ?? '',
  logradouro: r.logradouro ?? '',
  numero: r.numero ?? '',
  complemento: r.complemento ?? '',
  bairro: r.bairro ?? '',
  cidade: r.cidade,
  uf: r.uf,
  ativo: !!r.ativo
})

export const cliente = (r: Linha): Cliente => ({
  id: r.id,
  nome: r.nome,
  tipo: r.tipo,
  documento: r.documento,
  telefone: r.telefone,
  email: r.email,
  cep: r.cep ?? '',
  logradouro: r.logradouro ?? '',
  numero: r.numero ?? '',
  complemento: r.complemento ?? '',
  bairro: r.bairro ?? '',
  cidade: r.cidade,
  uf: r.uf,
  ativo: !!r.ativo
})

export const compra = (r: Linha, itens: ItemCompra[]): Compra => ({
  id: r.id,
  numero: r.numero,
  fornecedorId: r.fornecedor_id,
  data: r.data,
  status: r.status,
  observacao: r.observacao,
  itens
})

export const itemCompra = (r: Linha): ItemCompra => ({
  produtoId: r.produto_id,
  quantidade: r.quantidade,
  valorUnitario: r.valor_unitario,
  quantidadeRecebida: r.quantidade_recebida ?? 0
})

export const movimentacao = (r: Linha): Movimentacao => ({
  id: r.id,
  data: r.data,
  produtoId: r.produto_id,
  tipo: r.tipo,
  quantidade: r.quantidade,
  saldoApos: r.saldo_apos,
  motivo: r.motivo,
  usuarioId: r.usuario_id,
  ...(r.compra_id ? { compraId: r.compra_id } : {}),
  ...(r.venda_id ? { vendaId: r.venda_id } : {}),
  ...(r.os_id ? { osId: r.os_id } : {}),
  ...(r.estorno_de ? { estornoDe: r.estorno_de } : {})
})

export const venda = (r: Linha, itens: ItemVenda[]): Venda => ({
  id: r.id,
  numero: r.numero,
  clienteId: r.cliente_id ?? null,
  data: r.data,
  status: r.status,
  formaPagamento: r.forma_pagamento,
  desconto: r.desconto,
  observacao: r.observacao,
  usuarioId: r.usuario_id,
  canceladaEm: r.cancelada_em ?? null,
  motivoCancelamento: r.motivo_cancelamento,
  itens
})

export const itemVenda = (r: Linha): ItemVenda => ({ produtoId: r.produto_id, quantidade: r.quantidade, valorUnitario: r.valor_unitario })

export const ordemServico = (r: Linha, itens: ItemOS[], historico: HistoricoOS[], pagamentos: PagamentoOS[] = [], assinaturas: AssinaturaOS[] = []): OrdemServico => ({
  id: r.id,
  numero: r.numero,
  clienteId: r.cliente_id,
  status: r.status,
  dataEntrada: r.data_entrada,
  previsao: r.previsao ?? null,
  tecnicoId: r.tecnico_id ?? null,
  equipTipo: r.equip_tipo,
  equipMarca: r.equip_marca,
  equipModelo: r.equip_modelo,
  equipSerie: r.equip_serie,
  acessorios: r.acessorios,
  estadoFisico: r.estado_fisico,
  senhaTipo: r.senha_tipo ?? 'nenhuma',
  defeito: r.defeito,
  diagnostico: r.diagnostico,
  laudo: r.laudo,
  observacao: r.observacao,
  desconto: r.desconto,
  garantiaDias: r.garantia_dias,
  estoqueBaixado: !!r.estoque_baixado,
  concluidaEm: r.concluida_em ?? null,
  entregueEm: r.entregue_em ?? null,
  usuarioId: r.usuario_id,
  itens,
  historico,
  pagamentos,
  assinaturas,
  qtdFotos: r.qtd_fotos ?? 0
})

export const itemOS = (r: Linha): ItemOS => ({
  tipo: r.tipo,
  produtoId: r.produto_id ?? null,
  descricao: r.descricao,
  quantidade: r.quantidade,
  valorUnitario: r.valor_unitario
})

export const pagamentoOS = (r: Linha): PagamentoOS => ({
  id: r.id,
  em: r.em,
  tipo: r.tipo,
  forma: r.forma,
  valor: r.valor,
  usuario: r.usuario_nome,
  estornado: !!r.estornado,
  estornadoEm: r.estornado_em ?? null,
  motivoEstorno: r.motivo_estorno
})

export const assinaturaOS = (r: Linha): AssinaturaOS => ({ tipo: r.tipo, nome: r.nome, imagem: r.imagem, em: r.em })

const dataUrlJpeg = (b: Buffer): string => `data:image/jpeg;base64,${b.toString('base64')}`
export const fotoOS = (r: Linha): FotoOS => ({ id: r.id, em: r.em, legenda: r.legenda, miniatura: dataUrlJpeg(r.miniatura), usuario: r.usuario_nome })
export const imagemFoto = (r: Linha): string => dataUrlJpeg(r.imagem)

export const historicoOS = (r: Linha): HistoricoOS => ({ em: r.em, status: r.status, usuario: r.usuario_nome, observacao: r.observacao })

export const bool = (v: boolean): number => (v ? 1 : 0)

/** Arredonda valores monetários para centavos antes de gravar. */
export const dinheiro = (v: number): number => Math.round(v * 100) / 100

/** Data/hora local no formato ISO sem fuso ("2026-11-04T10:15:00"). */
export function agoraIso(d = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const baixaConta = (r: Linha): BaixaConta => ({
  id: r.id,
  em: r.em,
  valor: r.valor,
  juros: r.juros,
  desconto: r.desconto,
  forma: r.forma,
  usuario: r.usuario_nome,
  estornada: !!r.estornada,
  estornadaEm: r.estornada_em ?? null,
  motivoEstorno: r.motivo_estorno
})

export const conta = (r: Linha, baixas: BaixaConta[]): Conta => ({
  id: r.id,
  tipo: r.tipo,
  descricao: r.descricao,
  categoria: r.categoria,
  clienteId: r.cliente_id ?? null,
  fornecedorId: r.fornecedor_id ?? null,
  vendaId: r.venda_id ?? null,
  compraId: r.compra_id ?? null,
  parcela: r.parcela,
  parcelas: r.parcelas,
  valor: r.valor,
  vencimento: r.vencimento,
  status: r.status,
  observacao: r.observacao,
  motivoCancelamento: r.motivo_cancelamento,
  usuarioId: r.usuario_id,
  criadoEm: r.criado_em,
  baixas
})
