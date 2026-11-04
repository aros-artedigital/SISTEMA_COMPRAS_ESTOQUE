import type { ArgsDe, ErroSerializado, Eventos, NomeCanal, Resposta, RetornoDe } from '@shared/api'

/** Erro devolvido pelo processo principal (regra de negócio, validação ou permissão). */
export class ErroApp extends Error {
  readonly campo?: string
  readonly tipo: ErroSerializado['tipo']

  constructor(erro: ErroSerializado) {
    super(erro.mensagem)
    this.campo = erro.campo
    this.tipo = erro.tipo
  }
}

/** Chama um canal IPC tipado e devolve os dados, ou lança ErroApp. */
export async function chamar<C extends NomeCanal>(canal: C, ...args: ArgsDe<C>): Promise<RetornoDe<C>> {
  if (!window.api) {
    throw new ErroApp({ tipo: 'interno', mensagem: 'Esta tela precisa rodar dentro do aplicativo desktop.' })
  }
  const r = (await window.api.invoke(canal, ...args)) as Resposta<RetornoDe<C>>
  if (!r.ok) throw new ErroApp(r.erro)
  return r.dados
}

/** Escuta um evento enviado pelo processo principal. Retorna a função que cancela. */
export function aoEvento<E extends keyof Eventos>(evento: E, callback: (dados: Eventos[E]) => void): () => void {
  if (!window.api) return () => undefined
  return window.api.aoEvento(evento, (d) => callback(d as Eventos[E]))
}
