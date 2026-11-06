// Migração 4 — vendas para clientes.
// A venda é concluída na hora (baixa o estoque); depois disso só pode ser cancelada,
// o que devolve os itens ao estoque. Sincronizada como as compras (itens embutidos).

const AGORA_UTC = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
const NAO_APLICANDO = `(SELECT aplicando FROM sync_controle WHERE id = 1) = 0`
const NOVO_UUID = `lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
  substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))`

export const migracao4 = `
  CREATE TABLE vendas (
    id              INTEGER PRIMARY KEY,
    uuid            TEXT UNIQUE,
    numero          TEXT    NOT NULL UNIQUE,
    cliente_id      INTEGER REFERENCES clientes (id),
    data            TEXT    NOT NULL,
    status          TEXT    NOT NULL CHECK (status IN ('concluida', 'cancelada')),
    forma_pagamento TEXT    NOT NULL,
    desconto        REAL    NOT NULL DEFAULT 0 CHECK (desconto >= 0),
    observacao      TEXT    NOT NULL DEFAULT '',
    usuario_id      INTEGER NOT NULL REFERENCES usuarios (id),
    cancelada_em    TEXT,
    motivo_cancelamento TEXT NOT NULL DEFAULT '',
    criado_em       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX idx_vendas_cliente ON vendas (cliente_id);
  CREATE INDEX idx_vendas_data ON vendas (data);

  CREATE TABLE venda_itens (
    id             INTEGER PRIMARY KEY,
    venda_id       INTEGER NOT NULL REFERENCES vendas (id) ON DELETE CASCADE,
    produto_id     INTEGER NOT NULL REFERENCES produtos (id),
    quantidade     INTEGER NOT NULL CHECK (quantidade > 0),
    valor_unitario REAL    NOT NULL CHECK (valor_unitario >= 0),
    UNIQUE (venda_id, produto_id)
  );
  CREATE INDEX idx_venda_itens_produto ON venda_itens (produto_id);

  ALTER TABLE movimentacoes ADD COLUMN venda_id INTEGER REFERENCES vendas (id);

  CREATE TRIGGER sync_vendas_ai AFTER INSERT ON vendas BEGIN
    UPDATE vendas SET uuid = ${NOVO_UUID} WHERE id = NEW.id AND uuid IS NULL;
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em)
      SELECT 'vendas', uuid, 'salvar', ${AGORA_UTC} FROM vendas WHERE id = NEW.id AND ${NAO_APLICANDO};
  END;
  CREATE TRIGGER sync_vendas_au AFTER UPDATE ON vendas WHEN ${NAO_APLICANDO} BEGIN
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('vendas', NEW.uuid, 'salvar', ${AGORA_UTC});
  END;
  CREATE TRIGGER sync_vendas_ad AFTER DELETE ON vendas WHEN ${NAO_APLICANDO} BEGIN
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('vendas', OLD.uuid, 'excluir', ${AGORA_UTC});
  END;
  CREATE TRIGGER sync_venda_itens_ai AFTER INSERT ON venda_itens WHEN ${NAO_APLICANDO} BEGIN
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) SELECT 'vendas', uuid, 'salvar', ${AGORA_UTC} FROM vendas WHERE id = NEW.venda_id;
  END;
`
