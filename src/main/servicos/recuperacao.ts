import { randomInt } from 'crypto'
import type { AvisosSeguranca, EstadoRecuperacao } from '@shared/api'
import { banco } from '../db/conexao'
import { ErroNegocio } from '../erros'
import { gerarHash, verificarSenha } from '../seguranca'
import { agoraIso } from './mapeadores'

// Código de recuperação do administrador: permite redefinir a senha de um administrador
// pela tela de login quando ninguém lembra a senha. É mostrado uma única vez, guardado só
// como hash, vale em todos os terminais sincronizados e é consumido ao ser usado.

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem 0/O e 1/I, para não confundir ao digitar
const SENHA_PADRAO = 'admin123'

const normalizar = (codigo: string): string => codigo.toUpperCase().replace(/[^A-Z0-9]/g, '')

export function estado(): EstadoRecuperacao {
  const r = banco().prepare('SELECT criado_em FROM recuperacao WHERE id = 1').get() as { criado_em: string } | undefined
  return { existe: !!r, criadoEm: r?.criado_em ?? null }
}

/** Gera um novo código (o anterior deixa de valer) e o devolve em texto, formatado XXXX-XXXX-XXXX-XXXX. */
export function gerar(): string {
  const bruto = Array.from({ length: 16 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')
  banco()
    .prepare(
      `INSERT INTO recuperacao (id, codigo_hash, criado_em) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET codigo_hash = excluded.codigo_hash, criado_em = excluded.criado_em`
    )
    .run(gerarHash(bruto), agoraIso())
  return bruto.match(/.{4}/g)!.join('-')
}

// Proteção contra tentativa e erro: depois de 5 erros, espera crescente.
let erros = 0
let bloqueadoAte = 0

/** Redefine a senha de um administrador usando o código. Não exige sessão (é usado na tela de login). */
export function recuperar(login: string, codigo: string, novaSenha: string): void {
  const agora = Date.now()
  if (agora < bloqueadoAte) {
    throw new ErroNegocio(`Muitas tentativas. Aguarde ${Math.ceil((bloqueadoAte - agora) / 1000)} segundos e tente de novo.`)
  }
  const db = banco()
  const salvo = db.prepare('SELECT codigo_hash FROM recuperacao WHERE id = 1').get() as { codigo_hash: string } | undefined
  const usuario = db.prepare('SELECT id, perfil FROM usuarios WHERE login = ?').get(login.trim().toLowerCase()) as
    | { id: number; perfil: string }
    | undefined

  const valido = !!salvo && verificarSenha(normalizar(codigo), salvo.codigo_hash)
  if (!valido || usuario?.perfil !== 'admin') {
    erros++
    if (erros >= 5) bloqueadoAte = agora + Math.min(15 * 60_000, 30_000 * 2 ** (erros - 5))
    if (!salvo) throw new ErroNegocio('Nenhum código de recuperação foi criado neste sistema. Peça a outro administrador para redefinir sua senha.')
    throw new ErroNegocio('Login de administrador ou código de recuperação incorreto.', 'codigo')
  }
  if (novaSenha.length < 6) throw new ErroNegocio('Mínimo de 6 caracteres.', 'nova')

  db.transaction(() => {
    db.prepare(`UPDATE usuarios SET senha_hash = ?, ativo = 1, atualizado_em = datetime('now', 'localtime') WHERE id = ?`).run(gerarHash(novaSenha), usuario.id)
    db.prepare('DELETE FROM recuperacao WHERE id = 1').run() // código usado não vale de novo
  })()
  erros = 0
  bloqueadoAte = 0
}

/** Lembretes de segurança para o usuário logado. */
export function avisos(usuarioId: number, perfil: string): AvisosSeguranca {
  const { senha_hash } = banco().prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(usuarioId) as { senha_hash: string }
  return {
    senhaPadrao: verificarSenha(SENHA_PADRAO, senha_hash),
    semCodigoRecuperacao: perfil === 'admin' && !estado().existe
  }
}
