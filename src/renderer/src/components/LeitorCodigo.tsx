import { useState, type KeyboardEvent } from 'react'
import { ScanBarcode } from 'lucide-react'
import { useDb } from '@/data/store'
import type { Produto } from '@shared/tipos'

/** Busca um produto pelo código de barras ou pelo código interno (sem diferenciar maiúsculas). */
export function buscarPorCodigo(produtos: Produto[], codigo: string): Produto | undefined {
  const c = codigo.trim()
  if (!c) return undefined
  return produtos.find((p) => p.codigoBarras === c) ?? produtos.find((p) => p.codigo.toLowerCase() === c.toLowerCase())
}

interface Props {
  onEncontrar: (produto: Produto) => void
  placeholder?: string
  autoFocus?: boolean
  /** Se true, só aceita produtos ativos. */
  somenteAtivos?: boolean
}

/**
 * Campo para leitor de código de barras. Leitores USB funcionam como teclado:
 * digitam o código e enviam Enter — é nesse Enter que o produto é buscado.
 */
export function LeitorCodigo({ onEncontrar, placeholder = 'Leia o código de barras ou digite o código e tecle Enter', autoFocus, somenteAtivos = true }: Props) {
  const { produtos } = useDb()
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState('')

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const p = buscarPorCodigo(somenteAtivos ? produtos.filter((x) => x.ativo) : produtos, valor)
    if (p) {
      onEncontrar(p)
      setErro('')
    } else if (valor.trim()) {
      setErro(`Nenhum produto ativo com o código "${valor.trim()}".`)
    }
    setValor('')
  }

  return (
    <div>
      <div className="relative">
        <ScanBarcode size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
        <input
          value={valor}
          autoFocus={autoFocus}
          onChange={(e) => {
            setValor(e.target.value)
            setErro('')
          }}
          onKeyDown={aoTeclar}
          placeholder={placeholder}
          aria-label="Código de barras"
          className="h-10 w-full rounded-lg border border-dashed border-blue-300 bg-blue-50/40 pl-10 pr-3 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
    </div>
  )
}
