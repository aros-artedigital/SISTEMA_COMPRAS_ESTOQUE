// Migração 5 — inventário (contagem de estoque em lote).
// O inventário é um documento de trabalho deste terminal: não é sincronizado.
// O que vai para os outros terminais são os ajustes de estoque gerados ao concluir.

export const migracao5 = `
  CREATE TABLE inventarios (
    id            INTEGER PRIMARY KEY,
    numero        TEXT    NOT NULL UNIQUE,
    descricao     TEXT    NOT NULL DEFAULT '',
    categoria_id  INTEGER REFERENCES categorias (id) ON DELETE SET NULL,
    status        TEXT    NOT NULL CHECK (status IN ('aberto', 'concluido', 'cancelado')),
    criado_em     TEXT    NOT NULL,
    criado_por    INTEGER NOT NULL,
    concluido_em  TEXT,
    concluido_por INTEGER,
    nao_contados_zero INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE inventario_itens (
    id            INTEGER PRIMARY KEY,
    inventario_id INTEGER NOT NULL REFERENCES inventarios (id) ON DELETE CASCADE,
    produto_id    INTEGER NOT NULL REFERENCES produtos (id) ON DELETE CASCADE,
    -- saldo do sistema: na abertura e, depois de concluído, o saldo no momento da conclusão
    saldo_sistema INTEGER NOT NULL,
    contado       INTEGER CHECK (contado IS NULL OR contado >= 0),
    -- diferença aplicada ao concluir (null = não ajustado)
    ajuste        INTEGER,
    UNIQUE (inventario_id, produto_id)
  );
  CREATE INDEX idx_inventario_itens_produto ON inventario_itens (produto_id);
`
