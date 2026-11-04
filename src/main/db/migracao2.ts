import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

// Migração 2 — preparação para sincronização entre terminais (fase 4):
//  • uuid em todos os registros (identidade global entre terminais);
//  • fila de envio alimentada por gatilhos (sync_fila);
//  • estoque passa a ser exatamente a soma das movimentações, e pode ficar negativo
//    quando movimentações de outros terminais chegam (a regra "não vender sem saldo"
//    continua valendo para as operações feitas no próprio terminal).

/** Tabelas sincronizadas, na ordem em que dependem umas das outras. */
export const TABELAS_SYNC = ['usuarios', 'categorias', 'unidades', 'fornecedores', 'clientes', 'produtos', 'compras', 'movimentacoes'] as const

const AGORA_UTC = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
const NOVO_UUID = `lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
  substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))`
const NAO_APLICANDO = `(SELECT aplicando FROM sync_controle WHERE id = 1) = 0`

/** Colunas de produto que interessam à sincronização (o saldo fica de fora: vem das movimentações). */
const COLUNAS_PRODUTO = ['codigo', 'codigo_barras', 'nome', 'categoria_id', 'unidade_id', 'preco_custo', 'preco_venda', 'estoque_minimo', 'ativo']

function gatilhos(tabela: string): string {
  const mudou =
    tabela === 'produtos' ? ` AND (${COLUNAS_PRODUTO.map((c) => `OLD.${c} IS NOT NEW.${c}`).join(' OR ')})` : ''
  // Movimentações são imutáveis: só a inclusão entra na fila.
  const atualizacao =
    tabela === 'movimentacoes'
      ? ''
      : `
    CREATE TRIGGER sync_${tabela}_au AFTER UPDATE ON ${tabela} WHEN ${NAO_APLICANDO}${mudou} BEGIN
      INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('${tabela}', NEW.uuid, 'salvar', ${AGORA_UTC});
    END;
    CREATE TRIGGER sync_${tabela}_ad AFTER DELETE ON ${tabela} WHEN ${NAO_APLICANDO} BEGIN
      INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('${tabela}', OLD.uuid, 'excluir', ${AGORA_UTC});
    END;`
  // Um gatilho só para a inclusão: gera o uuid (se não veio) e depois põe na fila.
  // (Com dois gatilhos separados a ordem de execução não é garantida.)
  return `
    CREATE TRIGGER sync_${tabela}_ai AFTER INSERT ON ${tabela} BEGIN
      UPDATE ${tabela} SET uuid = ${NOVO_UUID} WHERE id = NEW.id AND uuid IS NULL;
      INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em)
        SELECT '${tabela}', uuid, 'salvar', ${AGORA_UTC} FROM ${tabela} WHERE id = NEW.id AND ${NAO_APLICANDO};
    END;${atualizacao}`
}

/**
 * Garante que o saldo de cada produto é a soma das suas movimentações, lançando um ajuste
 * "Saldo inicial" quando há diferença (ex.: estoque cadastrado antes de existir histórico).
 */
export function reconciliarSaldos(db: Database.Database, motivo = 'Saldo inicial (ajuste para sincronização)'): number {
  const admin = db.prepare(`SELECT id FROM usuarios WHERE perfil = 'admin' ORDER BY id LIMIT 1`).get() as { id: number } | undefined
  if (!admin) return 0
  const diferencas = db
    .prepare(
      `SELECT p.id, p.estoque, p.estoque - COALESCE(SUM(CASE m.tipo WHEN 'saida' THEN -m.quantidade ELSE m.quantidade END), 0) AS diferenca
       FROM produtos p LEFT JOIN movimentacoes m ON m.produto_id = p.id
       GROUP BY p.id HAVING diferenca <> 0`
    )
    .all() as { id: number; estoque: number; diferenca: number }[]
  const ins = db.prepare(
    `INSERT INTO movimentacoes (data, produto_id, tipo, quantidade, saldo_apos, motivo, usuario_id)
     VALUES ((SELECT COALESCE(MIN(data), strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')) FROM movimentacoes WHERE produto_id = ?), ?, 'ajuste', ?, ?, ?, ?)`
  )
  // O ajuste é datado junto da primeira movimentação do produto, para o histórico continuar fazendo sentido.
  for (const d of diferencas) ins.run(d.id, d.id, d.diferenca, d.estoque, motivo, admin.id)
  return diferencas.length
}

export function migracao2(db: Database.Database): void {
  // Produtos: reconstruída para tirar o CHECK (estoque >= 0) e já incluir o uuid.
  db.exec(`
    CREATE TABLE produtos_nova (
      id             INTEGER PRIMARY KEY,
      uuid           TEXT UNIQUE,
      codigo         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      codigo_barras  TEXT    NOT NULL DEFAULT '',
      nome           TEXT    NOT NULL,
      categoria_id   INTEGER NOT NULL REFERENCES categorias (id),
      unidade_id     INTEGER NOT NULL REFERENCES unidades (id),
      preco_custo    REAL    NOT NULL DEFAULT 0 CHECK (preco_custo >= 0),
      preco_venda    REAL    NOT NULL DEFAULT 0 CHECK (preco_venda >= 0),
      estoque        INTEGER NOT NULL DEFAULT 0,
      estoque_minimo INTEGER NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
      ativo          INTEGER NOT NULL DEFAULT 1,
      criado_em      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      atualizado_em  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    INSERT INTO produtos_nova (id, codigo, codigo_barras, nome, categoria_id, unidade_id, preco_custo, preco_venda, estoque, estoque_minimo, ativo, criado_em, atualizado_em)
      SELECT id, codigo, codigo_barras, nome, categoria_id, unidade_id, preco_custo, preco_venda, estoque, estoque_minimo, ativo, criado_em, atualizado_em FROM produtos;
    DROP TABLE produtos;
    ALTER TABLE produtos_nova RENAME TO produtos;
    CREATE INDEX idx_produtos_codigo_barras ON produtos (codigo_barras) WHERE codigo_barras <> '';
    CREATE INDEX idx_produtos_categoria ON produtos (categoria_id);
  `)

  for (const t of TABELAS_SYNC) {
    if (t !== 'produtos') db.exec(`ALTER TABLE ${t} ADD COLUMN uuid TEXT; CREATE UNIQUE INDEX idx_${t}_uuid ON ${t} (uuid);`)
  }

  db.exec(`
    CREATE TABLE sync_fila (
      id          INTEGER PRIMARY KEY,
      tabela      TEXT NOT NULL,
      uuid        TEXT NOT NULL,
      operacao    TEXT NOT NULL CHECK (operacao IN ('salvar', 'excluir')),
      alterado_em TEXT NOT NULL
    );
    CREATE INDEX idx_sync_fila_registro ON sync_fila (tabela, uuid);

    -- aplicando = 1 enquanto alterações vindas do servidor são gravadas (não voltam para a fila).
    CREATE TABLE sync_controle (id INTEGER PRIMARY KEY CHECK (id = 1), aplicando INTEGER NOT NULL DEFAULT 0);
    INSERT INTO sync_controle (id, aplicando) VALUES (1, 0);

    CREATE TABLE sync_conflitos (
      id        INTEGER PRIMARY KEY,
      tabela    TEXT NOT NULL,
      uuid      TEXT NOT NULL,
      descricao TEXT NOT NULL,
      motivo    TEXT NOT NULL,
      em        TEXT NOT NULL,
      resolvido INTEGER NOT NULL DEFAULT 0,
      -- alteração recebida guardada para nova tentativa (ex.: chegou antes do registro de que depende)
      alteracao TEXT
    );

    CREATE TABLE sync_config (id INTEGER PRIMARY KEY CHECK (id = 1), dados TEXT NOT NULL);
  `)

  // O estoque passa a ser derivado das movimentações: fecha a diferença dos saldos já existentes.
  reconciliarSaldos(db)

  for (const t of TABELAS_SYNC) {
    const ids = db.prepare(`SELECT id FROM ${t} WHERE uuid IS NULL`).all() as { id: number }[]
    const upd = db.prepare(`UPDATE ${t} SET uuid = ? WHERE id = ?`)
    for (const { id } of ids) upd.run(randomUUID(), id)
  }

  for (const t of TABELAS_SYNC) db.exec(gatilhos(t))

  // Itens e configurações não têm uuid próprio: alterá-los coloca o "dono" na fila.
  db.exec(`
    CREATE TRIGGER sync_compra_itens_ai AFTER INSERT ON compra_itens WHEN ${NAO_APLICANDO} BEGIN
      INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) SELECT 'compras', uuid, 'salvar', ${AGORA_UTC} FROM compras WHERE id = NEW.compra_id;
    END;
    CREATE TRIGGER sync_compra_itens_ad AFTER DELETE ON compra_itens WHEN ${NAO_APLICANDO} BEGIN
      INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) SELECT 'compras', uuid, 'salvar', ${AGORA_UTC} FROM compras WHERE id = OLD.compra_id;
    END;
    CREATE TRIGGER sync_configuracoes_ai AFTER INSERT ON configuracoes WHEN ${NAO_APLICANDO} BEGIN
      INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('configuracoes', 'configuracoes', 'salvar', ${AGORA_UTC});
    END;
    CREATE TRIGGER sync_configuracoes_au AFTER UPDATE ON configuracoes WHEN ${NAO_APLICANDO} BEGIN
      INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('configuracoes', 'configuracoes', 'salvar', ${AGORA_UTC});
    END;
  `)

  // Tudo o que já existe precisa ser enviado na primeira sincronização deste terminal.
  for (const t of TABELAS_SYNC) {
    db.exec(`INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) SELECT '${t}', uuid, 'salvar', ${AGORA_UTC} FROM ${t} ORDER BY id`)
  }
  db.exec(`INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) SELECT 'configuracoes', 'configuracoes', 'salvar', ${AGORA_UTC} FROM configuracoes`)
}
