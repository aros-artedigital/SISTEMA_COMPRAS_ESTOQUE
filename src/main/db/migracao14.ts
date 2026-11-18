// Migração 14 — assinaturas do cliente e fotos do equipamento na OS.
//  • os_assinaturas: assinatura desenhada na tela (PNG em data URL, pequena), na entrada e na retirada.
//    Sincronizada junto com a OS (altera o "dono" na fila).
//  • os_fotos: fotos do equipamento (JPEG reduzido + miniatura). Ficam só neste terminal (não sincronizam:
//    seriam grandes demais para o servidor), mas entram no backup do banco.

const AGORA_UTC = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
const NAO_APLICANDO = `(SELECT aplicando FROM sync_controle WHERE id = 1) = 0`
const FILA_DONO = (ref: string) =>
  `INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em) SELECT 'ordens_servico', uuid, 'salvar', ${AGORA_UTC} FROM ordens_servico WHERE id = ${ref}.os_id`

export const migracao14 = `
  CREATE TABLE os_assinaturas (
    id      INTEGER PRIMARY KEY,
    os_id   INTEGER NOT NULL REFERENCES ordens_servico (id) ON DELETE CASCADE,
    tipo    TEXT    NOT NULL CHECK (tipo IN ('entrada', 'retirada')),
    nome    TEXT    NOT NULL,
    imagem  TEXT    NOT NULL,
    em      TEXT    NOT NULL,
    UNIQUE (os_id, tipo)
  );
  CREATE TRIGGER sync_os_assinaturas_ai AFTER INSERT ON os_assinaturas WHEN ${NAO_APLICANDO} BEGIN ${FILA_DONO('NEW')}; END;
  CREATE TRIGGER sync_os_assinaturas_ad AFTER DELETE ON os_assinaturas WHEN ${NAO_APLICANDO} BEGIN ${FILA_DONO('OLD')}; END;

  CREATE TABLE os_fotos (
    id           INTEGER PRIMARY KEY,
    os_id        INTEGER NOT NULL REFERENCES ordens_servico (id) ON DELETE CASCADE,
    em           TEXT    NOT NULL,
    legenda      TEXT    NOT NULL DEFAULT '',
    imagem       BLOB    NOT NULL,
    miniatura    BLOB    NOT NULL,
    usuario_nome TEXT    NOT NULL
  );
  CREATE INDEX idx_os_fotos_os ON os_fotos (os_id);
`
