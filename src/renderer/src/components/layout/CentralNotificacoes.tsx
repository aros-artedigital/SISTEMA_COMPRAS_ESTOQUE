import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, Bell, BellOff, CheckCheck, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { Notificacao } from '@shared/api'
import { chamar } from '@/data/api'
import { useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'

// Sino da barra superior: avisos do sistema (estoque baixo, compras atrasadas, backup, sincronização...).
// Atualiza sozinho a cada minuto, ao trocar de tela e sempre que os dados mudam; avisos novos também aparecem como mensagem.

const ATUALIZAR_A_CADA = 60_000

const visual: Record<Notificacao['tipo'], { Icone: typeof Info; cor: string }> = {
  erro: { Icone: XCircle, cor: 'bg-red-100 text-red-600' },
  aviso: { Icone: AlertTriangle, cor: 'bg-amber-100 text-amber-600' },
  info: { Icone: Info, cor: 'bg-blue-100 text-blue-600' },
  sucesso: { Icone: CheckCircle2, cor: 'bg-emerald-100 text-emerald-600' }
}

export function CentralNotificacoes() {
  const [lista, setLista] = useState<Notificacao[]>([])
  const [aberto, setAberto] = useState(false)
  const [filtro, setFiltro] = useState<'novas' | 'todas'>('novas')
  const ref = useRef<HTMLDivElement>(null)
  const conhecidas = useRef<Set<string> | null>(null)
  const navegar = useNavigate()
  const notificar = useToast()
  const dados = useDb()
  const { pathname } = useLocation()

  const carregar = useCallback(async () => {
    try {
      const nova = await chamar('notificacoes:listar')
      // Avisa por mensagem só o que surgiu depois da primeira carga (não a lista inteira ao entrar).
      if (conhecidas.current) {
        const surgiram = nova.filter((n) => !n.lida && !conhecidas.current!.has(n.chave))
        if (surgiram.length === 1) notificar('info', `Nova notificação: ${surgiram[0].titulo}`)
        else if (surgiram.length > 1) notificar('info', `${surgiram.length} novas notificações. Veja no sino da barra superior.`)
      }
      conhecidas.current = new Set(nova.map((n) => n.chave))
      setLista(nova)
    } catch {
      // sem sessão ou erro passageiro: tenta de novo na próxima atualização
    }
  }, [notificar])

  // Recarrega quando os dados mudam (venda, compra recebida, sincronização...), ao trocar de tela e a cada minuto.
  useEffect(() => {
    void carregar()
  }, [carregar, dados, pathname])
  useEffect(() => {
    const t = setInterval(() => void carregar(), ATUALIZAR_A_CADA)
    return () => clearInterval(t)
  }, [carregar])

  useEffect(() => {
    const fora = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  async function marcar(chaves: string[]): Promise<void> {
    if (!chaves.length) return
    setLista((l) => l.map((n) => (chaves.includes(n.chave) ? { ...n, lida: true } : n)))
    await chamar('notificacoes:marcarLidas', chaves).catch(() => undefined)
  }

  function abrir(n: Notificacao): void {
    void marcar([n.chave])
    setAberto(false)
    if (n.link) navegar(n.link)
  }

  const naoLidas = lista.filter((n) => !n.lida)
  const visiveis = filtro === 'novas' ? naoLidas : lista

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setAberto((v) => !v)
          if (!aberto) setFiltro(naoLidas.length ? 'novas' : 'todas')
        }}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        title="Notificações"
        aria-label={naoLidas.length ? `Notificações (${naoLidas.length} não lidas)` : 'Notificações'}
        aria-haspopup="dialog"
        aria-expanded={aberto}
      >
        <Bell size={18} />
        {naoLidas.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-superficie">
            {naoLidas.length > 9 ? '9+' : naoLidas.length}
          </span>
        )}
      </button>

      {aberto && (
        <div role="dialog" aria-label="Notificações" className="absolute right-0 z-40 mt-1 w-[26rem] overflow-hidden rounded-xl border border-slate-200 bg-superficie shadow-xl">
          <div className="space-y-2.5 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-slate-800">Notificações</p>
              {naoLidas.length > 0 && (
                <button onClick={() => void marcar(naoLidas.map((n) => n.chave))} className="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-blue-600 hover:underline">
                  <CheckCheck size={14} /> Marcar todas como lidas
                </button>
              )}
            </div>
            <div>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs" role="tablist">
                {(['novas', 'todas'] as const).map((f) => (
                  <button
                    key={f}
                    role="tab"
                    aria-selected={filtro === f}
                    onClick={() => setFiltro(f)}
                    className={`whitespace-nowrap rounded-md px-3 py-1 font-medium ${filtro === f ? 'bg-superficie text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {f === 'novas' ? `Não lidas (${naoLidas.length})` : `Todas (${lista.length})`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ul className="max-h-[26rem] overflow-y-auto">
            {visiveis.length === 0 && (
              <li className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-slate-500">
                <BellOff size={28} className="text-slate-300" />
                {filtro === 'novas' && lista.length ? 'Nenhuma notificação nova.' : 'Tudo em dia: nenhuma notificação.'}
              </li>
            )}
            {visiveis.map((n) => {
              const { Icone, cor } = visual[n.tipo]
              return (
                <li key={n.chave} className="border-b border-slate-100 last:border-0">
                  <button onClick={() => abrir(n)} className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${n.lida ? 'opacity-70' : ''}`}>
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cor}`}>
                      <Icone size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={`truncate text-sm ${n.lida ? 'text-slate-600' : 'font-semibold text-slate-800'}`}>{n.titulo}</span>
                        {!n.lida && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="não lida" />}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">{n.mensagem}</span>
                      <span className="mt-1 block text-[11px] uppercase tracking-wide text-slate-400">{n.categoria}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
