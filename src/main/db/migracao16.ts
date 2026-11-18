// Migração 16 — contas a receber e a pagar.
//  • contas: cada parcela é uma conta (tipo receber/pagar), ligada ao cliente/fornecedor e, quando houver,
//    à venda a prazo ou à compra que a originou. Status: aberta, paga ou cancelada (nunca é apagada).
//  • conta_baixas: pagamentos/recebimentos (parciais ou totais), com juros e desconto; estornáveis.
//  • caixa_lancamentos passa a aceitar recebimento e pagamento de contas (tabela refeita: o SQLite não
//    altera CHECK de coluna).
// Contas e baixas são sincronizadas (as baixas vão embutidas na conta).

const AGORA_UTC = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
const NAO_APLICANDO = `(SELECT aplicando FROM sync_controle WHERE id = 1) = 0`
const NOVO_UUID = `lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
  substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))`
const FILA_DONO = `INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) SELECT 'contas', uuid, 'salvar', ${AGORA_UTC} FROM contas WHERE id = NEW.conta_id`

export const migracao16 = `
  CREATE TABLE contas (
    id            INTEGER PRIMARY KEY,
    uuid          TEXT UNIQUE,
    tipo          TEXT    NOT NULL CHECK (tipo IN ('receber', 'pagar')),
    descricao     TEXT    NOT NULL,
    categoria     TEXT    NOT NULL DEFAULT '',
    cliente_id    INTEGER REFERENCES clientes (id),
    fornecedor_id INTEGER REFERENCES fornecedores (id),
    venda_id      INTEGER REFERENCES vendas (id),
    compra_id     INTEGER REFERENCES compras (id),
    parcela       INTEGER NOT NULL DEFAULT 1,
    parcelas      INTEGER NOT NULL DEFAULT 1,
    valor         REAL    NOT NULL CHECK (valor > 0),
    vencimento    TEXT    NOT NULL,
    status        TEXT    NOT NULL CHECK (status IN ('aberta', 'paga', 'cancelada')),
    observacao    TEXT    NOT NULL DEFAULT '',
    motivo_cancelamento TEXT NOT NULL DEFAULT '',
    usuario_id    INTEGER NOT NULL REFERENCES usuarios (id),
    criado_em     TEXT    NOT NULL
  );
  CREATE INDEX idx_contas_vencimento ON contas (tipo, status, vencimento);
  CREATE INDEX idx_contas_venda ON contas (venda_id);
  CREATE INDEX idx_contas_compra ON contas (compra_id);

  CREATE TABLE conta_baixas (
    id             INTEGER PRIMARY KEY,
    conta_id       INTEGER NOT NULL REFERENCES contas (id) ON DELETE CASCADE,
    em             TEXT    NOT NULL,
    -- quanto abateu da conta; juros e desconto mudam só o valor que saiu/entrou
    valor          REAL    NOT NULL CHECK (valor > 0),
    juros          REAL    NOT NULL DEFAULT 0 CHECK (juros >= 0),
    desconto       REAL    NOT NULL DEFAULT 0 CHECK (desconto >= 0),
    forma          TEXT    NOT NULL,
    usuario_nome   TEXT    NOT NULL,
    estornada      INTEGER NOT NULL DEFAULT 0,
    estornada_em   TEXT,
    motivo_estorno TEXT    NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_conta_baixas_conta ON conta_baixas (conta_id);
  CREATE INDEX idx_conta_baixas_em ON conta_baixas (em);

  CREATE TRIGGER sync_contas_ai AFTER INSERT ON contas BEGIN
    UPDATE contas SET uuid = ${NOVO_UUID} WHERE id = NEW.id AND uuid IS NULL;
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em)
      SELECT 'contas', uuid, 'salvar', ${AGORA_UTC} FROM contas WHERE id = NEW.id AND ${NAO_APLICANDO};
  END;
  CREATE TRIGGER sync_contas_au AFTER UPDATE ON contas WHEN ${NAO_APLICANDO} BEGIN
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('contas', NEW.uuid, 'salvar', ${AGORA_UTC});
  END;
  CREATE TRIGGER sync_contas_ad AFTER DELETE ON contas WHEN ${NAO_APLICANDO} BEGIN
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('contas', OLD.uuid, 'excluir', ${AGORA_UTC});
  END;
  CREATE TRIGGER sync_conta_baixas_ai AFTER INSERT ON conta_baixas WHEN ${NAO_APLICANDO} BEGIN ${FILA_DONO}; END;
  CREATE TRIGGER sync_conta_baixas_au AFTER UPDATE ON conta_baixas WHEN ${NAO_APLICANDO} BEGIN ${FILA_DONO}; END;

  CREATE TABLE caixa_lancamentos_nova (
    id           INTEGER PRIMARY KEY,
    sessao_id    INTEGER NOT NULL REFERENCES caixa_sessoes (id) ON DELETE CASCADE,
    em           TEXT    NOT NULL,
    tipo         TEXT    NOT NULL CHECK (tipo IN ('venda', 'os', 'cancelamento', 'estorno', 'sangria', 'suprimento', 'conta_receber', 'conta_pagar')),
    forma        TEXT    NOT NULL,
    valor        REAL    NOT NULL,
    descricao    TEXT    NOT NULL,
    usuario_nome TEXT    NOT NULL
  );
  INSERT INTO caixa_lancamentos_nova SELECT id, sessao_id, em, tipo, forma, valor, descricao, usuario_nome FROM caixa_lancamentos;
  DROP TABLE caixa_lancamentos;
  ALTER TABLE caixa_lancamentos_nova RENAME TO caixa_lancamentos;
  CREATE INDEX idx_caixa_lancamentos_sessao ON caixa_lancamentos (sessao_id);
`
