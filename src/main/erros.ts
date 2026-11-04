import { ZodError } from 'zod'
import type { ErroSerializado } from '@shared/api'

/** Violação de regra de negócio, com mensagem pronta para o usuário. */
export class ErroNegocio extends Error {
  constructor(
    mensagem: string,
    readonly campo?: string
  ) {
    super(mensagem)
  }
}

export class ErroPermissao extends Error {}

export function serializarErro(e: unknown): ErroSerializado {
  if (e instanceof ErroNegocio) return { tipo: 'negocio', mensagem: e.message, campo: e.campo }
  if (e instanceof ErroPermissao) return { tipo: 'permissao', mensagem: e.message }
  if (e instanceof ZodError) {
    const issue = e.issues[0]
    // path[0] é o índice do argumento quando validamos a tupla; o campo vem depois.
    const campo = issue.path.find((p): p is string => typeof p === 'string')
    return { tipo: 'validacao', mensagem: issue.message, campo }
  }
  console.error('[erro interno]', e)
  return { tipo: 'interno', mensagem: 'Erro inesperado ao acessar o banco de dados.' }
}
