import type { z } from 'zod'
import type { baixaContaSchema, contaSchema } from '@shared/schemas'
import { dividirParcelas as dividir, saldoConta, somarMeses } from '@shared/dominio'
import type { Conta, FormaPagamento, Venda } from '@shared/tipos'
import { banco } from '../db/conexao'
import { ErroNegocio } from '../erros'
import * as caixa from './caixa'
import * as map from './mapeadores'

// Contas a receber e a pagar. Cada parcela é uma conta; pagamentos/recebimentos são "baixas"
// (parciais ou totais, com juros e desconto) e podem ser estornados. Contas nunca são apagadas:
// são canceladas, com motivo. Recebimentos entram no caixa aberto (todas as formas); pagamentos,
// só quando saem em dinheiro da gaveta.

type DadosConta = z.output<typeof contaSchema>
type DadosBaixa = z.output<typeof baixaContaSchema>

const db = () => banco()
const centavos = (v: number): number => Math.round(v * 100) / 100
const moeda = (v: number): string => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const nomeUsuario = (id: number): string => (db().prepare('SELECT nome FROM usuarios WHERE id = ?').get(id) as { nome: string } | undefined)?.nome ?? '—'

export function buscar(id: number): Conta {
  const r = db().prepare('SELECT * FROM contas WHERE id = ?').get(id) as map.Linha | undefined
  if (!r) throw new ErroNegocio('Conta não encontrada.')
  const baixas = (db().prepare('SELECT * FROM conta_baixas WHERE conta_id = ? ORDER BY id').all(id) as map.Linha[]).map(map.baixaConta)
  return map.conta(r, baixas)
}

function inserir(c: {
  tipo: 'receber' | 'pagar'
  descricao: string
  categoria: string
  clienteId: number | null
  fornecedorId: number | null
  vendaId: number | null
  compraId: number | null
  parcela: number
  parcelas: number
  valor: number
  vencimento: string
  observacao: string
  usuarioId: number
}): number {
  const r = db()
    .prepare(
      `INSERT INTO contas (tipo, descricao, categoria, cliente_id, fornecedor_id, venda_id, compra_id, parcela, parcelas, valor, vencimento, status, observacao, usuario_id, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberta', ?, ?, ?)`
    )
    .run(c.tipo, c.descricao, c.categoria, c.clienteId, c.fornecedorId, c.vendaId, c.compraId, c.parcela, c.parcelas, centavos(c.valor), c.vencimento, c.observacao, c.usuarioId, map.agoraIso())
  return Number(r.lastInsertRowid)
}

function validarReferencias(d: DadosConta): void {
  if (d.clienteId !== null && !db().prepare('SELECT 1 FROM clientes WHERE id = ?').get(d.clienteId)) throw new ErroNegocio('Cliente inválido.', 'clienteId')
  if (d.fornecedorId !== null && !db().prepare('SELECT 1 FROM fornecedores WHERE id = ?').get(d.fornecedorId)) throw new ErroNegocio('Fornecedor inválido.', 'fornecedorId')
  if (d.compraId !== null) {
    const c = db().prepare('SELECT status FROM compras WHERE id = ?').get(d.compraId) as { status: string } | undefined
    if (!c) throw new ErroNegocio('Compra inválida.', 'compraId')
    if (c.status === 'cancelada') throw new ErroNegocio('Compra cancelada não gera conta a pagar.', 'compraId')
  }
}

/** Nova conta (em uma ou mais parcelas mensais) ou edição de uma conta aberta sem pagamentos. */
export function salvar(id: number | null, d: DadosConta, usuarioId: number): Conta[] {
  return db().transaction(() => {
    validarReferencias(d)
    if (id === null) {
      const valores = dividir(d.valor, d.parcelas)
      return valores.map((valor, i) =>
        buscar(
          inserir({
            tipo: d.tipo,
            descricao: d.descricao,
            categoria: d.categoria,
            clienteId: d.tipo === 'receber' ? d.clienteId : null,
            fornecedorId: d.tipo === 'pagar' ? d.fornecedorId : null,
            vendaId: null,
            compraId: d.tipo === 'pagar' ? d.compraId : null,
            parcela: i + 1,
            parcelas: d.parcelas,
            valor,
            vencimento: somarMeses(d.vencimento, i),
            observacao: d.observacao,
            usuarioId
          })
        )
      )
    }
    const atual = buscar(id)
    if (atual.status !== 'aberta') throw new ErroNegocio(`Conta ${atual.status} não pode ser alterada.`)
    if (atual.baixas.some((b) => !b.estornada)) throw new ErroNegocio('Esta conta já tem pagamento registrado: estorne-o antes de alterar.')
    if (atual.vendaId && (d.valor !== atual.valor || d.clienteId !== atual.clienteId)) {
      throw new ErroNegocio('Parcela de venda a prazo: só o vencimento, a descrição e a observação podem ser alterados.', 'valor')
    }
    db()
      .prepare(`UPDATE contas SET descricao = ?, categoria = ?, cliente_id = ?, fornecedor_id = ?, compra_id = ?, valor = ?, vencimento = ?, observacao = ? WHERE id = ?`)
      .run(d.descricao, d.categoria, atual.tipo === 'receber' ? d.clienteId : null, atual.tipo === 'pagar' ? d.fornecedorId : null, atual.tipo === 'pagar' ? d.compraId : null, centavos(d.valor), d.vencimento, d.observacao, id)
    return [buscar(id)]
  })()
}

/** Lança a baixa no caixa aberto: recebimento (qualquer forma) ou pagamento em dinheiro (sai da gaveta). */
function lancarNoCaixa(c: Conta, liquido: number, forma: FormaPagamento, usuarioId: number, estorno = false): void {
  const rotulo = `${c.descricao}${c.parcelas > 1 ? ` (${c.parcela}/${c.parcelas})` : ''}`
  if (c.tipo === 'receber') caixa.lancar('conta_receber', forma, estorno ? -liquido : liquido, `${estorno ? 'Estorno: ' : ''}${rotulo}`, usuarioId)
  else if (forma === 'dinheiro') caixa.lancar('conta_pagar', 'dinheiro', estorno ? liquido : -liquido, `${estorno ? 'Estorno: ' : ''}${rotulo}`, usuarioId)
}

export function baixar(id: number, d: DadosBaixa, usuarioId: number): Conta {
  return db().transaction(() => {
    const c = buscar(id)
    if (c.status !== 'aberta') throw new ErroNegocio(c.status === 'paga' ? 'Esta conta já está quitada.' : 'Conta cancelada não pode ser paga.')
    const saldo = saldoConta(c)
    if (d.valor > saldo + 0.005) throw new ErroNegocio(`O valor (${moeda(d.valor)}) é maior que o saldo da conta (${moeda(saldo)}).`, 'valor')
    if (d.desconto > d.valor + d.juros + 0.005) throw new ErroNegocio('Desconto maior que o valor pago.', 'desconto')
    if (c.tipo === 'receber') caixa.exigirAberto()
    // Pagar em dinheiro com o caixa aberto: o dinheiro sai da gaveta, então precisa estar lá.
    const liquido = centavos(d.valor + d.juros - d.desconto)
    const gaveta = c.tipo === 'pagar' && d.forma === 'dinheiro' ? caixa.dinheiroNaGaveta() : null
    if (gaveta !== null && liquido > gaveta + 0.005) {
      throw new ErroNegocio(`Só há ${moeda(gaveta)} em dinheiro no caixa. Pague em outra forma ou registre um suprimento antes.`, 'forma')
    }
    db()
      .prepare('INSERT INTO conta_baixas (conta_id, em, valor, juros, desconto, forma, usuario_nome) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, map.agoraIso(), centavos(d.valor), centavos(d.juros), centavos(d.desconto), d.forma, nomeUsuario(usuarioId))
    if (saldo - d.valor < 0.005) db().prepare(`UPDATE contas SET status = 'paga' WHERE id = ?`).run(id)
    lancarNoCaixa(c, liquido, d.forma, usuarioId)
    return buscar(id)
  })()
}

export function estornarBaixa(id: number, baixaId: number, motivo: string, usuarioId: number): Conta {
  return db().transaction(() => {
    const c = buscar(id)
    const b = c.baixas.find((x) => x.id === baixaId)
    if (!b) throw new ErroNegocio('Pagamento não encontrado.')
    if (b.estornada) throw new ErroNegocio('Este pagamento já foi estornado.')
    if (c.status === 'cancelada') throw new ErroNegocio('Conta cancelada.')
    db().prepare('UPDATE conta_baixas SET estornada = 1, estornada_em = ?, motivo_estorno = ? WHERE id = ?').run(map.agoraIso(), motivo, baixaId)
    db().prepare(`UPDATE contas SET status = 'aberta' WHERE id = ?`).run(id)
    lancarNoCaixa(c, centavos(b.valor + b.juros - b.desconto), b.forma, usuarioId, true)
    return buscar(id)
  })()
}

export function cancelar(id: number, motivo: string): Conta {
  return db().transaction(() => {
    const c = buscar(id)
    if (c.status === 'cancelada') throw new ErroNegocio('Esta conta já está cancelada.')
    if (c.baixas.some((b) => !b.estornada)) throw new ErroNegocio('Esta conta tem pagamento registrado: estorne-o antes de cancelar.')
    if (c.vendaId) throw new ErroNegocio('Parcela de venda a prazo: cancele a venda (tela de Vendas) para cancelar as parcelas.')
    db().prepare(`UPDATE contas SET status = 'cancelada', motivo_cancelamento = ? WHERE id = ?`).run(motivo, id)
    return buscar(id)
  })()
}

// ---------- Venda a prazo ----------

/** Cria as parcelas a receber de uma venda a prazo (mensais, a partir do primeiro vencimento). */
export function parcelasDaVenda(v: Venda, parcelas: number, primeiroVencimento: string, total: number, usuarioId: number): void {
  dividir(total, parcelas).forEach((valor, i) =>
    inserir({
      tipo: 'receber',
      descricao: `Venda ${v.numero}`,
      categoria: 'Vendas a prazo',
      clienteId: v.clienteId,
      fornecedorId: null,
      vendaId: v.id,
      compraId: null,
      parcela: i + 1,
      parcelas,
      valor,
      vencimento: somarMeses(primeiroVencimento, i),
      observacao: '',
      usuarioId
    })
  )
}

/** Ao cancelar uma venda a prazo: cancela as parcelas (recebimentos precisam ser estornados antes). */
export function cancelarDaVenda(vendaId: number, motivo: string): void {
  const lista = (db().prepare('SELECT id FROM contas WHERE venda_id = ?').all(vendaId) as { id: number }[]).map((r) => buscar(r.id))
  if (lista.some((c) => c.baixas.some((b) => !b.estornada))) {
    throw new ErroNegocio('Esta venda a prazo já tem parcela recebida. Estorne os recebimentos (Contas a receber) antes de cancelar a venda.')
  }
  db().prepare(`UPDATE contas SET status = 'cancelada', motivo_cancelamento = ? WHERE venda_id = ? AND status <> 'cancelada'`).run(`Venda cancelada: ${motivo}`, vendaId)
}
