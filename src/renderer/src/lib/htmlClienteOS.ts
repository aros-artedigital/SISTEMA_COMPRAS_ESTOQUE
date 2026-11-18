import type { Snapshot } from '@shared/api'
import { descreverEquipamento, ETAPAS_OS, fimGarantia, pagoOS, rotuloStatusOS, saldoOS, subtotalOS, totalOS } from '@shared/dominio'
import * as fmt from '@shared/format'
import { coresDoTema } from '@shared/temas'
import type { OrdemServico, StatusOS } from '@shared/tipos'
import { escapar } from './relatorio'

// Página da OS para o cliente: um arquivo .html único (sem internet, sem scripts, sem imagens externas),
// pensado para abrir no celular depois de enviado pelo WhatsApp ou e-mail.
// Nunca leva a senha do equipamento, o técnico nem dados internos — só o que o cliente precisa saber.

const e = (v: string | number | null | undefined): string => escapar(String(v ?? ''))
const quebras = (v: string): string => e(v).replace(/\n/g, '<br>')
const minuscula = (v: string): string => v.charAt(0).toLowerCase() + v.slice(1)

/** Explicação da situação, em linguagem do cliente. */
export function mensagemStatusCliente(o: OrdemServico): string {
  const msgs: Record<StatusOS, string> = {
    aberta: 'Recebemos o seu equipamento e ele está na fila para análise.',
    em_analise: 'Nosso técnico está analisando o equipamento.',
    aguardando_aprovacao: 'O orçamento está pronto e aguarda a sua aprovação. Fale com a gente para aprovar.',
    em_execucao: 'O serviço está sendo realizado.',
    pronta: 'Seu equipamento está pronto e já pode ser retirado.',
    entregue: `Equipamento entregue${o.entregueEm ? ` em ${fmt.data(o.entregueEm)}` : ''}. Obrigado pela preferência!`,
    cancelada: 'Esta ordem de serviço foi cancelada.'
  }
  return msgs[o.status]
}

/** Telefone para o link do WhatsApp: só dígitos, com o 55 do Brasil quando faltar. */
export function telefoneWhatsApp(telefone: string): string {
  const d = fmt.somenteDigitos(telefone)
  if (d.length === 10 || d.length === 11) return `55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d
  return ''
}

export function htmlClienteOS(o: OrdemServico, db: Snapshot, geradoEm = new Date()): string {
  const empresa = db.configuracoes
  const cor = coresDoTema(empresa.tema, empresa.corPrincipal, empresa.corSecundaria)
  const cliente = db.clientes.find((c) => c.id === o.clienteId)
  const produto = (id: number | null) => db.produtos.find((p) => p.id === id)
  const cancelada = o.status === 'cancelada'
  const atual = ETAPAS_OS.indexOf(o.status)

  // Data em que cada etapa foi alcançada (a última vez, se a OS foi reaberta).
  const quando = new Map<StatusOS, string>()
  for (const h of o.historico) quando.set(h.status, h.em)

  const etapas = ETAPAS_OS.map((s, i) => {
    // Entregue é o fim: todas as etapas aparecem concluídas.
    const estado = cancelada ? 'futura' : i < atual || o.status === 'entregue' ? 'feita' : i === atual ? 'atual' : 'futura'
    const data = quando.get(s)
    return `<li class="etapa ${estado}"><span class="bolinha">${estado === 'feita' ? '✓' : i + 1}</span><span class="nome">${e(rotuloStatusOS[s])}${
      estado !== 'futura' && data ? `<small>${e(fmt.dataHora(data))}</small>` : ''
    }</span></li>`
  }).join('')

  const itens = o.itens
    .map((i) => {
      const nome = i.tipo === 'peca' ? (produto(i.produtoId)?.nome ?? 'Peça') : i.descricao
      return `<tr><td>${e(nome)}<small>${i.tipo === 'peca' ? 'Peça' : 'Serviço'}${i.quantidade > 1 ? ` · ${fmt.numero(i.quantidade)} × ${e(fmt.moeda(i.valorUnitario))}` : ''}</small></td><td class="num">${e(fmt.moeda(i.quantidade * i.valorUnitario))}</td></tr>`
    })
    .join('')

  const bloco = (titulo: string, texto: string): string => (texto.trim() ? `<div class="texto"><h3>${e(titulo)}</h3><p>${quebras(texto)}</p></div>` : '')
  const linha = (rotulo: string, valor: string): string => (valor ? `<div class="linha"><span>${e(rotulo)}</span><strong>${e(valor)}</strong></div>` : '')
  const garantiaAte = fimGarantia(o)
  const zap = telefoneWhatsApp(empresa.telefone)

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>OS ${e(o.numero)} — ${e(empresa.nomeEmpresa)}</title>
<style>
  :root { --cor: ${cor.principal}; --escura: ${cor.secundaria}; --fundo: #f1f5f9; --cartao: #fff; --texto: #0f172a; --suave: #64748b; --linha: #e2e8f0; }
  @media (prefers-color-scheme: dark) { :root { --fundo: #0b1220; --cartao: #111a2e; --texto: #e2e8f0; --suave: #94a3b8; --linha: #1e293b; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--fundo); color: var(--texto); font: 15px/1.5 -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; }
  header { background: var(--escura); color: #fff; padding: 20px 16px 56px; }
  header .empresa { font-weight: 700; font-size: 17px; }
  header .contato { opacity: .8; font-size: 13px; }
  main { max-width: 640px; margin: -40px auto 0; padding: 0 12px 32px; }
  .cartao { background: var(--cartao); border-radius: 14px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .topo { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
  .rotulo { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--suave); }
  .numero { font-size: 22px; font-weight: 800; }
  .status { display: inline-block; background: var(--cor); color: #fff; border-radius: 999px; padding: 4px 12px; font-weight: 700; font-size: 13px; white-space: nowrap; }
  .status.cancelada { background: #b91c1c; }
  .mensagem { margin: 12px 0 0; font-size: 16px; }
  ol { list-style: none; margin: 0; padding: 0; }
  .etapa { display: flex; gap: 12px; align-items: flex-start; position: relative; padding-bottom: 14px; }
  .etapa:not(:last-child)::before { content: ''; position: absolute; left: 13px; top: 28px; bottom: 0; width: 2px; background: var(--linha); }
  .etapa.feita:not(:last-child)::before { background: #22c55e; }
  .bolinha { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 700; background: var(--linha); color: var(--suave); }
  .feita .bolinha { background: #22c55e; color: #fff; }
  .atual .bolinha { background: var(--cor); color: #fff; box-shadow: 0 0 0 4px color-mix(in srgb, var(--cor) 25%, transparent); }
  .nome { padding-top: 3px; }
  .atual .nome { font-weight: 700; }
  .futura .nome { color: var(--suave); }
  .nome small, td small { display: block; color: var(--suave); font-size: 12px; font-weight: 400; }
  h2 { font-size: 15px; margin: 0 0 10px; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--suave); margin: 0 0 2px; }
  .texto { margin-top: 10px; } .texto p { margin: 0; }
  .linha { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--linha); }
  .linha:last-child { border-bottom: 0; } .linha span { color: var(--suave); } .linha strong { text-align: right; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 0; border-bottom: 1px solid var(--linha); vertical-align: top; }
  .num { text-align: right; white-space: nowrap; padding-left: 12px; }
  .total td { border: 0; font-size: 18px; font-weight: 800; padding-top: 10px; }
  .sub td { border: 0; color: var(--suave); padding: 2px 0; }
  .botao { display: block; text-align: center; background: #16a34a; color: #fff; text-decoration: none; font-weight: 700; padding: 12px; border-radius: 10px; margin-top: 12px; }
  footer { text-align: center; color: var(--suave); font-size: 12px; padding: 8px 16px 24px; }
</style></head>
<body>
<header>
  <div class="empresa">${e(empresa.nomeEmpresa)}</div>
  <div class="contato">${[empresa.telefone, empresa.email].filter(Boolean).map(e).join(' · ')}</div>
</header>
<main>
  <section class="cartao">
    <div class="topo">
      <div><div class="rotulo">Ordem de serviço</div><div class="numero">${e(o.numero)}</div></div>
      <span class="status${cancelada ? ' cancelada' : ''}">${e(rotuloStatusOS[o.status])}</span>
    </div>
    <p class="mensagem">${e(cliente ? `${cliente.nome.split(' ')[0]}, ${minuscula(mensagemStatusCliente(o))}` : mensagemStatusCliente(o))}</p>
  </section>

  ${cancelada ? '' : `<section class="cartao"><h2>Andamento</h2><ol>${etapas}</ol></section>`}

  <section class="cartao">
    <h2>Equipamento</h2>
    ${linha('Aparelho', descreverEquipamento(o))}
    ${linha('Nº de série / IMEI', o.equipSerie)}
    ${linha('Acessórios deixados', o.acessorios)}
    ${linha('Entrada', fmt.dataHora(o.dataEntrada))}
    ${linha('Previsão de entrega', o.previsao && !['pronta', 'entregue', 'cancelada'].includes(o.status) ? fmt.data(o.previsao) : '')}
    ${bloco('Defeito informado', o.defeito)}
    ${bloco('Diagnóstico', o.diagnostico)}
    ${bloco('Serviço realizado', o.laudo)}
  </section>

  ${
    o.itens.length
      ? `<section class="cartao">
    <h2>${o.status === 'aguardando_aprovacao' ? 'Orçamento' : 'Peças e serviços'}</h2>
    <table>
      ${itens}
      ${o.desconto ? `<tr class="sub"><td>Subtotal</td><td class="num">${e(fmt.moeda(subtotalOS(o)))}</td></tr><tr class="sub"><td>Desconto</td><td class="num">- ${e(fmt.moeda(o.desconto))}</td></tr>` : ''}
      <tr class="total"><td>Total</td><td class="num">${e(fmt.moeda(totalOS(o)))}</td></tr>
      ${pagoOS(o) > 0 && !cancelada ? `<tr class="sub"><td>Já pago</td><td class="num">${e(fmt.moeda(pagoOS(o)))}</td></tr><tr class="sub"><td><strong>Falta pagar</strong></td><td class="num"><strong>${e(fmt.moeda(saldoOS(o)))}</strong></td></tr>` : ''}
    </table>
  </section>`
      : ''
  }

  ${
    o.garantiaDias > 0 && !cancelada
      ? `<section class="cartao"><h2>Garantia</h2><p style="margin:0">${e(
          garantiaAte ? `Garantia de ${o.garantiaDias} dias, válida até ${fmt.data(garantiaAte)}.` : `Garantia de ${o.garantiaDias} dias a partir da entrega.`
        )} Guarde este arquivo.</p></section>`
      : ''
  }

  <section class="cartao">
    <h2>Fale com a gente</h2>
    ${linha('Telefone', empresa.telefone)}
    ${linha('E-mail', empresa.email)}
    ${linha('Endereço', empresa.endereco)}
    ${zap ? `<a class="botao" href="https://wa.me/${zap}?text=${encodeURIComponent(`Olá! Quero falar sobre a ordem de serviço ${o.numero}.`)}">Falar no WhatsApp</a>` : ''}
  </section>
</main>
<footer>Situação em ${e(fmt.dataHora(`${geradoEm.getFullYear()}-${String(geradoEm.getMonth() + 1).padStart(2, '0')}-${String(geradoEm.getDate()).padStart(2, '0')}T${String(geradoEm.getHours()).padStart(2, '0')}:${String(geradoEm.getMinutes()).padStart(2, '0')}:00`))}. Para saber se houve novidade, peça um arquivo atualizado.</footer>
</body></html>`
}

/** Mensagem pronta para o WhatsApp do cliente (o arquivo vai como anexo). */
export function mensagemWhatsApp(o: OrdemServico, db: Snapshot): string {
  const cliente = db.clientes.find((c) => c.id === o.clienteId)
  const partes = [
    `Olá${cliente ? `, ${cliente.nome.split(' ')[0]}` : ''}! Aqui é da ${db.configuracoes.nomeEmpresa}.`,
    `Sua ordem de serviço *${o.numero}* (${descreverEquipamento(o)}) está: *${rotuloStatusOS[o.status]}*.`,
    mensagemStatusCliente(o),
    o.itens.length ? `Total: ${fmt.moeda(totalOS(o))}.` : '',
    saldoOS(o) > 0 && pagoOS(o) > 0 && o.status !== 'cancelada' ? `Já pago: ${fmt.moeda(pagoOS(o))}. Falta pagar: ${fmt.moeda(saldoOS(o))}.` : '',
    'Envio em anexo o arquivo com todos os detalhes.'
  ]
  return partes.filter(Boolean).join('\n')
}
