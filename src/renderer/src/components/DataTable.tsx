import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileText, Inbox, Pencil, Trash2 } from 'lucide-react'

export interface Coluna<T> {
  chave: string
  titulo: string
  render: (item: T) => ReactNode
  alinhar?: 'esquerda' | 'direita' | 'centro'
  largura?: string
}

type Chave = string | number

interface DataTableProps<T> {
  colunas: Coluna<T>[]
  dados: T[]
  chave: (item: T) => Chave
  vazio?: string
  /** Itens por página sugeridos para esta tabela (o usuário pode trocar; a escolha fica guardada). */
  porPagina?: number
  /** Palavra usada no total ("57 produtos"). Padrão: "registros". */
  nomeItens?: string
  /** Seleção de linhas (caixas de marcar). Sem estas props, a tabela não mostra a coluna. */
  selecionados?: Set<Chave>
  onSelecionar?: (s: Set<Chave>) => void
  /** Nome que identifica a linha para leitores de tela ("Selecionar <nome>"). */
  rotuloLinha?: (item: T) => string
  /** Botões que aparecem na barra quando há linhas selecionadas (ações em lote). */
  acoesSelecao?: ReactNode
}

const alinhamento = { esquerda: 'text-left', direita: 'text-right', centro: 'text-center' }
const TAMANHOS = [10, 25, 50, 100]

function lerTamanho(chave: string, padrao: number): number {
  try {
    const v = Number(localStorage.getItem(chave))
    return v > 0 ? v : padrao
  } catch {
    return padrao
  }
}

/**
 * Tabela padrão do sistema: paginação com total de registros e itens por página, cabeçalho fixo
 * ao rolar (a tabela rola dentro do quadro quando a página tem mais linhas do que cabem na tela)
 * e, opcionalmente, seleção de linhas com ações em lote.
 */
export function DataTable<T>({
  colunas,
  dados,
  chave,
  vazio = 'Nenhum registro encontrado.',
  porPagina = 10,
  nomeItens = 'registros',
  selecionados,
  onSelecionar,
  rotuloLinha,
  acoesSelecao
}: DataTableProps<T>) {
  const { pathname } = useLocation()
  const chaveTamanho = `porPagina:${pathname}`
  const [tamanho, setTamanho] = useState(() => lerTamanho(chaveTamanho, porPagina))
  const [pagina, setPagina] = useState(1)
  const rolagem = useRef<HTMLDivElement>(null)
  const totalPaginas = Math.max(1, Math.ceil(dados.length / tamanho))
  const comSelecao = !!selecionados && !!onSelecionar

  // Volta para a primeira página quando o filtro reduz a lista.
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(1)
  }, [pagina, totalPaginas])

  // Ao trocar de página, a lista volta ao topo.
  useEffect(() => {
    rolagem.current?.scrollTo({ top: 0 })
  }, [pagina, tamanho])

  const visiveis = dados.slice((pagina - 1) * tamanho, pagina * tamanho)
  const tamanhos = useMemo(() => [...new Set([...TAMANHOS, porPagina])].sort((a, b) => a - b), [porPagina])

  // Seleção: só conta o que ainda está na lista (filtros e exclusões tiram itens da seleção).
  const chavesLista = useMemo(() => new Set(dados.map(chave)), [dados, chave])
  const marcados = comSelecao ? [...selecionados!].filter((k) => chavesLista.has(k)) : []
  const visiveisMarcados = comSelecao ? visiveis.filter((i) => selecionados!.has(chave(i))).length : 0
  const todosVisiveis = visiveis.length > 0 && visiveisMarcados === visiveis.length
  const algunsVisiveis = visiveisMarcados > 0 && !todosVisiveis

  function alternar(k: Chave): void {
    const s = new Set(marcados)
    if (s.has(k)) s.delete(k)
    else s.add(k)
    onSelecionar?.(s)
  }
  function alternarPagina(): void {
    const s = new Set(marcados)
    for (const i of visiveis) {
      if (todosVisiveis) s.delete(chave(i))
      else s.add(chave(i))
    }
    onSelecionar?.(s)
  }

  function trocarTamanho(n: number): void {
    setTamanho(n)
    setPagina(1)
    try {
      localStorage.setItem(chaveTamanho, String(n))
    } catch {
      // sem armazenamento: vale até fechar o app
    }
  }

  const inicio = dados.length === 0 ? 0 : (pagina - 1) * tamanho + 1
  const fim = Math.min(pagina * tamanho, dados.length)
  const nColunas = colunas.length + (comSelecao ? 1 : 0)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-superficie shadow-sm">
      {comSelecao && marcados.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-sm" role="region" aria-label="Ações com os selecionados">
          <span className="font-semibold text-blue-800">
            {marcados.length} selecionado{marcados.length > 1 ? 's' : ''}
          </span>
          {/* Ações à esquerda, junto da contagem (as mensagens aparecem no canto direito). */}
          {acoesSelecao && <div className="flex flex-wrap items-center gap-2">{acoesSelecao}</div>}
          <span className="flex items-center gap-4">
            {marcados.length < dados.length && (
              <button className="text-blue-700 underline-offset-2 hover:underline" onClick={() => onSelecionar!(new Set(chavesLista))}>
                Selecionar todos os {dados.length}
              </button>
            )}
            <button className="text-blue-700 underline-offset-2 hover:underline" onClick={() => onSelecionar!(new Set())}>
              Limpar seleção
            </button>
          </span>
        </div>
      )}

      {/* Rola aqui dentro quando há mais linhas do que cabem; o cabeçalho fica fixo no topo. */}
      <div ref={rolagem} className="max-h-[calc(100vh-17rem)] min-h-[8rem] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {comSelecao && (
                <th className="sticky top-0 z-10 w-10 bg-slate-50 px-4 py-3 shadow-[inset_0_-1px_0] shadow-slate-200">
                  <CaixaMarcar
                    marcado={todosVisiveis}
                    parcial={algunsVisiveis}
                    rotulo="Selecionar todos desta página"
                    onChange={alternarPagina}
                    desativado={visiveis.length === 0}
                  />
                </th>
              )}
              {colunas.map((c) => (
                <th
                  key={c.chave}
                  style={c.largura ? { width: c.largura } : undefined}
                  className={`sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-4 py-3 font-semibold text-slate-700 shadow-[inset_0_-1px_0] shadow-slate-200 ${alinhamento[c.alinhar ?? 'esquerda']}`}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr>
                <td colSpan={nColunas} className="px-4 py-12 text-center text-slate-500">
                  <Inbox className="mx-auto mb-2 text-slate-300" size={32} />
                  {vazio}
                </td>
              </tr>
            ) : (
              visiveis.map((item) => {
                const k = chave(item)
                const marcado = comSelecao && selecionados!.has(k)
                return (
                  <tr key={k} className={`border-b border-slate-100 last:border-0 ${marcado ? 'bg-blue-50/70' : 'hover:bg-slate-50/70'}`}>
                    {comSelecao && (
                      <td className="w-10 px-4 py-3">
                        <CaixaMarcar marcado={!!marcado} rotulo={`Selecionar ${rotuloLinha?.(item) ?? k}`} onChange={() => alternar(k)} />
                      </td>
                    )}
                    {colunas.map((c) => (
                      <td key={c.chave} className={`px-4 py-3 text-slate-700 ${alinhamento[c.alinhar ?? 'esquerda']}`}>
                        {c.render(item)}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-2.5 text-xs text-slate-600">
        <span aria-live="polite">
          {dados.length === 0 ? (
            `Nenhum ${nomeItens.replace(/s$/, '')}`
          ) : (
            <>
              Mostrando <strong className="font-semibold text-slate-800">{inicio}–{fim}</strong> de{' '}
              <strong className="font-semibold text-slate-800">{dados.length.toLocaleString('pt-BR')}</strong> {nomeItens}
            </>
          )}
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5">
            Por página
            <select
              value={tamanho}
              onChange={(e) => trocarTamanho(Number(e.target.value))}
              className="h-7 rounded-md border border-slate-300 bg-superficie px-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
              aria-label="Itens por página"
            >
              {tamanhos.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-0.5">
            <BotaoPagina rotulo="Primeira página" desativado={pagina === 1} onClick={() => setPagina(1)}>
              <ChevronsLeft size={15} />
            </BotaoPagina>
            <BotaoPagina rotulo="Página anterior" desativado={pagina === 1} onClick={() => setPagina((p) => p - 1)}>
              <ChevronLeft size={15} />
            </BotaoPagina>
            <span className="px-2 tabular-nums">
              Página {pagina} de {totalPaginas}
            </span>
            <BotaoPagina rotulo="Próxima página" desativado={pagina === totalPaginas} onClick={() => setPagina((p) => p + 1)}>
              <ChevronRight size={15} />
            </BotaoPagina>
            <BotaoPagina rotulo="Última página" desativado={pagina === totalPaginas} onClick={() => setPagina(totalPaginas)}>
              <ChevronsRight size={15} />
            </BotaoPagina>
          </div>
        </div>
      </div>
    </div>
  )
}

function BotaoPagina({ rotulo, desativado, onClick, children }: { rotulo: string; desativado: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent" disabled={desativado} onClick={onClick} aria-label={rotulo} title={rotulo}>
      {children}
    </button>
  )
}

function CaixaMarcar({ marcado, parcial, rotulo, onChange, desativado }: { marcado: boolean; parcial?: boolean; rotulo: string; onChange: () => void; desativado?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!parcial
  }, [parcial])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={marcado}
      onChange={onChange}
      disabled={desativado}
      aria-label={rotulo}
      className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600 align-middle"
    />
  )
}

const botaoAcao = 'inline-flex items-center gap-1 rounded-md border border-slate-300 bg-superficie px-2.5 py-1 text-xs font-medium'

/** Botão padrão da coluna de ações (ícone + texto). */
export function BotaoAcao({ icone: Icone, texto, onClick, perigo, titulo }: { icone: typeof Pencil; texto: string; onClick: () => void; perigo?: boolean; titulo?: string }) {
  return (
    <button
      onClick={onClick}
      title={titulo}
      className={`${botaoAcao} ${perigo ? 'text-red-600 hover:border-red-300 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}
    >
      <Icone size={13} aria-hidden="true" />
      {texto}
    </button>
  )
}

/** Botões padrão "Editar / Excluir" da coluna de ações. */
export function AcoesLinha({ onEditar, onExcluir, extra }: { onEditar?: () => void; onExcluir?: () => void; extra?: ReactNode }) {
  return (
    <div className="flex justify-end gap-1.5">
      {extra}
      {onEditar && <BotaoAcao icone={Pencil} texto="Editar" onClick={onEditar} />}
      {onExcluir && <BotaoAcao icone={Trash2} texto="Excluir" onClick={onExcluir} perigo />}
    </div>
  )
}

export const iconeFicha = FileText
