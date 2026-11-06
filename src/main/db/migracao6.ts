// Migração 6 — recebimento parcial de compras.
// Cada item guarda quanto já foi recebido. Enquanto faltar algo, a compra continua "pedido"
// (a tela mostra "Parcial"); quando tudo chega, vira "recebida".

export const migracao6 = `
  ALTER TABLE compra_itens ADD COLUMN quantidade_recebida INTEGER NOT NULL DEFAULT 0;
  -- Compras já recebidas antes desta versão receberam tudo.
  UPDATE compra_itens SET quantidade_recebida = quantidade WHERE compra_id IN (SELECT id FROM compras WHERE status = 'recebida');

  -- Receber parte de um item altera a compra: ela vai para a fila de envio.
  CREATE TRIGGER sync_compra_itens_au AFTER UPDATE ON compra_itens WHEN (SELECT aplicando FROM sync_controle WHERE id = 1) = 0 BEGIN
    INSERT INTO sync_fila (tabela, uuid, operacao, alterado_em)
      SELECT 'compras', uuid, 'salvar', strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM compras WHERE id = NEW.compra_id;
  END;
`
