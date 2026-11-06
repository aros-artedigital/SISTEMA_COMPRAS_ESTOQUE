import { useEffect, type ReactNode } from 'react'
import { AlertTriangle, HelpCircle, X } from 'lucide-react'
import { Button } from './ui'

interface ModalProps {
  aberto: boolean
  titulo: string
  onFechar: () => void
  children: ReactNode
  rodape?: ReactNode
  tamanho?: 'sm' | 'md' | 'lg' | 'xl'
}

const larguras = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }

export function Modal({ aberto, titulo, onFechar, children, rodape, tamanho = 'md' }: ModalProps) {
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto, onFechar])

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`flex max-h-[90vh] w-full flex-col rounded-xl bg-superficie shadow-xl ${larguras[tamanho]}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
          <button onClick={onFechar} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {rodape && <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3 rounded-b-xl">{rodape}</div>}
      </div>
    </div>
  )
}

interface ConfirmProps {
  aberto: boolean
  titulo?: string
  mensagem: ReactNode
  textoConfirmar?: string
  tom?: 'perigo' | 'primario'
  onConfirmar: () => void
  onCancelar: () => void
}

export function ConfirmDialog({
  aberto,
  titulo = 'Confirmar exclusão',
  mensagem,
  textoConfirmar = 'Excluir',
  tom = 'perigo',
  onConfirmar,
  onCancelar
}: ConfirmProps) {
  const Icone = tom === 'perigo' ? AlertTriangle : HelpCircle
  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      onFechar={onCancelar}
      tamanho="sm"
      rodape={
        <>
          <Button variante="secundario" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button variante={tom} onClick={onConfirmar}>
            {textoConfirmar}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tom === 'perigo' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}
        >
          <Icone size={20} />
        </div>
        <div className="pt-2 text-sm text-slate-600">{mensagem}</div>
      </div>
    </Modal>
  )
}
