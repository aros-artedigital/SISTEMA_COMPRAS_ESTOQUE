import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react'

export interface Coluna<T> {
  chave: string
  titulo: string
  render: (item: T) => ReactNode
  alinhar?: 'esquerda' | 'direita' | 'centro'
  largura?: string
}

interface DataTableProps<T> {
  colunas: Coluna<T>[]
  dados: T[]
  chave: (item: T) => string | number
  vazio?: string
  porPagina?: number
}

const alinhamento = { esquerda: 'text-left', direita: 'text-right', centro: 'text-center' }

export function DataTable<T>({ colunas, dados, chave, vazio = 'Nenhum registro encontrado.', porPagina = 10 }: DataTableProps<T>) {
  const [pagina, setPagina] = useState(1)
  const totalPaginas = Math.max(1, Math.ceil(dados.length / porPagina))

  // Volta para a primeira página quando o filtro reduz a lista.
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(1)
  }, [pagina, totalPaginas])

  const visiveis = dados.slice((pagina - 1) * porPagina, pagina * porPagina)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {colunas.map((c) => (
                <th
                  key={c.chave}
                  style={c.largura ? { width: c.largura } : undefined}
                  className={`whitespace-nowrap px-4 py-3 font-semibold text-slate-700 ${alinhamento[c.alinhar ?? 'esquerda']}`}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr>
                <td colSpan={colunas.length} className="px-4 py-12 text-center text-slate-500">
                  <Inbox className="mx-auto mb-2 text-slate-300" size={32} />
                  {vazio}
                </td>
              </tr>
            ) : (
              visiveis.map((item) => (
                <tr key={chave(item)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                  {colunas.map((c) => (
                    <td key={c.chave} className={`px-4 py-3 text-slate-700 ${alinhamento[c.alinhar ?? 'esquerda']}`}>
                      {c.render(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {dados.length > porPagina && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-xs text-slate-600">
          <span>
            {(pagina - 1) * porPagina + 1}–{Math.min(pagina * porPagina, dados.length)} de {dados.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40"
              disabled={pagina === 1}
              onClick={() => setPagina((p) => p - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2">
              Página {pagina} de {totalPaginas}
            </span>
            <button
              className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40"
              disabled={pagina === totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Botões padrão "Editar / Excluir" da coluna de ações. */
export function AcoesLinha({ onEditar, onExcluir, extra }: { onEditar?: () => void; onExcluir?: () => void; extra?: ReactNode }) {
  return (
    <div className="flex justify-end gap-1.5">
      {extra}
      {onEditar && (
        <button onClick={onEditar} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
          Editar
        </button>
      )}
      {onExcluir && (
        <button onClick={onExcluir} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:border-red-300 hover:bg-red-50">
          Excluir
        </button>
      )}
    </div>
  )
}
