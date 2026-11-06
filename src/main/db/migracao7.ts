// Migração 7 — estorno de movimentação.
// O estorno é uma nova movimentação, inversa, que aponta para a original (estorno_de).
// A original nunca é apagada nem alterada: o histórico fica completo.

export const migracao7 = `
  ALTER TABLE movimentacoes ADD COLUMN estorno_de INTEGER REFERENCES movimentacoes (id);
  CREATE UNIQUE INDEX idx_mov_estorno_de ON movimentacoes (estorno_de) WHERE estorno_de IS NOT NULL;
`
