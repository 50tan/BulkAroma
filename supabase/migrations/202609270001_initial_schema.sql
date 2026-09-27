-- ============================================================
-- FILE: 202609270001_initial_schema.sql
-- PROJECT: BulkAroma Price Intelligence
-- DESCRIPTION: Initial database schema – all tables, triggers, seed data
-- ============================================================

-- ------------------------------------------------------------
-- Extensions
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ------------------------------------------------------------
-- updated_at trigger function (defined first – used by many tables)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- TABLE: materials
-- ------------------------------------------------------------
CREATE TABLE materials (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_name    TEXT        NOT NULL,
  normalized_name   TEXT        NOT NULL,
  cas_number        TEXT,
  chemical_name     TEXT,
  category          TEXT,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT materials_normalized_name_unique UNIQUE (normalized_name)
);

CREATE TRIGGER trg_materials_updated_at
  BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- TABLE: material_aliases
-- ------------------------------------------------------------
CREATE TABLE material_aliases (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  material_id     UUID          NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
  supplier        TEXT,
  source_name     TEXT          NOT NULL,
  normalized_name TEXT          NOT NULL,
  confidence      DECIMAL(4,3)  CHECK (confidence BETWEEN 0 AND 1),
  match_reason    TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_material_aliases_updated_at
  BEFORE UPDATE ON material_aliases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- TABLE: supplier_sources
-- ------------------------------------------------------------
CREATE TABLE supplier_sources (
  id                        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier                  TEXT        NOT NULL UNIQUE,
  display_name              TEXT,
  base_url                  TEXT,
  currency                  TEXT,
  is_active                 BOOLEAN     NOT NULL DEFAULT TRUE,
  robots_txt_checked_at     TIMESTAMPTZ,
  robots_txt_allows_crawl   BOOLEAN,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_supplier_sources_updated_at
  BEFORE UPDATE ON supplier_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- TABLE: scrape_runs
-- (defined before price_observations which FK references it)
-- ------------------------------------------------------------
CREATE TABLE scrape_runs (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier         TEXT,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  status           TEXT        NOT NULL DEFAULT 'running',
  products_found   INT         NOT NULL DEFAULT 0,
  products_updated INT         NOT NULL DEFAULT 0,
  variants_found   INT         NOT NULL DEFAULT 0,
  prices_found     INT         NOT NULL DEFAULT 0,
  errors_count     INT         NOT NULL DEFAULT 0,
  blocked_count    INT         NOT NULL DEFAULT 0,
  parser_warnings  JSONB       NOT NULL DEFAULT '[]'
);

-- ------------------------------------------------------------
-- TABLE: supplier_products
-- ------------------------------------------------------------
CREATE TABLE supplier_products (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier              TEXT,
  source_product_id     TEXT,
  original_name         TEXT,
  normalized_name       TEXT,
  canonical_material_id UUID        REFERENCES materials (id) ON DELETE SET NULL,
  manufacturer          TEXT,
  brand                 TEXT,
  cas_number            TEXT,
  chemical_name         TEXT,
  sku                   TEXT,
  product_type          TEXT,
  description           TEXT,
  source_url            TEXT,
  image_url             TEXT,
  availability          TEXT        NOT NULL DEFAULT 'unknown',
  raw_metadata          JSONB,
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT supplier_products_supplier_url_unique UNIQUE (supplier, source_url)
);

CREATE TRIGGER trg_supplier_products_updated_at
  BEFORE UPDATE ON supplier_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- TABLE: product_variants
-- ------------------------------------------------------------
CREATE TABLE product_variants (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_product_id   UUID          NOT NULL REFERENCES supplier_products (id) ON DELETE CASCADE,
  variant_name          TEXT,
  quantity              DECIMAL(12,4) CHECK (quantity > 0),
  unit                  TEXT,
  normalized_quantity_g  DECIMAL(12,4),
  normalized_quantity_ml DECIMAL(12,4),
  sku                   TEXT,
  availability          TEXT          NOT NULL DEFAULT 'unknown',
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT product_variants_product_variant_unique UNIQUE (supplier_product_id, variant_name)
);

CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- TABLE: price_observations
-- ------------------------------------------------------------
CREATE TABLE price_observations (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_variant_id    UUID          NOT NULL REFERENCES product_variants (id) ON DELETE CASCADE,
  price_amount          DECIMAL(12,4) CHECK (price_amount >= 0),
  currency              TEXT,
  original_price_text   TEXT,
  sale_price            DECIMAL(12,4),
  original_list_price   DECIMAL(12,4),
  availability          TEXT,
  observed_at           TIMESTAMPTZ,
  source_url            TEXT,
  scrape_run_id         UUID          REFERENCES scrape_runs (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- TABLE: crawl_errors
-- ------------------------------------------------------------
CREATE TABLE crawl_errors (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  scrape_run_id  UUID        REFERENCES scrape_runs (id) ON DELETE SET NULL,
  supplier       TEXT,
  url            TEXT,
  error_type     TEXT,
  error_message  TEXT,
  http_status    INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- TABLE: match_mappings
-- ------------------------------------------------------------
CREATE TABLE match_mappings (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_product_id   UUID          NOT NULL REFERENCES supplier_products (id) ON DELETE CASCADE,
  target_material_id  UUID          NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
  match_type          TEXT          NOT NULL CHECK (match_type IN ('exact', 'strong', 'possible', 'uncertain', 'not_matched')),
  confidence          DECIMAL(4,3)  CHECK (confidence BETWEEN 0 AND 1),
  reason              TEXT,
  matching_evidence   JSONB         NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT match_mappings_source_target_unique UNIQUE (source_product_id, target_material_id)
);

CREATE TRIGGER trg_match_mappings_updated_at
  BEFORE UPDATE ON match_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- TABLE: user_match_overrides
-- ------------------------------------------------------------
CREATE TABLE user_match_overrides (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID,
  source_product_id   UUID        NOT NULL REFERENCES supplier_products (id) ON DELETE CASCADE,
  target_material_id  UUID        NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
  decision            TEXT        NOT NULL CHECK (decision IN ('same_material', 'different_material')),
  reason              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- TABLE: currency_rates
-- ------------------------------------------------------------
CREATE TABLE currency_rates (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  base_currency   TEXT          NOT NULL,
  target_currency TEXT          NOT NULL,
  rate            DECIMAL(20,8) NOT NULL CHECK (rate > 0),
  provider        TEXT,
  observed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT currency_rates_pair_observed_unique UNIQUE (base_currency, target_currency, observed_at)
);

-- ------------------------------------------------------------
-- TABLE: export_jobs
-- ------------------------------------------------------------
CREATE TABLE export_jobs (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type      TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending',
  file_url      TEXT,
  file_name     TEXT,
  row_count     INT,
  error_message TEXT,
  requested_by  UUID,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Seed: supplier_sources
-- ------------------------------------------------------------
INSERT INTO supplier_sources (supplier, display_name, base_url, currency, is_active)
VALUES
  ('psh',        'Perfumer Supply House',   'https://perfumersupplyhouse.com',      'USD', TRUE),
  ('fraterworks', 'Fraterworks',             'https://fraterworks.com',              'NZD', TRUE),
  ('pa',         'The Perfumer''s Apprentice', 'https://shop.perfumersapprentice.com', 'USD', TRUE)
ON CONFLICT (supplier) DO NOTHING;
