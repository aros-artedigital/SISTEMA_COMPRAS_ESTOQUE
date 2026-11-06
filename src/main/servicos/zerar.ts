import { join } from 'path'
import type { OpcoesZerar, ResultadoZerar } from '@shared/api'
import { banco } from '../db/conexao'
import { configuracoesPadrao } from '../db/seed'
import { ErroNegocio } from '../erros'
import { criarBackup, pastaDeBackups } from './backup'
import { salvarConfiguracoes } from './dados'
import { agoraIso } from './mapeadores'
import { configurado, lerConfig } from './sync/config'

// "Zerar dados": apaga produtos, estoque, compras e cadastros para começar do zero
// (ex.: depois de testar com os dados de demonstração). Sempre faz backup antes.

export const PALAVRA_CONFIRMACAO = 'ZERAR'

export async function zerarDados(o: OpcoesZerar, usuarioId: number): Promise<ResultadoZerar> {
  if (o.confirmacao.trim().toUpperCase() !== PALAVRA_CONFIRMACAO) {
    throw new ErroNegocio(`Digite ${PALAVRA_CONFIRMACAO} para confirmar.`, 'confirmacao')
  }
  // Conectado ao servidor, apagar só aqui deixaria este terminal diferente dos outros.
  if (configurado(lerConfig())) {
    throw new ErroNegocio('Este terminal está conectado ao servidor de sincronização. Desconecte-o em "Sincronização entre terminais" antes de zerar.')
  }

  const backup = join(pastaDeBackups(), `antes-de-zerar_${agoraIso().replace('T', '_').replace(/:/g, '')}.sqlite`)
  await criarBackup(backup)

  const db = banco()
  const contar = (t: string): number => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n
  const antes = { produtos: contar('produtos'), compras: contar('compras'), movimentacoes: contar('movimentacoes') }

  db.transaction(() => {
    // Não vai para a fila de envio: o terminal não está conectado, e os dados deixam de existir.
    db.prepare('UPDATE sync_controle SET aplicando = 1 WHERE id = 1').run()
    for (const t of ['compra_itens', 'venda_itens', 'movimentacoes', 'vendas', 'compras', 'produtos', 'categorias', 'fornecedores', 'clientes']) {
      db.prepare(`DELETE FROM ${t}`).run()
    }
    if (!o.manterUsuarios) db.prepare('DELETE FROM usuarios WHERE id <> ?').run(usuarioId)
    if (o.restaurarEmpresa) salvarConfiguracoes(configuracoesPadrao)
    db.prepare('DELETE FROM sync_fila').run()
    db.prepare('DELETE FROM sync_conflitos').run()
    db.prepare('UPDATE sync_controle SET aplicando = 0 WHERE id = 1').run()
  })()

  // Tudo o que sobrou (usuários, unidades, configurações) fica pronto para o primeiro envio,
  // caso este terminal seja conectado a um servidor depois.
  const agora = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  for (const t of ['usuarios', 'unidades']) {
    db.prepare(`INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) SELECT '${t}', uuid, 'salvar', ${agora} FROM ${t} ORDER BY id`).run()
  }
  db.prepare(`INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('configuracoes', 'configuracoes', 'salvar', ${agora})`).run()
  db.prepare(`INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) SELECT 'recuperacao', 'recuperacao', 'salvar', ${agora} FROM recuperacao`).run()

  return { backup, ...antes }
}
