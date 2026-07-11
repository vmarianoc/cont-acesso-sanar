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

-- Billing: faturas por tenant (emitidas via Banco Cora ou baixa manual).
CREATE TABLE IF NOT EXISTS faturas (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  competencia      DATE NOT NULL,
  valor_centavos   INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','paga','cancelada')),
  vencimento       DATE NOT NULL,
  metodo_pagamento TEXT,
  cora_invoice_id  TEXT,
  linha_digitavel  TEXT,
  pix_copia_cola   TEXT,
  pago_em          TIMESTAMPTZ,
  baixa_manual_por UUID,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, competencia)
);
CREATE INDEX IF NOT EXISTS idx_faturas_status ON faturas(status, vencimento);

-- Código curto do condomínio (login da portaria digita isso, não UUID)
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS codigo TEXT;
UPDATE public.tenants
   SET codigo = UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 6))
 WHERE codigo IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_codigo ON public.tenants (UPPER(codigo));
