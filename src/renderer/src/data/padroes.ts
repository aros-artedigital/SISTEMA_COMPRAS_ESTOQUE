import type { Configuracoes } from '@shared/tipos'

/** Usado só até o primeiro carregamento do banco. */
export const configuracoesPadrao: Configuracoes = {
  nomeEmpresa: '',
  cnpj: '',
  telefone: '',
  email: '',
  endereco: '',
  cep: '',
  estoqueMinimoPadrao: 5,
  alertarEstoqueMinimo: true,
  prefixoCompra: 'C-',
  custoAoReceber: 'medio',
  tema: 'azul',
  corPrincipal: '#2563eb',
  corSecundaria: '#13294b',
  apagarSenhaOs: true,
  exigirCaixaAberto: false
}
