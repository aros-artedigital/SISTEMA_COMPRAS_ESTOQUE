import { useState } from 'react'
import { FileDown, Printer } from 'lucide-react'
import type { Snapshot } from '@shared/api'
import { descreverEquipamento } from '@shared/dominio'
import * as fmt from '@shared/format'
import type { OrdemServico } from '@shared/tipos'
import { useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { codigoBarrasSvg, modelos, type ModeloEtiqueta } from '@/lib/etiquetas'
import { escapar } from '@/lib/relatorio'
import { imprimir, salvarPdf } from '@/lib/saida'
import { Modal } from './Modal'
import { Button, Input, Select } from './ui'

// Etiqueta da OS para colar no aparelho (ou no saquinho): número grande, cliente, equipamento e
// código de barras do número — lido pelo leitor na busca da tela de OS, abre a ficha direto.

export function htmlEtiquetaOS(o: OrdemServico, db: Snapshot, modelo: ModeloEtiqueta, quantidade: number): string {
  const cliente = db.clientes.find((c) => c.id === o.clienteId)
  const e = (v: string): string => escapar(v)
  const etiqueta = `<div class="et">
    <div class="topo"><strong>${e(o.numero)}</strong><span>${e(fmt.data(o.dataEntrada))}</span></div>
    <div class="cliente">${e(cliente?.nome ?? '')}${cliente?.telefone ? ` · ${e(cliente.telefone)}` : ''}</div>
    <div class="equip">${e(descreverEquipamento(o))}</div>
    <div class="barras">${codigoBarrasSvg(o.numero, 30)}</div>
    <div class="empresa">${e(db.configuracoes.nomeEmpresa)}</div>
  </div>`
  const porPagina = modelo.colunas * modelo.linhas
  const celulas = Array.from({ length: quantidade }, () => etiqueta)
  const paginas: string[] = []
  for (let i = 0; i < celulas.length; i += porPagina) paginas.push(`<section class="folha">${celulas.slice(i, i + porPagina).join('')}</section>`)
  const { pagina, margem, etiqueta: t, espaco } = modelo
  const pequena = t.altura < 32
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiqueta ${e(o.numero)}</title><style>
  @page { size: ${pagina.largura}mm ${pagina.altura}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; }
  .folha { width: ${pagina.largura}mm; height: ${pagina.altura}mm; padding: ${margem.topo}mm 0 0 ${margem.esquerda}mm; display: grid;
    grid-template-columns: repeat(${modelo.colunas}, ${t.largura}mm); grid-auto-rows: ${t.altura}mm; column-gap: ${espaco.horizontal}mm; row-gap: ${espaco.vertical}mm;
    page-break-after: always; overflow: hidden; }
  .folha:last-child { page-break-after: auto; }
  .et { width: ${t.largura}mm; height: ${t.altura}mm; padding: 1.2mm 2mm; display: flex; flex-direction: column; overflow: hidden; }
  .topo { display: flex; justify-content: space-between; align-items: baseline; }
  .topo strong { font-size: ${pequena ? 10 : 13}pt; }
  .topo span, .empresa { font-size: ${pequena ? 5.5 : 6.5}pt; }
  .cliente, .equip { font-size: ${pequena ? 6 : 7.5}pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cliente { font-weight: 600; }
  .barras { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 0.4mm 0; }
  .barras svg { max-width: 100%; max-height: 100%; height: 100%; }
  .empresa { text-align: center; }
</style></head><body>${paginas.join('')}</body></html>`
}

export function EtiquetaOSModal({ os: o, onFechar }: { os: OrdemServico; onFechar: () => void }) {
  const db = useDb()
  const notificar = useToast()
  const [modeloId, setModeloId] = useState('rolo-50x30')
  const [quantidade, setQuantidade] = useState('1')
  const modelo = modelos.find((m) => m.id === modeloId) ?? modelos[0]
  const qtd = Math.min(20, Math.max(1, Math.floor(Number(quantidade) || 1)))
  const html = (): string => htmlEtiquetaOS(o, db, modelo, qtd)

  return (
    <Modal
      aberto
      titulo={`Etiqueta da OS ${o.numero}`}
      onFechar={onFechar}
      tamanho="sm"
      rodape={
        <>
          <Button variante="secundario" onClick={onFechar}>
            Fechar
          </Button>
          <Button variante="secundario" icone={<FileDown size={16} />} onClick={() => void salvarPdf(html(), `etiqueta-${o.numero}`, {}, notificar)}>
            PDF
          </Button>
          <Button icone={<Printer size={16} />} onClick={() => void imprimir(html(), {}, notificar)}>
            Imprimir
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Para colar no aparelho ou no saquinho. O código de barras é o número da OS: lido na busca da tela de OS, abre a ficha.</p>
        <Select label="Modelo" opcoes={modelos.map((m) => ({ value: m.id, label: m.nome }))} value={modeloId} onChange={(e) => setModeloId(e.target.value)} />
        <Input label="Quantidade" type="number" min="1" max="20" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} wrapperClassName="w-32" />
      </div>
    </Modal>
  )
}
