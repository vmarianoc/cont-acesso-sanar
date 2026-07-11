-- Runs with search_path already set to the tenant schema.
-- LPR (leitura de placas Intelbras): eventos de acesso por placa.

DO $$ BEGIN
  ALTER TABLE eventos DROP CONSTRAINT IF EXISTS eventos_metodo_check;
  ALTER TABLE eventos ADD CONSTRAINT eventos_metodo_check
    CHECK (metodo IN ('facial','qrcode','biometria','manual','placa'));
END $$;
