-- Tokens de push (FCM/APNs) por pessoa. Não confundir com a tabela
-- `dispositivos`, que representa hardware de controle de acesso (catracas).
CREATE TABLE IF NOT EXISTS dispositivos_push (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id  UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  plataforma TEXT NOT NULL CHECK (plataforma IN ('android', 'ios', 'web')),
  ativo      BOOLEAN NOT NULL DEFAULT true,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dispositivos_push_token ON dispositivos_push(token);
CREATE INDEX IF NOT EXISTS idx_dispositivos_push_pessoa ON dispositivos_push(pessoa_id) WHERE ativo = true;
