import ExcelJS from 'exceljs'
import { randomUUID } from 'crypto'
import { basename } from 'path'
import { ZodError } from 'zod'
import type { FormatoColuna, LinhaImportacao, Planilha, PreviaImportacao, ResultadoImportacao, TipoImportacao } from '@shared/api'
import { mascaraCnpj, mascaraCpf, mascaraTelefone, somenteDigitos } from '@shared/format'
import { clienteSchema, fornecedorSchema, produtoSchema } from '@shared/schemas'
import { banco } from '../db/conexao'
import { ErroNegocio } from '../erros'
import * as cadastros from './cadastros'
import { lerConfiguracoes } from './dados'
import * as produtos from './produtos'

// ---------- Exportação ----------

const formatos: Record<FormatoColuna, string | undefined> = {
  texto: undefined,
  numero: '#,##0',
  moeda: '"R$" #,##0.00',
  data: 'dd/mm/yyyy',
  dataHora: 'dd/mm/yyyy hh:mm'
}

/** "2026-11-04" ou "2026-11-04T10:15:00" → Date sem deslocamento de fuso no Excel. */
function paraData(v: unknown): Date | unknown {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return v
  const [a, m, d] = v.slice(0, 10).split('-').map(Number)
  const [h, min] = v.length >= 16 ? [Number(v.slice(11, 13)), Number(v.slice(14, 16))] : [0, 0]
  return new Date(Date.UTC(a, m - 1, d, h, min))
}

function estilizarCabecalho(ws: ExcelJS.Worksheet): void {
  const cab = ws.getRow(1)
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF13294B' } }
  cab.alignment = { vertical: 'middle' }
  cab.height = 20
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

export async function exportar(p: Planilha, destino: string): Promise<string> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Gestor de Estoque e Compras'
  const ws = wb.addWorksheet(p.nome.slice(0, 31) || 'Dados')
  ws.columns = p.colunas.map((c, i) => ({
    header: c.titulo,
    key: String(i),
    width: c.largura ?? Math.min(50, Math.max(c.titulo.length + 2, ...p.linhas.slice(0, 200).map((l) => String(l[i] ?? '').length + 2))),
    style: formatos[c.formato ?? 'texto'] ? { numFmt: formatos[c.formato ?? 'texto'] } : {}
  }))
  for (const linha of p.linhas) {
    ws.addRow(linha.map((v, i) => (p.colunas[i]?.formato === 'data' || p.colunas[i]?.formato === 'dataHora' ? paraData(v) : v)))
  }
  estilizarCabecalho(ws)
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: p.colunas.length } }
  await wb.xlsx.writeFile(destino)
  return destino
}

// ---------- Definição das planilhas de importação ----------

interface Coluna {
  chave: string
  titulo: string
  obrigatoria?: boolean
  apelidos?: string[]
  exemplo: string | number
}

const colunasImportacao: Record<TipoImportacao, Coluna[]> = {
  produtos: [
    { chave: 'codigo', titulo: 'Código', obrigatoria: true, exemplo: 'P0100' },
    { chave: 'nome', titulo: 'Nome', obrigatoria: true, apelidos: ['descricao', 'produto'], exemplo: 'Mouse sem fio' },
    { chave: 'codigoBarras', titulo: 'Código de barras', apelidos: ['ean', 'gtin', 'codigo barras'], exemplo: '7891234567895' },
    { chave: 'categoria', titulo: 'Categoria', obrigatoria: true, exemplo: 'Periféricos' },
    { chave: 'unidade', titulo: 'Unidade', obrigatoria: true, apelidos: ['un', 'sigla', 'unidade de medida'], exemplo: 'UN' },
    { chave: 'precoCusto', titulo: 'Preço de custo', obrigatoria: true, apelidos: ['custo'], exemplo: 45.5 },
    { chave: 'precoVenda', titulo: 'Preço de venda', obrigatoria: true, apelidos: ['venda', 'preco'], exemplo: 79.9 },
    { chave: 'estoqueMinimo', titulo: 'Estoque mínimo', apelidos: ['minimo'], exemplo: 5 },
    { chave: 'estoqueInicial', titulo: 'Estoque inicial', apelidos: ['estoque', 'saldo'], exemplo: 10 },
    { chave: 'ativo', titulo: 'Ativo', exemplo: 'Sim' }
  ],
  fornecedores: [
    { chave: 'razaoSocial', titulo: 'Razão social', obrigatoria: true, apelidos: ['razao', 'nome'], exemplo: 'Distribuidora Exemplo Ltda' },
    { chave: 'nomeFantasia', titulo: 'Nome fantasia', apelidos: ['fantasia'], exemplo: 'Exemplo Dist.' },
    { chave: 'cnpj', titulo: 'CNPJ', obrigatoria: true, exemplo: '11.222.333/0001-81' },
    { chave: 'telefone', titulo: 'Telefone', apelidos: ['fone'], exemplo: '(11) 3333-4444' },
    { chave: 'email', titulo: 'E-mail', apelidos: ['email'], exemplo: 'vendas@exemplo.com.br' },
    { chave: 'cidade', titulo: 'Cidade', exemplo: 'São Paulo' },
    { chave: 'uf', titulo: 'UF', apelidos: ['estado'], exemplo: 'SP' },
    { chave: 'ativo', titulo: 'Ativo', exemplo: 'Sim' }
  ],
  clientes: [
    { chave: 'nome', titulo: 'Nome', obrigatoria: true, apelidos: ['razao social', 'cliente'], exemplo: 'Maria Oliveira' },
    { chave: 'tipo', titulo: 'Tipo (PF/PJ)', apelidos: ['tipo', 'pessoa'], exemplo: 'PF' },
    { chave: 'documento', titulo: 'CPF/CNPJ', obrigatoria: true, apelidos: ['cpf', 'cnpj', 'documento'], exemplo: '123.456.789-09' },
    { chave: 'telefone', titulo: 'Telefone', apelidos: ['fone', 'celular'], exemplo: '(11) 98888-7777' },
    { chave: 'email', titulo: 'E-mail', apelidos: ['email'], exemplo: 'maria@email.com' },
    { chave: 'cidade', titulo: 'Cidade', exemplo: 'Campinas' },
    { chave: 'uf', titulo: 'UF', apelidos: ['estado'], exemplo: 'SP' },
    { chave: 'ativo', titulo: 'Ativo', exemplo: 'Sim' }
  ]
}

const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\*/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export async function gerarModelo(tipo: TipoImportacao, destino: string): Promise<string> {
  const cols = colunasImportacao[tipo]
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(tipo[0].toUpperCase() + tipo.slice(1))
  ws.columns = cols.map((c) => ({ header: c.obrigatoria ? `${c.titulo} *` : c.titulo, key: c.chave, width: Math.max(16, c.titulo.length + 4) }))
  ws.addRow(Object.fromEntries(cols.map((c) => [c.chave, c.exemplo])))
  estilizarCabecalho(ws)

  const ajuda = wb.addWorksheet('Instruções')
  ajuda.columns = [{ width: 110 }]
  const textos = [
    'Como importar',
    '1. Preencha a primeira aba a partir da linha 2 (a linha de exemplo pode ser apagada ou substituída).',
    '2. Colunas com * são obrigatórias. A ordem das colunas não importa; o nome do cabeçalho sim.',
    '3. Registros já existentes são atualizados (produtos pelo Código; fornecedores e clientes pelo CNPJ/CPF).',
    '4. Valores podem usar vírgula decimal (49,90). Ativo aceita Sim/Não (vazio = Sim).',
    ...(tipo === 'produtos'
      ? [
          '5. Categorias que não existirem são criadas automaticamente. A unidade deve ser uma sigla já cadastrada (UN, CX, KG...).',
          '6. Estoque inicial só vale para produtos novos; para os existentes, use a tela de Movimentações.'
        ]
      : tipo === 'clientes'
        ? ['5. Se o Tipo ficar vazio, ele é deduzido pelo documento (11 dígitos = PF, 14 = PJ).']
        : []),
    '',
    'Antes de gravar, o sistema mostra uma prévia linha a linha com o que será criado, atualizado ou recusado.'
  ]
  textos.forEach((t, i) => (ajuda.getCell(`A${i + 1}`).value = t))
  ajuda.getCell('A1').font = { bold: true, size: 14 }
  await wb.xlsx.writeFile(destino)
  return destino
}

// ---------- Leitura ----------

/** Extrai o valor "visível" de uma célula (fórmulas, links e texto rico viram texto/número). */
function valorCelula(c: ExcelJS.Cell): string | number | boolean | null {
  const v = c.value
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('result' in v) return (v.result as string | number) ?? null
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('text' in v) return String(v.text)
    return c.text || null
  }
  return v
}

type Linha = Record<string, string | number | boolean | null>

async function lerPlanilha(tipo: TipoImportacao, origem: string): Promise<{ numero: number; dados: Linha }[]> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.readFile(origem)
  } catch {
    throw new ErroNegocio('Não foi possível abrir o arquivo. Use uma planilha do Excel (.xlsx).')
  }
  const ws = wb.worksheets[0]
  if (!ws) throw new ErroNegocio('A planilha está vazia.')

  const cols = colunasImportacao[tipo]
  const mapa = new Map<number, string>()
  ws.getRow(1).eachCell((cel, i) => {
    const titulo = normalizar(String(valorCelula(cel) ?? ''))
    const col = cols.find((c) => normalizar(c.titulo) === titulo || c.apelidos?.some((a) => normalizar(a) === titulo))
    if (col && ![...mapa.values()].includes(col.chave)) mapa.set(i, col.chave)
  })
  const faltando = cols.filter((c) => c.obrigatoria && ![...mapa.values()].includes(c.chave)).map((c) => c.titulo)
  if (faltando.length) throw new ErroNegocio(`Colunas obrigatórias não encontradas no cabeçalho: ${faltando.join(', ')}. Use o modelo de importação.`)

  const linhas: { numero: number; dados: Linha }[] = []
  ws.eachRow((row, numero) => {
    if (numero === 1) return
    const dados: Linha = {}
    for (const [i, chave] of mapa) {
      const v = valorCelula(row.getCell(i))
      dados[chave] = typeof v === 'string' ? v.trim() : v
    }
    if (Object.values(dados).some((v) => v !== null && v !== '')) linhas.push({ numero, dados })
  })
  if (linhas.length === 0) throw new ErroNegocio('Nenhuma linha preenchida encontrada abaixo do cabeçalho.')
  if (linhas.length > 5000) throw new ErroNegocio('Limite de 5.000 linhas por importação.')
  return linhas
}

// ---------- Conversões tolerantes ----------

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim())

/** Aceita 49.9, "49,90", "R$ 1.234,56". Vazio → undefined. */
function numero(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  const s = texto(v).replace(/R\$|\s/g, '')
  if (!s) return undefined
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : NaN
}

function booleano(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  const s = normalizar(texto(v))
  return !['nao', 'n', '0', 'false', 'inativo', 'no'].includes(s)
}

// ---------- Aplicação linha a linha ----------

interface Resultado {
  acao: 'criar' | 'atualizar'
  descricao: string
  avisos: string[]
}

function importarProduto(d: Linha, usuarioId: number): Resultado {
  const db = banco()
  const avisos: string[] = []
  const codigo = texto(d.codigo)
  const existente = db.prepare('SELECT id FROM produtos WHERE codigo = ? COLLATE NOCASE').get(codigo) as { id: number } | undefined

  const nomeCategoria = texto(d.categoria)
  let categoria = db.prepare('SELECT id FROM categorias WHERE nome = ? COLLATE NOCASE').get(nomeCategoria) as { id: number } | undefined
  if (!categoria && nomeCategoria) {
    categoria = cadastros.salvarCategoria(null, { nome: nomeCategoria, descricao: '' })
    avisos.push(`categoria "${nomeCategoria}" criada`)
  }
  const sigla = texto(d.unidade).toUpperCase()
  const unidade = db.prepare('SELECT id FROM unidades WHERE sigla = ?').get(sigla) as { id: number } | undefined
  if (!unidade) throw new ErroNegocio(sigla ? `Unidade "${sigla}" não cadastrada.` : 'Unidade é obrigatória.')

  const estoqueInicial = numero(d.estoqueInicial)
  if (existente && estoqueInicial) avisos.push('estoque ignorado (produto existente: use Movimentações)')

  const dados = produtoSchema.parse({
    codigo,
    codigoBarras: texto(d.codigoBarras).replace(/\D/g, ''),
    nome: texto(d.nome),
    categoriaId: categoria?.id ?? 0,
    unidadeId: unidade.id,
    precoCusto: numero(d.precoCusto) ?? NaN,
    precoVenda: numero(d.precoVenda) ?? NaN,
    estoque: existente ? 0 : (estoqueInicial ?? 0),
    estoqueMinimo: numero(d.estoqueMinimo) ?? lerConfiguracoes().estoqueMinimoPadrao,
    ativo: d.ativo === null || d.ativo === undefined || d.ativo === '' ? true : booleano(d.ativo)
  })
  produtos.salvar(existente?.id ?? null, dados, usuarioId)
  return { acao: existente ? 'atualizar' : 'criar', descricao: `${dados.codigo} — ${dados.nome}`, avisos }
}

const mesmoDoc = (tabela: 'fornecedores' | 'clientes', coluna: string, doc: string): number | undefined =>
  (banco().prepare(`SELECT id, ${coluna} AS doc FROM ${tabela}`).all() as { id: number; doc: string }[]).find(
    (r) => somenteDigitos(r.doc) === somenteDigitos(doc)
  )?.id

function importarFornecedor(d: Linha): Resultado {
  const cnpj = mascaraCnpj(texto(d.cnpj))
  const id = mesmoDoc('fornecedores', 'cnpj', cnpj)
  const dados = fornecedorSchema.parse({
    razaoSocial: texto(d.razaoSocial),
    nomeFantasia: texto(d.nomeFantasia),
    cnpj,
    telefone: mascaraTelefone(texto(d.telefone)),
    email: texto(d.email),
    cidade: texto(d.cidade),
    uf: texto(d.uf),
    ativo: d.ativo === null || d.ativo === undefined || d.ativo === '' ? true : booleano(d.ativo)
  })
  cadastros.salvarFornecedor(id ?? null, dados)
  return { acao: id ? 'atualizar' : 'criar', descricao: `${dados.razaoSocial} (${dados.cnpj})`, avisos: [] }
}

function importarCliente(d: Linha): Resultado {
  const digitos = somenteDigitos(texto(d.documento))
  const tipoInformado = texto(d.tipo).toUpperCase()
  const tipo = tipoInformado === 'PF' || tipoInformado === 'PJ' ? tipoInformado : digitos.length === 14 ? 'PJ' : 'PF'
  const documento = tipo === 'PF' ? mascaraCpf(digitos) : mascaraCnpj(digitos)
  const id = mesmoDoc('clientes', 'documento', documento)
  const dados = clienteSchema.parse({
    nome: texto(d.nome),
    tipo,
    documento,
    telefone: mascaraTelefone(texto(d.telefone)),
    email: texto(d.email),
    cidade: texto(d.cidade),
    uf: texto(d.uf),
    ativo: d.ativo === null || d.ativo === undefined || d.ativo === '' ? true : booleano(d.ativo)
  })
  cadastros.salvarCliente(id ?? null, dados)
  return { acao: id ? 'atualizar' : 'criar', descricao: `${dados.nome} (${dados.documento})`, avisos: [] }
}

function mensagemErro(e: unknown): string {
  if (e instanceof ErroNegocio) return e.message
  if (e instanceof ZodError) {
    const i = e.issues[0]
    const campo = typeof i.path[0] === 'string' ? i.path[0] : ''
    return campo ? `${i.message} (${campo})` : i.message
  }
  console.error('[importação]', e)
  return 'Erro inesperado nesta linha.'
}

class Desfazer extends Error {}

/**
 * Aplica as linhas dentro de uma transação. Cada linha roda num savepoint próprio:
 * uma linha com erro é descartada sem afetar as outras.
 * Em modo prévia, tudo é desfeito no final — a prévia usa exatamente as mesmas regras da gravação.
 */
function aplicar(tipo: TipoImportacao, linhas: { numero: number; dados: Linha }[], usuarioId: number, previa: boolean): LinhaImportacao[] {
  const db = banco()
  const resultado: LinhaImportacao[] = []
  const executar = db.transaction(() => {
    for (const { numero: n, dados } of linhas) {
      try {
        const r = db.transaction(() =>
          tipo === 'produtos' ? importarProduto(dados, usuarioId) : tipo === 'fornecedores' ? importarFornecedor(dados) : importarCliente(dados)
        )()
        resultado.push({ linha: n, ...r })
      } catch (e) {
        const descricao = texto(dados.nome ?? dados.razaoSocial ?? dados.codigo) || '(sem nome)'
        resultado.push({ linha: n, descricao, acao: 'erro', erro: mensagemErro(e), avisos: [] })
      }
    }
    if (previa) throw new Desfazer()
  })
  try {
    executar()
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e
  }
  return resultado
}

// Prévias aguardando confirmação (o arquivo é lido uma vez; a confirmação usa o token).
const pendentes = new Map<string, { tipo: TipoImportacao; arquivo: string; linhas: { numero: number; dados: Linha }[] }>()

export async function previa(tipo: TipoImportacao, origem: string, usuarioId: number): Promise<PreviaImportacao> {
  const linhas = await lerPlanilha(tipo, origem)
  const resultado = aplicar(tipo, linhas, usuarioId, true)
  const token = randomUUID()
  pendentes.clear()
  pendentes.set(token, { tipo, arquivo: basename(origem), linhas })
  return {
    token,
    arquivo: basename(origem),
    tipo,
    linhas: resultado,
    criar: resultado.filter((r) => r.acao === 'criar').length,
    atualizar: resultado.filter((r) => r.acao === 'atualizar').length,
    erros: resultado.filter((r) => r.acao === 'erro').length
  }
}

export function tipoPendente(token: string): TipoImportacao {
  const p = pendentes.get(token)
  if (!p) throw new ErroNegocio('A prévia expirou. Selecione o arquivo novamente.')
  return p.tipo
}

export function confirmar(token: string, usuarioId: number): ResultadoImportacao {
  const p = pendentes.get(token)
  if (!p) throw new ErroNegocio('A prévia expirou. Selecione o arquivo novamente.')
  pendentes.delete(token)
  const r = aplicar(p.tipo, p.linhas, usuarioId, false)
  return {
    criados: r.filter((x) => x.acao === 'criar').length,
    atualizados: r.filter((x) => x.acao === 'atualizar').length,
    ignorados: r.filter((x) => x.acao === 'erro').length
  }
}
