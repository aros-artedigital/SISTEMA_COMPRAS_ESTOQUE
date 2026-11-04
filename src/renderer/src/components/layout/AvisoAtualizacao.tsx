import { Download } from 'lucide-react'
import { chamar } from '@/data/api'
import { useAtualizacao } from '@/data/sync'

/** Faixa no topo quando uma nova versão já foi baixada e só falta reiniciar. */
export function AvisoAtualizacao() {
  const a = useAtualizacao()
  if (a?.status !== 'pronta') return null
  return (
    <div className="flex items-center justify-center gap-3 bg-blue-600 px-4 py-2 text-sm text-white">
      <Download size={16} />
      <span>
        A versão <strong>{a.novaVersao}</strong> foi baixada e será instalada ao fechar o sistema.
      </span>
      <button onClick={() => void chamar('atualizacao:instalar')} className="rounded-md bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25">
        Reiniciar e atualizar agora
      </button>
    </div>
  )
}
