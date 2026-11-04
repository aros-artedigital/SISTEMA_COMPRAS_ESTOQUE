import { FileDown, FileSpreadsheet, Printer } from 'lucide-react'
import { Button } from './ui'

/** Botões padrão de saída: PDF, Imprimir e Excel. Só aparecem os que receberem ação. */
export function BarraSaida({ onPdf, onImprimir, onExcel }: { onPdf?: () => void; onImprimir?: () => void; onExcel?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {onExcel && (
        <Button variante="secundario" icone={<FileSpreadsheet size={16} />} onClick={onExcel}>
          Excel
        </Button>
      )}
      {onPdf && (
        <Button variante="secundario" icone={<FileDown size={16} />} onClick={onPdf}>
          PDF
        </Button>
      )}
      {onImprimir && (
        <Button variante="secundario" icone={<Printer size={16} />} onClick={onImprimir}>
          Imprimir
        </Button>
      )}
    </div>
  )
}
