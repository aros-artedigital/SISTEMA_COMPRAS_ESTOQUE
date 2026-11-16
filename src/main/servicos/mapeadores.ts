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
  HistoricoOS
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

export const ordemServico = (r: Linha, itens: ItemOS[], historico: HistoricoOS[]): OrdemServico => ({
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
  historico
})

export const itemOS = (r: Linha): ItemOS => ({
  tipo: r.tipo,
  produtoId: r.produto_id ?? null,
  descricao: r.descricao,
  quantidade: r.quantidade,
  valorUnitario: r.valor_unitario
})

export const historicoOS = (r: Linha): HistoricoOS => ({ em: r.em, status: r.status, usuario: r.usuario_nome, observacao: r.observacao })

export const bool = (v: boolean): number => (v ? 1 : 0)

/** Arredonda valores monetários para centavos antes de gravar. */
export const dinheiro = (v: number): number => Math.round(v * 100) / 100

/** Data/hora local no formato ISO sem fuso ("2026-11-04T10:15:00"). */
export function agoraIso(d = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
