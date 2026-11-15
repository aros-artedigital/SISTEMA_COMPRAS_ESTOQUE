import { useState, type ReactNode } from 'react'
import { Ban, CheckCircle2, FileSpreadsheet, Trash2 } from 'lucide-react'
import { ConfirmDialog } from './Modal'
import { Button } from './ui'

// Botões padrão da barra de ações em lote (aparece na tabela quando há linhas marcadas).
// Só aparecem as ações recebidas; "Excluir" pede confirmação antes.

interface Props {
  quantidade: number
  /** Ex.: ['cliente', 'clientes'] — usado na confirmação. */
  nome: [string, string]
  onAtivar?: () => void
  onInativar?: () => void
  onExcel?: () => void
  onExcluir?: () => void
  /** Explica o que não pode ser excluído (ex.: "clientes com vendas"). */
  avisoExcluir?: ReactNode
  /** Ações específicas da tela, antes de "Excluir". */
  children?: ReactNode
}

export function AcoesLote({ quantidade, nome, onAtivar, onInativar, onExcel, onExcluir, avisoExcluir, children }: Props) {
  const [confirmando, setConfirmando] = useState(false)
  const palavra = quantidade === 1 ? nome[0] : nome[1]
  return (
    <>
      {onAtivar && (
        <Button tamanho="sm" variante="secundario" icone={<CheckCircle2 size={14} />} onClick={onAtivar}>
          Ativar
        </Button>
      )}
      {onInativar && (
        <Button tamanho="sm" variante="secundario" icone={<Ban size={14} />} onClick={onInativar}>
          Inativar
        </Button>
      )}
      {children}
      {onExcel && (
        <Button tamanho="sm" variante="secundario" icone={<FileSpreadsheet size={14} />} onClick={onExcel}>
          Excel
        </Button>
      )}
      {onExcluir && (
        <Button tamanho="sm" variante="perigo" icone={<Trash2 size={14} />} onClick={() => setConfirmando(true)}>
          Excluir
        </Button>
      )}
      {onExcluir && (
        <ConfirmDialog
          aberto={confirmando}
          titulo={`Excluir ${nome[1]} selecionados`}
          textoConfirmar={`Excluir ${quantidade}`}
          mensagem={
            <>
              Excluir <strong>{quantidade} {palavra}</strong>? {avisoExcluir}
            </>
          }
          onConfirmar={() => {
            setConfirmando(false)
            onExcluir()
          }}
          onCancelar={() => setConfirmando(false)}
        />
      )}
    </>
  )
}
