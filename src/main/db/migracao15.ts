// Migração 15 — caixa do dia.
// Cada terminal tem o seu caixa (não sincroniza, como o inventário): abertura com troco, lançamentos
// automáticos de vendas e pagamentos de OS, sangria, suprimento e fechamento com o valor contado.
// Só um caixa aberto por vez (índice único parcial).

export const migracao15 = `
  CREATE TABLE caixa_sessoes (
    id              INTEGER PRIMARY KEY,
    numero          TEXT    NOT NULL UNIQUE,
    status          TEXT    NOT NULL CHECK (status IN ('aberto', 'fechado')),
    aberto_em       TEXT    NOT NULL,
    aberto_por_nome TEXT    NOT NULL,
    troco           REAL    NOT NULL DEFAULT 0 CHECK (troco >= 0),
    fechado_em      TEXT,
    fechado_por_nome TEXT,
    -- JSON { forma: valor } no fechamento
    esperado        TEXT,
    contado         TEXT,
    observacao      TEXT    NOT NULL DEFAULT ''
  );
  CREATE UNIQUE INDEX idx_caixa_um_aberto ON caixa_sessoes (status) WHERE status = 'aberto';

  CREATE TABLE caixa_lancamentos (
    id           INTEGER PRIMARY KEY,
    sessao_id    INTEGER NOT NULL REFERENCES caixa_sessoes (id) ON DELETE CASCADE,
    em           TEXT    NOT NULL,
    tipo         TEXT    NOT NULL CHECK (tipo IN ('venda', 'os', 'cancelamento', 'estorno', 'sangria', 'suprimento')),
    forma        TEXT    NOT NULL,
    -- entradas positivas, saídas negativas
    valor        REAL    NOT NULL,
    descricao    TEXT    NOT NULL,
    usuario_nome TEXT    NOT NULL
  );
  CREATE INDEX idx_caixa_lancamentos_sessao ON caixa_lancamentos (sessao_id);
`
