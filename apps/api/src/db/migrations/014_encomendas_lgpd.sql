-- Runs with search_path already set to the tenant schema.
-- Encomendas: foto e retirada por terceiro autorizado.
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE encomendas ADD COLUMN IF NOT EXISTS retirada_por TEXT;
