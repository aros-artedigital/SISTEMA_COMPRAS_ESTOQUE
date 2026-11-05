import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { chamar } from '@/data/api'
import { alterar } from '@/data/store'
import { useEstadoSync } from '@/data/sync'
import { useToast } from '@/contexts/ToastContext'
import { executar } from '@/lib/executar'
import { Modal } from './Modal'
import { Button, Card, CardHeader, Checkbox, Input } from './ui'

/** Zona de perigo de Configurações: apaga produtos, estoque, compras e cadastros (com backup antes). */
export function SecaoZerar() {
  const notificar = useToast()
  const sync = useEstadoSync()
  const [aberto, setAberto] = useState(false)
  const [manterUsuarios, setManterUsuarios] = useState(false)
  const [restaurarEmpresa, setRestaurarEmpresa] = useState(true)
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')

  function fechar(): void {
    setAberto(false)
    setConfirmacao('')
    setErro('')
  }

  async function zerar(): Promise<void> {
    let backup = ''
    const ok = await executar(
      async () => {
        backup = (await alterar('sistema:zerarDados', { manterUsuarios, restaurarEmpresa, confirmacao })).backup
      },
      { notificar, form: { values: { confirmacao }, setError: (_c: never, m: string) => setErro(m) } }
    )
    if (!ok) return
    fechar()
    notificar('sucesso', 'Dados zerados. Agora é só cadastrar os seus produtos.', {
      rotulo: 'Ver backup feito antes',
      executar: () => void chamar('arquivo:mostrar', backup)
    })
  }

  const conectado = !!sync?.configurado

  return (
    <Card className="border-red-200 xl:col-span-2">
      <CardHeader titulo="Zerar dados" />
      <div className="flex flex-wrap items-center gap-4 p-5 text-sm text-slate-600">
        <p className="min-w-0 flex-1">
          Apaga <strong className="text-slate-800">produtos, estoque, movimentações, compras, categorias, fornecedores e clientes</strong> para começar a
          usar o sistema com os seus próprios dados. As unidades de medida são mantidas. Um backup é feito antes, na pasta de backups.
        </p>
        <Button variante="perigo" icone={<Trash2 size={16} />} disabled={conectado} onClick={() => setAberto(true)}>
          Zerar dados...
        </Button>
        {conectado && <p className="w-full text-xs text-amber-700">Desconecte este terminal do servidor de sincronização antes de zerar.</p>}
      </div>

      <Modal
        aberto={aberto}
        titulo="Zerar dados do sistema"
        onFechar={fechar}
        tamanho="sm"
        rodape={
          <>
            <Button variante="secundario" onClick={fechar}>Cancelar</Button>
            <Button variante="perigo" icone={<Trash2 size={16} />} disabled={confirmacao.trim().toUpperCase() !== 'ZERAR'} onClick={zerar}>
              Zerar agora
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="flex gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-red-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            Todos os produtos, o estoque, as compras e os cadastros serão apagados. Só será possível voltar restaurando o backup feito agora.
          </p>
          <div className="space-y-2">
            <Checkbox label="Manter os outros usuários (senão, fica só você)" checked={manterUsuarios} onChange={setManterUsuarios} />
            <Checkbox label="Voltar os dados da empresa ao padrão (nome, CNPJ, endereço)" checked={restaurarEmpresa} onChange={setRestaurarEmpresa} />
          </div>
          <Input
            label="Para confirmar, digite ZERAR"
            value={confirmacao}
            error={erro}
            autoComplete="off"
            className="font-mono uppercase"
            onChange={(e) => {
              setConfirmacao(e.target.value)
              setErro('')
            }}
          />
        </div>
      </Modal>
    </Card>
  )
}
