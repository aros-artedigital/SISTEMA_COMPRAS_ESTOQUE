import { useState } from 'react'
import { Ban, Plus, Trash2, Wallet } from 'lucide-react'
import { pagoOS, rotuloFormaPagamento, rotuloTipoPagamentoOS, saldoOS, totalOS } from '@shared/dominio'
import * as fmt from '@shared/format'
import type { FormaPagamento, OrdemServico } from '@shared/tipos'
import { alterar } from '@/data/store'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { executar } from '@/lib/executar'
import { InputMoeda } from './InputMoeda'
import { Button, Input, Select } from './ui'

// Pagamentos da ordem de serviço: sinal, restante na entrega (em uma ou mais formas) e estorno.

export interface LinhaPagamento {
  chave: number
  forma: FormaPagamento | ''
  valor: string
}

let chave = 1
export const novaLinhaPagamento = (valor = ''): LinhaPagamento => ({ chave: chave++, forma: '', valor })

const FORMAS = (Object.keys(rotuloFormaPagamento) as FormaPagamento[]).map((f) => ({ value: f, label: rotuloFormaPagamento[f] }))

/** Linhas preenchidas → pagamentos, ou a mensagem do que falta. */
export function lerPagamentos(linhas: LinhaPagamento[], saldo: number): { pagamentos: { forma: FormaPagamento; valor: number }[]; erro: string } {
  const usadas = linhas.filter((l) => l.forma || l.valor)
  if (usadas.some((l) => !l.forma)) return { pagamentos: [], erro: 'Escolha a forma de cada pagamento.' }
  if (usadas.some((l) => !(Number(l.valor) > 0))) return { pagamentos: [], erro: 'Informe o valor de cada pagamento.' }
  const pagamentos = usadas.map((l) => ({ forma: l.forma as FormaPagamento, valor: Math.round(Number(l.valor) * 100) / 100 }))
  const soma = pagamentos.reduce((s, p) => s + p.valor, 0)
  if (soma > saldo + 0.005) return { pagamentos: [], erro: `O total (${fmt.moeda(soma)}) passa do que falta receber (${fmt.moeda(saldo)}).` }
  return { pagamentos, erro: '' }
}

/** Uma ou mais formas de pagamento (ex.: parte no Pix, parte no cartão). */
export function LinhasPagamento({ linhas, onChange, saldo }: { linhas: LinhaPagamento[]; onChange: (l: LinhaPagamento[]) => void; saldo: number }) {
  const soma = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0)
  const falta = Math.max(0, Math.round((saldo - soma) * 100) / 100)
  const mudar = (c: number, campo: 'forma' | 'valor', v: string): void => onChange(linhas.map((l) => (l.chave === c ? { ...l, [campo]: v } : l)))
  return (
    <div className="space-y-2">
      {linhas.map((l, i) => (
        <div key={l.chave} className="flex items-center gap-2">
          <Select
            className="min-w-0 flex-1"
            aria-label={`Forma de pagamento ${i + 1}`}
            placeholder="Forma..."
            opcoes={FORMAS}
            value={l.forma}
            onChange={(e) => mudar(l.chave, 'forma', e.target.value)}
          />
          <div className="w-32">
            <InputMoeda aria-label={`Valor recebido ${i + 1}`} value={l.valor} onChange={(e) => mudar(l.chave, 'valor', e.target.value)} />
          </div>
          {linhas.length > 1 && (
            <button className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remover forma de pagamento" onClick={() => onChange(linhas.filter((x) => x.chave !== l.chave))}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between text-xs">
        {linhas.length < 4 ? (
          <button className="flex items-center gap-1 font-medium text-blue-700 hover:underline" onClick={() => onChange([...linhas, novaLinhaPagamento(falta ? String(falta) : '')])}>
            <Plus size={12} /> Dividir em outra forma
          </button>
        ) : (
          <span />
        )}
        <span className={falta > 0 ? 'text-amber-700' : 'text-emerald-700'}>{falta > 0 ? `Faltam ${fmt.moeda(falta)}` : 'Valor completo'}</span>
      </div>
    </div>
  )
}

/** Quadro da ficha: total, recebido, saldo, lista de pagamentos, receber e estornar. */
export function PainelPagamentos({ os: o }: { os: OrdemServico }) {
  const { pode } = useAuth()
  const notificar = useToast()
  const total = totalOS(o)
  const pago = pagoOS(o)
  const saldo = saldoOS(o)
  const [recebendo, setRecebendo] = useState(false)
  const [linhas, setLinhas] = useState<LinhaPagamento[]>([])
  const [erro, setErro] = useState('')
  const [estornando, setEstornando] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')

  const podeReceber = pode('osEditar') && o.status !== 'cancelada' && saldo > 0

  async function confirmar(): Promise<void> {
    const r = lerPagamentos(linhas, saldo)
    if (r.erro || !r.pagamentos.length) return setErro(r.erro || 'Informe o valor recebido.')
    const ok = await executar(() => alterar('os:receber', o.id, r.pagamentos), { notificar, sucesso: `Recebido ${fmt.moeda(r.pagamentos.reduce((s, p) => s + p.valor, 0))} na OS ${o.numero}.` })
    if (ok) setRecebendo(false)
  }

  async function estornar(id: number): Promise<void> {
    if (motivo.trim().length < 3) return setErro('Informe o motivo do estorno.')
    const ok = await executar(() => alterar('os:estornarPagamento', o.id, id, motivo), { notificar, sucesso: 'Pagamento estornado.' })
    if (ok) setEstornando(null)
  }

  if (total <= 0 && !o.pagamentos.length) return null

  return (
    <section className="rounded-lg border border-slate-200 p-3" aria-label="Pagamento da OS">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Wallet size={15} className="text-blue-600" /> Pagamento
        </h3>
        {podeReceber && !recebendo && (
          <Button
            tamanho="sm"
            variante="secundario"
            onClick={() => {
              setLinhas([novaLinhaPagamento(String(saldo))])
              setErro('')
              setRecebendo(true)
            }}
          >
            {o.status === 'entregue' || o.status === 'pronta' ? 'Receber' : 'Receber sinal'}
          </Button>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Total</dt>
          <dd className="font-semibold tabular-nums text-slate-800">{fmt.moeda(total)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Recebido</dt>
          <dd className="font-semibold tabular-nums text-emerald-700">{fmt.moeda(pago)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">{o.status === 'cancelada' && pago > 0 ? 'A devolver' : 'Falta receber'}</dt>
          <dd className={`font-semibold tabular-nums ${o.status === 'cancelada' ? (pago > 0 ? 'text-red-600' : 'text-slate-400') : saldo > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
            {fmt.moeda(o.status === 'cancelada' ? pago : saldo)}
          </dd>
        </div>
      </dl>
      {o.status === 'cancelada' && pago > 0 && (
        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">OS cancelada com valor recebido: devolva ao cliente e estorne os pagamentos abaixo.</p>
      )}

      {recebendo && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-2">
          <LinhasPagamento
            linhas={linhas}
            saldo={saldo}
            onChange={(l) => {
              setLinhas(l)
              setErro('')
            }}
          />
          {erro && <p className="text-xs text-red-600">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button tamanho="sm" variante="fantasma" onClick={() => setRecebendo(false)}>
              Cancelar
            </Button>
            <Button tamanho="sm" onClick={() => void confirmar()}>
              Confirmar recebimento
            </Button>
          </div>
        </div>
      )}

      {o.pagamentos.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {o.pagamentos.map((p) => (
            <li key={p.id} className="py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className={p.estornado ? 'text-slate-400 line-through' : 'text-slate-700'}>
                  {rotuloTipoPagamentoOS[p.tipo]} · {rotuloFormaPagamento[p.forma]}
                  <span className="ml-1 text-xs text-slate-400 no-underline">
                    {fmt.dataHora(p.em)} · {p.usuario}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`font-medium tabular-nums ${p.estornado ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{fmt.moeda(p.valor)}</span>
                  {!p.estornado && pode('osEditar') && estornando !== p.id && (
                    <button
                      className="text-xs font-medium text-red-600 hover:underline"
                      onClick={() => {
                        setEstornando(p.id)
                        setMotivo('')
                        setErro('')
                      }}
                    >
                      Estornar
                    </button>
                  )}
                </span>
              </div>
              {p.estornado && <p className="text-xs text-slate-500">Estornado{p.estornadoEm ? ` em ${fmt.dataHora(p.estornadoEm)}` : ''}: {p.motivoEstorno}</p>}
              {estornando === p.id && (
                <div className="mt-1.5 flex items-center gap-2">
                  <Input aria-label="Motivo do estorno" className="h-8 min-w-0 flex-1" placeholder="Motivo do estorno" value={motivo} autoFocus onChange={(e) => setMotivo(e.target.value)} />
                  <Button tamanho="sm" variante="perigo" icone={<Ban size={13} />} onClick={() => void estornar(p.id)}>
                    Estornar
                  </Button>
                  <Button tamanho="sm" variante="fantasma" onClick={() => setEstornando(null)}>
                    Voltar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {erro && !recebendo && <p className="mt-1 text-xs text-red-600">{erro}</p>}
    </section>
  )
}
