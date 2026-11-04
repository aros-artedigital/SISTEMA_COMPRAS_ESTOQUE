import { pode, type Recurso } from '@shared/permissoes'
import type { Usuario } from '@shared/tipos'
import { banco } from '../db/conexao'
import { ErroPermissao } from '../erros'
import * as map from './mapeadores'

// App desktop com uma única janela: a sessão vive no processo principal.
// Toda chamada IPC passa por aqui antes de tocar no banco.

let usuarioId: number | null = null

export function iniciarSessao(id: number): void {
  usuarioId = id
}

export function encerrarSessao(): void {
  usuarioId = null
}

/** Usuário logado, relido do banco (reflete inativação ou troca de perfil na hora). */
export function usuarioLogado(): Usuario {
  if (usuarioId === null) throw new ErroPermissao('Sessão expirada. Entre novamente.')
  const linha = banco().prepare('SELECT * FROM usuarios WHERE id = ?').get(usuarioId)
  if (!linha) {
    encerrarSessao()
    throw new ErroPermissao('Sessão expirada. Entre novamente.')
  }
  const u = map.usuario(linha)
  if (!u.ativo) {
    encerrarSessao()
    throw new ErroPermissao('Usuário inativo.')
  }
  return u
}

export function exigir(recurso: Recurso): Usuario {
  const u = usuarioLogado()
  if (!pode(u.perfil, recurso)) throw new ErroPermissao('Seu perfil não tem permissão para esta ação.')
  return u
}
