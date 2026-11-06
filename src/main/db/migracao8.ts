// Migração 8 — registro de auditoria: quem fez o quê, quando, e o que mudou (antes → depois).
// Fica em cada terminal (não é sincronizado) e não é apagado ao zerar os dados.

export const migracao8 = `
  CREATE TABLE auditoria (
    id           INTEGER PRIMARY KEY,
    em           TEXT    NOT NULL,
    usuario_id   INTEGER,
    usuario_nome TEXT    NOT NULL,
    acao         TEXT    NOT NULL,
    entidade     TEXT    NOT NULL,
    entidade_id  INTEGER,
    descricao    TEXT    NOT NULL,
    -- JSON: [{ "campo": "Preço de venda", "de": "R$ 49,90", "para": "R$ 54,90" }]
    alteracoes   TEXT
  );
  CREATE INDEX idx_auditoria_em ON auditoria (em);
`
