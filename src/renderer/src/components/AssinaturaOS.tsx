import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { Eraser, PenLine, Trash2 } from 'lucide-react'
import * as fmt from '@shared/format'
import type { AssinaturaOS, OrdemServico } from '@shared/tipos'
import { alterar, useDb } from '@/data/store'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { executar } from '@/lib/executar'
import { ConfirmDialog, Modal } from './Modal'
import { Button, Input } from './ui'

// Assinatura do cliente na tela: com o mouse, o dedo (tela de toque) ou uma caneta de mesa digitalizadora.
// Gravada como PNG pequeno (tinta escura, fundo transparente), sai na impressão da OS.

const LARGURA = 600
const ALTURA = 200

/** Quadro de assinatura. Chama onMudar(true) quando há algo desenhado. */
export function QuadroAssinatura({ canvasRef, onMudar }: { canvasRef: RefObject<HTMLCanvasElement>; onMudar: (temTraco: boolean) => void }) {
  const desenhando = useRef(false)
  const ultimo = useRef<{ x: number; y: number } | null>(null)

  const ponto = (e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * LARGURA, y: ((e.clientY - r.top) / r.height) * ALTURA }
  }

  function inicio(e: PointerEvent<HTMLCanvasElement>): void {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    desenhando.current = true
    ultimo.current = ponto(e)
    // Um toque sem arrastar também marca (ponto).
    const ctx = e.currentTarget.getContext('2d')!
    ctx.fillStyle = '#0f172a'
    ctx.beginPath()
    ctx.arc(ultimo.current.x, ultimo.current.y, 1.6, 0, Math.PI * 2)
    ctx.fill()
    onMudar(true)
  }
  function mover(e: PointerEvent<HTMLCanvasElement>): void {
    if (!desenhando.current || !ultimo.current) return
    const p = ponto(e)
    const ctx = e.currentTarget.getContext('2d')!
    // Caneta com pressão engrossa o traço; mouse e dedo usam espessura média.
    ctx.lineWidth = e.pointerType === 'pen' && e.pressure > 0 ? 1.5 + e.pressure * 3.5 : 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
    ctx.beginPath()
    ctx.moveTo(ultimo.current.x, ultimo.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    ultimo.current = p
  }
  function fim(): void {
    desenhando.current = false
    ultimo.current = null
  }

  return (
    <div className="relative rounded-lg border-2 border-dashed border-slate-300 bg-white">
      <canvas
        ref={canvasRef}
        width={LARGURA}
        height={ALTURA}
        aria-label="Quadro de assinatura"
        className="block w-full touch-none cursor-crosshair"
        style={{ aspectRatio: `${LARGURA} / ${ALTURA}` }}
        onPointerDown={inicio}
        onPointerMove={mover}
        onPointerUp={fim}
        onPointerCancel={fim}
        onPointerLeave={fim}
      />
      <div className="pointer-events-none absolute inset-x-8 bottom-10 border-b border-slate-300" />
      <span className="pointer-events-none absolute bottom-3 left-8 text-xs text-slate-400">Assine acima da linha</span>
    </div>
  )
}

const TEXTOS = {
  entrada: { titulo: 'Assinatura na entrada', declaracao: 'Confirmo que deixei o equipamento descrito nesta OS, com os acessórios e o estado físico anotados.' },
  retirada: { titulo: 'Assinatura na retirada', declaracao: 'Confirmo que retirei o equipamento descrito nesta OS.' }
}

export function ColetarAssinatura({ os: o, tipo, onFechar }: { os: OrdemServico; tipo: AssinaturaOS['tipo']; onFechar: () => void }) {
  const { clientes } = useDb()
  const notificar = useToast()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [temTraco, setTemTraco] = useState(false)
  const [nome, setNome] = useState(clientes.find((c) => c.id === o.clienteId)?.nome ?? '')
  const [erro, setErro] = useState('')

  function limpar(): void {
    const c = canvas.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setTemTraco(false)
  }

  async function salvar(): Promise<void> {
    if (nome.trim().length < 2) return setErro('Informe o nome de quem está assinando.')
    if (!temTraco || !canvas.current) return setErro('Peça para o cliente assinar no quadro.')
    const imagem = canvas.current.toDataURL('image/png')
    const ok = await executar(() => alterar('os:assinar', o.id, { tipo, nome: nome.trim(), imagem }), { notificar, sucesso: `${TEXTOS[tipo].titulo} gravada na OS ${o.numero}.` })
    if (ok) onFechar()
  }

  return (
    <Modal
      aberto
      titulo={`${TEXTOS[tipo].titulo} — OS ${o.numero}`}
      onFechar={onFechar}
      tamanho="lg"
      rodape={
        <>
          <Button variante="secundario" icone={<Eraser size={16} />} className="mr-auto" onClick={limpar} disabled={!temTraco}>
            Limpar
          </Button>
          <Button variante="secundario" onClick={onFechar}>
            Cancelar
          </Button>
          <Button icone={<PenLine size={16} />} onClick={() => void salvar()}>
            Salvar assinatura
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{TEXTOS[tipo].declaracao}</p>
        <QuadroAssinatura
          canvasRef={canvas}
          onMudar={(v) => {
            setTemTraco(v)
            setErro('')
          }}
        />
        <Input
          label="Nome de quem assina"
          wrapperClassName="max-w-sm"
          value={nome}
          onChange={(e) => {
            setNome(e.target.value)
            setErro('')
          }}
          hint={tipo === 'retirada' ? 'Se outra pessoa for retirar pelo cliente, escreva o nome dela.' : undefined}
        />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>
    </Modal>
  )
}

/** Quadro da ficha: as duas assinaturas (entrada e retirada), com colher, refazer e remover. */
export function AssinaturasOS({ os: o }: { os: OrdemServico }) {
  const { pode } = useAuth()
  const notificar = useToast()
  const [colhendo, setColhendo] = useState<AssinaturaOS['tipo'] | null>(null)
  const [removendo, setRemovendo] = useState<AssinaturaOS['tipo'] | null>(null)
  useEffect(() => setColhendo(null), [o.id])

  const editavel = pode('osEditar') && o.status !== 'cancelada'
  const podeRetirada = o.status === 'pronta' || o.status === 'entregue'

  return (
    <section className="rounded-lg border border-slate-200 p-3" aria-label="Assinaturas do cliente">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        <PenLine size={15} className="text-blue-600" /> Assinaturas do cliente
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['entrada', 'retirada'] as const).map((tipo) => {
          const a = o.assinaturas.find((x) => x.tipo === tipo)
          const disponivel = tipo === 'entrada' || podeRetirada
          return (
            <div key={tipo} className="rounded-lg bg-slate-50 p-2">
              <p className="text-xs font-medium text-slate-500">{tipo === 'entrada' ? 'Entrada do equipamento' : 'Retirada do equipamento'}</p>
              {a ? (
                <>
                  <div className="mt-1 rounded border border-slate-200 bg-white">
                    <img src={a.imagem} alt={`Assinatura de ${tipo} de ${a.nome}`} className="mx-auto h-16 object-contain" />
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {a.nome} · {fmt.dataHora(a.em)}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-slate-400">{disponivel ? 'Ainda não assinada.' : 'Disponível quando a OS estiver pronta.'}</p>
              )}
              {editavel && disponivel && (
                <div className="mt-2 flex gap-2">
                  <Button tamanho="sm" variante={a ? 'secundario' : 'primario'} icone={<PenLine size={13} />} onClick={() => setColhendo(tipo)}>
                    {a ? 'Refazer' : `Colher assinatura`}
                  </Button>
                  {a && (
                    <Button tamanho="sm" variante="fantasma" icone={<Trash2 size={13} />} onClick={() => setRemovendo(tipo)} aria-label={`Remover assinatura de ${tipo}`}>
                      Remover
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {colhendo && <ColetarAssinatura os={o} tipo={colhendo} onFechar={() => setColhendo(null)} />}
      <ConfirmDialog
        aberto={removendo !== null}
        titulo="Remover assinatura"
        textoConfirmar="Remover"
        mensagem={`Remover a assinatura de ${removendo ?? ''}? A remoção fica registrada na auditoria.`}
        onConfirmar={() => {
          const t = removendo!
          setRemovendo(null)
          void executar(() => alterar('os:removerAssinatura', o.id, t), { notificar, sucesso: 'Assinatura removida.' })
        }}
        onCancelar={() => setRemovendo(null)}
      />
    </section>
  )
}
