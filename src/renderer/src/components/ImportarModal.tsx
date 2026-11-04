import { useState } from 'react'
import { Download, FileUp, Upload } from 'lucide-react'
import type { PreviaImportacao, TipoImportacao } from '@shared/api'
import { chamar } from '@/data/api'
import { alterar } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { executar } from '@/lib/executar'
import { Modal } from './Modal'
import { Badge, Button, Checkbox } from './ui'

const nomes: Record<TipoImportacao, string> = { produtos: 'produtos', fornecedores: 'fornecedores', clientes: 'clientes' }

export function ImportarModal({ tipo, aberto, onFechar }: { tipo: TipoImportacao; aberto: boolean; onFechar: () => void }) {
  const notificar = useToast()
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null)
  const [soErros, setSoErros] = useState(false)

  function fechar(): void {
    setPrevia(null)
    setSoErros(false)
    onFechar()
  }

  async function baixarModelo(): Promise<void> {
    let caminho: string | null = null
    const ok = await executar(async () => (caminho = await chamar('excel:modelo', tipo)), { notificar })
    if (ok && caminho) notificar('sucesso', 'Modelo salvo. Preencha e depois selecione a planilha.', { rotulo: 'Mostrar na pasta', executar: () => void chamar('arquivo:mostrar', caminho!) })
  }

  async function selecionar(): Promise<void> {
    await executar(
      async () => {
        const p = await chamar('excel:previa', tipo)
        if (p) {
          setPrevia(p)
          setSoErros(p.erros > 0 && p.erros < p.linhas.length)
        }
      },
      { notificar }
    )
  }

  async function confirmar(): Promise<void> {
    if (!previa) return
    let msg = ''
    const ok = await executar(
      async () => {
        const r = await alterar('excel:importar', previa.token)
        msg = `Importação concluída: ${r.criados} criado(s), ${r.atualizados} atualizado(s)${r.ignorados ? `, ${r.ignorados} linha(s) com erro ignorada(s)` : ''}.`
      },
      { notificar }
    )
    if (ok) {
      notificar('sucesso', msg)
      fechar()
    }
  }

  const validas = previa ? previa.criar + previa.atualizar : 0
  const linhas = previa ? previa.linhas.filter((l) => !soErros || l.acao === 'erro') : []

  return (
    <Modal
      aberto={aberto}
      titulo={`Importar ${nomes[tipo]} do Excel`}
      onFechar={fechar}
      tamanho="xl"
      rodape={
        previa ? (
          <>
            <Button variante="secundario" onClick={() => setPrevia(null)}>Escolher outro arquivo</Button>
            <Button icone={<Upload size={16} />} disabled={validas === 0} onClick={confirmar}>
              Importar {validas} registro(s)
            </Button>
          </>
        ) : (
          <Button variante="secundario" onClick={fechar}>Fechar</Button>
        )
      }
    >
      {!previa ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 p-5">
            <p className="text-sm font-semibold text-slate-800">1. Baixe o modelo</p>
            <p className="mb-4 mt-1 text-sm text-slate-500">Planilha com as colunas certas, um exemplo e instruções de preenchimento.</p>
            <Button variante="secundario" icone={<Download size={16} />} onClick={baixarModelo}>Baixar modelo</Button>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-5">
            <p className="text-sm font-semibold text-slate-800">2. Selecione a planilha preenchida</p>
            <p className="mb-4 mt-1 text-sm text-slate-500">Nada é gravado ainda: primeiro você vê uma prévia linha a linha.</p>
            <Button icone={<FileUp size={16} />} onClick={selecionar}>Selecionar planilha (.xlsx)</Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-600">
              Arquivo: <strong>{previa.arquivo}</strong>
            </span>
            <Badge cor="verde">{previa.criar} novo(s)</Badge>
            <Badge cor="azul">{previa.atualizar} atualização(ões)</Badge>
            <Badge cor={previa.erros ? 'vermelho' : 'cinza'}>{previa.erros} com erro</Badge>
            {previa.erros > 0 && (
              <span className="ml-auto">
                <Checkbox label="Mostrar só linhas com erro" checked={soErros} onChange={setSoErros} />
              </span>
            )}
          </div>
          {previa.erros > 0 && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Linhas com erro serão ignoradas. Corrija-as na planilha e importe de novo, se preferir.
            </p>
          )}
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  <th className="w-16 px-3 py-2 text-left font-medium">Linha</th>
                  <th className="px-3 py-2 text-left font-medium">Registro</th>
                  <th className="w-32 px-3 py-2 text-left font-medium">Ação</th>
                  <th className="px-3 py-2 text-left font-medium">Observação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.linha} className="border-t border-slate-100">
                    <td className="px-3 py-2 tabular-nums text-slate-500">{l.linha}</td>
                    <td className="px-3 py-2 text-slate-800">{l.descricao}</td>
                    <td className="px-3 py-2">
                      {l.acao === 'erro' ? <Badge cor="vermelho">Erro</Badge> : l.acao === 'criar' ? <Badge cor="verde">Criar</Badge> : <Badge cor="azul">Atualizar</Badge>}
                    </td>
                    <td className={`px-3 py-2 text-xs ${l.erro ? 'text-red-700' : 'text-slate-500'}`}>{l.erro ?? l.avisos.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}
