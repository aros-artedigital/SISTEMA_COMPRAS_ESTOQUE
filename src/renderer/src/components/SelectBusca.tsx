import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { contem } from '@shared/format'

// Campo de seleção com busca: funciona como um <select> (mesmas props, mesmo onChange), mas dá
// para digitar e filtrar a lista. Teclado: ↑ ↓ escolhem, Enter confirma, Esc fecha.
// A lista abre "por cima" de tudo (fora das janelas com rolagem), para nunca ficar cortada.

export interface Opcao {
  value: string | number
  label: string
}

export interface SelectBuscaProps {
  id?: string
  value?: string | number | readonly string[]
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void
  opcoes: Opcao[]
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  erro?: boolean
  'aria-label'?: string
  name?: string
}

const VAZIO = '\u0000'

export function SelectBusca({ id, value, onChange, opcoes, placeholder, disabled, autoFocus, className = '', erro, name, ...resto }: SelectBuscaProps) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [destaque, setDestaque] = useState(0)
  const [posicao, setPosicao] = useState<{ left: number; top: number; width: number; acima: boolean } | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const idLista = useId()

  const atual = String(value ?? '')
  // A opção "vazia" (placeholder) aparece como primeira da lista, para poder limpar o filtro.
  const todas = useMemo<Opcao[]>(() => (placeholder !== undefined ? [{ value: VAZIO, label: placeholder }, ...opcoes] : opcoes), [opcoes, placeholder])
  const filtradas = useMemo(() => (busca ? todas.filter((o) => o.value !== VAZIO && contem(o.label, busca)) : todas), [todas, busca])
  const selecionada = opcoes.find((o) => String(o.value) === atual)

  function abrir(): void {
    if (disabled) return
    setBusca('')
    const i = todas.findIndex((o) => (o.value === VAZIO ? atual === '' : String(o.value) === atual))
    setDestaque(Math.max(0, i))
    setAberto(true)
  }

  function escolher(o: Opcao): void {
    const v = o.value === VAZIO ? '' : String(o.value)
    setAberto(false)
    setBusca('')
    if (v !== atual) onChange?.({ target: { value: v, name }, currentTarget: { value: v, name } } as unknown as ChangeEvent<HTMLSelectElement>)
  }

  // Posição da lista: logo abaixo do campo (ou acima, se não couber).
  useLayoutEffect(() => {
    if (!aberto) return
    const calcular = (): void => {
      const r = campo.current?.getBoundingClientRect()
      if (!r) return
      const acima = window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom
      setPosicao({ left: r.left, top: acima ? r.top - 4 : r.bottom + 4, width: Math.max(r.width, 180), acima })
    }
    calcular()
    window.addEventListener('resize', calcular)
    window.addEventListener('scroll', calcular, true)
    return () => {
      window.removeEventListener('resize', calcular)
      window.removeEventListener('scroll', calcular, true)
    }
  }, [aberto])

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent): void => {
      const alvo = e.target as Node
      if (!campo.current?.parentElement?.contains(alvo) && !lista.current?.contains(alvo)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-indice="${destaque}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [destaque, aberto])

  function teclar(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!aberto) return abrir()
      const passo = e.key === 'ArrowDown' ? 1 : -1
      setDestaque((d) => Math.min(Math.max(0, d + passo), filtradas.length - 1))
    } else if (e.key === 'Enter') {
      if (!aberto) return
      e.preventDefault()
      e.stopPropagation()
      const o = filtradas[destaque]
      if (o) escolher(o)
    } else if (e.key === 'Escape') {
      if (!aberto) return
      // Fecha só a lista, não a janela em que o campo está.
      e.preventDefault()
      e.stopPropagation()
      setAberto(false)
      setBusca('')
    } else if (e.key === 'Tab') {
      setAberto(false)
      setBusca('')
    }
  }

  const exibido = aberto ? busca : (selecionada?.label ?? '')

  return (
    <div className={`relative ${className}`}>
      <input
        ref={campo}
        id={id}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={aberto && filtradas[destaque] ? `${idLista}-${destaque}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        value={exibido}
        placeholder={aberto ? (selecionada?.label ?? 'Digite para buscar...') : (placeholder ?? 'Selecione...')}
        onMouseDown={() => (aberto ? setAberto(false) : abrir())}
        onChange={(e) => {
          if (!aberto) abrir()
          setBusca(e.target.value)
          setDestaque(0)
        }}
        onKeyDown={teclar}
        onBlur={() => {
          // Dá tempo do clique na opção ser tratado antes de fechar.
          setTimeout(() => {
            if (document.activeElement !== campo.current) setAberto(false)
          }, 120)
        }}
        className={`h-10 w-full cursor-pointer rounded-lg border bg-superficie pl-3 pr-8 text-sm text-slate-900 placeholder:text-slate-500 focus:cursor-text focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 ${
          erro ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
        } ${!selecionada && !aberto ? 'placeholder:text-slate-500' : ''}`}
        {...resto}
      />
      <ChevronDown
        size={16}
        className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${aberto ? 'rotate-180' : ''}`}
      />
      {aberto &&
        posicao &&
        createPortal(
          <ul
            ref={lista}
            id={idLista}
            role="listbox"
            className="fixed z-[70] max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-superficie py-1 text-sm shadow-xl"
            style={{
              left: posicao.left,
              width: posicao.width,
              ...(posicao.acima ? { bottom: window.innerHeight - posicao.top } : { top: posicao.top })
            }}
          >
            {filtradas.length === 0 && <li className="px-3 py-2 text-slate-400">Nenhum resultado para “{busca}”</li>}
            {filtradas.map((o, i) => {
              const marcada = o.value === VAZIO ? atual === '' : String(o.value) === atual
              return (
                <li
                  key={String(o.value)}
                  id={`${idLista}-${i}`}
                  data-indice={i}
                  role="option"
                  aria-selected={marcada}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    escolher(o)
                  }}
                  onMouseEnter={() => setDestaque(i)}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 ${i === destaque ? 'bg-blue-50 text-blue-800' : 'text-slate-700'} ${
                    o.value === VAZIO ? 'italic text-slate-500' : ''
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {marcada && <Check size={15} className="shrink-0 text-blue-600" />}
                </li>
              )
            })}
          </ul>,
          document.body
        )}
    </div>
  )
}
