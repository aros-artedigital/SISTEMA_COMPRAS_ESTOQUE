import { app, ipcMain, shell } from 'electron'
import { z } from 'zod'
import type { ArgsDe, NomeCanal, Resposta, RetornoDe } from '@shared/api'
import type { Recurso } from '@shared/permissoes'
import * as s from '@shared/schemas'
import { banco, caminhoBanco } from './db/conexao'
import { ErroNegocio, serializarErro } from './erros'
import { escolherArquivo, escolherDestino, escolherPasta } from './janela'
import * as backup from './servicos/backup'
import * as backupExterno from './servicos/backupExterno'
import * as excel from './servicos/excel'
import * as impressao from './servicos/impressao'
import * as cadastros from './servicos/cadastros'
import * as compras from './servicos/compras'
import * as dados from './servicos/dados'
import * as estoque from './servicos/estoque'
import * as produtos from './servicos/produtos'
import { exigir, usuarioLogado } from './servicos/sessao'
import * as usuarios from './servicos/usuarios'
import * as vendas from './servicos/vendas'
import * as inventario from './servicos/inventario'
import * as sync from './servicos/sync/motor'
import * as atualizacao from './atualizacao'
import * as recuperacao from './servicos/recuperacao'
import { zerarDados } from './servicos/zerar'

type Handler<C extends NomeCanal> = (...args: ArgsDe<C>) => RetornoDe<C> | Promise<RetornoDe<C>>

/**
 * Registra um canal IPC. Os argumentos vindos da interface não são confiáveis:
 * cada handler valida com zod e checa permissão no próprio processo principal.
 * O retorno é sempre um envelope { ok, dados | erro } para a mensagem chegar intacta.
 */
function canal<C extends NomeCanal>(nome: C, handler: Handler<C>): void {
  ipcMain.handle(nome, async (_evento, ...args: unknown[]): Promise<Resposta<RetornoDe<C>>> => {
    try {
      return { ok: true, dados: await handler(...(args as ArgsDe<C>)) }
    } catch (e) {
      return { ok: false, erro: serializarErro(e) }
    }
  })
}

const id = (v: unknown): number => s.idSchema.parse(v)
const idOuNovo = (v: unknown): number | null => s.idOuNovoSchema.parse(v)

/** Gera os canais salvar/excluir de um cadastro simples. */
function crud<Dados>(
  recurso: Recurso,
  salvar: (id: number | null, dados: Dados, usuarioId: number) => unknown,
  excluir: (id: number, usuarioId: number) => void,
  schema: z.ZodType<Dados, z.ZodTypeDef, unknown>
) {
  return {
    salvar: (i: number | null, d: unknown) => {
      const u = exigir(recurso)
      return salvar(idOuNovo(i), schema.parse(d), u.id)
    },
    excluir: (i: number) => {
      const u = exigir(recurso)
      excluir(id(i), u.id)
    }
  }
}

export function registrarCanais(): void {
  // ---------- Sessão ----------
  canal('auth:entrar', (login, senha) => usuarios.entrar(z.string().parse(login), z.string().parse(senha)))
  canal('auth:sair', () => usuarios.sair())
  canal('auth:trocarSenha', (atual, nova) => {
    const d = s.trocaSenhaSchema.parse({ atual, nova })
    usuarios.trocarSenha(usuarioLogado().id, d.atual, d.nova)
  })
  canal('auth:atualizarPerfil', (d) => usuarios.atualizarPerfil(usuarioLogado().id, s.perfilSchema.parse(d)))

  canal('auth:avisos', () => {
    const u = usuarioLogado()
    return recuperacao.avisos(u.id, u.perfil)
  })
  canal('auth:recuperar', (login, codigo, nova) =>
    recuperacao.recuperar(z.string().max(100).parse(login), z.string().max(100).parse(codigo), z.string().max(200).parse(nova))
  )
  canal('recuperacao:estado', () => {
    exigir('configuracoes')
    return recuperacao.estado()
  })
  canal('sistema:zerarDados', (o) => {
    const u = exigir('configuracoes')
    const opcoes = z.object({ manterUsuarios: z.boolean(), restaurarEmpresa: z.boolean(), confirmacao: z.string().max(20) }).parse(o)
    return zerarDados(opcoes, u.id)
  })
  canal('recuperacao:gerar', () => {
    exigir('configuracoes')
    return recuperacao.gerar()
  })

  canal('dados:carregar', () => {
    usuarioLogado()
    return dados.carregar()
  })
  canal('sistema:info', () => {
    usuarioLogado()
    const { versao } = banco().prepare('SELECT sqlite_version() AS versao').get() as { versao: string }
    return {
      versao: app.getVersion(),
      caminhoBanco: caminhoBanco(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      sqlite: versao
    }
  })

  // ---------- Cadastros ----------
  const cat = crud('cadastros', cadastros.salvarCategoria, cadastros.excluirCategoria, s.categoriaSchema)
  canal('categorias:salvar', cat.salvar as Handler<'categorias:salvar'>)
  canal('categorias:excluir', cat.excluir)

  const un = crud('cadastros', cadastros.salvarUnidade, cadastros.excluirUnidade, s.unidadeSchema)
  canal('unidades:salvar', un.salvar as Handler<'unidades:salvar'>)
  canal('unidades:excluir', un.excluir)

  const prod = crud('produtos', produtos.salvar, produtos.excluir, s.produtoSchema)
  canal('produtos:salvar', prod.salvar as Handler<'produtos:salvar'>)
  canal('produtos:excluir', prod.excluir)

  const forn = crud('fornecedores', cadastros.salvarFornecedor, cadastros.excluirFornecedor, s.fornecedorSchema)
  canal('fornecedores:salvar', forn.salvar as Handler<'fornecedores:salvar'>)
  canal('fornecedores:excluir', forn.excluir)

  const cli = crud('clientes', cadastros.salvarCliente, cadastros.excluirCliente, s.clienteSchema)
  canal('clientes:salvar', cli.salvar as Handler<'clientes:salvar'>)
  canal('clientes:excluir', cli.excluir)

  const usu = crud('usuarios', usuarios.salvar, usuarios.excluir, s.usuarioSchema)
  canal('usuarios:salvar', usu.salvar as Handler<'usuarios:salvar'>)
  canal('usuarios:excluir', usu.excluir)

  // ---------- Compras e estoque ----------
  const comp = crud('compras', compras.salvar, compras.excluir, s.compraEntradaSchema)
  canal('compras:salvar', comp.salvar as Handler<'compras:salvar'>)
  canal('compras:excluir', comp.excluir)
  canal('compras:receber', (i, itens) => {
    const u = exigir('compras')
    const lista = z
      .array(z.object({ produtoId: s.idSchema, quantidade: z.number().int('Use números inteiros').min(0, 'Não pode ser negativo') }))
      .optional()
      .parse(itens)
    return compras.receber(id(i), u.id, lista)
  })
  canal('compras:encerrar', (i) => {
    exigir('compras')
    compras.encerrar(id(i))
  })

  canal('vendas:registrar', (d) => vendas.registrar(s.vendaSchema.parse(d), exigir('vendas').id))
  canal('vendas:cancelar', (i, motivo) => vendas.cancelar(id(i), s.cancelamentoSchema.parse(motivo), exigir('vendasCancelar').id))

  canal('inventario:listar', () => {
    exigir('estoque')
    return inventario.listar()
  })
  canal('inventario:obter', (i) => {
    exigir('estoque')
    return inventario.obter(id(i))
  })
  canal('inventario:abrir', (d) => {
    const u = exigir('estoque')
    const dados = z.object({ descricao: z.string().trim().max(200), categoriaId: s.idOuNovoSchema }).parse(d)
    return inventario.abrir(dados, u.id)
  })
  canal('inventario:contar', (i, contado) => {
    exigir('estoque')
    inventario.contar(id(i), z.number().int('Use número inteiro').min(0, 'Não pode ser negativo').max(10_000_000).nullable().parse(contado))
  })
  canal('inventario:concluir', (i, o) => {
    const u = exigir('inventarioConcluir')
    return inventario.concluir(id(i), z.object({ naoContadosZero: z.boolean() }).parse(o), u.id)
  })
  canal('inventario:cancelar', (i) => {
    exigir('inventarioConcluir')
    inventario.cancelar(id(i))
  })

  canal('estoque:movimentar', (d) => {
    const u = exigir('estoque')
    estoque.movimentar({ ...s.movimentacaoSchema.parse(d), usuarioId: u.id })
  })

  canal('configuracoes:salvar', (d) => {
    exigir('configuracoes')
    dados.salvarConfiguracoes(s.configuracoesSchema.parse(d))
  })

  // ---------- Relatórios, PDF e impressão ----------
  const pagina = z.object({ paisagem: z.boolean().optional(), numerarPaginas: z.boolean().optional() })
  const html = z.string().min(1).max(20_000_000)
  const nomeArquivo = (v: unknown): string => z.string().min(1).max(150).parse(v).replace(/[\/:*?"<>|]+/g, '-')

  canal('relatorio:pdf', async (h, nome, p) => {
    usuarioLogado()
    const destino = await escolherDestino('Salvar PDF', `${nomeArquivo(nome)}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }])
    return destino ? impressao.gerarPdf(html.parse(h), destino, pagina.parse(p)) : null
  })
  canal('relatorio:imprimir', (h, p) => {
    usuarioLogado()
    return impressao.imprimir(html.parse(h), pagina.parse(p))
  })

  // ---------- Excel ----------
  const planilha = z.object({
    nome: z.string().max(100),
    colunas: z.array(
      z.object({ titulo: z.string(), formato: z.enum(['texto', 'numero', 'moeda', 'data', 'dataHora']).optional(), largura: z.number().optional() })
    ),
    linhas: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(200_000)
  })
  const tipoImportacao = z.enum(['produtos', 'fornecedores', 'clientes'])
  const filtroExcel = [{ name: 'Planilha do Excel', extensions: ['xlsx'] }]

  canal('excel:exportar', async (p, nome) => {
    usuarioLogado()
    const destino = await escolherDestino('Exportar para Excel', `${nomeArquivo(nome)}.xlsx`, filtroExcel)
    return destino ? excel.exportar(planilha.parse(p), destino) : null
  })
  canal('excel:modelo', async (t) => {
    const tipo = tipoImportacao.parse(t)
    exigir(tipo)
    const destino = await escolherDestino('Salvar modelo de importação', `modelo-importacao-${tipo}.xlsx`, filtroExcel)
    return destino ? excel.gerarModelo(tipo, destino) : null
  })
  canal('excel:previa', async (t) => {
    const tipo = tipoImportacao.parse(t)
    const u = exigir(tipo)
    const origem = await escolherArquivo('Importar planilha', filtroExcel)
    return origem ? excel.previa(tipo, origem, u.id) : null
  })
  canal('excel:importar', (token) => {
    const t = z.string().uuid().parse(token)
    const u = exigir(excel.tipoPendente(t))
    return excel.confirmar(t, u.id)
  })

  // ---------- Backup ----------
  canal('backup:criar', async () => {
    exigir('configuracoes')
    const destino = await escolherDestino('Salvar backup', backup.nomeSugerido(), [{ name: 'Backup do banco (SQLite)', extensions: ['sqlite'] }])
    return destino ? backup.criarBackup(destino) : null
  })
  canal('backup:listar', () => {
    exigir('configuracoes')
    return backup.listarBackups()
  })
  canal('backup:restaurar', async (caminho) => {
    exigir('configuracoes')
    let origem = z.string().min(1).nullable().parse(caminho)
    // Um caminho vindo da interface só é aceito se for um dos backups da pasta do sistema.
    if (origem && !backup.listarBackups().some((b) => b.caminho === origem)) throw new ErroNegocio('Backup não encontrado na pasta do sistema.')
    origem ??= await escolherArquivo('Restaurar backup', [{ name: 'Backup do banco (SQLite)', extensions: ['sqlite', 'db'] }])
    if (!origem) return false
    await backup.restaurar(origem)
    return true
  })
  canal('backupExterno:estado', () => {
    exigir('configuracoes')
    return backupExterno.estado()
  })
  canal('backupExterno:escolherPasta', async () => {
    exigir('configuracoes')
    const pasta = await escolherPasta('Pasta do backup externo (pendrive, outro disco ou Google Drive/OneDrive)')
    return pasta ? backupExterno.configurar(pasta) : null
  })
  canal('backupExterno:fazerAgora', () => {
    exigir('configuracoes')
    return backupExterno.fazerAgora()
  })
  canal('backupExterno:desativar', () => {
    exigir('configuracoes')
    return backupExterno.desativar()
  })
  canal('backup:abrirPasta', async () => {
    exigir('configuracoes')
    await shell.openPath(backup.pastaDeBackups())
  })
  canal('arquivo:mostrar', (caminho) => {
    usuarioLogado()
    shell.showItemInFolder(z.string().min(1).parse(caminho))
  })

  // ---------- Sincronização ----------
  const conexao = z.object({
    url: z.string().trim().min(1, 'Informe o endereço do servidor').max(300),
    chave: z.string().min(1, 'Informe a chave de cadastro').max(300),
    nome: z.string().trim().min(1, 'Informe o nome deste terminal').max(100),
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{1,6}$/, 'Use de 1 a 6 letras ou números'),
    modo: z.enum(['enviar', 'substituir'])
  })

  canal('sync:estado', () => {
    usuarioLogado()
    return sync.estado()
  })
  canal('sync:conectar', (d) => {
    exigir('configuracoes')
    return sync.conectar(conexao.parse(d))
  })
  canal('sync:sincronizar', () => {
    usuarioLogado()
    return sync.sincronizar()
  })
  canal('sync:configurar', (o) => {
    exigir('configuracoes')
    return sync.configurar(z.object({ ativo: z.boolean(), intervalo: z.number().int().min(1).max(240) }).parse(o))
  })
  canal('sync:desconectar', () => {
    exigir('configuracoes')
    return sync.desconectar()
  })
  canal('sync:conflitos', () => {
    usuarioLogado()
    return sync.listarConflitos()
  })
  canal('sync:resolverConflito', (i) => {
    usuarioLogado()
    sync.resolverConflito(id(i))
  })

  // ---------- Atualização do aplicativo ----------
  canal('atualizacao:estado', () => atualizacao.estado())
  canal('atualizacao:verificar', () => {
    usuarioLogado()
    return atualizacao.verificar()
  })
  canal('atualizacao:instalar', () => {
    usuarioLogado()
    atualizacao.instalar()
  })
}
