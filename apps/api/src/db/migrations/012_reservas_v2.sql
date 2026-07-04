-- Runs with search_path already set to the tenant schema.
-- Regras de reserva por espaço (períodos, aprovação, antecedência, limite
-- mensal) + presença de visitantes (entrada/saída).

ALTER TABLE espacos ADD COLUMN IF NOT EXISTS periodos JSONB NOT NULL DEFAULT
  '[{"nome":"manhã","inicio":"08:00","fim":"12:00"},{"nome":"tarde","inicio":"13:00","fim":"18:00"},{"nome":"noite","inicio":"19:00","fim":"23:00"}]';
ALTER TABLE espacos ADD COLUMN IF NOT EXISTS exige_aprovacao BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE espacos ADD COLUMN IF NOT EXISTS antecedencia_max_dias INTEGER NOT NULL DEFAULT 60;
ALTER TABLE espacos ADD COLUMN IF NOT EXISTS limite_mensal_por_unidade INTEGER NOT NULL DEFAULT 4;

-- Um período por espaço/dia (antes era o dia inteiro).
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_espaco_id_data_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservas_espaco_data_periodo
  ON reservas (espaco_id, data, COALESCE(periodo, ''))
  WHERE status <> 'cancelada';

DO $$ BEGIN
  ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_status_check;
  ALTER TABLE reservas ADD CONSTRAINT reservas_status_check
    CHECK (status IN ('pendente','confirmada','cancelada'));
END $$;

ALTER TABLE visitantes ADD COLUMN IF NOT EXISTS entrada_em TIMESTAMPTZ;
ALTER TABLE visitantes ADD COLUMN IF NOT EXISTS saida_em TIMESTAMPTZ;
