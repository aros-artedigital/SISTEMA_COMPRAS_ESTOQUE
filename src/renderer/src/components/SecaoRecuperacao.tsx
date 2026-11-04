import { useEffect, useState } from 'react'
import { Copy, FileDown, LifeBuoy, Printer, ShieldCheck, ShieldAlert } from 'lucide-react'
import type { EstadoRecuperacao } from '@shared/api'
import { chamar } from '@/data/api'
import { useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { executar } from '@/lib/executar'
import { escapar } from '@/lib/relatorio'
import { imprimir, salvarPdf } from '@/lib/saida'
import { ConfirmDialog, Modal } from './Modal'
import { Button, Card, CardHeader } from './ui'
import * as fmt from '@shared/format'

/** Página para imprimir ou salvar o código (guardar fora do computador). */
function htmlCodigo(codigo: string, empresa: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Código de recuperação</title><style>
  @page { size: A4; margin: 25mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; }
  h1 { font-size: 18pt; color: #13294b; margin: 0 0 4px; }
  .codigo { font-family: Consolas, 'Courier New', monospace; font-size: 26pt; letter-spacing: 3px; border: 2px dashed #13294b; padding: 18px; text-align: center; margin: 24px 0; }
  p, li { font-size: 11pt; line-height: 1.5; }
</style></head><body>
  <p>${escapar(empresa)}</p>
  <h1>Código de recuperação do administrador</h1>
  <p>Gestor de Estoque e Compras · gerado em ${escapar(fmt.dataHora(new Date().toISOString().slice(0, 16)))}</p>
  <div class="codigo">${escapar(codigo)}</div>
  <ul>
    <li>Use na tela de login, em <strong>Esqueci minha senha</strong>, se nenhum administrador lembrar a senha.</li>
    <li>Vale uma única vez e em todos os terminais sincronizados. Depois de usar, gere um novo em Configurações.</li>
    <li>Guarde em local seguro, longe do computador. Quem tiver este código pode redefinir a senha de um administrador.</li>
  </ul>
</body></html>`
}

export function SecaoRecuperacao() {
  const notificar = useToast()
  const { configuracoes } = useDb()
  const [estado, setEstado] = useState<EstadoRecuperacao | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  const atualizar = (): void => void chamar('recuperacao:estado').then(setEstado, () => setEstado(null))
  useEffect(atualizar, [])

  async function gerar(): Promise<void> {
    setConfirmar(false)
    await executar(async () => setCodigo(await chamar('recuperacao:gerar')), { notificar })
    atualizar()
  }

  if (!estado) return null
  const html = codigo ? htmlCodigo(codigo, configuracoes.nomeEmpresa) : ''

  return (
    <Card className="xl:col-span-2">
      <CardHeader titulo="Recuperação de acesso" />
      <div className="space-y-3 p-5 text-sm text-slate-600">
        <p className="flex items-start gap-2">
          {estado.existe ? (
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
          ) : (
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-500" />
          )}
          <span>
            {estado.existe ? (
              <>Código de recuperação criado em {fmt.dataHora(estado.criadoEm!)}.</>
            ) : (
              <>
                <strong className="text-slate-800">Nenhum código criado.</strong> Se todos os administradores esquecerem a senha, não haverá como
                entrar no sistema.
              </>
            )}
          </span>
        </p>
        <p>
          O código permite redefinir a senha de um administrador pela tela de login (<em>Esqueci minha senha</em>). Ele é mostrado uma única vez:
          imprima ou salve em PDF e guarde fora do computador.
        </p>
        <Button variante={estado.existe ? 'secundario' : 'primario'} icone={<LifeBuoy size={16} />} onClick={() => (estado.existe ? setConfirmar(true) : void gerar())}>
          {estado.existe ? 'Gerar novo código' : 'Criar código de recuperação'}
        </Button>
      </div>

      <ConfirmDialog
        aberto={confirmar}
        titulo="Gerar novo código"
        textoConfirmar="Gerar novo"
        tom="primario"
        mensagem="O código atual deixará de funcionar. Guarde o novo código em local seguro."
        onConfirmar={gerar}
        onCancelar={() => setConfirmar(false)}
      />

      <Modal
        aberto={codigo !== null}
        titulo="Seu código de recuperação"
        onFechar={() => setCodigo(null)}
        rodape={
          <>
            <Button variante="secundario" icone={<Printer size={16} />} onClick={() => void imprimir(html, {}, notificar)}>Imprimir</Button>
            <Button variante="secundario" icone={<FileDown size={16} />} onClick={() => void salvarPdf(html, 'codigo-recuperacao', {}, notificar)}>
              Salvar PDF
            </Button>
            <Button onClick={() => setCodigo(null)}>Já guardei</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">Anote, imprima ou salve agora. Por segurança, este código não poderá ser exibido de novo.</p>
        <div className="my-5 flex items-center justify-center gap-3">
          <code className="select-all rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 px-5 py-4 font-mono text-2xl font-semibold tracking-widest text-slate-900">
            {codigo}
          </code>
          <button
            onClick={() => void navigator.clipboard.writeText(codigo ?? '').then(() => notificar('sucesso', 'Código copiado.'))}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Copiar código"
          >
            <Copy size={18} />
          </button>
        </div>
        <p className="text-xs text-slate-500">Vale uma única vez e em todos os terminais sincronizados. Quem tiver o código pode redefinir a senha de um administrador.</p>
      </Modal>
    </Card>
  )
}
