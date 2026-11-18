// Migração 12 — senha do equipamento na ordem de serviço.
// senha_tipo: nenhuma, desenho (padrão de desbloqueio "1-5-9-6"), pin (só números) ou texto.
// A senha não vai para a lista da interface: só é lida pelo canal os:verSenha (com permissão e auditoria).

export const migracao12 = `
  ALTER TABLE ordens_servico ADD COLUMN senha_tipo TEXT NOT NULL DEFAULT 'nenhuma' CHECK (senha_tipo IN ('nenhuma', 'desenho', 'pin', 'texto'));
  ALTER TABLE ordens_servico ADD COLUMN senha TEXT NOT NULL DEFAULT '';
`
