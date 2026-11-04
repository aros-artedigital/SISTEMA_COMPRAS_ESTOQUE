import { ErroApp } from '@/data/api'
import type { Notificar } from '@/contexts/ToastContext'

interface Opcoes {
  notificar: Notificar
  sucesso?: string
  /** Se o erro indicar um campo, ele é destacado no formulário em vez de virar notificação. */
  form?: { values: object; setError: (campo: never, mensagem: string) => void }
}

let emAndamento = false

/**
 * Roda uma ação no banco tratando erros de forma padronizada. Retorna true se deu certo.
 * Ignora cliques repetidos enquanto a ação anterior não termina (evita gravar em dobro).
 */
export async function executar(acao: () => Promise<unknown>, { notificar, sucesso, form }: Opcoes): Promise<boolean> {
  if (emAndamento) return false
  emAndamento = true
  try {
    await acao()
    if (sucesso) notificar('sucesso', sucesso)
    return true
  } catch (e) {
    const erro = e instanceof ErroApp ? e : null
    if (!erro) console.error(e)
    const mensagem = erro?.message ?? 'Erro inesperado. Tente novamente.'
    if (erro?.campo && form && erro.campo in form.values) (form.setError as (c: string, m: string) => void)(erro.campo, mensagem)
    else notificar(erro?.tipo === 'negocio' ? 'aviso' : 'erro', mensagem)
    return false
  } finally {
    emAndamento = false
  }
}
