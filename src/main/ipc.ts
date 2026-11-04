import { app, ipcMain, shell } from 'electron'
import { z } from 'zod'
import type { ArgsDe, NomeCanal, Resposta, RetornoDe } from '@shared/api'
import type { Recurso } from '@shared/permissoes'
import * as s from '@shared/schemas'
import { banco, caminhoBanco } from './db/conexao'
import { ErroNegocio, serializarErro } from './erros'
import { escolherArquivo, escolherDestino } from './janela'
import * as backup from './servicos/backup'
import * as excel from './servicos/excel'
import * as impressao from './servicos/impressao'
import * as cadastros from './servicos/cadastros'
import * as compras from './servicos/compras'
import * as dados from './servicos/dados'
import * as estoque from './servicos/estoque'
import * as produtos from './servicos/produtos'
import { exigir, usuarioLogado } from './servicos/sessao'
import * as usuarios from './servicos/usuarios'

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
  canal('compras:receber', (i) => compras.receber(id(i), exigir('compras').id))

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
  canal('backup:abrirPasta', async () => {
    exigir('configuracoes')
    await shell.openPath(backup.pastaDeBackups())
  })
  canal('arquivo:mostrar', (caminho) => {
    usuarioLogado()
    shell.showItemInFolder(z.string().min(1).parse(caminho))
  })
}
