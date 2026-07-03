-- Runs with search_path already set to the tenant schema.
-- Controle de acesso por área: dispositivos e espaços ganham "area" e as
-- liberações (permanentes ou temporárias, geradas por agendamentos) passam a
-- ser validadas pelo Edge via /edge/validate-access.

ALTER TABLE dispositivos ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT 'portaria';
ALTER TABLE espacos ADD COLUMN IF NOT EXISTS area TEXT;

-- Espaços sem área explícita usam o próprio nome normalizado.
UPDATE espacos SET area = lower(regexp_replace(nome, '\s+', '_', 'g')) WHERE area IS NULL;

CREATE TABLE IF NOT EXISTS liberacoes_acesso (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id     UUID REFERENCES pessoas(id) ON DELETE CASCADE,
  visitante_id  UUID REFERENCES visitantes(id) ON DELETE CASCADE,
  area          TEXT NOT NULL,
  metodo        TEXT NOT NULL DEFAULT 'facial' CHECK (metodo IN ('facial','qrcode','biometria','manual')),
  valido_de     TIMESTAMPTZ NOT NULL,
  valido_ate    TIMESTAMPTZ NOT NULL,
  origem_tipo   TEXT NOT NULL DEFAULT 'manual' CHECK (origem_tipo IN ('reserva','visitante','manual')),
  origem_id     UUID,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_por    UUID,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (pessoa_id IS NOT NULL OR visitante_id IS NOT NULL),
  CHECK (valido_ate > valido_de)
);

CREATE INDEX IF NOT EXISTS idx_liberacoes_pessoa_area ON liberacoes_acesso(pessoa_id, area, valido_ate);
CREATE INDEX IF NOT EXISTS idx_liberacoes_visitante ON liberacoes_acesso(visitante_id);
