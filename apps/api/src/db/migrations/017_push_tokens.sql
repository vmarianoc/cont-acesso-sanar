-- Tokens de push (FCM Web Push) por pessoa: cada navegador/dispositivo em que
-- o usuário ativou notificações gera um token; o worker de notificações envia
-- para todos os tokens da pessoa e remove os expirados (UNREGISTERED).
CREATE TABLE IF NOT EXISTS push_tokens (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id    UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  plataforma   TEXT NOT NULL DEFAULT 'web' CHECK (plataforma IN ('web','android','ios')),
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_pessoa ON push_tokens(pessoa_id);
