import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, FolderOpen, HardDriveUpload, Unlink } from 'lucide-react'
import type { EstadoBackupExterno } from '@shared/api'
import { chamar } from '@/data/api'
import { haQuantoTempo } from '@/data/sync'
import { useToast } from '@/contexts/ToastContext'
import { executar } from '@/lib/executar'
import { ConfirmDialog } from './Modal'
import { Badge, Button, Card, CardHeader } from './ui'

/** Configurações → cópia automática do banco numa pasta fora deste computador. */
export function SecaoBackupExterno() {
  const notificar = useToast()
  const [estado, setEstado] = useState<EstadoBackupExterno | null>(null)
  const [desativando, setDesativando] = useState(false)

  useEffect(() => {
    chamar('backupExterno:estado').then(setEstado, () => setEstado(null))
  }, [])

  async function escolher(): Promise<void> {
    await executar(
      async () => {
        const e = await chamar('backupExterno:escolherPasta')
        if (e) {
          setEstado(e)
          notificar('sucesso', 'Pasta configurada e primeira cópia feita.')
        }
      },
      { notificar }
    )
    // Se a cópia falhou, mostra o erro registrado.
    chamar('backupExterno:estado').then(setEstado, () => undefined)
  }

  async function agora(): Promise<void> {
    await executar(async () => setEstado(await chamar('backupExterno:fazerAgora')), { notificar, sucesso: 'Cópia externa feita.' })
    chamar('backupExterno:estado').then(setEstado, () => undefined)
  }

  if (!estado) return null
  const ok = estado.pasta && !estado.ultimoErro && estado.ultimoEm

  return (
    <Card className="xl:col-span-2">
      <CardHeader
        titulo="Backup fora deste computador"
        acao={!estado.pasta ? <Badge cor="amarelo">Não configurado</Badge> : ok ? <Badge cor="verde">Ativo</Badge> : <Badge cor="vermelho">Com problema</Badge>}
      />
      <div className="grid gap-6 p-5 text-sm text-slate-600 lg:grid-cols-5">
        <div className="space-y-2 lg:col-span-2">
          <p>
            Os backups automáticos ficam no mesmo disco do sistema: se o computador quebrar ou for roubado, eles se perdem junto. Escolha uma pasta
            em <strong>pendrive, outro disco</strong> ou numa <strong>pasta do Google Drive/OneDrive</strong> (que já vai para a nuvem).
          </p>
          <p className="text-xs text-slate-500">Uma cópia é feita ao abrir o sistema (uma por dia), e as 10 mais recentes são mantidas.</p>
        </div>
        <div className="space-y-3 lg:col-span-3">
          {estado.pasta ? (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-slate-500">Pasta</dt>
                <dd className="truncate font-mono text-xs leading-5 text-slate-700" title={estado.pasta}>{estado.pasta}</dd>
                <dt className="text-slate-500">Última cópia</dt>
                <dd className="text-slate-800">{estado.ultimoEm ? haQuantoTempo(estado.ultimoEm) : 'nenhuma ainda'}</dd>
                <dt className="text-slate-500">Cópias guardadas</dt>
                <dd className="text-slate-800">{estado.arquivos}</dd>
              </dl>
              {estado.ultimoErro ? (
                <p className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                  <AlertTriangle size={16} className="shrink-0" /> {estado.ultimoErro}
                </p>
              ) : (
                ok && (
                  <p className="flex items-center gap-2 text-xs text-emerald-700">
                    <CheckCircle2 size={16} /> Seus dados também estão fora deste computador.
                  </p>
                )
              )}
              <div className="flex flex-wrap gap-2">
                <Button icone={<HardDriveUpload size={16} />} onClick={agora}>Fazer cópia agora</Button>
                <Button variante="secundario" icone={<FolderOpen size={16} />} onClick={escolher}>Trocar pasta...</Button>
                <Button variante="fantasma" icone={<Unlink size={16} />} onClick={() => setDesativando(true)}>Desativar</Button>
              </div>
            </>
          ) : (
            <Button icone={<FolderOpen size={16} />} onClick={escolher}>Escolher pasta do backup externo...</Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        aberto={desativando}
        titulo="Desativar backup externo"
        textoConfirmar="Desativar"
        mensagem="As cópias já feitas continuam na pasta, mas nenhuma nova será feita."
        onConfirmar={() => {
          setDesativando(false)
          void executar(async () => setEstado(await chamar('backupExterno:desativar')), { notificar, sucesso: 'Backup externo desativado.' })
        }}
        onCancelar={() => setDesativando(false)}
      />
    </Card>
  )
}
