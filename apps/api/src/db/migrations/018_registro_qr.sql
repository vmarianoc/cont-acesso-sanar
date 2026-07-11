-- QR temporário do convite de visitante (lido pelo facial Intelbras ou
-- validado manualmente pelo porteiro)
ALTER TABLE visitantes ADD COLUMN IF NOT EXISTS qr_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitantes_qr ON visitantes(qr_token) WHERE qr_token IS NOT NULL;

-- Códigos de primeiro acesso (auto-cadastro na implantação): gerados apenas
-- quando o síndico dispara; o morador confirma com e-mail/CPF + código.
CREATE TABLE IF NOT EXISTS registro_codigos (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id  UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  codigo     TEXT NOT NULL,
  expira_em  TIMESTAMPTZ NOT NULL,
  usado_em   TIMESTAMPTZ,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_registro_codigos_pessoa ON registro_codigos(pessoa_id);

-- Solicitação de cadastro (novo morador) ainda não tem pessoa/unidade
ALTER TABLE aprovacoes ALTER COLUMN pessoa_id DROP NOT NULL;
ALTER TABLE aprovacoes ALTER COLUMN unidade_id DROP NOT NULL;
