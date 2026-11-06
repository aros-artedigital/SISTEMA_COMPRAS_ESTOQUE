import { useEffect, useRef, useState } from 'react'
import * as fmt from '@shared/format'

// Saldo de estoque ao longo do tempo, em degraus (o saldo muda de uma vez a cada movimentação).
// Série única (azul da paleta), linha de 2px, linha do estoque mínimo tracejada e cursor com o valor.

export interface PontoSaldo {
  data: string // ISO local com hora
  saldo: number
}

const M = { topo: 14, direita: 12, base: 26, esquerda: 44 }
const AZUL = '#2a78d6'

function tempo(iso: string): number {
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).getTime()
}

export function GraficoSaldo({ pontos, minimo, altura = 200 }: { pontos: PontoSaldo[]; minimo: number; altura?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(600)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(280, e.contentRect.width)))
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [pontos.length === 0]) // o contêiner muda quando o gráfico sai do estado vazio

  if (pontos.length === 0) {
    return (
      <div ref={ref} className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500" style={{ height: altura }}>
        Nenhuma movimentação ainda.
      </div>
    )
  }

  // O gráfico vai até agora, mantendo o último saldo.
  const serie = [...pontos, { data: new Date().toISOString().slice(0, 19), saldo: pontos[pontos.length - 1].saldo }]
  const t0 = tempo(serie[0].data)
  const t1 = Math.max(tempo(serie[serie.length - 1].data), t0 + 86_400_000)
  const valores = serie.map((p) => p.saldo)
  const maxV = Math.max(minimo, ...valores, 1)
  const minV = Math.min(0, ...valores)
  const areaL = largura - M.esquerda - M.direita
  const areaA = altura - M.topo - M.base
  const x = (t: number): number => M.esquerda + ((t - t0) / (t1 - t0)) * areaL
  const y = (v: number): number => M.topo + areaA - ((v - minV) / (maxV - minV || 1)) * areaA

  let caminho = `M${x(tempo(serie[0].data))},${y(serie[0].saldo)}`
  for (let i = 1; i < serie.length; i++) caminho += ` H${x(tempo(serie[i].data))} V${y(serie[i].saldo)}`

  const ticks = Array.from(new Set([minV, Math.round((minV + maxV) / 2), maxV]))
  const datas = [t0, (t0 + t1) / 2, t1]

  function mover(e: React.MouseEvent<SVGRectElement>): void {
    const rect = (e.target as SVGRectElement).getBoundingClientRect()
    const t = t0 + ((e.clientX - rect.left) / rect.width) * (t1 - t0)
    // Último ponto antes do cursor (o saldo vale até a próxima movimentação).
    let idx = 0
    for (let i = 0; i < pontos.length; i++) if (tempo(pontos[i].data) <= t) idx = i
    setHover(idx)
  }

  const p = hover !== null ? pontos[hover] : null
  return (
    <div ref={ref} className="relative">
      <svg width={largura} height={altura} role="img" aria-label="Saldo do produto ao longo do tempo">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.esquerda} x2={largura - M.direita} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#c3c2b7' : '#e1e0d9'} />
            <text x={M.esquerda - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#898781" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmt.numero(t)}
            </text>
          </g>
        ))}
        {datas.map((t, i) => (
          <text key={i} x={x(t)} y={altura - 8} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize={11} fill="#52514e">
            {fmt.data(new Date(t).toISOString().slice(0, 10))}
          </text>
        ))}
        {minimo > 0 && (
          <g>
            <line x1={M.esquerda} x2={largura - M.direita} y1={y(minimo)} y2={y(minimo)} stroke="#d03b3b" strokeDasharray="4 4" strokeWidth={1} />
            <text x={largura - M.direita} y={y(minimo) - 4} textAnchor="end" fontSize={10} fill="#52514e">
              mínimo {fmt.numero(minimo)}
            </text>
          </g>
        )}
        <path d={caminho} fill="none" stroke={AZUL} strokeWidth={2} strokeLinejoin="round" />
        {p && (
          <g>
            <line x1={x(tempo(p.data))} x2={x(tempo(p.data))} y1={M.topo} y2={M.topo + areaA} stroke="#898781" strokeDasharray="2 3" />
            <circle cx={x(tempo(p.data))} cy={y(p.saldo)} r={4.5} fill={AZUL} stroke="#fff" strokeWidth={2} />
          </g>
        )}
        <rect x={M.esquerda} y={M.topo} width={areaL} height={areaA} fill="transparent" onMouseMove={mover} onMouseLeave={() => setHover(null)} />
      </svg>
      {p && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(x(tempo(p.data)) + 8, largura - 150) }}
        >
          <p className="font-semibold text-slate-800">{fmt.dataHora(p.data)}</p>
          <p className="text-slate-600">
            Saldo: <strong className="tabular-nums text-slate-900">{fmt.numero(p.saldo)}</strong>
          </p>
        </div>
      )}
    </div>
  )
}
