import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Search } from 'lucide-react'

// ---------- Botões ----------

type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma'

const variantes: Record<Variante, string> = {
  primario: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
  secundario: 'bg-superficie text-slate-700 border border-slate-300 hover:bg-slate-50',
  perigo: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  fantasma: 'text-slate-600 hover:bg-slate-100'
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  tamanho?: 'sm' | 'md'
  icone?: ReactNode
}

export function Button({ variante = 'primario', tamanho = 'md', icone, className = '', children, ...props }: ButtonProps) {
  const tam = tamanho === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm'
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${tam} ${variantes[variante]} ${className}`}
      {...props}
    >
      {icone}
      {children}
    </button>
  )
}

// ---------- Campos de formulário ----------

interface FieldProps {
  label: string
  error?: string
  hint?: string
  obrigatorio?: boolean
  className?: string
  children: (id: string) => ReactNode
}

export function Field({ label, error, hint, obrigatorio, className = '', children }: FieldProps) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
        {obrigatorio && <span className="text-red-500"> *</span>}
      </label>
      {children(id)}
      {error ? <span className="text-xs text-red-600">{error}</span> : hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
  )
}

// Sem largura fixa: campos com label ocupam a coluna (w-full); sem label, quem chama define.
const baseInput =
  'h-10 rounded-lg border bg-superficie px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-100'
const estadoInput = (erro?: string): string =>
  erro ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  obrigatorio?: boolean
  wrapperClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, obrigatorio, wrapperClassName, className = '', ...props },
  ref
) {
  if (!label) return <input ref={ref} className={`${baseInput} ${estadoInput(error)} ${className}`} {...props} />
  return (
    <Field label={label} error={error} hint={hint} obrigatorio={obrigatorio} className={wrapperClassName}>
      {(id) => <input ref={ref} id={id} className={`${baseInput} w-full ${estadoInput(error)} ${className}`} {...props} />}
    </Field>
  )
})

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  obrigatorio?: boolean
  wrapperClassName?: string
  opcoes: { value: string | number; label: string }[]
  placeholder?: string
}

export function Select({ label, error, obrigatorio, wrapperClassName, opcoes, placeholder, className = '', ...props }: SelectProps) {
  const el = (id?: string) => (
    <select id={id} className={`${baseInput} w-full ${estadoInput(error)} pr-8`} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {opcoes.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
  if (!label) return <div className={className}>{el()}</div>
  return (
    <Field label={label} error={error} obrigatorio={obrigatorio} className={`${wrapperClassName ?? ''} ${className}`}>
      {(id) => el(id)}
    </Field>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
  wrapperClassName?: string
}

export function Textarea({ label, error, wrapperClassName, className = '', ...props }: TextareaProps) {
  return (
    <Field label={label} error={error} className={wrapperClassName}>
      {(id) => (
        <textarea
          id={id}
          rows={3}
          className={`w-full rounded-lg border bg-superficie px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 ${estadoInput(error)} ${className}`}
          {...props}
        />
      )}
    </Field>
  )
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      {label}
    </label>
  )
}

export function SearchInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input type="search" className={`${baseInput} w-full ${estadoInput()} pl-9`} {...props} />
    </div>
  )
}

// ---------- Exibição ----------

type CorBadge = 'cinza' | 'verde' | 'vermelho' | 'amarelo' | 'azul' | 'roxo'

const coresBadge: Record<CorBadge, string> = {
  cinza: 'bg-slate-100 text-slate-700',
  verde: 'bg-emerald-100 text-emerald-700',
  vermelho: 'bg-red-100 text-red-700',
  amarelo: 'bg-amber-100 text-amber-800',
  azul: 'bg-blue-100 text-blue-700',
  roxo: 'bg-violet-100 text-violet-700'
}

export function Badge({ cor = 'cinza', children }: { cor?: CorBadge; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${coresBadge[cor]}`}>{children}</span>
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-slate-200 bg-superficie shadow-sm ${className}`}>{children}</div>
}

export function CardHeader({ titulo, acao }: { titulo: string; acao?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
      <h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>
      {acao}
    </div>
  )
}
