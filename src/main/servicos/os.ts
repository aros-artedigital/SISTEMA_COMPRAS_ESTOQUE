import type { z } from 'zod'
import type { osEntradaSchema } from '@shared/schemas'
import { osEmAndamento, pagoOS, proximosStatusOS, rotuloStatusOS, saldoOS, totalOS } from '@shared/dominio'
import type { FormaPagamento, FotoOS, OrdemServico, SenhaOS, StatusOS } from '@shared/tipos'
import { banco } from '../db/conexao'
import { ErroNegocio } from '../erros'
import { lerConfiguracoes } from './dados'
import { lancarMovimentacao } from './estoque'
import * as map from './mapeadores'
import { lerConfig } from './sync/config'

// Ordens de serviço (assistência técnica).
// Enquanto está em atendimento, a OS pode ser editada à vontade. Ao ficar pronta (ou ser entregue
// direto), as peças saem do estoque ligadas à OS; reabrir ou cancelar uma OS pronta devolve as peças.
// Entregue e cancelada são finais. Cada mudança de status fica no histórico.

type DadosOS = z.output<typeof osEntradaSchema>

export function buscar(id: number): OrdemServico {
  const db = banco()
  const linha = db.prepare('SELECT o.*, (SELECT COUNT(*) FROM os_fotos f WHERE f.os_id = o.id) AS qtd_fotos FROM ordens_servico o WHERE o.id = ?').get(id) as map.Linha | undefined
  if (!linha) throw new ErroNegocio('Ordem de serviço não encontrada.')
  const itens = (db.prepare('SELECT * FROM os_itens WHERE os_id = ? ORDER BY id').all(id) as map.Linha[]).map(map.itemOS)
  const historico = (db.prepare('SELECT * FROM os_historico WHERE os_id = ? ORDER BY id').all(id) as map.Linha[]).map(map.historicoOS)
  const pagamentos = (db.prepare('SELECT * FROM os_pagamentos WHERE os_id = ? ORDER BY id').all(id) as map.Linha[]).map(map.pagamentoOS)
  const assinaturas = (db.prepare('SELECT * FROM os_assinaturas WHERE os_id = ? ORDER BY id').all(id) as map.Linha[]).map(map.assinaturaOS)
  return map.ordemServico(linha, itens, historico, pagamentos, assinaturas)
}

/** OS-0001, ou OS-A0001 com sincronização (o código do terminal evita números repetidos). */
function proximoNumero(): string {
  const prefixo = `OS-${lerConfig().codigo}`
  const { n } = banco().prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM ordens_servico').get() as { n: number }
  let numero = `${prefixo}${String(n).padStart(4, '0')}`
  for (let i = n + 1; banco().prepare('SELECT 1 FROM ordens_servico WHERE numero = ?').get(numero); i++) {
    numero = `${prefixo}${String(i).padStart(4, '0')}`
  }
  return numero
}

const moeda = (v: number): string => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const nomeUsuario = (id: number): string => (banco().prepare('SELECT nome FROM usuarios WHERE id = ?').get(id) as { nome: string } | undefined)?.nome ?? '—'

function anotar(osId: number, status: StatusOS, usuarioId: number, observacao: string): void {
  banco()
    .prepare('INSERT INTO os_historico (os_id, em, status, usuario_nome, observacao) VALUES (?, ?, ?, ?, ?)')
    .run(osId, map.agoraIso(), status, nomeUsuario(usuarioId), observacao)
}

export function salvar(id: number | null, d: DadosOS, usuarioId: number): OrdemServico {
  const db = banco()
  return db.transaction(() => {
    const cliente = db.prepare('SELECT ativo FROM clientes WHERE id = ?').get(d.clienteId) as { ativo: number } | undefined
    if (!cliente) throw new ErroNegocio('Cliente inválido.', 'clienteId')
    if (d.tecnicoId !== null) {
      const t = db.prepare('SELECT ativo FROM usuarios WHERE id = ?').get(d.tecnicoId) as { ativo: number } | undefined
      if (!t) throw new ErroNegocio('Técnico inválido.', 'tecnicoId')
    }
    for (const item of d.itens) {
      if (item.tipo !== 'peca') continue
      const p = db.prepare('SELECT nome, ativo FROM produtos WHERE id = ?').get(item.produtoId) as { nome: string; ativo: number } | undefined
      if (!p) throw new ErroNegocio('Produto inválido na lista de peças.', 'itens')
    }

    const campos = {
      cliente_id: d.clienteId,
      previsao: d.previsao,
      tecnico_id: d.tecnicoId,
      equip_tipo: d.equipTipo,
      equip_marca: d.equipMarca,
      equip_modelo: d.equipModelo,
      equip_serie: d.equipSerie,
      acessorios: d.acessorios,
      estado_fisico: d.estadoFisico,
      defeito: d.defeito,
      diagnostico: d.diagnostico,
      laudo: d.laudo,
      observacao: d.observacao,
      desconto: map.dinheiro(d.desconto),
      garantia_dias: d.garantiaDias
    }

    if (id === null) {
      if (!cliente.ativo) throw new ErroNegocio('Cliente inativo.', 'clienteId')
      const todos = { numero: proximoNumero(), status: 'aberta', data_entrada: map.agoraIso(), usuario_id: usuarioId, ...campos }
      const r = db
        .prepare(`INSERT INTO ordens_servico (${Object.keys(todos).join(', ')}) VALUES (${Object.keys(todos).map(() => '?').join(', ')})`)
        .run(...Object.values(todos))
      id = Number(r.lastInsertRowid)
      anotar(id, 'aberta', usuarioId, 'Equipamento recebido')
    } else {
      const atual = buscar(id)
      if (!osEmAndamento(atual.status)) {
        throw new ErroNegocio(`OS ${rotuloStatusOS[atual.status].toLowerCase()} não pode ser alterada.${atual.status === 'pronta' ? ' Reabra a OS para mudar peças ou serviços.' : ''}`)
      }
      db.prepare(
        `UPDATE ordens_servico SET ${Object.keys(campos).map((c) => `${c} = ?`).join(', ')}, atualizado_em = datetime('now', 'localtime') WHERE id = ?`
      ).run(...Object.values(campos), id)
      db.prepare('DELETE FROM os_itens WHERE os_id = ?').run(id)
    }

    // Senha só muda quando a tela manda (ausente = mantém a atual).
    if (d.senha) db.prepare('UPDATE ordens_servico SET senha_tipo = ?, senha = ? WHERE id = ?').run(d.senha.tipo, d.senha.tipo === 'nenhuma' ? '' : d.senha.valor, id)

    // O total não pode ficar menor do que já foi pago pelo cliente.
    const pago = pagoOS(buscar(id))
    const novoTotal = Math.max(0, d.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0) - d.desconto)
    if (pago > novoTotal + 0.005) throw new ErroNegocio(`O total da OS (${moeda(novoTotal)}) ficaria menor que o já recebido (${moeda(pago)}). Estorne o pagamento antes.`, 'desconto')

    const ins = db.prepare('INSERT INTO os_itens (os_id, tipo, produto_id, descricao, quantidade, valor_unitario) VALUES (?, ?, ?, ?, ?, ?)')
    for (const i of d.itens) ins.run(id, i.tipo, i.produtoId, i.descricao, i.quantidade, map.dinheiro(i.valorUnitario))
    return buscar(id)
  })()
}

/** Peças saem do estoque (OS pronta/entregue) ou voltam (reaberta/cancelada), ligadas à OS. */
function movimentarPecas(o: OrdemServico, tipo: 'saida' | 'entrada', motivo: string, usuarioId: number): void {
  for (const i of o.itens) {
    if (i.tipo !== 'peca' || i.produtoId === null) continue
    lancarMovimentacao({ produtoId: i.produtoId, tipo, quantidade: i.quantidade, motivo, usuarioId, osId: o.id })
  }
}

type Recebimento = { forma: FormaPagamento; valor: number }

/** Grava pagamentos (dentro da transação de quem chama). Não deixa receber mais do que o saldo. */
function lancarPagamentos(o: OrdemServico, pagamentos: Recebimento[], usuarioId: number): void {
  if (!pagamentos.length) return
  if (o.status === 'cancelada') throw new ErroNegocio('OS cancelada não recebe pagamentos.')
  const soma = Math.round(pagamentos.reduce((s, p) => s + p.valor, 0) * 100) / 100
  const saldo = saldoOS(o)
  if (totalOS(o) <= 0) throw new ErroNegocio('A OS ainda não tem valor: preencha o orçamento antes de receber.', 'pagamento')
  if (soma > saldo + 0.005) throw new ErroNegocio(`O valor (${moeda(soma)}) é maior que o que falta receber (${moeda(saldo)}).`, 'pagamento')
  const tipo = osEmAndamento(o.status) ? 'sinal' : 'pagamento'
  const ins = banco().prepare('INSERT INTO os_pagamentos (os_id, em, tipo, forma, valor, usuario_nome) VALUES (?, ?, ?, ?, ?, ?)')
  for (const p of pagamentos) ins.run(o.id, map.agoraIso(), tipo, p.forma, map.dinheiro(p.valor), nomeUsuario(usuarioId))
}

export function receber(id: number, pagamentos: Recebimento[], usuarioId: number): OrdemServico {
  return banco().transaction(() => {
    lancarPagamentos(buscar(id), pagamentos, usuarioId)
    return buscar(id)
  })()
}

export function estornarPagamento(osId: number, pagamentoId: number, motivo: string): OrdemServico {
  const db = banco()
  return db.transaction(() => {
    const p = db.prepare('SELECT estornado FROM os_pagamentos WHERE id = ? AND os_id = ?').get(pagamentoId, osId) as { estornado: number } | undefined
    if (!p) throw new ErroNegocio('Pagamento não encontrado.')
    if (p.estornado) throw new ErroNegocio('Este pagamento já foi estornado.')
    db.prepare('UPDATE ordens_servico SET atualizado_em = datetime(\'now\', \'localtime\') WHERE id = ?').run(osId)
    db.prepare('UPDATE os_pagamentos SET estornado = 1, estornado_em = ?, motivo_estorno = ? WHERE id = ?').run(map.agoraIso(), motivo, pagamentoId)
    return buscar(osId)
  })()
}

export function mudarStatus(
  id: number,
  novo: StatusOS,
  observacao: string,
  usuarioId: number,
  opcoes: { pagamentos: Recebimento[]; entregarComSaldo: boolean } = { pagamentos: [], entregarComSaldo: false }
): OrdemServico {
  const db = banco()
  return db.transaction(() => {
    const o = buscar(id)
    if (o.status === novo) throw new ErroNegocio(`A OS já está "${rotuloStatusOS[novo]}".`)
    if (!proximosStatusOS(o.status).includes(novo)) {
      throw new ErroNegocio(`Uma OS ${rotuloStatusOS[o.status].toLowerCase()} não pode passar para "${rotuloStatusOS[novo]}".`)
    }
    if (novo === 'cancelada' && observacao.trim().length < 3) throw new ErroNegocio('Informe o motivo do cancelamento.', 'observacao')

    // Entrega: registra o que foi recebido agora e confere o saldo.
    if (novo === 'entregue') {
      lancarPagamentos({ ...o, status: 'pronta' }, opcoes.pagamentos, usuarioId)
      const falta = saldoOS(buscar(id))
      if (falta > 0 && !opcoes.entregarComSaldo) {
        throw new ErroNegocio(`Falta receber ${moeda(falta)}. Registre o pagamento ou confirme a entrega com valor a receber.`, 'pagamento')
      }
    } else if (opcoes.pagamentos.length) {
      throw new ErroNegocio('Pagamentos junto com a mudança de status só na entrega.')
    }

    const agora = map.agoraIso()
    let estoqueBaixado = o.estoqueBaixado
    let concluidaEm = o.concluidaEm

    if ((novo === 'pronta' || novo === 'entregue') && !estoqueBaixado) {
      // Confere o saldo de cada peça; sem saldo, nada muda.
      movimentarPecas(o, 'saida', `Ordem de serviço ${o.numero}`, usuarioId)
      estoqueBaixado = true
      concluidaEm = concluidaEm ?? agora
    }
    if ((novo === 'cancelada' || osEmAndamento(novo)) && estoqueBaixado) {
      movimentarPecas(o, 'entrada', `${novo === 'cancelada' ? 'Cancelamento' : 'Reabertura'} da ordem de serviço ${o.numero}`, usuarioId)
      estoqueBaixado = false
      concluidaEm = null
    }

    // O equipamento voltou para o cliente: a senha dele deixa de ser guardada (se configurado).
    if ((novo === 'entregue' || novo === 'cancelada') && o.senhaTipo !== 'nenhuma' && lerConfiguracoes().apagarSenhaOs) {
      db.prepare(`UPDATE ordens_servico SET senha_tipo = 'nenhuma', senha = '' WHERE id = ?`).run(id)
    }

    db.prepare(
      `UPDATE ordens_servico SET status = ?, estoque_baixado = ?, concluida_em = ?, entregue_em = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`
    ).run(novo, map.bool(estoqueBaixado), concluidaEm, novo === 'entregue' ? agora : null, id)
    anotar(id, novo, usuarioId, observacao.trim())
    return buscar(id)
  })()
}

/** Senha do equipamento (quem chama confere a permissão e registra na auditoria). */
export function verSenha(id: number): SenhaOS {
  const r = banco().prepare('SELECT senha_tipo, senha FROM ordens_servico WHERE id = ?').get(id) as { senha_tipo: SenhaOS['tipo']; senha: string } | undefined
  if (!r) throw new ErroNegocio('Ordem de serviço não encontrada.')
  return { tipo: r.senha_tipo, valor: r.senha }
}

export function excluir(id: number): void {
  const db = banco()
  const o = buscar(id)
  if (o.status === 'entregue') throw new ErroNegocio('OS entregue não pode ser excluída.')
  if (db.prepare('SELECT 1 FROM movimentacoes WHERE os_id = ? LIMIT 1').get(id)) {
    throw new ErroNegocio('Esta OS já movimentou o estoque (peças usadas). Cancele-a em vez de excluir.')
  }
  db.prepare('DELETE FROM ordens_servico WHERE id = ?').run(id) // itens e histórico saem por ON DELETE CASCADE
}

// ---------- Assinaturas ----------

export function assinar(id: number, d: { tipo: 'entrada' | 'retirada'; nome: string; imagem: string }): OrdemServico {
  const db = banco()
  return db.transaction(() => {
    const o = buscar(id)
    if (o.status === 'cancelada') throw new ErroNegocio('OS cancelada não recebe assinatura.')
    if (d.tipo === 'retirada' && o.status !== 'pronta' && o.status !== 'entregue') {
      throw new ErroNegocio('A assinatura de retirada é colhida quando o equipamento está pronto ou é entregue.')
    }
    db.prepare('DELETE FROM os_assinaturas WHERE os_id = ? AND tipo = ?').run(id, d.tipo)
    db.prepare('INSERT INTO os_assinaturas (os_id, tipo, nome, imagem, em) VALUES (?, ?, ?, ?, ?)').run(id, d.tipo, d.nome, d.imagem, map.agoraIso())
    return buscar(id)
  })()
}

export function removerAssinatura(id: number, tipo: 'entrada' | 'retirada'): OrdemServico {
  const n = banco().prepare('DELETE FROM os_assinaturas WHERE os_id = ? AND tipo = ?').run(id, tipo).changes
  if (!n) throw new ErroNegocio('Assinatura não encontrada.')
  return buscar(id)
}

// ---------- Fotos (só neste terminal) ----------

const MAXIMO_FOTOS = 20

export function listarFotos(id: number): FotoOS[] {
  buscar(id)
  return (banco().prepare('SELECT id, os_id, em, legenda, miniatura, usuario_nome FROM os_fotos WHERE os_id = ? ORDER BY id').all(id) as map.Linha[]).map(map.fotoOS)
}

export function foto(fotoId: number): { osId: number; imagem: string } {
  const r = banco().prepare('SELECT os_id, imagem FROM os_fotos WHERE id = ?').get(fotoId) as map.Linha | undefined
  if (!r) throw new ErroNegocio('Foto não encontrada.')
  return { osId: r.os_id, imagem: map.imagemFoto(r) }
}

const binario = (dataUrl: string): Buffer => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')

export function adicionarFoto(id: number, d: { imagem: string; miniatura: string; legenda: string }, usuarioId: number): FotoOS {
  const db = banco()
  const o = buscar(id)
  if (o.qtdFotos >= MAXIMO_FOTOS) throw new ErroNegocio(`Cada OS pode ter até ${MAXIMO_FOTOS} fotos.`)
  const r = db
    .prepare('INSERT INTO os_fotos (os_id, em, legenda, imagem, miniatura, usuario_nome) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, map.agoraIso(), d.legenda, binario(d.imagem), binario(d.miniatura), nomeUsuario(usuarioId))
  return map.fotoOS(db.prepare('SELECT id, os_id, em, legenda, miniatura, usuario_nome FROM os_fotos WHERE id = ?').get(Number(r.lastInsertRowid)) as map.Linha)
}

export function excluirFoto(fotoId: number): number {
  const r = banco().prepare('SELECT os_id FROM os_fotos WHERE id = ?').get(fotoId) as { os_id: number } | undefined
  if (!r) throw new ErroNegocio('Foto não encontrada.')
  banco().prepare('DELETE FROM os_fotos WHERE id = ?').run(fotoId)
  return r.os_id
}
