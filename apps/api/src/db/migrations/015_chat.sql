-- Runs with search_path already set to the tenant schema.
-- Chat portaria ↔ morador: uma conversa por unidade.

CREATE TABLE IF NOT EXISTS chat_mensagens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade_id  UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  autor_id    UUID NOT NULL,
  autor_nome  TEXT NOT NULL,
  origem      TEXT NOT NULL CHECK (origem IN ('portaria','morador')),
  texto       TEXT NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_unidade ON chat_mensagens(unidade_id, criado_em DESC);
