-- This script runs with search_path already set to the tenant schema.
-- All tables are created without schema prefix.

CREATE TABLE IF NOT EXISTS condominios (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome          TEXT NOT NULL,
  cnpj          TEXT,
  endereco      TEXT,
  cidade        TEXT,
  estado        CHAR(2),
  cep           TEXT,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blocos (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  condominio_id  UUID NOT NULL REFERENCES condominios(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  ativo          BOOLEAN NOT NULL DEFAULT true,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unidades (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bloco_id    UUID NOT NULL REFERENCES blocos(id) ON DELETE CASCADE,
  numero      TEXT NOT NULL,
  andar       INTEGER,
  ativa       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pessoas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome          TEXT NOT NULL,
  cpf           TEXT,
  rg            TEXT,
  foto_url      TEXT,
  tipo          TEXT NOT NULL CHECK (tipo IN ('morador','funcionario','visitante','prestador')),
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_cpf ON pessoas(cpf) WHERE cpf IS NOT NULL;

CREATE TABLE IF NOT EXISTS vinculos_unidade (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id      UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  unidade_id     UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  tipo_vinculo   TEXT NOT NULL CHECK (tipo_vinculo IN ('proprietario','inquilino','dependente','funcionario')),
  ativo          BOOLEAN NOT NULL DEFAULT true,
  inicio         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fim            TIMESTAMPTZ,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS veiculos (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id  UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  placa      TEXT NOT NULL,
  modelo     TEXT,
  cor        TEXT,
  ativo      BOOLEAN NOT NULL DEFAULT true,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_veiculos_placa ON veiculos(placa) WHERE ativo = true;

CREATE TABLE IF NOT EXISTS biometrias (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id   UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('facial','digital','iris')),
  template    BYTEA NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS historico_pessoas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id   UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  campo       TEXT NOT NULL,
  valor_antes TEXT,
  valor_depois TEXT,
  alterado_por UUID,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aprovacoes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id     UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  unidade_id    UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','rejeitado')),
  dados         JSONB NOT NULL DEFAULT '{}',
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS historico_aprovacoes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aprovacao_id   UUID NOT NULL REFERENCES aprovacoes(id) ON DELETE CASCADE,
  status         TEXT NOT NULL,
  aprovador_id   UUID,
  observacao     TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auditoria (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id   UUID,
  acao         TEXT NOT NULL,
  tabela       TEXT NOT NULL,
  registro_id  UUID,
  dados_antes  JSONB,
  dados_depois JSONB,
  ip           INET,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dispositivos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome          TEXT NOT NULL,
  tipo          TEXT NOT NULL,
  local         TEXT,
  condominio_id UUID REFERENCES condominios(id),
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispositivo_id      UUID NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
  tipo_comando        TEXT NOT NULL,
  payload             JSONB NOT NULL DEFAULT '{}',
  executado           BOOLEAN NOT NULL DEFAULT false,
  executado_em        TIMESTAMPTZ,
  ultimo_heartbeat    TIMESTAMPTZ,
  status_dispositivo  TEXT,
  versao_fw           TEXT,
  tentativas          INTEGER NOT NULL DEFAULT 0,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eventos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispositivo_id  UUID NOT NULL,
  pessoa_id       UUID REFERENCES pessoas(id),
  tipo            TEXT NOT NULL,
  resultado       TEXT NOT NULL CHECK (resultado IN ('liberado','negado','erro')),
  metodo          TEXT NOT NULL CHECK (metodo IN ('facial','qrcode','biometria','manual')),
  foto_url        TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eventos_dispositivo ON eventos(dispositivo_id);
CREATE INDEX IF NOT EXISTS idx_eventos_criado_em ON eventos(criado_em DESC);

CREATE TABLE IF NOT EXISTS visitantes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome                TEXT NOT NULL,
  documento           TEXT,
  foto_url            TEXT,
  unidade_id          UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  pre_autorizado_por  UUID NOT NULL REFERENCES pessoas(id),
  valido_de           TIMESTAMPTZ NOT NULL,
  valido_ate          TIMESTAMPTZ NOT NULL,
  usado               BOOLEAN NOT NULL DEFAULT false,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios_tenant (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id    UUID REFERENCES pessoas(id),
  email        TEXT NOT NULL UNIQUE,
  senha_hash   TEXT NOT NULL,
  perfil       TEXT NOT NULL DEFAULT 'morador' CHECK (perfil IN ('superadmin','admin','porteiro','morador','sindico')),
  ativo        BOOLEAN NOT NULL DEFAULT true,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notificacoes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id    UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  titulo       TEXT NOT NULL,
  mensagem     TEXT NOT NULL,
  tipo         TEXT NOT NULL,
  lida         BOOLEAN NOT NULL DEFAULT false,
  dados        JSONB NOT NULL DEFAULT '{}',
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
