import { Save } from 'lucide-react'
import { db, useDb } from '@/data/store'
import { useToast } from '@/contexts/ToastContext'
import { PageHeader } from '@/components/PageHeader'
import { Button, Card, CardHeader, Checkbox, Input } from '@/components/ui'
import { configuracoesSchema } from '@/lib/schemas'
import { useForm } from '@/lib/useForm'
import * as fmt from '@/lib/format'

export default function Configuracoes() {
  const { configuracoes, compras } = useDb()
  const proximaCompra = String(compras.reduce((m, c) => Math.max(m, c.id), 0) + 1).padStart(4, '0')
  const notificar = useToast()
  const form = useForm({ ...configuracoes, estoqueMinimoPadrao: String(configuracoes.estoqueMinimoPadrao) }, configuracoesSchema)

  function salvar(): void {
    const dados = form.validate()
    if (!dados) return
    db.salvarConfiguracoes(dados)
    notificar('sucesso', 'Configurações salvas.')
  }

  return (
    <>
      <PageHeader
        titulo="Configurações"
        subtitulo="Dados da empresa e preferências do sistema"
        acoes={<Button icone={<Save size={16} />} onClick={salvar}>Salvar alterações</Button>}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader titulo="Dados da empresa" />
          <div className="grid grid-cols-2 gap-4 p-5">
            <Input label="Nome da empresa" obrigatorio wrapperClassName="col-span-2" {...form.bind('nomeEmpresa')} />
            <Input label="CNPJ" {...form.bind('cnpj')} onChange={(e) => form.set('cnpj', fmt.mascaraCnpj(e.target.value))} />
            <Input label="Telefone" {...form.bind('telefone')} onChange={(e) => form.set('telefone', fmt.mascaraTelefone(e.target.value))} />
            <Input label="E-mail" type="email" wrapperClassName="col-span-2" {...form.bind('email')} />
            <Input label="Endereço" wrapperClassName="col-span-2" {...form.bind('endereco')} />
          </div>
        </Card>

        <Card>
          <CardHeader titulo="Estoque e compras" />
          <div className="grid grid-cols-2 gap-4 p-5">
            <Input label="Estoque mínimo padrão" type="number" min="0" hint="Sugerido ao cadastrar novos produtos" {...form.bind('estoqueMinimoPadrao')} />
            <Input label="Prefixo das compras" obrigatorio hint={`Próxima: ${form.values.prefixoCompra}${proximaCompra}`} {...form.bind('prefixoCompra')} />
            <div className="col-span-2">
              <Checkbox
                label="Exibir alertas de estoque mínimo no painel"
                checked={form.values.alertarEstoqueMinimo}
                onChange={(v) => form.set('alertarEstoqueMinimo', v)}
              />
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader titulo="Banco de dados e sincronização" />
          <div className="p-5 text-sm text-slate-600">
            <p>
              Nesta versão os dados são fictícios e ficam apenas na memória (são reiniciados ao fechar o app). O banco local SQLite, backup/restauração e a
              sincronização com o servidor serão configurados aqui nas próximas fases.
            </p>
            {window.api && (
              <p className="mt-3 text-xs text-slate-400">
                Electron {window.api.versions.electron} · Chrome {window.api.versions.chrome} · Node {window.api.versions.node}
              </p>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
