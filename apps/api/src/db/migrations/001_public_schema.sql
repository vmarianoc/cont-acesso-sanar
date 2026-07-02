CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome          TEXT NOT NULL,
  schema_name   TEXT NOT NULL UNIQUE,
  plano         TEXT NOT NULL DEFAULT 'basico',
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_hierarquia (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pai_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  filho_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pai_id, filho_id)
);

CREATE TABLE IF NOT EXISTS public.licencas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plano           TEXT NOT NULL,
  max_unidades    INTEGER NOT NULL DEFAULT 100,
  max_dispositivos INTEGER NOT NULL DEFAULT 10,
  validade        TIMESTAMPTZ,
  ativa           BOOLEAN NOT NULL DEFAULT true,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.migrations (
  id         SERIAL PRIMARY KEY,
  nome       TEXT NOT NULL UNIQUE,
  aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chave de licença e vínculo ao hardware do Edge (validação pelo Edge Service).
-- ALTERs idempotentes: o schema public é (re)aplicado inteiro a cada migrate.
ALTER TABLE public.licencas ADD COLUMN IF NOT EXISTS license_key TEXT;
ALTER TABLE public.licencas ADD COLUMN IF NOT EXISTS edge_fingerprint TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_licencas_license_key
  ON public.licencas(license_key) WHERE license_key IS NOT NULL;
