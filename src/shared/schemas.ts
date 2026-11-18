import { z } from 'zod'
import { somenteDigitos } from './format'
import { limparPermissoes } from './permissoes'

// Schemas de validação dos formulários. Serão reaproveitados no processo
// principal (fase 2) para validar os dados recebidos via IPC.

const obrigatorio = (campo: string) => z.string().trim().min(1, `${campo} é obrigatório`)
const emailOpcional = z.union([z.literal(''), z.string().trim().email('E-mail inválido')])
const cep = z
  .string()
  .default('')
  .refine((v) => [0, 8].includes(somenteDigitos(v).length), 'CEP deve ter 8 dígitos')
const endereco = {
  cep,
  logradouro: z.string().trim().default(''),
  numero: z.string().trim().default(''),
  complemento: z.string().trim().default(''),
  bairro: z.string().trim().default('')
}
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
  ...endereco,
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
    ...endereco,
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
  /** Perfil personalizado: lista de permissões (null = as do perfil). Administrador nunca é personalizado. */
  permissoes: z.array(z.string()).nullable().default(null).transform(limparPermissoes),
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

const corHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')

export const configuracoesSchema = z.object({
  nomeEmpresa: obrigatorio('Nome da empresa'),
  cnpj: z.string(),
  telefone: z.string().trim(),
  email: emailOpcional,
  endereco: z.string().trim(),
  cep,
  estoqueMinimoPadrao: z.coerce.number().int().min(0, 'Não pode ser negativo'),
  alertarEstoqueMinimo: z.boolean(),
  prefixoCompra: obrigatorio('Prefixo').max(6, 'Máximo de 6 caracteres'),
  custoAoReceber: z.enum(['medio', 'ultimo', 'manter']),
  tema: z.enum(['azul', 'verde', 'roxo', 'grafite', 'vinho', 'personalizado']).default('azul'),
  corPrincipal: corHex.default('#2563eb'),
  corSecundaria: corHex.default('#13294b'),
  apagarSenhaOs: z.boolean().default(true)
})

export const senhaSchema = z
  .object({
    atual: obrigatorio('Senha atual'),
    nova: z.string().min(6, 'Mínimo de 6 caracteres'),
    confirmar: z.string()
  })
  .refine((s) => s.nova === s.confirmar, { path: ['confirmar'], message: 'As senhas não conferem' })

export const perfilSchema = z.object({
  nome: obrigatorio('Nome'),
  email: z.string().trim().email('E-mail inválido')
})

// ---------- Validação das chamadas IPC (processo principal) ----------

export const idSchema = z.number().int().positive()
export const idOuNovoSchema = idSchema.nullable()

export const itemCompraSchema = z.object({
  produtoId: idSchema,
  quantidade: z.number().int('Quantidades devem ser inteiras').positive('Quantidade deve ser maior que zero'),
  valorUnitario: z.number().min(0, 'Valor unitário não pode ser negativo')
})

export const compraEntradaSchema = compraSchema.extend({
  status: z.enum(['rascunho', 'pedido', 'cancelada']),
  itens: z
    .array(itemCompraSchema)
    .min(1, 'Adicione ao menos um produto')
    .refine((itens) => new Set(itens.map((i) => i.produtoId)).size === itens.length, 'O mesmo produto aparece em mais de uma linha')
})

export const trocaSenhaSchema = z.object({
  atual: z.string().min(1, 'Senha atual é obrigatória'),
  nova: z.string().min(6, 'Mínimo de 6 caracteres')
})

// ---------- Vendas ----------

export const itemVendaSchema = z.object({
  produtoId: idSchema,
  quantidade: z.number().int('Quantidades devem ser inteiras').positive('Quantidade deve ser maior que zero'),
  valorUnitario: z.number().min(0, 'Preço não pode ser negativo')
})

export const vendaSchema = z
  .object({
    clienteId: idSchema.nullable(),
    formaPagamento: z.enum(['dinheiro', 'pix', 'debito', 'credito', 'boleto', 'outro']),
    desconto: z.number().min(0, 'Desconto não pode ser negativo'),
    observacao: z.string().trim().max(500),
    itens: z
      .array(itemVendaSchema)
      .min(1, 'Adicione ao menos um produto')
      .refine((itens) => new Set(itens.map((i) => i.produtoId)).size === itens.length, 'O mesmo produto aparece em mais de uma linha')
  })
  .refine((v) => v.desconto <= v.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0), {
    path: ['desconto'],
    message: 'Desconto maior que o total da venda'
  })

export const cancelamentoSchema = z.string().trim().min(3, 'Informe o motivo do cancelamento').max(300)

// ---------- Ordens de serviço ----------

const textoOS = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres`).default('')

/** Campos do formulário (valores como texto; o schema converte). */
export const osSchema = z.object({
  clienteId: id('o cliente'),
  tecnicoId: z
    .union([z.literal(''), z.coerce.number().int().positive()])
    .nullable()
    .default(null)
    .transform((v) => (v ? Number(v) : null)),
  previsao: z
    .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')])
    .nullable()
    .default(null)
    .transform((v) => v || null),
  equipTipo: obrigatorio('Tipo do equipamento').max(60),
  equipMarca: textoOS(60),
  equipModelo: textoOS(80),
  equipSerie: textoOS(80),
  acessorios: textoOS(300),
  estadoFisico: textoOS(500),
  defeito: obrigatorio('Defeito relatado').max(2000),
  diagnostico: textoOS(2000),
  laudo: textoOS(2000),
  observacao: textoOS(2000),
  desconto: z.coerce.number({ invalid_type_error: 'Desconto inválido' }).min(0, 'Desconto não pode ser negativo').default(0),
  garantiaDias: z.coerce.number({ invalid_type_error: 'Garantia inválida' }).int('Use número inteiro de dias').min(0, 'Não pode ser negativa').max(3650, 'Máximo de 3650 dias').default(90)
})

export const itemOsSchema = z
  .object({
    tipo: z.enum(['peca', 'servico']),
    produtoId: idSchema.nullable(),
    descricao: z.string().trim().max(200).default(''),
    quantidade: z.number().int('Quantidades devem ser inteiras').positive('Quantidade deve ser maior que zero'),
    valorUnitario: z.number().min(0, 'Valor não pode ser negativo')
  })
  .refine((i) => (i.tipo === 'peca' ? i.produtoId !== null : i.descricao.length > 0), 'Escolha o produto da peça ou descreva o serviço')
  .transform((i) => (i.tipo === 'peca' ? { ...i, descricao: '' } : { ...i, produtoId: null }))

export const senhaOsSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('nenhuma'), valor: z.string().max(0).default('') }),
  z.object({
    tipo: z.literal('desenho'),
    valor: z
      .string()
      .regex(/^[1-9](-[1-9]){3,8}$/, 'O desenho precisa ligar pelo menos 4 pontos')
      .refine((v) => new Set(v.split('-')).size === v.split('-').length, 'Cada ponto só pode ser usado uma vez no desenho')
  }),
  z.object({ tipo: z.literal('pin'), valor: z.string().regex(/^\d{4,16}$/, 'O PIN deve ter de 4 a 16 números') }),
  z.object({ tipo: z.literal('texto'), valor: z.string().min(1, 'Informe a senha').max(64, 'Máximo de 64 caracteres') })
])

export const osEntradaSchema = osSchema
  .extend({
    itens: z.array(itemOsSchema).max(200, 'Máximo de 200 itens'),
    /** Ausente = mantém a senha atual (a tela só manda quando o usuário mexe nela). */
    senha: senhaOsSchema.optional()
  })
  .refine((o) => o.desconto <= o.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0), {
    path: ['desconto'],
    message: 'Desconto maior que o total da OS'
  })

export const statusOsSchema = z.enum(['aberta', 'em_analise', 'aguardando_aprovacao', 'em_execucao', 'pronta', 'entregue', 'cancelada'])

export const pagamentoOsSchema = z.object({
  forma: z.enum(['dinheiro', 'pix', 'debito', 'credito', 'boleto', 'outro']),
  valor: z.number({ invalid_type_error: 'Valor inválido' }).positive('Informe um valor maior que zero').max(10_000_000)
})
export const pagamentosOsSchema = z.array(pagamentoOsSchema).min(1, 'Informe o valor recebido').max(5, 'Máximo de 5 formas de pagamento')

/** Opções ao mudar o status: na entrega, o que foi recebido agora e se pode entregar com saldo em aberto. */
export const opcoesStatusOsSchema = z
  .object({ pagamentos: z.array(pagamentoOsSchema).max(5).default([]), entregarComSaldo: z.boolean().default(false) })
  .default({})

export const assinaturaOsSchema = z.object({
  tipo: z.enum(['entrada', 'retirada']),
  nome: z.string().trim().min(2, 'Informe o nome de quem assinou').max(100),
  imagem: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'Assinatura inválida').max(100_000, 'Assinatura grande demais')
})

export const fotoOsSchema = z.object({
  imagem: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'Imagem inválida').max(6_000_000, 'Foto grande demais'),
  miniatura: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'Miniatura inválida').max(300_000),
  legenda: z.string().trim().max(120).default('')
})
