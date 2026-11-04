import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Cloud, Download, Link2, RefreshCw, Unlink } from 'lucide-react'
import { z } from 'zod'
import type { ConflitoSync } from '@shared/api'
import { chamar } from '@/data/api'
import { haQuantoTempo, useAtualizacao, useEstadoSync } from '@/data/sync'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { executar } from '@/lib/executar'
import { useForm } from '@/lib/useForm'
import { ConfirmDialog, Modal } from './Modal'
import { Badge, Button, Card, CardHeader, Checkbox, Input, Select } from './ui'
import * as fmt from '@shared/format'

const conexaoSchema = z.object({
  url: z.string().trim().regex(/^https?:\/\/\S+$/i, 'Informe o endereço completo (https://...)'),
  chave: z.string().min(1, 'Informe a chave de cadastro do servidor'),
  nome: z.string().trim().min(1, 'Dê um nome a este terminal (ex.: Loja Centro)'),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,6}$/, 'De 1 a 6 letras ou números (ex.: A, LOJA2)'),
  modo: z.enum(['enviar', 'substituir'])
})

export function SecaoSincronizacao() {
  const estado = useEstadoSync()
  const notificar = useToast()
  const { sair } = useAuth()
  const [conflitos, setConflitos] = useState<ConflitoSync[] | null>(null)
  const [confirmarSaida, setConfirmarSaida] = useState(false)
  const [conectando, setConectando] = useState(false)
  const form = useForm({ url: 'https://', chave: '', nome: '', codigo: '', modo: 'enviar' as 'enviar' | 'substituir' }, conexaoSchema)

  if (!estado) return null

  async function conectar(): Promise<void> {
    const d = form.validate()
    if (!d) return
    setConectando(true)
    let precisaEntrar = false
    const ok = await executar(async () => ({ precisaEntrar } = await chamar('sync:conectar', d)), { notificar, form })
    setConectando(false)
    if (!ok) return
    if (precisaEntrar) {
      await sair()
      notificar('sucesso', 'Terminal conectado e dados baixados do servidor. Entre com um usuário do servidor.')
    } else {
      notificar('sucesso', 'Terminal conectado e sincronizado.')
    }
  }

  async function sincronizar(): Promise<void> {
    let msg = ''
    const ok = await executar(
      async () => {
        const r = await chamar('sync:sincronizar')
        msg = `${r.enviados} enviado(s), ${r.recebidos} recebido(s)${r.rejeitados ? `, ${r.rejeitados} recusado(s)` : ''}.`
      },
      { notificar }
    )
    if (ok) notificar('sucesso', `Sincronizado: ${msg}`)
  }

  const abrirConflitos = (): void => void chamar('sync:conflitos').then(setConflitos)

  return (
    <Card className="xl:col-span-2">
      <CardHeader
        titulo="Sincronização entre terminais"
        acao={estado.configurado ? <Badge cor={estado.ultimoErro ? 'amarelo' : 'verde'}>{estado.ultimoErro ? 'Sem conexão' : 'Conectado'}</Badge> : <Badge>Só neste computador</Badge>}
      />
      {!estado.configurado ? (
        <div className="grid gap-6 p-5 lg:grid-cols-5">
          <div className="space-y-2 text-sm text-slate-600 lg:col-span-2">
            <p>Conecte este computador ao servidor (API PHP + MySQL) para usar o sistema em vários terminais com os mesmos dados.</p>
            <p>
              Cada terminal continua funcionando <strong>sem internet</strong>; quando houver conexão, as alterações são enviadas e recebidas
              automaticamente.
            </p>
            <p className="text-xs text-slate-500">O endereço e a chave de cadastro são definidos na instalação do servidor (arquivo config.php).</p>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:col-span-3">
            <Input label="Endereço do servidor" obrigatorio wrapperClassName="col-span-2" placeholder="https://seu-dominio.com.br/estoque-api" {...form.bind('url')} />
            <Input label="Chave de cadastro" obrigatorio type="password" wrapperClassName="col-span-2" {...form.bind('chave')} />
            <Input label="Nome deste terminal" obrigatorio placeholder="Loja Centro" {...form.bind('nome')} />
            <Input
              label="Código do terminal"
              obrigatorio
              maxLength={6}
              placeholder="A"
              hint="Entra no número das compras (C-A0001)"
              {...form.bind('codigo')}
              onChange={(e) => form.set('codigo', e.target.value.toUpperCase())}
            />
            <fieldset className="col-span-2 space-y-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">Dados deste terminal</legend>
              {(
                [
                  ['enviar', 'Enviar os dados deste terminal', 'Use no primeiro terminal (o servidor está vazio) ou para juntar os dados deste computador aos do servidor.'],
                  ['substituir', 'Substituir pelos dados do servidor', 'Use nos demais terminais. Os dados deste computador são apagados (um backup é feito antes) e os do servidor são baixados.']
                ] as const
              ).map(([valor, titulo, desc]) => (
                <label key={valor} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${form.values.modo === valor ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200'}`}>
                  <input type="radio" name="modo" className="mt-0.5" checked={form.values.modo === valor} onChange={() => form.set('modo', valor)} />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{titulo}</span>
                    <span className="block text-xs text-slate-500">{desc}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="col-span-2 flex justify-end">
              <Button icone={<Link2 size={16} />} onClick={conectar} disabled={conectando}>
                {conectando ? 'Conectando...' : 'Conectar terminal'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 p-5 lg:grid-cols-5">
          <div className="space-y-3 text-sm lg:col-span-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-slate-500">Servidor</dt>
              <dd className="truncate font-mono text-xs leading-5 text-slate-700">{estado.url}</dd>
              <dt className="text-slate-500">Terminal</dt>
              <dd className="text-slate-800">
                {estado.nome} <span className="font-mono text-xs text-slate-400">({estado.codigo})</span>
              </dd>
              <dt className="text-slate-500">Última sincronização</dt>
              <dd className="text-slate-800">{estado.sincronizando ? 'em andamento...' : haQuantoTempo(estado.ultimaSync)}</dd>
              <dt className="text-slate-500">Pendentes de envio</dt>
              <dd className="text-slate-800">{fmt.numero(estado.pendentes)}</dd>
            </dl>
            {estado.ultimoErro && (
              <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle size={16} className="shrink-0" /> {estado.ultimoErro}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button icone={<RefreshCw size={16} />} onClick={sincronizar} disabled={estado.sincronizando}>Sincronizar agora</Button>
              <Button variante={estado.conflitos ? 'perigo' : 'secundario'} icone={<AlertTriangle size={16} />} onClick={abrirConflitos}>
                Conflitos ({estado.conflitos})
              </Button>
              <Button variante="fantasma" icone={<Unlink size={16} />} onClick={() => setConfirmarSaida(true)}>Desconectar</Button>
            </div>
          </div>
          <div className="space-y-3 lg:col-span-2">
            <Checkbox
              label="Sincronizar automaticamente"
              checked={estado.ativo}
              onChange={(ativo) => void executar(() => chamar('sync:configurar', { ativo, intervalo: estado.intervalo }), { notificar })}
            />
            <Select
              label="Intervalo"
              disabled={!estado.ativo}
              opcoes={[1, 5, 15, 30, 60].map((m) => ({ value: m, label: m === 60 ? 'A cada 1 hora' : `A cada ${m} min` }))}
              value={String(estado.intervalo)}
              onChange={(e) => void executar(() => chamar('sync:configurar', { ativo: estado.ativo, intervalo: Number(e.target.value) }), { notificar })}
            />
            <p className="text-xs text-slate-500">Também sincroniza ao abrir o sistema. Sem internet, as alterações ficam guardadas e são enviadas depois.</p>
          </div>
        </div>
      )}

      <SecaoAtualizacao />

      <Modal aberto={conflitos !== null} titulo="Conflitos de sincronização" onFechar={() => setConflitos(null)} tamanho="lg">
        {conflitos?.length === 0 ? (
          <p className="flex items-center gap-2 py-6 text-sm text-slate-600">
            <CheckCircle2 size={18} className="text-emerald-600" /> Nenhum conflito pendente.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {conflitos?.map((c) => (
              <li key={c.id} className="flex gap-3 py-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{c.descricao}</p>
                  <p className="text-sm text-slate-600">{c.motivo}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{fmt.dataHora(c.em)}</p>
                </div>
                <Button
                  tamanho="sm"
                  variante="secundario"
                  onClick={async () => {
                    await chamar('sync:resolverConflito', c.id)
                    setConflitos((l) => l?.filter((x) => x.id !== c.id) ?? null)
                  }}
                >
                  Resolvido
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog
        aberto={confirmarSaida}
        titulo="Desconectar do servidor"
        textoConfirmar="Desconectar"
        mensagem="Este terminal deixa de sincronizar. Os dados locais continuam aqui, e as alterações ainda não enviadas ficam guardadas para quando você conectar de novo."
        onConfirmar={() => {
          setConfirmarSaida(false)
          void executar(() => chamar('sync:desconectar'), { notificar, sucesso: 'Terminal desconectado.' })
        }}
        onCancelar={() => setConfirmarSaida(false)}
      />
    </Card>
  )
}

function SecaoAtualizacao() {
  const a = useAtualizacao()
  const notificar = useToast()
  if (!a) return null
  const textos: Record<typeof a.status, string> = {
    desativada: a.mensagem ?? 'Atualização automática desativada.',
    verificando: 'Procurando novas versões...',
    atualizado: 'Você está usando a versão mais recente.',
    disponivel: `Versão ${a.novaVersao} encontrada. Baixando...`,
    baixando: `Baixando a versão ${a.novaVersao ?? ''}: ${a.progresso ?? 0}%`,
    pronta: `Versão ${a.novaVersao} pronta para instalar.`,
    erro: a.mensagem ?? 'Não foi possível verificar.'
  }
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4 text-sm">
      <Cloud size={18} className="text-slate-400" />
      <span className="text-slate-600">
        <strong className="text-slate-800">Atualizações</strong> · versão instalada {a.versaoAtual} · {textos[a.status]}
      </span>
      <span className="ml-auto flex gap-2">
        {a.status === 'pronta' ? (
          <Button tamanho="sm" icone={<Download size={14} />} onClick={() => void chamar('atualizacao:instalar')}>
            Reiniciar e atualizar
          </Button>
        ) : (
          <Button
            tamanho="sm"
            variante="secundario"
            disabled={a.status === 'desativada' || a.status === 'verificando' || a.status === 'baixando'}
            onClick={() => void executar(() => chamar('atualizacao:verificar'), { notificar })}
          >
            Verificar agora
          </Button>
        )}
      </span>
    </div>
  )
}
