import type { z } from 'zod'
import type { perfilSchema, usuarioSchema } from '@shared/schemas'
import type { Usuario } from '@shared/tipos'
import { banco } from '../db/conexao'
import { ErroNegocio } from '../erros'
import { gerarHash, verificarSenha } from '../seguranca'
import * as map from './mapeadores'
import { encerrarSessao, iniciarSessao } from './sessao'

// ---------- Autenticação ----------

const MSG_LOGIN_INVALIDO = 'Login ou senha inválidos.'
let hashFalso: string | undefined

export function entrar(login: string, senha: string): Usuario {
  const linha = banco().prepare('SELECT * FROM usuarios WHERE login = ?').get(login.trim().toLowerCase()) as map.Linha | undefined
  // Mesmo custo de verificação para login inexistente, para não revelar quais logins existem.
  hashFalso ??= gerarHash('login-inexistente')
  const ok = verificarSenha(senha, linha?.senha_hash ?? hashFalso)
  if (!linha || !ok) throw new ErroNegocio(MSG_LOGIN_INVALIDO)
  if (!linha.ativo) throw new ErroNegocio('Usuário inativo. Procure o administrador.')
  iniciarSessao(linha.id)
  return map.usuario(linha)
}

export function sair(): void {
  encerrarSessao()
}

export function trocarSenha(usuarioId: number, atual: string, nova: string): void {
  const linha = banco().prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(usuarioId) as { senha_hash: string }
  if (!verificarSenha(atual, linha.senha_hash)) throw new ErroNegocio('Senha atual incorreta.', 'atual')
  banco()
    .prepare(`UPDATE usuarios SET senha_hash = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`)
    .run(gerarHash(nova), usuarioId)
}

export function atualizarPerfil(usuarioId: number, d: z.output<typeof perfilSchema>): void {
  banco()
    .prepare(`UPDATE usuarios SET nome = ?, email = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`)
    .run(d.nome, d.email, usuarioId)
}

// ---------- Cadastro (somente administrador) ----------

const contarAdminsAtivos = (excetoId: number): number =>
  (banco().prepare(`SELECT COUNT(*) AS n FROM usuarios WHERE perfil = 'admin' AND ativo = 1 AND id <> ?`).get(excetoId) as { n: number }).n

export function salvar(id: number | null, d: z.output<typeof usuarioSchema>, logadoId: number): Usuario {
  const db = banco()
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM usuarios WHERE login = ? AND id IS NOT ?').get(d.login, id)) {
      throw new ErroNegocio('Login já em uso.', 'login')
    }
    if ((id === null || d.senha) && d.senha.length < 6) throw new ErroNegocio('Mínimo de 6 caracteres.', 'senha')

    if (id === null) {
      const r = db
        .prepare('INSERT INTO usuarios (nome, email, login, senha_hash, perfil, ativo) VALUES (?, ?, ?, ?, ?, ?)')
        .run(d.nome, d.email, d.login, gerarHash(d.senha), d.perfil, map.bool(d.ativo))
      id = Number(r.lastInsertRowid)
    } else {
      if (id === logadoId && (!d.ativo || d.perfil !== 'admin')) {
        throw new ErroNegocio('Você não pode remover o próprio acesso de administrador.', 'perfil')
      }
      const atual = db.prepare('SELECT perfil, ativo FROM usuarios WHERE id = ?').get(id) as { perfil: string; ativo: number } | undefined
      if (!atual) throw new ErroNegocio('Usuário não encontrado.')
      const deixaDeSerAdmin = atual.perfil === 'admin' && atual.ativo && (d.perfil !== 'admin' || !d.ativo)
      if (deixaDeSerAdmin && contarAdminsAtivos(id) === 0) {
        throw new ErroNegocio('O sistema precisa de pelo menos um administrador ativo.', 'perfil')
      }
      db.prepare(
        `UPDATE usuarios SET nome = ?, email = ?, login = ?, perfil = ?, ativo = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`
      ).run(d.nome, d.email, d.login, d.perfil, map.bool(d.ativo), id)
      if (d.senha) db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(gerarHash(d.senha), id)
    }
    return map.usuario(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) as map.Linha)
  })()
}

export function excluir(id: number, logadoId: number): void {
  const db = banco()
  if (id === logadoId) throw new ErroNegocio('Você não pode excluir o próprio usuário.')
  const u = db.prepare('SELECT perfil, ativo FROM usuarios WHERE id = ?').get(id) as { perfil: string; ativo: number } | undefined
  if (!u) throw new ErroNegocio('Usuário não encontrado.')
  if (u.perfil === 'admin' && u.ativo && contarAdminsAtivos(id) === 0) throw new ErroNegocio('O sistema precisa de pelo menos um administrador ativo.')
  if (db.prepare('SELECT 1 FROM movimentacoes WHERE usuario_id = ? LIMIT 1').get(id) || db.prepare('SELECT 1 FROM vendas WHERE usuario_id = ? LIMIT 1').get(id)) {
    throw new ErroNegocio('Usuário possui movimentações no histórico. Inative-o em vez de excluir.')
  }
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id)
}
