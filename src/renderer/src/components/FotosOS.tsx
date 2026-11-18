import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Trash2, X } from 'lucide-react'
import * as fmt from '@shared/format'
import type { FotoOS, OrdemServico } from '@shared/tipos'
import { chamar } from '@/data/api'
import { alterar } from '@/data/store'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { executar } from '@/lib/executar'
import { ConfirmDialog, Modal } from './Modal'
import { Button, Select } from './ui'

// Fotos do equipamento na OS (riscos, tela trincada, estado na entrada). Do arquivo ou da câmera do computador.
// São reduzidas antes de gravar (até 1600 px, JPEG) e ficam só neste computador — não sincronizam.

const LADO_MAXIMO = 1600
const LADO_MINIATURA = 320

/** Reduz uma imagem (arquivo ou quadro da câmera) para foto + miniatura em JPEG. */
export async function reduzir(origem: CanvasImageSource & { width?: number; height?: number }, largura: number, altura: number): Promise<{ imagem: string; miniatura: string }> {
  const gerar = (lado: number, qualidade: number): string => {
    const escala = Math.min(1, lado / Math.max(largura, altura))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(largura * escala))
    c.height = Math.max(1, Math.round(altura * escala))
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff' // PNG com transparência fica com fundo branco
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(origem, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', qualidade)
  }
  return { imagem: gerar(LADO_MAXIMO, 0.82), miniatura: gerar(LADO_MINIATURA, 0.7) }
}

async function deArquivo(arquivo: File): Promise<{ imagem: string; miniatura: string }> {
  const bmp = await createImageBitmap(arquivo)
  try {
    return await reduzir(bmp, bmp.width, bmp.height)
  } finally {
    bmp.close()
  }
}

export function FotosOS({ os: o }: { os: OrdemServico }) {
  const { pode } = useAuth()
  const notificar = useToast()
  const [fotos, setFotos] = useState<FotoOS[]>([])
  const [ampliada, setAmpliada] = useState<{ foto: FotoOS; imagem: string } | null>(null)
  const [excluindo, setExcluindo] = useState<FotoOS | null>(null)
  const [camera, setCamera] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)
  const editavel = pode('osEditar') && o.status !== 'cancelada'

  const carregar = useCallback(() => {
    chamar('os:fotos', o.id).then(setFotos, () => setFotos([]))
  }, [o.id])
  useEffect(carregar, [carregar, o.qtdFotos])

  async function adicionar(dados: { imagem: string; miniatura: string }, legenda = ''): Promise<boolean> {
    return executar(() => alterar('os:adicionarFoto', o.id, { ...dados, legenda }), { notificar })
  }

  async function escolhidos(lista: FileList | null): Promise<void> {
    if (!lista?.length) return
    setEnviando(true)
    let ok = 0
    try {
      for (const f of Array.from(lista)) {
        try {
          if (await adicionar(await deArquivo(f), f.name.replace(/\.[^.]+$/, '').slice(0, 120))) ok++
        } catch {
          notificar('aviso', `Não foi possível ler "${f.name}". Use fotos JPG, PNG ou WEBP.`)
        }
      }
    } finally {
      setEnviando(false)
      if (arquivo.current) arquivo.current.value = ''
    }
    if (ok) notificar('sucesso', ok === 1 ? 'Foto adicionada.' : `${ok} fotos adicionadas.`)
  }

  async function ampliar(f: FotoOS): Promise<void> {
    await executar(async () => setAmpliada({ foto: f, imagem: await chamar('os:foto', f.id) }), { notificar })
  }

  return (
    <section className="rounded-lg border border-slate-200 p-3" aria-label="Fotos do equipamento">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Camera size={15} className="text-blue-600" /> Fotos do equipamento {fotos.length > 0 && <span className="font-normal text-slate-500">({fotos.length})</span>}
        </h3>
        {editavel && (
          <div className="flex gap-2">
            <input ref={arquivo} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden aria-label="Escolher fotos" onChange={(e) => void escolhidos(e.target.files)} />
            <Button tamanho="sm" variante="secundario" icone={<ImagePlus size={14} />} disabled={enviando} onClick={() => arquivo.current?.click()}>
              {enviando ? 'Adicionando...' : 'Adicionar fotos'}
            </Button>
            <Button tamanho="sm" variante="secundario" icone={<Camera size={14} />} onClick={() => setCamera(true)}>
              Tirar foto
            </Button>
          </div>
        )}
      </div>
      {fotos.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma foto. Fotografe riscos, trincas e o estado do aparelho na entrada para evitar discussão depois.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((f) => (
            <li key={f.id} className="group relative">
              <button className="block w-full overflow-hidden rounded-lg border border-slate-200" onClick={() => void ampliar(f)} title={f.legenda || 'Ampliar'}>
                <img src={f.miniatura} alt={f.legenda || `Foto de ${fmt.dataHora(f.em)}`} className="aspect-square w-full object-cover" />
              </button>
              {editavel && (
                <button
                  className="absolute right-1 top-1 hidden rounded-full bg-black/60 p-1 text-white hover:bg-red-600 group-hover:block"
                  aria-label={`Excluir foto ${f.legenda || f.id}`}
                  onClick={() => setExcluindo(f)}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-400">As fotos ficam neste computador e entram no backup; não vão para os outros terminais.</p>

      {ampliada && (
        <Modal aberto titulo={ampliada.foto.legenda || 'Foto do equipamento'} onFechar={() => setAmpliada(null)} tamanho="xl">
          <img src={ampliada.imagem} alt={ampliada.foto.legenda || 'Foto do equipamento'} className="mx-auto max-h-[65vh] rounded-lg object-contain" />
          <p className="mt-2 text-center text-xs text-slate-500">
            {fmt.dataHora(ampliada.foto.em)} · {ampliada.foto.usuario}
          </p>
        </Modal>
      )}
      {camera && <CameraModal onFechar={() => setCamera(false)} onFoto={(d) => adicionar(d)} />}
      <ConfirmDialog
        aberto={!!excluindo}
        mensagem="Excluir esta foto? Não dá para desfazer."
        onConfirmar={() => {
          const f = excluindo!
          setExcluindo(null)
          void executar(() => alterar('os:excluirFoto', f.id), { notificar, sucesso: 'Foto excluída.' })
        }}
        onCancelar={() => setExcluindo(null)}
      />
    </section>
  )
}

/** Câmera do computador (webcam ou câmera USB): mostra a imagem ao vivo e tira quantas fotos quiser. */
function CameraModal({ onFechar, onFoto }: { onFechar: () => void; onFoto: (d: { imagem: string; miniatura: string }) => Promise<boolean> }) {
  const video = useRef<HTMLVideoElement>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraId] = useState('')
  const [erro, setErro] = useState('')
  const [tiradas, setTiradas] = useState(0)

  useEffect(() => {
    let fluxo: MediaStream | null = null
    let cancelado = false
    navigator.mediaDevices
      .getUserMedia({ video: cameraId ? { deviceId: { exact: cameraId }, width: { ideal: 1600 } } : { width: { ideal: 1600 } } })
      .then(async (f) => {
        if (cancelado) return f.getTracks().forEach((t) => t.stop())
        fluxo = f
        if (video.current) video.current.srcObject = f
        setErro('')
        const todos = await navigator.mediaDevices.enumerateDevices()
        setCameras(todos.filter((d) => d.kind === 'videoinput'))
      })
      .catch(() => setErro('Nenhuma câmera disponível. Conecte uma webcam ou use "Adicionar fotos" com imagens do celular.'))
    return () => {
      cancelado = true
      fluxo?.getTracks().forEach((t) => t.stop())
    }
  }, [cameraId])

  async function tirar(): Promise<void> {
    const v = video.current
    if (!v || !v.videoWidth) return
    if (await onFoto(await reduzir(v, v.videoWidth, v.videoHeight))) setTiradas((n) => n + 1)
  }

  return (
    <Modal
      aberto
      titulo="Tirar foto do equipamento"
      onFechar={onFechar}
      tamanho="lg"
      rodape={
        <>
          {tiradas > 0 && <span className="mr-auto self-center text-sm text-emerald-700">{tiradas === 1 ? '1 foto tirada' : `${tiradas} fotos tiradas`}</span>}
          <Button variante="secundario" icone={<X size={16} />} onClick={onFechar}>
            Concluir
          </Button>
          <Button icone={<Camera size={16} />} onClick={() => void tirar()} disabled={!!erro}>
            Tirar foto
          </Button>
        </>
      }
    >
      {erro ? (
        <p className="rounded-lg bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">{erro}</p>
      ) : (
        <div className="space-y-3">
          {cameras.length > 1 && (
            <Select
              label="Câmera"
              wrapperClassName="max-w-sm"
              opcoes={cameras.map((c, i) => ({ value: c.deviceId, label: c.label || `Câmera ${i + 1}` }))}
              value={cameraId || cameras[0]?.deviceId}
              onChange={(e) => setCameraId(e.target.value)}
            />
          )}
          <video ref={video} autoPlay playsInline muted className="mx-auto max-h-[55vh] w-full rounded-lg bg-black object-contain" />
        </div>
      )}
    </Modal>
  )
}
