import { useEffect, useRef, useState } from 'react'

// Gráfico de barras agrupadas em SVG puro (sem biblioteca).
// Cores das séries: slots 1 e 2 da paleta categórica validada (azul / laranja).

export interface Serie {
  nome: string
  cor: string
}

export interface PontoGrafico {
  rotulo: string
  valores: number[] // um valor por série, na mesma ordem
}

interface Props {
  series: Serie[]
  dados: PontoGrafico[]
  formatar: (v: number) => string
  formatarEixo?: (v: number) => string
  altura?: number
}

const M = { topo: 12, direita: 8, base: 28, esquerda: 64 }

function escalaBonita(max: number): number[] {
  if (max <= 0) return [0, 1]
  const bruto = max / 4
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= bruto) ?? bruto
  const ticks: number[] = []
  for (let v = 0; v <= max + passo * 0.001; v += passo) ticks.push(v)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + passo)
  return ticks
}

export function GraficoBarras({ series, dados, formatar, formatarEixo = formatar, altura = 240 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(600)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(280, e.contentRect.width)))
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])

  const ticks = escalaBonita(Math.max(0, ...dados.flatMap((d) => d.valores)))
  const topoEscala = ticks[ticks.length - 1]
  const areaL = largura - M.esquerda - M.direita
  const areaA = altura - M.topo - M.base
  const y = (v: number): number => M.topo + areaA - (v / topoEscala) * areaA

  const grupo = areaL / Math.max(1, dados.length)
  const larguraBarra = Math.min(28, (grupo * 0.6) / series.length)
  const gap = 2

  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.nome} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />
            {s.nome}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative">
        <svg width={largura} height={altura} role="img" aria-label="Gráfico de movimentações por mês">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.esquerda} x2={largura - M.direita} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#c3c2b7' : '#e1e0d9'} strokeWidth={1} />
              <text x={M.esquerda - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#898781" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatarEixo(t)}
              </text>
            </g>
          ))}

          {dados.map((d, i) => {
            const x0 = M.esquerda + grupo * i
            const inicio = x0 + (grupo - (larguraBarra * series.length + gap * (series.length - 1))) / 2
            return (
              <g key={d.rotulo}>
                {hover === i && <rect x={x0} y={M.topo} width={grupo} height={areaA} fill="#0b0b0b" opacity={0.04} />}
                {d.valores.map((v, s) => {
                  const h = Math.max(0, y(0) - y(v))
                  const x = inicio + s * (larguraBarra + gap)
                  const r = Math.min(4, h, larguraBarra / 2)
                  // Barra com topo arredondado (4px) e base reta, ancorada na linha zero.
                  const path =
                    h === 0
                      ? ''
                      : `M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + larguraBarra - r} Q${x + larguraBarra},${y(v)} ${x + larguraBarra},${y(v) + r} V${y(0)} Z`
                  return path && <path key={s} d={path} fill={series[s].cor} />
                })}
                <text x={x0 + grupo / 2} y={altura - 8} textAnchor="middle" fontSize={11} fill="#52514e">
                  {d.rotulo}
                </text>
                {/* Área de hover maior que as barras */}
                <rect
                  x={x0}
                  y={M.topo}
                  width={grupo}
                  height={areaA + M.base}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            )
          })}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{
              left: Math.min(M.esquerda + grupo * hover + grupo / 2, largura - 160),
              top: 4
            }}
          >
            <p className="mb-1 font-semibold text-slate-800">{dados[hover].rotulo}</p>
            {series.map((s, idx) => (
              <p key={s.nome} className="flex items-center justify-between gap-3 text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.cor }} />
                  {s.nome}
                </span>
                <span className="font-medium tabular-nums text-slate-900">{formatar(dados[hover].valores[idx])}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
