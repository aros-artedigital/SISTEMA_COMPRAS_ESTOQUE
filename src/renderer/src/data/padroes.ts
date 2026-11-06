import type { Configuracoes } from '@shared/tipos'

/** Usado só até o primeiro carregamento do banco. */
export const configuracoesPadrao: Configuracoes = {
  nomeEmpresa: '',
  cnpj: '',
  telefone: '',
  email: '',
  endereco: '',
  estoqueMinimoPadrao: 5,
  alertarEstoqueMinimo: true,
  prefixoCompra: 'C-',
  custoAoReceber: 'medio'
}
