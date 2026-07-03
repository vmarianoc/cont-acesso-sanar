-- Ramais da Central SIP (docs/modules/central-sip.md). Cada morador com
-- app recebe um ramal vinculado à sua unidade; a credencial é consumida uma
-- única vez pelo app para registrar o softphone no Flexisip do Edge.
CREATE TABLE IF NOT EXISTS ramais_sip (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id     UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  numero        TEXT NOT NULL,
  usuario_sip   TEXT NOT NULL,
  senha_sip     TEXT NOT NULL,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ramais_sip_numero ON ramais_sip(numero);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ramais_sip_pessoa_ativo ON ramais_sip(pessoa_id) WHERE ativo = true;
