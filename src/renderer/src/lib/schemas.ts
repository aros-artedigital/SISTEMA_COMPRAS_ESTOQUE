import { z } from 'zod'
import { somenteDigitos } from './format'

// Schemas de validação dos formulários. Serão reaproveitados no processo
// principal (fase 2) para validar os dados recebidos via IPC.

const obrigatorio = (campo: string) => z.string().trim().min(1, `${campo} é obrigatório`)
const emailOpcional = z.union([z.literal(''), z.string().trim().email('E-mail inválido')])
const uf = z.union([z.literal(''), z.string().trim().length(2, 'UF deve ter 2 letras')]).transform((v) => v.toUpperCase())
const numeroNaoNegativo = (campo: string) =>
  z.coerce.number({ invalid_type_error: `${campo} inválido` }).min(0, `${campo} não pode ser negativo`)
const id = (campo: string) => z.coerce.number().int().positive(`Selecione ${campo}`)

export const categoriaSchema = z.object({
  nome: obrigatorio('Nome'),
  descricao: z.string().trim()
})

export const unidadeSchema = z.object({
  sigla: obrigatorio('Sigla').max(5, 'Máximo de 5 caracteres').transform((v) => v.toUpperCase()),
  nome: obrigatorio('Nome')
})

export const produtoSchema = z
  .object({
    codigo: obrigatorio('Código'),
    codigoBarras: z.union([z.literal(''), z.string().trim().regex(/^\d{8,14}$/, 'Use de 8 a 14 dígitos')]),
    nome: obrigatorio('Nome'),
    categoriaId: id('a categoria'),
    unidadeId: id('a unidade'),
    precoCusto: numeroNaoNegativo('Preço de custo'),
    precoVenda: numeroNaoNegativo('Preço de venda'),
    estoque: z.coerce.number().int('Use número inteiro').min(0, 'Estoque não pode ser negativo'),
    estoqueMinimo: z.coerce.number().int('Use número inteiro').min(0, 'Não pode ser negativo'),
    ativo: z.boolean()
  })
  .refine((p) => p.precoVenda >= p.precoCusto, {
    path: ['precoVenda'],
    message: 'Preço de venda menor que o custo'
  })

export const fornecedorSchema = z.object({
  razaoSocial: obrigatorio('Razão social'),
  nomeFantasia: z.string().trim(),
  cnpj: z.string().refine((v) => somenteDigitos(v).length === 14, 'CNPJ deve ter 14 dígitos'),
  telefone: z.string().trim(),
  email: emailOpcional,
  cidade: z.string().trim(),
  uf,
  ativo: z.boolean()
})

export const clienteSchema = z
  .object({
    nome: obrigatorio('Nome'),
    tipo: z.enum(['PF', 'PJ']),
    documento: z.string(),
    telefone: z.string().trim(),
    email: emailOpcional,
    cidade: z.string().trim(),
    uf,
    ativo: z.boolean()
  })
  .refine((c) => somenteDigitos(c.documento).length === (c.tipo === 'PF' ? 11 : 14), {
    path: ['documento'],
    message: 'Documento incompleto'
  })

export const usuarioSchema = z.object({
  nome: obrigatorio('Nome'),
  email: z.string().trim().email('E-mail inválido'),
  login: obrigatorio('Login').regex(/^[a-z0-9._-]+$/, 'Use letras minúsculas, números, ponto ou traço'),
  senha: z.string(),
  perfil: z.enum(['admin', 'gerente', 'operador']),
  ativo: z.boolean()
})

export const movimentacaoSchema = z.object({
  produtoId: id('o produto'),
  tipo: z.enum(['entrada', 'saida', 'ajuste']),
  quantidade: z.coerce.number().int('Use número inteiro').refine((n) => n !== 0, 'Quantidade não pode ser zero'),
  motivo: obrigatorio('Motivo')
})

export const compraSchema = z.object({
  fornecedorId: id('o fornecedor'),
  data: obrigatorio('Data'),
  observacao: z.string().trim()
})

export const configuracoesSchema = z.object({
  nomeEmpresa: obrigatorio('Nome da empresa'),
  cnpj: z.string(),
  telefone: z.string().trim(),
  email: emailOpcional,
  endereco: z.string().trim(),
  estoqueMinimoPadrao: z.coerce.number().int().min(0, 'Não pode ser negativo'),
  alertarEstoqueMinimo: z.boolean(),
  prefixoCompra: obrigatorio('Prefixo').max(6, 'Máximo de 6 caracteres')
})

export const senhaSchema = z
  .object({
    atual: obrigatorio('Senha atual'),
    nova: z.string().min(6, 'Mínimo de 6 caracteres'),
    confirmar: z.string()
  })
  .refine((s) => s.nova === s.confirmar, { path: ['confirmar'], message: 'As senhas não conferem' })
