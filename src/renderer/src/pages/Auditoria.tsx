import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, RefreshCw } from 'lucide-react'
import type { ConsultaAuditoria, RegistroAuditoria } from '@shared/api'
import { chamar } from '@/data/api'
import { useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { Filtros, PageHeader } from '@/components/PageHeader'
import { DataTable, type Coluna } from '@/components/DataTable'
import { BarraSaida } from '@/components/BarraSaida'
import { Badge, Button, Input, SearchInput, Select } from '@/components/ui'
import { relatorioExcel, relatorioImprimir, relatorioPdf } from '@/lib/saida'
import type { Relatorio } from '@/lib/relatorio'
import * as fmt from '@shared/format'

const ACOES = [
  'Inclusão',
  'Alteração',
  'Exclusão',
  'Login',
  'Login recusado',
  'Recebimento',
  'Recebimento parcial',
  'Encerramento',
  'Cancelamento',
  'Estorno',
  'Conclusão',
  'Importação',
  'Zerar dados',
  'Restauração de backup',
  'Recuperação de acesso',
  'Recuperação recusada',
  'Conexão ao servidor',
  'Desconexão do servidor'
]
const ENTIDADES = ['Produto', 'Categoria', 'Unidade', 'Fornecedor', 'Cliente', 'Usuário', 'Compra', 'Venda', 'Movimentação', 'Inventário', 'Configurações', 'Sessão', 'Sistema']

type CorBadge = 'cinza' | 'verde' | 'vermelho' | 'amarelo' | 'azul' | 'roxo'
function corAcao(a: string): CorBadge {
  if (a === 'Inclusão' || a === 'Login' || a.startsWith('Recebimento')) return 'verde'
  if (a === 'Alteração' || a === 'Importação' || a === 'Conclusão') return 'azul'
  if (a === 'Exclusão' || a === 'Zerar dados' || a.endsWith('recusado') || a.endsWith('recusada')) return 'vermelho'
  if (a === 'Estorno' || a === 'Cancelamento' || a === 'Encerramento') return 'amarelo'
  return 'roxo'
}

const textoAlteracoes = (r: RegistroAuditoria): string => r.alteracoes.map((a) => `${a.campo}: ${a.de} → ${a.para}`).join('\n')

export default function Auditoria() {
  const { configuracoes } = useDb()
  const notificar = useToast()
  const [de, setDe] = useState(fmt.hojeIso().slice(0, 8) + '01')
  const [ate, setAte] = useState('')
  const [usuario, setUsuario] = useState('')
  const [acao, setAcao] = useState('')
  const [entidade, setEntidade] = useState('')
  const [busca, setBusca] = useState('')
  const [consulta, setConsulta] = useState<ConsultaAuditoria | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function carregar(): Promise<void> {
    setCarregando(true)
    try {
      setConsulta(await chamar('auditoria:listar', { de, ate, usuario, acao, entidade, busca: busca.trim() }))
    } catch (e) {
      notificar('erro', (e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  // Busca de texto espera o usuário parar de digitar.
  useEffect(() => {
    const t = setTimeout(() => void carregar(), busca ? 300 : 0)
    return () => clearTimeout(t)
  }, [de, ate, usuario, acao, entidade, busca]) // eslint-disable-line react-hooks/exhaustive-deps

  const itens = consulta?.itens ?? []

  const relatorio = useMemo<Relatorio>(
    () => ({
      titulo: 'Auditoria do sistema',
      filtros: [
        de || ate ? `Período: ${de ? fmt.data(de) : 'início'} a ${ate ? fmt.data(ate) : 'hoje'}` : 'Todo o período',
        usuario && `Usuário: ${usuario}`,
        acao && `Ação: ${acao}`,
        entidade && `Tipo: ${entidade}`,
        busca && `Busca: "${busca}"`
      ].filter(Boolean) as string[],
      colunas: [
        { titulo: 'Data/hora', formato: 'dataHora', peso: 1.2 },
        { titulo: 'Usuário', peso: 1 },
        { titulo: 'Ação', peso: 1 },
        { titulo: 'Tipo', peso: 0.9 },
        { titulo: 'Descrição', peso: 2.6 },
        { titulo: 'Alterações (antes → depois)', peso: 3 }
      ],
      linhas: itens.map((r) => [r.em, r.usuario, r.acao, r.entidade, r.descricao, textoAlteracoes(r)])
    }),
    [itens, de, ate, usuario, acao, entidade, busca]
  )
  const nome = `auditoria_${fmt.hojeIso()}`

  const colunas: Coluna<RegistroAuditoria>[] = [
    { chave: 'em', titulo: 'Data/hora', largura: '140px', render: (r) => <span className="tabular-nums text-slate-600">{fmt.dataHora(r.em)}</span> },
    { chave: 'usuario', titulo: 'Usuário', largura: '140px', render: (r) => <span className="font-medium text-slate-700">{r.usuario}</span> },
    {
      chave: 'acao',
      titulo: 'Ação',
      largura: '150px',
      render: (r) => (
        <span className="flex flex-col items-start gap-1">
          <Badge cor={corAcao(r.acao)}>{r.acao}</Badge>
          <span className="text-xs text-slate-400">{r.entidade}</span>
        </span>
      )
    },
    {
      chave: 'descricao',
      titulo: 'O que aconteceu',
      render: (r) => (
        <div className="space-y-1">
          <p className="text-slate-800">{r.descricao}</p>
          {r.alteracoes.length > 0 && (
            <ul className="space-y-0.5 text-xs">
              {r.alteracoes.map((a, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5 text-slate-500">
                  <span className="font-medium text-slate-600">{a.campo}:</span>
                  <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through decoration-red-300">{a.de}</span>
                  <ArrowRight size={12} className="text-slate-400" />
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">{a.para}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader
        titulo="Auditoria"
        subtitulo="Quem fez o quê e quando: cadastros, preços, exclusões, acessos e operações sensíveis"
        acoes={
          <>
            <Button variante="secundario" icone={<RefreshCw size={16} className={carregando ? 'animate-spin' : ''} />} onClick={() => void carregar()}>
              Atualizar
            </Button>
            <BarraSaida
              onExcel={() => relatorioExcel(relatorio, nome, notificar)}
              onPdf={() => relatorioPdf(relatorio, configuracoes.nomeEmpresa, nome, notificar)}
              onImprimir={() => relatorioImprimir(relatorio, configuracoes.nomeEmpresa, notificar)}
            />
          </>
        }
      />

      <Filtros>
        <SearchInput className="w-64" placeholder="Buscar na descrição ou nos valores..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select
          className="w-44"
          placeholder="Todos os usuários"
          opcoes={(consulta?.usuarios ?? []).map((u) => ({ value: u, label: u }))}
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
        />
        <Select className="w-44" placeholder="Todas as ações" opcoes={ACOES.map((a) => ({ value: a, label: a }))} value={acao} onChange={(e) => setAcao(e.target.value)} />
        <Select className="w-40" placeholder="Todos os tipos" opcoes={ENTIDADES.map((a) => ({ value: a, label: a }))} value={entidade} onChange={(e) => setEntidade(e.target.value)} />
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>De</span>
          <Input type="date" className="w-40" value={de} onChange={(e) => setDe(e.target.value)} />
          <span>até</span>
          <Input type="date" className="w-40" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <span className="ml-auto text-sm text-slate-500">
          {consulta && consulta.total > itens.length ? `${itens.length} mais recentes de ${fmt.numero(consulta.total)}` : `${itens.length} registro(s)`}
        </span>
      </Filtros>

      <DataTable colunas={colunas} dados={itens} chave={(r) => r.id} porPagina={15} vazio={carregando ? 'Carregando...' : 'Nenhum registro de auditoria no período.'} />

      <p className="mt-3 text-xs text-slate-400">
        A auditoria fica guardada neste computador e não pode ser apagada pela tela. Os valores são gravados como estavam no momento da ação.
      </p>
    </>
  )
}
