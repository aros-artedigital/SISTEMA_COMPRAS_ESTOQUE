import { useState } from 'react'
import { Field } from './ui'

// Campo de valor em reais. Digita-se como se escreve ("35", "59,90", "1.234,56" — o ponto
// decimal "59.9" também é aceito) e, ao sair do campo, o valor aparece formatado: 1.234,56.
// Para o formulário o valor continua um texto numérico simples ("1234.56"), como os demais campos.

type Evento = { target: { value: string } }

interface Props {
  label?: string
  error?: string
  hint?: string
  obrigatorio?: boolean
  wrapperClassName?: string
  className?: string
  placeholder?: string
  autoFocus?: boolean
  value: string | number
  onChange: (e: Evento) => void
  'aria-label'?: string
}

/** Texto digitado → número ("" quando vazio). Vírgula é sempre decimal; ponto só quando seguido de 1–2 dígitos no fim. */
export function lerMoeda(texto: string): string {
  const t = texto.replace(/[^\d.,-]/g, '')
  if (!/\d/.test(t)) return ''
  let normal: string
  if (t.includes(',')) normal = t.replace(/\./g, '').replace(',', '.')
  else {
    const partes = t.split('.')
    const ultima = partes[partes.length - 1]
    normal = partes.length > 1 && ultima.length <= 2 ? `${partes.slice(0, -1).join('')}.${ultima}` : partes.join('')
  }
  const n = Number(normal.replace(/,/g, ''))
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : ''
}

export const formatarMoeda = (v: string | number): string =>
  v === '' || v === null || v === undefined || !Number.isFinite(Number(v))
    ? ''
    : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function InputMoeda({ label, error, hint, obrigatorio, wrapperClassName, className = '', value, onChange, ...resto }: Props) {
  const [editando, setEditando] = useState<string | null>(null)
  const exibido = editando ?? formatarMoeda(value)

  const campo = (id?: string) => (
    <div className={`relative ${label ? 'w-full' : ''}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={exibido}
        onFocus={(e) => {
          setEditando(formatarMoeda(value))
          const campo = e.target
          // select() também foca o campo: só seleciona se o foco ainda estiver aqui
          // (com Tab rápido o foco já pode ter ido para o próximo campo).
          requestAnimationFrame(() => {
            if (document.activeElement === campo) campo.select()
          })
        }}
        onChange={(e) => {
          const limpo = e.target.value.replace(/[^\d.,]/g, '')
          setEditando(limpo)
          onChange({ target: { value: lerMoeda(limpo) } })
        }}
        onBlur={() => setEditando(null)}
        className={`h-10 w-full rounded-lg border bg-superficie pl-9 pr-3 text-right text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-100 ${
          error ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
        } ${className}`}
        {...resto}
      />
    </div>
  )

  if (!label) return campo()
  return (
    <Field label={label} error={error} hint={hint} obrigatorio={obrigatorio} className={wrapperClassName}>
      {(id) => campo(id)}
    </Field>
  )
}
