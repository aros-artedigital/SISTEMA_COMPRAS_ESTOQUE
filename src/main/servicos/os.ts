import type { z } from 'zod'
import type { osEntradaSchema } from '@shared/schemas'
import { osEmAndamento, proximosStatusOS, rotuloStatusOS } from '@shared/dominio'
import type { OrdemServico, StatusOS } from '@shared/tipos'
import { banco } from '../db/conexao'
import { ErroNegocio } from '../erros'
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
  const linha = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id) as map.Linha | undefined
  if (!linha) throw new ErroNegocio('Ordem de serviço não encontrada.')
  const itens = (db.prepare('SELECT * FROM os_itens WHERE os_id = ? ORDER BY id').all(id) as map.Linha[]).map(map.itemOS)
  const historico = (db.prepare('SELECT * FROM os_historico WHERE os_id = ? ORDER BY id').all(id) as map.Linha[]).map(map.historicoOS)
  return map.ordemServico(linha, itens, historico)
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

export function mudarStatus(id: number, novo: StatusOS, observacao: string, usuarioId: number): OrdemServico {
  const db = banco()
  return db.transaction(() => {
    const o = buscar(id)
    if (o.status === novo) throw new ErroNegocio(`A OS já está "${rotuloStatusOS[novo]}".`)
    if (!proximosStatusOS(o.status).includes(novo)) {
      throw new ErroNegocio(`Uma OS ${rotuloStatusOS[o.status].toLowerCase()} não pode passar para "${rotuloStatusOS[novo]}".`)
    }
    if (novo === 'cancelada' && observacao.trim().length < 3) throw new ErroNegocio('Informe o motivo do cancelamento.', 'observacao')

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

    db.prepare(
      `UPDATE ordens_servico SET status = ?, estoque_baixado = ?, concluida_em = ?, entregue_em = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`
    ).run(novo, map.bool(estoqueBaixado), concluidaEm, novo === 'entregue' ? agora : null, id)
    anotar(id, novo, usuarioId, observacao.trim())
    return buscar(id)
  })()
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
