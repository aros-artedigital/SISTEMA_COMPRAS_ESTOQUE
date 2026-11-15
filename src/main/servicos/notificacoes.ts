import type { Notificacao } from '@shared/api'
import { pode } from '@shared/permissoes'
import type { Usuario } from '@shared/tipos'
import { banco } from '../db/conexao'
import * as atualizacao from '../atualizacao'
import { lerConfiguracoes } from './dados'
import { agoraIso } from './mapeadores'
import * as recuperacao from './recuperacao'
import * as sync from './sync/motor'

// Central de notificações: avisos calculados a partir do estado atual do sistema (estoque, compras,
// inventário, backup, sincronização, atualização), filtrados pelo que o usuário pode ver.
// Cada aviso tem uma chave estável; o que o usuário já leu fica em notificacoes_lidas.
// Quando a situação se resolve (ex.: estoque reposto), a marca de lido é apagada — se o problema
// voltar, o aviso aparece de novo como não lido.

const DIAS_COMPRA_ATRASADA = 7
const MAXIMO = 60

const dias = (de: string): number => Math.floor((Date.now() - new Date(de.length === 10 ? `${de}T00:00:00` : de).getTime()) / 86_400_000)

function calcular(u: Usuario): Omit<Notificacao, 'lida'>[] {
  const db = banco()
  const lista: Omit<Notificacao, 'lida'>[] = []

  // Estoque: sem estoque e abaixo do mínimo.
  if (pode(u, 'produtos') && lerConfiguracoes().alertarEstoqueMinimo) {
    const produtos = db
      .prepare(`SELECT id, codigo, nome, estoque, estoque_minimo FROM produtos WHERE ativo = 1 AND (estoque <= 0 OR estoque < estoque_minimo) ORDER BY estoque, nome`)
      .all() as { id: number; codigo: string; nome: string; estoque: number; estoque_minimo: number }[]
    for (const p of produtos) {
      const zerado = p.estoque <= 0
      lista.push({
        chave: `${zerado ? 'estoque-zerado' : 'estoque-baixo'}:${p.id}`,
        tipo: zerado ? 'erro' : 'aviso',
        categoria: 'Estoque',
        titulo: zerado ? `Sem estoque: ${p.nome}` : `Estoque baixo: ${p.nome}`,
        mensagem: zerado ? `${p.codigo} está sem saldo. Mínimo: ${p.estoque_minimo}.` : `${p.codigo} tem ${p.estoque} — abaixo do mínimo de ${p.estoque_minimo}.`,
        link: '/produtos?filtro=baixo'
      })
    }
  }

  // Compras pedidas há muitos dias e ainda não recebidas.
  if (pode(u, 'compras')) {
    const compras = db
      .prepare(
        `SELECT c.id, c.numero, c.data, COALESCE(NULLIF(f.nome_fantasia, ''), f.razao_social) AS fornecedor
         FROM compras c JOIN fornecedores f ON f.id = c.fornecedor_id WHERE c.status = 'pedido' ORDER BY c.data`
      )
      .all() as { id: number; numero: string; data: string; fornecedor: string }[]
    for (const c of compras) {
      const d = dias(c.data)
      if (d < DIAS_COMPRA_ATRASADA) continue
      lista.push({
        chave: `compra-atrasada:${c.id}`,
        tipo: 'aviso',
        categoria: 'Compras',
        titulo: `Compra ${c.numero} aguardando entrega`,
        mensagem: `Pedido a ${c.fornecedor} há ${d} dias e ainda não recebido.`,
        link: '/compras',
        em: c.data
      })
    }
  }

  // Inventário aberto há mais de um dia.
  if (pode(u, 'estoque')) {
    const inventarios = db.prepare(`SELECT id, numero, criado_em FROM inventarios WHERE status = 'aberto'`).all() as { id: number; numero: string; criado_em: string }[]
    for (const i of inventarios) {
      const d = dias(i.criado_em)
      if (d < 1) continue
      lista.push({
        chave: `inventario-aberto:${i.id}`,
        tipo: 'info',
        categoria: 'Estoque',
        titulo: `Inventário ${i.numero} em aberto`,
        mensagem: `Contagem iniciada há ${d} dia${d > 1 ? 's' : ''} e ainda não concluída.`,
        link: '/inventario',
        em: i.criado_em
      })
    }
  }

  // Segurança e backup.
  const avisos = recuperacao.avisos(u.id, u.perfil)
  if (avisos.senhaPadrao) {
    lista.push({ chave: 'senha-padrao', tipo: 'aviso', categoria: 'Segurança', titulo: 'Troque a senha padrão', mensagem: 'Você ainda usa a senha de instalação. Defina uma senha só sua.', link: '/perfil' })
  }
  if (pode(u, 'configuracoes')) {
    if (avisos.semCodigoRecuperacao) {
      lista.push({
        chave: 'codigo-recuperacao',
        tipo: 'info',
        categoria: 'Segurança',
        titulo: 'Crie um código de recuperação',
        mensagem: 'Sem ele, se a senha do administrador for esquecida, não há como recuperar o acesso.',
        link: '/configuracoes?aba=seguranca'
      })
    }
    if (avisos.backupExternoAtrasado !== null) {
      lista.push({
        chave: 'backup-externo',
        tipo: 'aviso',
        categoria: 'Backup',
        titulo: 'Backup externo atrasado',
        mensagem: avisos.backupExternoAtrasado < 0 ? 'A cópia fora do computador ainda não foi concluída.' : `Sem cópia fora do computador há ${avisos.backupExternoAtrasado} dias.`,
        link: '/configuracoes?aba=backup'
      })
    }
    for (const c of sync.listarConflitos()) {
      lista.push({
        chave: `conflito:${c.id}`,
        tipo: 'aviso',
        categoria: 'Sincronização',
        titulo: 'Conflito de sincronização',
        mensagem: `${c.descricao}: ${c.motivo}`,
        link: '/configuracoes?aba=sincronizacao',
        em: c.em
      })
    }
  }

  const at = atualizacao.estado()
  if (at.status === 'pronta' || at.status === 'disponivel') {
    lista.push({
      chave: `atualizacao:${at.novaVersao ?? ''}`,
      tipo: 'sucesso',
      categoria: 'Sistema',
      titulo: at.status === 'pronta' ? `Versão ${at.novaVersao} pronta para instalar` : `Nova versão ${at.novaVersao} disponível`,
      mensagem: at.status === 'pronta' ? 'Reinicie o sistema pelo aviso no topo da tela para atualizar.' : 'O download começa automaticamente.'
    })
  }

  return lista.slice(0, MAXIMO)
}

export function listar(u: Usuario): Notificacao[] {
  const db = banco()
  const atuais = calcular(u)
  const lidas = new Set((db.prepare('SELECT chave FROM notificacoes_lidas WHERE usuario_id = ?').all(u.id) as { chave: string }[]).map((r) => r.chave))
  // Situação resolvida: esquece a marca de lido, para o aviso voltar como novo se o problema voltar.
  const chaves = new Set(atuais.map((n) => n.chave))
  const resolvidas = [...lidas].filter((c) => !chaves.has(c))
  if (resolvidas.length) {
    const apagar = db.prepare('DELETE FROM notificacoes_lidas WHERE usuario_id = ? AND chave = ?')
    db.transaction(() => resolvidas.forEach((c) => apagar.run(u.id, c)))()
  }
  const peso = { erro: 0, aviso: 1, info: 2, sucesso: 3 }
  return atuais
    .map((n) => ({ ...n, lida: lidas.has(n.chave) }))
    .sort((a, b) => Number(a.lida) - Number(b.lida) || peso[a.tipo] - peso[b.tipo])
}

export function marcarLidas(u: Usuario, chaves: string[]): void {
  const db = banco()
  const ins = db.prepare('INSERT OR IGNORE INTO notificacoes_lidas (usuario_id, chave, em) VALUES (?, ?, ?)')
  const em = agoraIso()
  db.transaction(() => chaves.forEach((c) => ins.run(u.id, c, em)))()
}
