import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/Modal'
import { alternarTema } from '@/lib/tema'
import type { Recurso } from '@shared/permissoes'

// Atalhos de teclado do sistema inteiro. Cada tela marca seu botão principal com
// data-atalho="novo" para o Ctrl+N; a busca da tela é o primeiro campo de pesquisa.

const TELAS: { tecla: string; caminho: string; titulo: string; recurso: Recurso }[] = [
  { tecla: '1', caminho: '/', titulo: 'Início', recurso: 'dashboard' },
  { tecla: '2', caminho: '/vendas', titulo: 'Vendas', recurso: 'vendas' },
  { tecla: '3', caminho: '/produtos', titulo: 'Produtos', recurso: 'produtos' },
  { tecla: '4', caminho: '/estoque', titulo: 'Movimentações', recurso: 'estoque' },
  { tecla: '5', caminho: '/inventario', titulo: 'Inventário', recurso: 'estoque' },
  { tecla: '6', caminho: '/compras', titulo: 'Compras', recurso: 'compras' },
  { tecla: '7', caminho: '/fornecedores', titulo: 'Fornecedores', recurso: 'fornecedores' },
  { tecla: '8', caminho: '/clientes', titulo: 'Clientes', recurso: 'clientes' },
  { tecla: '9', caminho: '/relatorios', titulo: 'Relatórios', recurso: 'relatorios' }
]

const GERAIS: { teclas: string[]; acao: string }[] = [
  { teclas: ['F1'], acao: 'Mostrar esta lista de atalhos' },
  { teclas: ['F2'], acao: 'Nova venda (de qualquer tela)' },
  { teclas: ['Ctrl', 'N'], acao: 'Novo cadastro na tela atual (produto, cliente, compra...)' },
  { teclas: ['Ctrl', 'F'], acao: 'Ir para a busca da tela atual' },
  { teclas: ['Ctrl', 'Shift', 'D'], acao: 'Alternar entre tema claro e escuro' },
  { teclas: ['Esc'], acao: 'Fechar a janela aberta' },
  { teclas: ['Enter'], acao: 'No campo de código: adicionar o produto lido' }
]

const janelaAberta = (): boolean => document.querySelector('[role="dialog"]') !== null

export function Atalhos() {
  const [ajuda, setAjuda] = useState(false)
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const { pode } = useAuth()

  useEffect(() => {
    const abrir = (): void => setAjuda(true)
    window.addEventListener('abrir-atalhos', abrir)
    return () => window.removeEventListener('abrir-atalhos', abrir)
  }, [])

  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()

      if (ctrl && e.shiftKey && k === 'd') {
        e.preventDefault()
        alternarTema()
        return
      }
      if (e.key === 'F1') {
        e.preventDefault()
        if (!janelaAberta()) setAjuda(true)
        return
      }
      // Com uma janela aberta, os atalhos de tela ficam desligados (Esc continua fechando).
      if (janelaAberta()) return

      // Na tela de Vendas, o F2 é tratado pela própria tela.
      if (e.key === 'F2' && pathname !== '/vendas' && pode('vendas')) {
        e.preventDefault()
        navegar('/vendas', { state: { novaVenda: true } })
        return
      }
      if (!ctrl || e.shiftKey || e.altKey) return
      if (k === 'n') {
        const botao = document.querySelector<HTMLButtonElement>('main [data-atalho="novo"]:not(:disabled)')
        if (botao) {
          e.preventDefault()
          botao.click()
        }
        return
      }
      if (k === 'f') {
        const busca = document.querySelector<HTMLInputElement>('main input[type="search"]')
        if (busca) {
          e.preventDefault()
          busca.focus()
          busca.select()
        }
        return
      }
      const tela = TELAS.find((t) => t.tecla === e.key)
      if (tela && pode(tela.recurso)) {
        e.preventDefault()
        navegar(tela.caminho)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [navegar, pathname, pode])

  return (
    <Modal aberto={ajuda} titulo="Atalhos de teclado" onFechar={() => setAjuda(false)} tamanho="lg">
      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Em qualquer tela</h3>
          <ul className="space-y-2">
            {GERAIS.map((a) => (
              <li key={a.acao} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-slate-700">{a.acao}</span>
                <Teclas teclas={a.teclas} />
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Ir para a tela</h3>
          <ul className="space-y-2">
            {TELAS.filter((t) => pode(t.recurso)).map((t) => (
              <li key={t.tecla} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700">{t.titulo}</span>
                <Teclas teclas={['Ctrl', t.tecla]} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  )
}

function Teclas({ teclas }: { teclas: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {teclas.map((t, i) => (
        <kbd key={i} className="min-w-[1.75rem] rounded-md border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-center font-sans text-xs font-medium text-slate-700 shadow-[0_1px_0] shadow-slate-300">
          {t}
        </kbd>
      ))}
    </span>
  )
}
