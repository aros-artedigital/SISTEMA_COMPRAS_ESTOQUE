import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Cloud, CloudOff, HardDrive, Loader2, RefreshCw } from 'lucide-react'
import { chamar } from '@/data/api'
import { haQuantoTempo, useEstadoSync } from '@/data/sync'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { executar } from '@/lib/executar'

/** Situação da sincronização na barra superior, com atalho para sincronizar agora. */
export function IndicadorSync() {
  const estado = useEstadoSync()
  const { pode } = useAuth()
  const notificar = useToast()
  const [aberto, setAberto] = useState(false)
  const [, forcarRelogio] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  // Atualiza o "há X min" a cada meio minuto.
  useEffect(() => {
    const t = setInterval(() => forcarRelogio((n) => n + 1), 30_000)
    const fora = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => {
      clearInterval(t)
      document.removeEventListener('mousedown', fora)
    }
  }, [])

  if (!estado) return null

  let icone = <HardDrive size={16} />
  let texto = 'Só neste computador'
  let cor = 'text-slate-500'
  if (estado.configurado) {
    if (estado.sincronizando) {
      icone = <Loader2 size={16} className="animate-spin" />
      texto = 'Sincronizando...'
      cor = 'text-blue-600'
    } else if (estado.ultimoErro) {
      icone = <CloudOff size={16} />
      texto = estado.pendentes ? `Offline · ${estado.pendentes} pendente(s)` : 'Offline'
      cor = 'text-amber-700'
    } else if (estado.conflitos) {
      icone = <AlertTriangle size={16} />
      texto = `${estado.conflitos} conflito(s)`
      cor = 'text-red-600'
    } else if (estado.pendentes) {
      icone = <Cloud size={16} />
      texto = `${estado.pendentes} pendente(s)`
      cor = 'text-amber-700'
    } else {
      icone = <Cloud size={16} />
      texto = `Sincronizado ${haQuantoTempo(estado.ultimaSync)}`
      cor = 'text-emerald-700'
    }
  }

  async function sincronizarAgora(): Promise<void> {
    setAberto(false)
    let msg = ''
    const ok = await executar(
      async () => {
        const r = await chamar('sync:sincronizar')
        msg = `Sincronizado: ${r.enviados} enviado(s), ${r.recebidos} recebido(s)${r.rejeitados ? `, ${r.rejeitados} com conflito` : ''}.`
      },
      { notificar }
    )
    if (ok) notificar(estado?.conflitos ? 'aviso' : 'sucesso', msg)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100 ${cor}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        title={estado.ultimoErro ?? undefined}
      >
        {icone}
        <span>{texto}</span>
      </button>

      {aberto && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-72 rounded-lg border border-slate-200 bg-superficie p-3 text-sm shadow-lg">
          {estado.configurado ? (
            <>
              <p className="font-medium text-slate-800">
                Terminal {estado.nome} <span className="font-mono text-xs text-slate-400">({estado.codigo})</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Última sincronização: {haQuantoTempo(estado.ultimaSync)}</p>
              {estado.ultimoErro && <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{estado.ultimoErro}</p>}
              <button
                onClick={sincronizarAgora}
                disabled={estado.sincronizando}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw size={14} /> Sincronizar agora
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-600">
              Os dados estão só neste computador. Conecte a um servidor para usar o sistema em vários terminais.
            </p>
          )}
          {pode('configuracoes') && (
            <Link to="/configuracoes" onClick={() => setAberto(false)} className="mt-2 block text-center text-xs font-medium text-blue-600 hover:underline">
              {estado.configurado ? 'Configurações e conflitos' : 'Configurar sincronização'}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
