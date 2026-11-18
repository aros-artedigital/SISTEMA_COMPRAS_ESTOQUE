import { useState } from 'react'
import { Copy, ExternalLink, FileCode2, FolderOpen, MessageCircle } from 'lucide-react'
import type { OrdemServico } from '@shared/tipos'
import { chamar } from '@/data/api'
import { useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { executar } from '@/lib/executar'
import { htmlClienteOS, mensagemWhatsApp, telefoneWhatsApp } from '@/lib/htmlClienteOS'
import { Modal } from './Modal'
import { Button, Textarea } from './ui'

// Enviar a OS ao cliente sem servidor na internet: salva uma página .html (abre no celular, sem internet)
// e abre o WhatsApp do cliente com a mensagem pronta — o arquivo é anexado na conversa.

export function EnviarClienteOS({ os: o, onFechar }: { os: OrdemServico; onFechar: () => void }) {
  const db = useDb()
  const notificar = useToast()
  const cliente = db.clientes.find((c) => c.id === o.clienteId)
  const telefone = telefoneWhatsApp(cliente?.telefone ?? '')
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState(() => mensagemWhatsApp(o, db))

  async function salvar(): Promise<void> {
    let caminho: string | null = null
    const ok = await executar(async () => (caminho = await chamar('os:salvarArquivoCliente', o.id, htmlClienteOS(o, db))), { notificar })
    if (ok && caminho) {
      setArquivo(caminho)
      notificar('sucesso', 'Arquivo da OS salvo. Agora envie pelo WhatsApp ou e-mail.')
    }
  }

  function whatsapp(): void {
    // Abre no navegador/aplicativo do WhatsApp; sem telefone, o próprio WhatsApp pede para escolher o contato.
    window.open(`https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`, '_blank')
  }

  async function copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(mensagem)
      notificar('sucesso', 'Mensagem copiada.')
    } catch {
      notificar('aviso', 'Não foi possível copiar. Selecione o texto e use Ctrl+C.')
    }
  }

  return (
    <Modal aberto titulo={`Enviar a OS ${o.numero} ao cliente`} onFechar={onFechar} tamanho="lg" rodape={<Button onClick={onFechar}>Concluir</Button>}>
      <ol className="space-y-5">
        <li className="flex gap-3">
          <Passo n={1} feito={!!arquivo} />
          <div className="flex-1 space-y-2">
            <p className="font-medium text-slate-800">Salvar o arquivo da OS</p>
            <p className="text-sm text-slate-600">
              Uma página com a situação, o equipamento, o orçamento e a garantia, nas cores da empresa. Abre no celular do cliente mesmo sem internet. A senha do
              equipamento e dados internos não vão no arquivo.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button icone={<FileCode2 size={16} />} variante={arquivo ? 'secundario' : 'primario'} onClick={() => void salvar()}>
                {arquivo ? 'Salvar de novo' : 'Salvar arquivo'}
              </Button>
              {arquivo && (
                <>
                  <Button variante="secundario" icone={<ExternalLink size={16} />} onClick={() => void executar(() => chamar('arquivo:abrir', arquivo), { notificar })}>
                    Ver como o cliente
                  </Button>
                  <Button variante="secundario" icone={<FolderOpen size={16} />} onClick={() => void chamar('arquivo:mostrar', arquivo)}>
                    Mostrar na pasta
                  </Button>
                </>
              )}
            </div>
            {arquivo && <p className="break-all text-xs text-slate-500">{arquivo}</p>}
          </div>
        </li>

        <li className="flex gap-3">
          <Passo n={2} />
          <div className="flex-1 space-y-2">
            <p className="font-medium text-slate-800">Enviar pelo WhatsApp</p>
            <Textarea label="Mensagem" rows={6} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <Button icone={<MessageCircle size={16} />} onClick={whatsapp} disabled={!mensagem.trim()}>
                {telefone ? `Abrir WhatsApp de ${cliente?.nome.split(' ')[0]}` : 'Abrir WhatsApp'}
              </Button>
              <Button variante="secundario" icone={<Copy size={16} />} onClick={() => void copiar()}>
                Copiar mensagem
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              {telefone
                ? `Número: ${cliente?.telefone}. `
                : 'O cliente não tem telefone celular no cadastro: o WhatsApp vai pedir para escolher o contato. '}
              O WhatsApp não deixa anexar arquivos por link: na conversa, clique no clipe (ou arraste o arquivo salvo) para anexar.
            </p>
          </div>
        </li>
      </ol>
    </Modal>
  )
}

function Passo({ n, feito }: { n: number; feito?: boolean }) {
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${feito ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'}`}>
      {feito ? '✓' : n}
    </span>
  )
}
