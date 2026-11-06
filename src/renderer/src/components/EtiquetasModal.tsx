import { useEffect, useMemo, useState } from 'react'
import { FileDown, Printer, Trash2 } from 'lucide-react'
import { useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { codigoBarrasSvg, htmlEtiquetas, modelos } from '@/lib/etiquetas'
import { imprimir, salvarPdf } from '@/lib/saida'
import { LeitorCodigo } from './LeitorCodigo'
import { Modal } from './Modal'
import { Button, Checkbox, Input, Select } from './ui'
import * as fmt from '@shared/format'

export interface ItemEtiqueta {
  produtoId: number
  quantidade: number
}

interface Props {
  aberto: boolean
  onFechar: () => void
  inicial: ItemEtiqueta[]
  titulo?: string
}

export function EtiquetasModal({ aberto, onFechar, inicial, titulo = 'Imprimir etiquetas' }: Props) {
  const { produtos } = useDb()
  const notificar = useToast()
  const [itens, setItens] = useState<ItemEtiqueta[]>([])
  const [modeloId, setModeloId] = useState(modelos[0].id)
  const [mostrarPreco, setMostrarPreco] = useState(true)
  const [mostrarCodigo, setMostrarCodigo] = useState(true)
  const [pular, setPular] = useState('0')

  // Carrega a lista inicial só no momento em que o modal abre.
  useEffect(() => {
    if (aberto) setItens(inicial.filter((i) => i.quantidade > 0))
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  const modelo = modelos.find((m) => m.id === modeloId) ?? modelos[0]
  const total = itens.reduce((s, i) => s + i.quantidade, 0)
  const porFolha = modelo.colunas * modelo.linhas
  const folhas = Math.ceil((total + (Number(pular) || 0)) / porFolha)

  const selecionados = itens
    .map((i) => ({ produto: produtos.find((p) => p.id === i.produtoId)!, quantidade: i.quantidade }))
    .filter((i) => i.produto)

  const primeiro = selecionados[0]?.produto
  const amostra = useMemo(() => {
    if (!primeiro) return ''
    try {
      return codigoBarrasSvg(primeiro.codigoBarras || primeiro.codigo, 30)
    } catch {
      return ''
    }
  }, [primeiro])

  function adicionar(produtoId: number): void {
    setItens((l) => (l.some((i) => i.produtoId === produtoId) ? l.map((i) => (i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + 1 } : i)) : [...l, { produtoId, quantidade: 1 }]))
  }

  function gerar(): string | null {
    if (total === 0) {
      notificar('aviso', 'Adicione ao menos uma etiqueta.')
      return null
    }
    try {
      return htmlEtiquetas(selecionados, modelo, { mostrarPreco, mostrarCodigo, pular: Number(pular) || 0 })
    } catch {
      notificar('erro', 'Não foi possível gerar o código de barras de algum produto. Verifique os códigos cadastrados.')
      return null
    }
  }

  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      onFechar={onFechar}
      tamanho="lg"
      rodape={
        <>
          <span className="mr-auto self-center text-sm text-slate-500">
            {total} etiqueta(s) · {folhas} {modelo.colunas * modelo.linhas > 1 ? 'folha(s)' : 'página(s)'}
          </span>
          <Button variante="secundario" onClick={onFechar}>Fechar</Button>
          <Button
            variante="secundario"
            icone={<Printer size={16} />}
            onClick={() => {
              const html = gerar()
              if (html) void imprimir(html, {}, notificar)
            }}
          >
            Imprimir
          </Button>
          <Button
            icone={<FileDown size={16} />}
            onClick={() => {
              const html = gerar()
              if (html) void salvarPdf(html, `etiquetas_${fmt.hojeIso()}`, {}, notificar)
            }}
          >
            Salvar PDF
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-5 gap-5">
        <div className="col-span-3 space-y-3">
          <LeitorCodigo onEncontrar={(p) => adicionar(p.id)} placeholder="Leia ou digite o código para adicionar" />
          <Select
            placeholder="...ou escolha um produto para adicionar"
            opcoes={produtos.filter((p) => p.ativo).map((p) => ({ value: p.id, label: `${p.codigo} — ${p.nome}` }))}
            value=""
            onChange={(e) => e.target.value && adicionar(Number(e.target.value))}
          />
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
            {selecionados.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Nenhum produto adicionado.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {selecionados.map(({ produto: p, quantidade }) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-800">{p.nome}</p>
                        <p className="font-mono text-xs text-slate-400">{p.codigoBarras || `${p.codigo} (sem código de barras: usa o código interno)`}</p>
                      </td>
                      <td className="w-24 px-2 py-2">
                        <Input
                          type="number"
                          min="0"
                          className="w-full text-right"
                          aria-label={`Quantidade de etiquetas de ${p.nome}`}
                          value={String(quantidade)}
                          onChange={(e) => {
                            const q = Math.max(0, Math.floor(Number(e.target.value) || 0))
                            setItens((l) => l.map((i) => (i.produtoId === p.id ? { ...i, quantidade: q } : i)))
                          }}
                        />
                      </td>
                      <td className="w-10 pr-2 text-center">
                        <button
                          onClick={() => setItens((l) => l.filter((i) => i.produtoId !== p.id))}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remover"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="col-span-2 space-y-4">
          <Select label="Modelo de etiqueta" opcoes={modelos.map((m) => ({ value: m.id, label: m.nome }))} value={modeloId} onChange={(e) => setModeloId(e.target.value)} />
          {porFolha > 1 && (
            <Input label="Pular posições" type="number" min="0" max={porFolha - 1} hint="Para reaproveitar uma folha já usada" value={pular} onChange={(e) => setPular(e.target.value)} />
          )}
          <div className="flex flex-col gap-2">
            <Checkbox label="Mostrar preço de venda" checked={mostrarPreco} onChange={setMostrarPreco} />
            <Checkbox label="Mostrar código interno" checked={mostrarCodigo} onChange={setMostrarCodigo} />
          </div>
          {selecionados[0] && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Prévia</p>
              <div className="flex h-32 w-full flex-col rounded-md border border-slate-300 bg-superficie p-2 shadow-sm">
                <p className="truncate text-xs font-semibold">{selecionados[0].produto.nome}</p>
                <div className="flex min-h-0 flex-1 items-center justify-center [&>svg]:max-h-full [&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: amostra }} />
                <div className="flex justify-between text-[10px]">
                  <span>{mostrarCodigo ? selecionados[0].produto.codigo : ''}</span>
                  {mostrarPreco && <strong className="text-xs">{fmt.moeda(selecionados[0].produto.precoVenda)}</strong>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
