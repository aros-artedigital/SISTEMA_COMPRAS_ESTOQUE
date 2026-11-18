import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Boxes, Building2, CheckCircle2, DatabaseBackup, FolderOpen, History, KeyRound, Palette, RefreshCw, Save, ShieldCheck, Sun, SunMoon, Upload, type LucideIcon } from 'lucide-react'
import { coresDoTema, TEMAS, type IdTema } from '@shared/temas'
import { aplicarCores } from '@/lib/tema'
import { coresMenu, escala, rgbParaHex } from '@/lib/cores'
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

type IdAba = 'empresa' | 'aparencia' | 'estoque' | 'seguranca' | 'sincronizacao' | 'backup'

const ABAS: { id: IdAba; titulo: string; icone: LucideIcon }[] = [
  { id: 'empresa', titulo: 'Dados da empresa', icone: Building2 },
  { id: 'aparencia', titulo: 'Aparência', icone: Palette },
  { id: 'estoque', titulo: 'Estoque e compras', icone: Boxes },
  { id: 'seguranca', titulo: 'Segurança', icone: ShieldCheck },
  { id: 'sincronizacao', titulo: 'Sincronização', icone: RefreshCw },
  { id: 'backup', titulo: 'Backup e dados', icone: DatabaseBackup }
]
/** Abas com campos do formulário (as outras têm ações próprias e não usam "Salvar"). */
const CAMPOS_DA_ABA: Partial<Record<IdAba, string[]>> = {
  empresa: ['nomeEmpresa', 'cnpj', 'telefone', 'email', 'cep', 'endereco'],
  aparencia: ['tema', 'corPrincipal', 'corSecundaria'],
  estoque: ['estoqueMinimoPadrao', 'prefixoCompra', 'custoAoReceber', 'alertarEstoqueMinimo'],
  seguranca: ['apagarSenhaOs']
}

export default function Configuracoes() {
  const { configuracoes, compras } = useDb()
  const terminal = useEstadoSync()?.codigo ?? ''
  const proximaCompra = terminal + String(compras.reduce((m, c) => Math.max(m, c.id), 0) + 1).padStart(4, '0')
  const notificar = useToast()
  const form = useForm({ ...configuracoes, estoqueMinimoPadrao: String(configuracoes.estoqueMinimoPadrao) }, configuracoesSchema)
  const [params, setParams] = useSearchParams()
  const aba: IdAba = ABAS.some((a) => a.id === params.get('aba')) ? (params.get('aba') as IdAba) : 'empresa'
  const irPara = (id: IdAba): void => setParams({ aba: id }, { replace: true })

  const [info, setInfo] = useState<InfoSistema | null>(null)

  useEffect(() => {
    chamar('sistema:info').then(setInfo, () => setInfo(null))
  }, [])

  // Pré-visualização: as cores escolhidas aparecem na hora; ao sair sem salvar, voltam as salvas.
  const { tema, corPrincipal, corSecundaria } = form.values
  useEffect(() => {
    aplicarCores(coresDoTema(tema, corPrincipal, corSecundaria), false)
  }, [tema, corPrincipal, corSecundaria])
  const salvas = useRef(configuracoes)
  salvas.current = configuracoes
  useEffect(
    () => () => {
      const c = salvas.current
      aplicarCores(coresDoTema(c.tema, c.corPrincipal, c.corSecundaria))
    },
    []
  )

  // Erro de validação em outra aba: leva até ela.
  useEffect(() => {
    const temErro = (id: string): boolean => (CAMPOS_DA_ABA[id as IdAba] ?? []).some((c) => form.errors[c as keyof typeof form.errors])
    if (temErro(aba)) return
    const comErro = Object.keys(CAMPOS_DA_ABA).find(temErro)
    if (comErro) irPara(comErro as IdAba)
  }, [form.errors]) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar(): Promise<void> {
    const dados = form.validate()
    if (!dados) return
    await executar(() => alterar('configuracoes:salvar', dados), { notificar, form, sucesso: 'Configurações salvas.' })
  }

  const temFormulario = aba in CAMPOS_DA_ABA

  return (
    <>
      <PageHeader
        titulo="Configurações"
        subtitulo="Dados da empresa e preferências do sistema"
        acoes={temFormulario && <Button icone={<Save size={16} />} onClick={salvar}>Salvar alterações</Button>}
      />

      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-superficie p-1 shadow-sm" role="tablist" aria-label="Seções das configurações">
        {ABAS.map(({ id, titulo, icone: Icone }) => (
          <button
            key={id}
            role="tab"
            aria-selected={aba === id}
            onClick={() => irPara(id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              aba === id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <Icone size={16} />
            {titulo}
          </button>
        ))}
      </div>

      {aba === 'empresa' && (
        <Card className="max-w-3xl">
          <CardHeader titulo="Dados da empresa" icone={Building2} />
          <div className="grid grid-cols-2 gap-4 p-5">
            <Input label="Nome da empresa" obrigatorio wrapperClassName="col-span-2" {...form.bind('nomeEmpresa')} />
            <Input label="CNPJ" {...form.bind('cnpj')} onChange={(e) => form.set('cnpj', fmt.mascaraCnpj(e.target.value))} />
            <Input label="Telefone" {...form.bind('telefone')} onChange={(e) => form.set('telefone', fmt.mascaraTelefone(e.target.value))} />
            <Input label="E-mail" type="email" wrapperClassName="col-span-2" {...form.bind('email')} />
            <CepEmpresa
              cep={form.values.cep}
              erro={form.errors.cep}
              onCep={(v) => form.set('cep', v)}
              onEndereco={(e) => form.set('endereco', e)}
            />
            <Input label="Endereço" hint="Preenchido pela busca de CEP; complete com o número" {...form.bind('endereco')} />
          </div>
        </Card>
      )}

      {aba === 'aparencia' && (
        <SecaoAparencia
          tema={tema}
          principal={corPrincipal}
          secundaria={corSecundaria}
          erroPrincipal={form.errors.corPrincipal}
          erroSecundaria={form.errors.corSecundaria}
          onTema={(t) => {
            // Ao personalizar, começa pelas cores do tema que estava escolhido.
            if (t === 'personalizado' && tema !== 'personalizado') {
              const atual = coresDoTema(tema, corPrincipal, corSecundaria)
              form.set('corPrincipal', atual.principal)
              form.set('corSecundaria', atual.secundaria)
            }
            form.set('tema', t)
          }}
          onPrincipal={(c) => form.set('corPrincipal', c)}
          onSecundaria={(c) => form.set('corSecundaria', c)}
        />
      )}

      {aba === 'estoque' && (
        <Card className="max-w-3xl">
          <CardHeader titulo="Estoque e compras" icone={Boxes} />
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
      )}

      {aba === 'seguranca' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader titulo="Senhas dos equipamentos (ordens de serviço)" icone={KeyRound} />
            <div className="space-y-2 p-5 text-sm text-slate-600">
              <p>
                A senha de desbloqueio que o cliente informa fica guardada só para quem tem a permissão "Ver senha do equipamento"; cada visualização vai para a
                auditoria e ela nunca sai na impressão.
              </p>
              <Checkbox
                label="Apagar a senha quando a OS for entregue ou cancelada (recomendado)"
                checked={form.values.apagarSenhaOs}
                onChange={(v) => form.set('apagarSenhaOs', v)}
              />
            </div>
          </Card>
          <SecaoRecuperacao />
        </div>
      )}
      {aba === 'sincronizacao' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <SecaoSincronizacao />
        </div>
      )}
      {aba === 'backup' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <SecaoBackup info={info} />
          <SecaoBackupExterno />
          <SecaoZerar />
        </div>
      )}
    </>
  )
}

function SecaoAparencia(props: {
  tema: IdTema
  principal: string
  secundaria: string
  erroPrincipal?: string
  erroSecundaria?: string
  onTema: (t: IdTema) => void
  onPrincipal: (c: string) => void
  onSecundaria: (c: string) => void
}) {
  type Opcao = { id: IdTema; nome: string; principal: string; secundaria: string }
  const lista: Opcao[] = [...TEMAS, { id: 'personalizado', nome: 'Personalizado', principal: props.principal, secundaria: props.secundaria }]
  const opcoes = lista.map((t): Opcao => ({
    ...t,
    // A miniatura mostra a cor como vai ficar na tela (já com o ajuste de legibilidade).
    principal: rgbParaHex(escala(t.principal)['600']),
    secundaria: rgbParaHex(coresMenu(t.secundaria).fundo)
  }))
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader titulo="Tema de cores da empresa" icone={Palette} />
        <div className="p-5">
          <p className="mb-4 text-sm text-slate-600">
            Vale para todos os usuários (e para os outros computadores, se estiverem sincronizados). A mudança aparece na hora como prévia; clique em{' '}
            <strong>Salvar alterações</strong> para manter.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Tema de cores">
            {opcoes.map((t) => {
              const ativo = props.tema === t.id
              return (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={ativo}
                  aria-label={t.nome}
                  onClick={() => props.onTema(t.id)}
                  className={`flex overflow-hidden rounded-xl border-2 text-left transition-shadow hover:shadow-md ${ativo ? 'border-blue-600 shadow-md' : 'border-slate-200'}`}
                >
                  {/* Miniatura: menu lateral na cor secundária e um botão na principal */}
                  <span className="flex w-14 flex-col gap-1.5 p-2" style={{ background: t.secundaria }}>
                    <span className="h-2 rounded-sm" style={{ background: t.principal }} />
                    <span className="h-2 rounded-sm bg-white/25" />
                    <span className="h-2 rounded-sm bg-white/25" />
                    <span className="h-2 rounded-sm bg-white/25" />
                  </span>
                  <span className="flex flex-1 flex-col justify-between gap-3 bg-superficie p-3">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800">{t.nome}</span>
                      {ativo && <CheckCircle2 size={18} className="shrink-0 text-blue-600" />}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="rounded-md px-2.5 py-1 text-xs font-medium text-white" style={{ background: t.principal }}>
                        Botão
                      </span>
                      <span className="text-xs font-medium" style={{ color: t.principal }}>
                        Link
                      </span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {props.tema === 'personalizado' && (
            <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
              <SeletorCor
                rotulo="Cor principal"
                dica="Botões, links, abas e o item ativo do menu"
                valor={props.principal}
                erro={props.erroPrincipal}
                onChange={props.onPrincipal}
              />
              <SeletorCor rotulo="Cor secundária" dica="Fundo do menu lateral" valor={props.secundaria} erro={props.erroSecundaria} onChange={props.onSecundaria} />
              <p className="text-xs text-slate-500 sm:col-span-2">
                Se a cor for muito clara, o sistema a escurece um pouco na tela para os textos continuarem legíveis.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader titulo="Modo escuro e tamanho da letra" icone={SunMoon} />
        <p className="p-5 text-sm text-slate-600">
          Cada pessoa escolhe para si, no botão <Sun size={14} className="inline align-[-2px]" /> da barra superior: modo claro, escuro ou automático (igual ao
          Windows) e letra pequena, normal ou grande. A escolha fica guardada neste computador.
        </p>
      </Card>
    </div>
  )
}

function SeletorCor({ rotulo, dica, valor, erro, onChange }: { rotulo: string; dica: string; valor: string; erro?: string; onChange: (c: string) => void }) {
  const [texto, setTexto] = useState(valor)
  useEffect(() => setTexto(valor), [valor])
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700">{rotulo}</p>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${rotulo} (seletor)`}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-superficie p-1"
        />
        <input
          aria-label={rotulo}
          value={texto}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
            setTexto(v)
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase())
          }}
          className={`h-10 w-28 rounded-lg border bg-superficie px-3 font-mono text-sm uppercase text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            erro ? 'border-red-400' : 'border-slate-300'
          }`}
        />
      </div>
      <p className={`mt-1 text-xs ${erro ? 'text-red-600' : 'text-slate-500'}`}>{erro ?? dica}</p>
    </div>
  )
}

/** CEP da empresa: a busca monta o endereço em uma linha ("Rua, número - Bairro - Cidade/UF"). */
function CepEmpresa({ cep, erro, onCep, onEndereco }: { cep: string; erro?: string; onCep: (v: string) => void; onEndereco: (e: string) => void }) {
  const [aviso, setAviso] = useState('')
  async function buscar(v: string): Promise<void> {
    setAviso('Buscando endereço...')
    try {
      const e = await chamar('cep:buscar', v)
      onEndereco(`${e.logradouro}, - ${e.bairro} - ${e.cidade}/${e.uf}`.replace(/^, - /, ''))
      setAviso('Endereço encontrado: complete com o número.')
    } catch (err) {
      setAviso((err as Error).message)
    }
  }
  return (
    <Input
      label="CEP"
      placeholder="00000-000"
      inputMode="numeric"
      value={cep}
      error={erro}
      hint={aviso || 'Digite o CEP para preencher o endereço'}
      onChange={(e) => {
        const v = fmt.mascaraCep(e.target.value)
        onCep(v)
        if (fmt.somenteDigitos(v).length === 8) void buscar(v)
        else setAviso('')
      }}
    />
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
      <CardHeader titulo="Banco de dados e backup" icone={DatabaseBackup} />
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
