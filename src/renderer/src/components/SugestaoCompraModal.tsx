import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, ShoppingCart } from 'lucide-react'
import { calcularSugestao, type ItemSugestao } from '@shared/sugestaoCompra'
import * as fmt from '@shared/format'
import { alterar, useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { executar } from '@/lib/executar'
import { exportarExcel } from '@/lib/saida'
import { Modal } from './Modal'
import { Badge, Button, Checkbox, Input, Select } from './ui'

// Sugestão de compra automática: calcula quanto comprar pelo consumo real e gera um pedido
// (rascunho) por fornecedor. O usuário confere, ajusta quantidades e fornecedores e só então gera.

interface Escolha {
  marcado: boolean
  quantidade: string
  fornecedorId: string
}

export function SugestaoCompraModal({ onFechar }: { onFechar: () => void }) {
  const db = useDb()
  const { fornecedores, unidades } = db
  const notificar = useToast()
  const [diasConsumo, setDiasConsumo] = useState('90')
  const [diasCobertura, setDiasCobertura] = useState('30')
  const [somenteAbaixo, setSomenteAbaixo] = useState(true)
  const [escolhas, setEscolhas] = useState<Record<number, Escolha>>({})
  const [erro, setErro] = useState('')

  const sugestao = useMemo(
    () => calcularSugestao(db, { diasConsumo: Number(diasConsumo), diasCobertura: Number(diasCobertura), somenteAbaixoMinimo: somenteAbaixo }),
    [db, diasConsumo, diasCobertura, somenteAbaixo]
  )

  // Ao mudar os parâmetros, recomeça com tudo marcado e as quantidades sugeridas.
  useEffect(() => {
    setEscolhas(Object.fromEntries(sugestao.map((s) => [s.produto.id, { marcado: true, quantidade: String(s.sugerido), fornecedorId: s.fornecedorId ? String(s.fornecedorId) : '' }])))
    setErro('')
  }, [sugestao])

  const nomeFornecedor = (id: string | number): string => {
    const f = fornecedores.find((x) => x.id === Number(id))
    return f ? f.nomeFantasia || f.razaoSocial : 'Sem fornecedor'
  }
  const ativos = fornecedores.filter((f) => f.ativo).map((f) => ({ value: f.id, label: f.nomeFantasia || f.razaoSocial }))
  const mudar = (id: number, campo: keyof Escolha, v: string | boolean): void => {
    setErro('')
    setEscolhas((e) => ({ ...e, [id]: { ...e[id], [campo]: v } }))
  }

  const marcados = sugestao.filter((s) => escolhas[s.produto.id]?.marcado && (Number(escolhas[s.produto.id]?.quantidade) || 0) > 0)
  // Agrupa os marcados por fornecedor: cada grupo vira um pedido.
  const grupos = useMemo(() => {
    const g = new Map<string, ItemSugestao[]>()
    for (const s of marcados) {
      const f = escolhas[s.produto.id]?.fornecedorId ?? ''
      g.set(f, [...(g.get(f) ?? []), s])
    }
    return [...g.entries()].sort((a, b) => nomeFornecedor(a[0]).localeCompare(nomeFornecedor(b[0])))
  }, [marcados, escolhas]) // eslint-disable-line react-hooks/exhaustive-deps
  const quantidade = (s: ItemSugestao): number => Math.floor(Number(escolhas[s.produto.id]?.quantidade) || 0)
  const total = marcados.reduce((t, s) => t + quantidade(s) * s.custo, 0)
  const ordenada = [...sugestao].sort(
    (a, b) => nomeFornecedor(escolhas[a.produto.id]?.fornecedorId ?? '').localeCompare(nomeFornecedor(escolhas[b.produto.id]?.fornecedorId ?? '')) || 0
  )

  async function gerar(): Promise<void> {
    if (!marcados.length) return setErro('Marque ao menos um produto com quantidade.')
    if (grupos.some(([f]) => !f)) return setErro('Escolha o fornecedor dos produtos marcados que estão "Sem fornecedor".')
    const pedidos = grupos.map(([f, itens]) => ({
      fornecedorId: Number(f),
      observacao: `Gerado pela sugestão de compra (consumo dos últimos ${diasConsumo} dias, para ${diasCobertura} dias).`,
      itens: itens.map((s) => ({ produtoId: s.produto.id, quantidade: quantidade(s), valorUnitario: Math.round(s.custo * 100) / 100 }))
    }))
    let criadas: { numero: string }[] = []
    const ok = await executar(async () => (criadas = await alterar('compras:gerarPedidos', pedidos)), { notificar })
    if (!ok) return
    notificar('sucesso', `${criadas.length === 1 ? '1 pedido gerado' : `${criadas.length} pedidos gerados`} como rascunho: ${criadas.map((c) => c.numero).join(', ')}. Confira e mude para "Pedido enviado".`)
    onFechar()
  }

  function exportar(): void {
    void exportarExcel(
      {
        nome: 'Sugestão de compra',
        colunas: [
          { titulo: 'Fornecedor' },
          { titulo: 'Código' },
          { titulo: 'Produto' },
          { titulo: 'Estoque', formato: 'numero' },
          { titulo: 'Mínimo', formato: 'numero' },
          { titulo: 'Consumo/dia', formato: 'numero' },
          { titulo: 'Já pedido', formato: 'numero' },
          { titulo: 'Comprar', formato: 'numero' },
          { titulo: 'Custo', formato: 'moeda' },
          { titulo: 'Subtotal', formato: 'moeda' }
        ],
        linhas: ordenada
          .filter((s) => escolhas[s.produto.id]?.marcado)
          .map((s) => [
            nomeFornecedor(escolhas[s.produto.id]?.fornecedorId ?? ''),
            s.produto.codigo,
            s.produto.nome,
            s.produto.estoque,
            s.produto.estoqueMinimo,
            s.consumoDiario,
            s.aCaminho,
            quantidade(s),
            s.custo,
            quantidade(s) * s.custo
          ])
      },
      `sugestao-compra_${fmt.hojeIso()}`,
      notificar
    )
  }

  return (
    <Modal
      aberto
      titulo="Sugestão de compra"
      onFechar={onFechar}
      tamanho="xl"
      rodape={
        <>
          <Button variante="secundario" icone={<FileSpreadsheet size={16} />} className="mr-auto" onClick={exportar} disabled={!marcados.length}>
            Excel
          </Button>
          <Button variante="secundario" onClick={onFechar}>
            Cancelar
          </Button>
          <Button icone={<ShoppingCart size={16} />} onClick={() => void gerar()} disabled={!marcados.length}>
            {grupos.length === 1 ? 'Gerar 1 pedido' : `Gerar ${grupos.length} pedidos`}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <Select
          label="Medir o consumo dos últimos"
          wrapperClassName="w-52"
          opcoes={[30, 60, 90, 180].map((n) => ({ value: n, label: `${n} dias` }))}
          value={diasConsumo}
          onChange={(e) => setDiasConsumo(e.target.value)}
        />
        <Select
          label="Comprar para"
          wrapperClassName="w-44"
          opcoes={[15, 30, 45, 60, 90].map((n) => ({ value: n, label: `${n} dias` }))}
          value={diasCobertura}
          onChange={(e) => setDiasCobertura(e.target.value)}
        />
        <div className="pb-2">
          <Checkbox label="Só produtos no estoque mínimo ou abaixo" checked={somenteAbaixo} onChange={setSomenteAbaixo} />
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Comprar = estoque mínimo + consumo por dia × dias de cobertura − estoque atual − o que já foi pedido e não chegou. Fornecedor e custo vêm da última compra de
        cada produto; ajuste à vontade. Os pedidos são gerados como <strong>rascunho</strong>, um por fornecedor.
      </p>

      {sugestao.length === 0 ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">Nada a comprar: o estoque cobre o consumo previsto (e o que já foi pedido).</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Marcar todos"
                    checked={sugestao.every((s) => escolhas[s.produto.id]?.marcado)}
                    onChange={(e) => setEscolhas((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, { ...v, marcado: e.target.checked }])))}
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">Produto</th>
                <th className="px-3 py-2 text-right font-medium">Estoque / mín.</th>
                <th className="px-3 py-2 text-right font-medium" title="Média de saídas por dia no período">
                  Consumo/dia
                </th>
                <th className="px-3 py-2 text-right font-medium">Já pedido</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Comprar</th>
                <th className="px-3 py-2 text-right font-medium">Custo</th>
                <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                <th className="w-56 px-3 py-2 text-left font-medium">Fornecedor</th>
              </tr>
            </thead>
            <tbody>
              {ordenada.map((s) => {
                const e = escolhas[s.produto.id]
                if (!e) return null
                const un = unidades.find((u) => u.id === s.produto.unidadeId)?.sigla ?? ''
                return (
                  <tr key={s.produto.id} className={`border-t border-slate-100 ${e.marcado ? '' : 'opacity-50'}`}>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" aria-label={`Comprar ${s.produto.nome}`} checked={e.marcado} onChange={(ev) => mudar(s.produto.id, 'marcado', ev.target.checked)} />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{s.produto.nome}</p>
                      <p className="font-mono text-xs text-slate-400">
                        {s.produto.codigo}
                        {s.produto.estoque <= 0 && (
                          <span className="ml-2 font-sans">
                            <Badge cor="vermelho">Sem estoque</Badge>
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt.numero(s.produto.estoque)} / {fmt.numero(s.produto.estoqueMinimo)} {un}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.consumoDiario.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{s.aCaminho ? fmt.numero(s.aCaminho) : '—'}</td>
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`Quantidade a comprar de ${s.produto.nome}`}
                        type="number"
                        min="0"
                        step="1"
                        className="w-full text-right"
                        value={e.quantidade}
                        onChange={(ev) => mudar(s.produto.id, 'quantidade', ev.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt.moeda(s.custo)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{fmt.moeda(quantidade(s) * s.custo)}</td>
                    <td className="px-3 py-2">
                      <Select
                        aria-label={`Fornecedor de ${s.produto.nome}`}
                        placeholder="Escolha o fornecedor..."
                        opcoes={ativos}
                        value={e.fornecedorId}
                        onChange={(ev) => mudar(s.produto.id, 'fornecedorId', ev.target.value)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {marcados.length > 0 && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm">
          <ul className="space-y-0.5" aria-label="Pedidos que serão gerados">
            {grupos.map(([f, itens]) => (
              <li key={f || 'sem'} className={f ? 'text-slate-700' : 'font-medium text-red-700'}>
                {f ? nomeFornecedor(f) : 'Sem fornecedor — escolha na tabela'}: {itens.length} {itens.length === 1 ? 'item' : 'itens'} ·{' '}
                {fmt.moeda(itens.reduce((t, s) => t + quantidade(s) * s.custo, 0))}
              </li>
            ))}
          </ul>
          <p className="text-right">
            <span className="text-slate-500">Investimento estimado</span>
            <br />
            <strong className="text-lg tabular-nums text-slate-900">{fmt.moeda(total)}</strong>
          </p>
        </div>
      )}
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </Modal>
  )
}
