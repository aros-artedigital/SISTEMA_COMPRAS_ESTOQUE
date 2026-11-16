// Migração 11 — ordens de serviço (assistência técnica).
//  • ordens_servico: cliente, equipamento, defeito, diagnóstico, laudo, valores e status;
//  • os_itens: peças (do estoque) e serviços (mão de obra);
//  • os_historico: cada mudança de status, com quem e quando;
//  • movimentacoes.os_id: as peças saem do estoque ligadas à OS quando ela fica pronta.
// Sincronizada como as vendas (itens e histórico embutidos no registro da OS).

const AGORA_UTC = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
const NAO_APLICANDO = `(SELECT aplicando FROM sync_controle WHERE id = 1) = 0`
const NOVO_UUID = `lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
  substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))`
const FILA_DONO = (ref: string) =>
  `INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) SELECT 'ordens_servico', uuid, 'salvar', ${AGORA_UTC} FROM ordens_servico WHERE id = ${ref}.os_id`

export const migracao11 = `
  CREATE TABLE ordens_servico (
    id              INTEGER PRIMARY KEY,
    uuid            TEXT UNIQUE,
    numero          TEXT    NOT NULL UNIQUE,
    cliente_id      INTEGER NOT NULL REFERENCES clientes (id),
    status          TEXT    NOT NULL CHECK (status IN ('aberta', 'em_analise', 'aguardando_aprovacao', 'em_execucao', 'pronta', 'entregue', 'cancelada')),
    data_entrada    TEXT    NOT NULL,
    previsao        TEXT,
    tecnico_id      INTEGER REFERENCES usuarios (id),
    equip_tipo      TEXT    NOT NULL DEFAULT '',
    equip_marca     TEXT    NOT NULL DEFAULT '',
    equip_modelo    TEXT    NOT NULL DEFAULT '',
    equip_serie     TEXT    NOT NULL DEFAULT '',
    acessorios      TEXT    NOT NULL DEFAULT '',
    estado_fisico   TEXT    NOT NULL DEFAULT '',
    defeito         TEXT    NOT NULL DEFAULT '',
    diagnostico     TEXT    NOT NULL DEFAULT '',
    laudo           TEXT    NOT NULL DEFAULT '',
    observacao      TEXT    NOT NULL DEFAULT '',
    desconto        REAL    NOT NULL DEFAULT 0 CHECK (desconto >= 0),
    garantia_dias   INTEGER NOT NULL DEFAULT 90 CHECK (garantia_dias >= 0),
    -- 1 = as peças já saíram do estoque (OS pronta ou entregue)
    estoque_baixado INTEGER NOT NULL DEFAULT 0,
    concluida_em    TEXT,
    entregue_em     TEXT,
    usuario_id      INTEGER NOT NULL REFERENCES usuarios (id),
    criado_em       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    atualizado_em   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX idx_os_cliente ON ordens_servico (cliente_id);
  CREATE INDEX idx_os_status ON ordens_servico (status);

  CREATE TABLE os_itens (
    id             INTEGER PRIMARY KEY,
    os_id          INTEGER NOT NULL REFERENCES ordens_servico (id) ON DELETE CASCADE,
    tipo           TEXT    NOT NULL CHECK (tipo IN ('peca', 'servico')),
    produto_id     INTEGER REFERENCES produtos (id),
    descricao      TEXT    NOT NULL DEFAULT '',
    quantidade     INTEGER NOT NULL CHECK (quantidade > 0),
    valor_unitario REAL    NOT NULL CHECK (valor_unitario >= 0),
    CHECK ((tipo = 'peca' AND produto_id IS NOT NULL) OR (tipo = 'servico' AND produto_id IS NULL))
  );
  CREATE INDEX idx_os_itens_os ON os_itens (os_id);
  CREATE INDEX idx_os_itens_produto ON os_itens (produto_id);

  CREATE TABLE os_historico (
    id           INTEGER PRIMARY KEY,
    os_id        INTEGER NOT NULL REFERENCES ordens_servico (id) ON DELETE CASCADE,
    em           TEXT    NOT NULL,
    status       TEXT    NOT NULL,
    usuario_nome TEXT    NOT NULL,
    observacao   TEXT    NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_os_historico_os ON os_historico (os_id);

  ALTER TABLE movimentacoes ADD COLUMN os_id INTEGER REFERENCES ordens_servico (id);

  CREATE TRIGGER sync_ordens_servico_ai AFTER INSERT ON ordens_servico BEGIN
    UPDATE ordens_servico SET uuid = ${NOVO_UUID} WHERE id = NEW.id AND uuid IS NULL;
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em)
      SELECT 'ordens_servico', uuid, 'salvar', ${AGORA_UTC} FROM ordens_servico WHERE id = NEW.id AND ${NAO_APLICANDO};
  END;
  CREATE TRIGGER sync_ordens_servico_au AFTER UPDATE ON ordens_servico WHEN ${NAO_APLICANDO} BEGIN
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('ordens_servico', NEW.uuid, 'salvar', ${AGORA_UTC});
  END;
  CREATE TRIGGER sync_ordens_servico_ad AFTER DELETE ON ordens_servico WHEN ${NAO_APLICANDO} BEGIN
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) VALUES ('ordens_servico', OLD.uuid, 'excluir', ${AGORA_UTC});
  END;
  CREATE TRIGGER sync_os_itens_ai AFTER INSERT ON os_itens WHEN ${NAO_APLICANDO} BEGIN ${FILA_DONO('NEW')}; END;
  CREATE TRIGGER sync_os_itens_ad AFTER DELETE ON os_itens WHEN ${NAO_APLICANDO} BEGIN ${FILA_DONO('OLD')}; END;
  CREATE TRIGGER sync_os_historico_ai AFTER INSERT ON os_historico WHEN ${NAO_APLICANDO} BEGIN ${FILA_DONO('NEW')}; END;
`
