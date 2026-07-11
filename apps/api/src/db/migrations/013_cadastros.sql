-- Runs with search_path already set to the tenant schema.
-- Cadastros vivos: vaga do veículo, pets, liberação recorrente (prestador),
-- consentimento LGPD do usuário.

ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS vaga TEXT;

CREATE TABLE IF NOT EXISTS pets (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pessoa_id  UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id) ON DELETE SET NULL,
  nome       TEXT NOT NULL,
  especie    TEXT NOT NULL DEFAULT 'cachorro' CHECK (especie IN ('cachorro','gato','ave','outro')),
  raca       TEXT,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recorrência: {"dias":[1..7 ISO, 1=segunda], "hora_inicio":"08:00", "hora_fim":"17:00"}
ALTER TABLE liberacoes_acesso ADD COLUMN IF NOT EXISTS recorrencia JSONB;

ALTER TABLE usuarios_tenant ADD COLUMN IF NOT EXISTS consentimento_em TIMESTAMPTZ;
