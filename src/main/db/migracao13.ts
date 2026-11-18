// Migração 13 — pagamentos da ordem de serviço.
// Sinal (com a OS em andamento) e pagamento (pronta/entregue), em uma ou mais formas.
// Um pagamento não é apagado: é estornado (com motivo). Sincronizado junto com a OS.

const AGORA_UTC = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
const NAO_APLICANDO = `(SELECT aplicando FROM sync_controle WHERE id = 1) = 0`
const FILA_DONO = `INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) SELECT 'ordens_servico', uuid, 'salvar', ${AGORA_UTC} FROM ordens_servico WHERE id = NEW.os_id`

export const migracao13 = `
  CREATE TABLE os_pagamentos (
    id             INTEGER PRIMARY KEY,
    os_id          INTEGER NOT NULL REFERENCES ordens_servico (id) ON DELETE CASCADE,
    em             TEXT    NOT NULL,
    tipo           TEXT    NOT NULL CHECK (tipo IN ('sinal', 'pagamento')),
    forma          TEXT    NOT NULL,
    valor          REAL    NOT NULL CHECK (valor > 0),
    usuario_nome   TEXT    NOT NULL,
    estornado      INTEGER NOT NULL DEFAULT 0,
    estornado_em   TEXT,
    motivo_estorno TEXT    NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_os_pagamentos_os ON os_pagamentos (os_id);
  CREATE INDEX idx_os_pagamentos_em ON os_pagamentos (em);

  CREATE TRIGGER sync_os_pagamentos_ai AFTER INSERT ON os_pagamentos WHEN ${NAO_APLICANDO} BEGIN ${FILA_DONO}; END;
  CREATE TRIGGER sync_os_pagamentos_au AFTER UPDATE ON os_pagamentos WHEN ${NAO_APLICANDO} BEGIN ${FILA_DONO}; END;
`
