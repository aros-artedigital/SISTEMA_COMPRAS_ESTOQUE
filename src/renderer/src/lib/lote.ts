import { useState } from 'react'
import type { ResultadoLote } from '@shared/api'
import type { Notificar } from '@/contexts/ToastContext'
import { executar } from './executar'

// Seleção de linhas + ações em lote, igual em todas as telas: mostra quantos deram certo e,
// para os que não puderam, o motivo; os que falharam continuam marcados.

type Chave = string | number

export interface Palavras {
  /** Ex.: ['cliente', 'clientes'] */
  nome: [string, string]
  /** Concorda o verbo no feminino ("compras excluídas"). */
  feminino?: boolean
}

const plural = (n: number, [um, varios]: [string, string]): string => (n === 1 ? um : varios)
function conjugar(verbo: string, n: number, feminino?: boolean): string {
  const v = feminino ? verbo.replace(/o$/, 'a') : verbo
  return n === 1 ? v : `${v}s`
}

export function useLote(notificar: Notificar, palavras: Palavras) {
  const [selecionados, setSelecionados] = useState<Set<Chave>>(new Set())

  /** Roda a ação (ex.: verbo "excluído") e informa o resultado. */
  async function emLote(acao: () => Promise<ResultadoLote>, verbo: string): Promise<void> {
    let r: ResultadoLote | null = null
    const ok = await executar(async () => (r = await acao()), { notificar })
    if (!ok || !r) return
    const { feitos, falhas } = r as ResultadoLote
    if (feitos) notificar('sucesso', `${feitos} ${plural(feitos, palavras.nome)} ${conjugar(verbo, feitos, palavras.feminino)}.`)
    if (falhas.length) {
      const exemplos = falhas
        .slice(0, 3)
        .map((f) => `${f.item}: ${f.motivo}`)
        .join(' · ')
      const naoPode = falhas.length === 1 ? 'não pôde ser' : 'não puderam ser'
      notificar('aviso', `${falhas.length} ${naoPode} ${conjugar(verbo, falhas.length, palavras.feminino)} — ${exemplos}${falhas.length > 3 ? ' …' : ''}`)
    }
    setSelecionados(new Set(falhas.map((f) => f.id)))
  }

  return { selecionados, setSelecionados, emLote }
}
