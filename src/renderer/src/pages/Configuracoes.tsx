import { useEffect, useState } from 'react'
import { DatabaseBackup, FolderOpen, History, Save, Upload } from 'lucide-react'
import { alterar, useDb } from '@/data/store'
import { chamar } from '@/data/api'
import type { InfoBackup, InfoSistema } from '@shared/api'
import { useAuth } from '@/contexts/AuthContext'
import { ConfirmDialog } from '@/components/Modal'
import { SecaoSincronizacao } from '@/components/SecaoSincronizacao'
import { SecaoRecuperacao } from '@/components/SecaoRecuperacao'
import { SecaoZerar } from '@/components/SecaoZerar'
import { SecaoBackupExterno } from '@/components/SecaoBackupExterno'
import { useEstadoSync } from '@/data/sync'
import { useToast } from '@/contexts/ToastContext'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Button, Card, CardHeader, Checkbox, Input, Select } from '@/components/ui'
import { configuracoesSchema } from '@shared/schemas'
import { useForm } from '@/lib/useForm'
import { executar } from '@/lib/executar'
import * as fmt from '@shared/format'

export default function Configuracoes() {
  const { configuracoes, compras } = useDb()
  const terminal = useEstadoSync()?.codigo ?? ''
  const proximaCompra = terminal + String(compras.reduce((m, c) => Math.max(m, c.id), 0) + 1).padStart(4, '0')
  const notificar = useToast()
  const form = useForm({ ...configuracoes, estoqueMinimoPadrao: String(configuracoes.estoqueMinimoPadrao) }, configuracoesSchema)

  const [info, setInfo] = useState<InfoSistema | null>(null)

  useEffect(() => {
    chamar('sistema:info').then(setInfo, () => setInfo(null))
  }, [])

  async function salvar(): Promise<void> {
    const dados = form.validate()
    if (!dados) return
    await executar(() => alterar('configuracoes:salvar', dados), { notificar, form, sucesso: 'Configurações salvas.' })
  }

  return (
    <>
      <PageHeader
        titulo="Configurações"
        subtitulo="Dados da empresa e preferências do sistema"
        acoes={<Button icone={<Save size={16} />} onClick={salvar}>Salvar alterações</Button>}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader titulo="Dados da empresa" />
          <div className="grid grid-cols-2 gap-4 p-5">
            <Input label="Nome da empresa" obrigatorio wrapperClassName="col-span-2" {...form.bind('nomeEmpresa')} />
            <Input label="CNPJ" {...form.bind('cnpj')} onChange={(e) => form.set('cnpj', fmt.mascaraCnpj(e.target.value))} />
            <Input label="Telefone" {...form.bind('telefone')} onChange={(e) => form.set('telefone', fmt.mascaraTelefone(e.target.value))} />
            <Input label="E-mail" type="email" wrapperClassName="col-span-2" {...form.bind('email')} />
            <Input label="Endereço" wrapperClassName="col-span-2" {...form.bind('endereco')} />
          </div>
        </Card>

        <Card>
          <CardHeader titulo="Estoque e compras" />
          <div className="grid grid-cols-2 gap-4 p-5">
            <Input label="Estoque mínimo padrão" type="number" min="0" hint="Sugerido ao cadastrar novos produtos" {...form.bind('estoqueMinimoPadrao')} />
            <Input label="Prefixo das compras" obrigatorio hint={`Próxima: ${form.values.prefixoCompra}${proximaCompra}`} {...form.bind('prefixoCompra')} />
            <Select
              label="Custo ao receber compras"
              wrapperClassName="col-span-2"
              opcoes={[
                { value: 'medio', label: 'Custo médio ponderado (recomendado)' },
                { value: 'ultimo', label: 'Último preço pago' },
                { value: 'manter', label: 'Não alterar o custo cadastrado' }
              ]}
              value={form.values.custoAoReceber}
              onChange={(e) => form.set('custoAoReceber', e.target.value as typeof form.values.custoAoReceber)}
            />
            <p className="col-span-2 -mt-2 text-xs text-slate-500">
              {
                {
                  medio: 'Ex.: 10 un. a R$ 5,00 em estoque + compra de 10 un. a R$ 7,00 = custo de R$ 6,00. Deixa o valor do estoque e a margem corretos.',
                  ultimo: 'O custo passa a ser o preço pago na última compra recebida.',
                  manter: 'O custo só muda quando alguém edita o produto.'
                }[form.values.custoAoReceber]
              }
            </p>
            <div className="col-span-2">
              <Checkbox
                label="Exibir alertas de estoque mínimo no painel"
                checked={form.values.alertarEstoqueMinimo}
                onChange={(v) => form.set('alertarEstoqueMinimo', v)}
              />
            </div>
          </div>
        </Card>

        <SecaoRecuperacao />
        <SecaoSincronizacao />
        <SecaoBackup info={info} />
        <SecaoBackupExterno />
        <SecaoZerar />
      </div>
    </>
  )
}

function tamanho(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

function SecaoBackup({ info }: { info: InfoSistema | null }) {
  const notificar = useToast()
  const { sair } = useAuth()
  const [backups, setBackups] = useState<InfoBackup[]>([])
  // null = escolher arquivo no diálogo; string = um backup da lista
  const [restaurando, setRestaurando] = useState<{ caminho: string | null; nome: string } | null>(null)

  const atualizarLista = (): void => {
    chamar('backup:listar').then(setBackups, () => setBackups([]))
  }
  useEffect(atualizarLista, [])

  async function fazerBackup(): Promise<void> {
    let caminho: string | null = null
    const ok = await executar(async () => (caminho = await chamar('backup:criar')), { notificar })
    if (ok && caminho) {
      notificar('sucesso', 'Backup salvo.', { rotulo: 'Mostrar na pasta', executar: () => void chamar('arquivo:mostrar', caminho!) })
      atualizarLista()
    }
  }

  async function restaurar(): Promise<void> {
    if (!restaurando) return
    const alvo = restaurando
    setRestaurando(null)
    let feito = false
    const ok = await executar(async () => (feito = await chamar('backup:restaurar', alvo.caminho)), { notificar })
    if (ok && feito) {
      // O main já encerrou a sessão: as senhas válidas agora são as do backup.
      await sair()
      notificar('sucesso', 'Backup restaurado. Entre novamente para continuar.')
    }
  }

  return (
    <Card className="xl:col-span-2">
      <CardHeader titulo="Banco de dados e backup" />
      <div className="grid gap-6 p-5 lg:grid-cols-5">
        <div className="space-y-3 text-sm text-slate-600 lg:col-span-2">
          <p>Os dados ficam em um banco SQLite neste computador e o sistema funciona sem internet, mesmo quando sincronizado com o servidor.</p>
          <p>
            Um <strong>backup automático</strong> é feito uma vez por dia ao abrir o sistema (os 7 mais recentes são mantidos). Para proteção contra
            perda do computador, salve backups manuais também em um pendrive ou na nuvem.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button icone={<DatabaseBackup size={16} />} onClick={fazerBackup}>Fazer backup agora</Button>
            <Button variante="secundario" icone={<Upload size={16} />} onClick={() => setRestaurando({ caminho: null, nome: 'um arquivo escolhido' })}>
              Restaurar de arquivo...
            </Button>
            <Button variante="secundario" icone={<FolderOpen size={16} />} onClick={() => void chamar('backup:abrirPasta')}>Abrir pasta</Button>
          </div>
          {info && (
            <div className="space-y-1 pt-2 text-xs text-slate-500">
              <p>
                Banco: <code className="select-all rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{info.caminhoBanco}</code>
              </p>
              <p className="text-slate-400">
                Versão {info.versao} · SQLite {info.sqlite} · Electron {info.electron} · Node {info.node}
              </p>
            </div>
          )}
        </div>

        <div className="lg:col-span-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <History size={16} /> Backups na pasta do sistema
          </p>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
            {backups.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Nenhum backup ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.caminho} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">
                        <p className="tabular-nums text-slate-800">{fmt.dataHora(b.data)}</p>
                        <p className="truncate text-xs text-slate-400" title={b.nome}>{b.nome}</p>
                      </td>
                      <td className="px-3 py-2">
                        {b.automatico ? (
                          <Badge>Automático</Badge>
                        ) : b.nome.startsWith('antes-da-restauracao') ? (
                          <Badge cor="amarelo">Antes de restaurar</Badge>
                        ) : b.nome.startsWith('antes-de-zerar') ? (
                          <Badge cor="amarelo">Antes de zerar</Badge>
                        ) : b.nome.startsWith('antes-da-sincronizacao') ? (
                          <Badge cor="amarelo">Antes de sincronizar</Badge>
                        ) : (
                          <Badge cor="azul">Manual</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-500">{tamanho(b.tamanho)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button tamanho="sm" variante="secundario" onClick={() => setRestaurando({ caminho: b.caminho, nome: fmt.dataHora(b.data) })}>
                          Restaurar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        aberto={!!restaurando}
        titulo="Restaurar backup"
        textoConfirmar="Restaurar"
        mensagem={
          <>
            Todos os dados atuais serão substituídos pelos do backup de <strong>{restaurando?.nome}</strong>. Antes disso, uma cópia do estado atual é
            guardada na pasta de backups. Depois da restauração você precisará entrar novamente.
          </>
        }
        onConfirmar={restaurar}
        onCancelar={() => setRestaurando(null)}
      />
    </Card>
  )
}
