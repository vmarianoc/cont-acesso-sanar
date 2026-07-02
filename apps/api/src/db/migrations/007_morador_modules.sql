-- Runs with search_path already set to the tenant schema.
-- Módulos do app do morador (condar): áreas comuns/reservas, encomendas e
-- autorização de visitante na portaria.

CREATE TABLE IF NOT EXISTS espacos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        TEXT NOT NULL,
  descricao   TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  espaco_id   UUID NOT NULL REFERENCES espacos(id) ON DELETE CASCADE,
  pessoa_id   UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  data        DATE NOT NULL,
  periodo     TEXT,
  status      TEXT NOT NULL DEFAULT 'confirmada' CHECK (status IN ('pendente','confirmada','cancelada')),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (espaco_id, data)
);

CREATE TABLE IF NOT EXISTS encomendas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id       UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  unidade_id      UUID REFERENCES unidades(id) ON DELETE SET NULL,
  remetente       TEXT NOT NULL,
  descricao       TEXT,
  prateleira      TEXT,
  codigo_retirada TEXT,
  status          TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','retirada')),
  recebida_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retirada_em     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS solicitacoes_acesso (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome         TEXT NOT NULL,
  documento    TEXT,
  tipo         TEXT NOT NULL DEFAULT 'visita',
  unidade_id   UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','liberado','recusado')),
  criado_por   UUID,
  decidido_por UUID,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decidido_em  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_unidade_status ON solicitacoes_acesso(unidade_id, status);
CREATE INDEX IF NOT EXISTS idx_encomendas_pessoa_status ON encomendas(pessoa_id, status);
