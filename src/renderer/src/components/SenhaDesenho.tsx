import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

// Grade 3×3 do padrão de desbloqueio (como no Android). Pontos numerados assim:
//   1 2 3
//   4 5 6
//   7 8 9
// Desenha-se arrastando o mouse (ou o dedo) pelos pontos, ou clicando/teclando Enter em cada ponto na ordem.
// Como no celular, passar "por cima" de um ponto ainda não usado (ex.: de 1 para 3) inclui o do meio (2).
// No modo somente leitura mostra o traço com a ordem numerada, para o técnico reproduzir no aparelho.

const LADO = 300
const pos = (n: number): { x: number; y: number } => ({ x: 50 + ((n - 1) % 3) * 100, y: 50 + Math.floor((n - 1) / 3) * 100 })
const RAIO_TOQUE = 34

/** Ponto do meio entre a e b, quando ele existe na grade (1→3 passa pelo 2; 1→9 pelo 5). */
function pontoDoMeio(a: number, b: number): number | null {
  const [la, ca, lb, cb] = [Math.floor((a - 1) / 3), (a - 1) % 3, Math.floor((b - 1) / 3), (b - 1) % 3]
  if ((la + lb) % 2 || (ca + cb) % 2) return null
  return ((la + lb) / 2) * 3 + (ca + cb) / 2 + 1
}

/** Acrescenta o ponto (e o do meio, se for o caso), sem repetir. */
export function acrescentar(lista: number[], n: number): number[] {
  if (lista.includes(n)) return lista
  const ultimo = lista[lista.length - 1]
  const meio = ultimo ? pontoDoMeio(ultimo, n) : null
  return meio && !lista.includes(meio) ? [...lista, meio, n] : [...lista, n]
}

interface Props {
  pontos: number[]
  onChange?: (pontos: number[]) => void
  /** Largura em pixels (a altura é igual). */
  tamanho?: number
  rotulo?: string
}

export function SenhaDesenho({ pontos, onChange, tamanho = 220, rotulo = 'Desenho da senha' }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const [desenhando, setDesenhando] = useState(false)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const editavel = !!onChange

  function noSvg(e: PointerEvent): { x: number; y: number } {
    const r = svg.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * LADO, y: ((e.clientY - r.top) / r.height) * LADO }
  }
  const pontoEm = (p: { x: number; y: number }): number | null => {
    for (let n = 1; n <= 9; n++) {
      const c = pos(n)
      if (Math.hypot(c.x - p.x, c.y - p.y) <= RAIO_TOQUE) return n
    }
    return null
  }

  function inicio(e: PointerEvent<SVGSVGElement>): void {
    if (!editavel) return
    const p = noSvg(e)
    const n = pontoEm(p)
    if (n === null) return
    e.preventDefault()
    svg.current?.setPointerCapture?.(e.pointerId)
    setDesenhando(true)
    setCursor(p)
    onChange!(acrescentar(pontos, n))
  }
  function mover(e: PointerEvent<SVGSVGElement>): void {
    if (!desenhando) return
    const p = noSvg(e)
    setCursor(p)
    const n = pontoEm(p)
    if (n !== null && !pontos.includes(n)) onChange!(acrescentar(pontos, n))
  }
  function fim(): void {
    setDesenhando(false)
    setCursor(null)
  }
  function tecla(e: KeyboardEvent, n: number): void {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onChange?.(acrescentar(pontos, n))
  }

  const ultimo = pontos.length ? pos(pontos[pontos.length - 1]) : null
  const caminho = pontos.map((n, i) => `${i ? 'L' : 'M'}${pos(n).x} ${pos(n).y}`).join(' ')

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${LADO} ${LADO}`}
      width={tamanho}
      height={tamanho}
      role="group"
      aria-label={`${rotulo}${pontos.length ? `: ${pontos.join(', ')}` : ''}`}
      className={`select-none rounded-xl bg-slate-900 ${editavel ? 'cursor-pointer touch-none' : ''}`}
      onPointerDown={inicio}
      onPointerMove={mover}
      onPointerUp={fim}
      onPointerCancel={fim}
    >
      <defs>
        <marker id="seta-desenho" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#60a5fa" />
        </marker>
      </defs>
      {pontos.length > 1 && (
        <path d={caminho} fill="none" stroke="#3b82f6" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      )}
      {/* Setas no meio de cada trecho: mostram o sentido do desenho. */}
      {pontos.slice(1).map((n, i) => {
        const a = pos(pontos[i])
        const b = pos(n)
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        return <line key={`s${i}`} x1={mx - (b.x - a.x) * 0.06} y1={my - (b.y - a.y) * 0.06} x2={mx + (b.x - a.x) * 0.06} y2={my + (b.y - a.y) * 0.06} stroke="#bfdbfe" strokeWidth="3" markerEnd="url(#seta-desenho)" />
      })}
      {desenhando && ultimo && cursor && <line x1={ultimo.x} y1={ultimo.y} x2={cursor.x} y2={cursor.y} stroke="#93c5fd" strokeWidth="6" strokeLinecap="round" opacity="0.6" />}
      {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => {
        const { x, y } = pos(n)
        const ordem = pontos.indexOf(n)
        const usado = ordem >= 0
        const inicial = ordem === 0
        return (
          <g
            key={n}
            role={editavel ? 'button' : undefined}
            tabIndex={editavel ? 0 : undefined}
            aria-label={editavel ? `Ponto ${n}` : undefined}
            aria-pressed={editavel ? usado : undefined}
            onKeyDown={(e) => tecla(e, n)}
            className="outline-none [&:focus-visible>circle:first-child]:stroke-amber-300"
          >
            <circle cx={x} cy={y} r={RAIO_TOQUE - 6} fill="transparent" stroke="transparent" strokeWidth="3" />
            <circle cx={x} cy={y} r={usado ? 16 : 9} fill={inicial ? '#22c55e' : usado ? '#3b82f6' : '#94a3b8'} stroke={usado ? '#fff' : 'none'} strokeWidth="3" />
            {usado && (
              <text x={x} y={y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" style={{ pointerEvents: 'none' }}>
                {ordem + 1}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
