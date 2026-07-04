-- Runs with search_path already set to the tenant schema.
-- Tokens de conta: redefinição de senha (esqueci-senha) e convite de morador.

CREATE TABLE IF NOT EXISTS tokens_conta (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id  UUID NOT NULL REFERENCES usuarios_tenant(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('reset','convite')),
  token_hash  TEXT NOT NULL,
  expira_em   TIMESTAMPTZ NOT NULL,
  usado_em    TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tokens_conta_hash ON tokens_conta(token_hash);
