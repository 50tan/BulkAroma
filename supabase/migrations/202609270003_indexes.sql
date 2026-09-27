-- ============================================================
-- FILE: 202609270003_indexes.sql
-- PROJECT: BulkAroma Price Intelligence
-- DESCRIPTION: All performance indexes
-- ============================================================

-- ------------------------------------------------------------
-- materials
-- ------------------------------------------------------------
CREATE INDEX idx_materials_normalized_name
  ON materials (normalized_name);

CREATE INDEX idx_materials_cas_number
  ON materials (cas_number)
  WHERE cas_number IS NOT NULL;

CREATE INDEX idx_materials_category
  ON materials (category)
  WHERE category IS NOT NULL;

-- ------------------------------------------------------------
-- material_aliases
-- ------------------------------------------------------------
CREATE INDEX idx_material_aliases_material_id
  ON material_aliases (material_id);

CREATE INDEX idx_material_aliases_normalized_name
  ON material_aliases (normalized_name);

CREATE INDEX idx_material_aliases_supplier
  ON material_aliases (supplier)
  WHERE supplier IS NOT NULL;

-- ------------------------------------------------------------
-- supplier_sources
-- ------------------------------------------------------------
CREATE INDEX idx_supplier_sources_supplier
  ON supplier_sources (supplier);

CREATE INDEX idx_supplier_sources_is_active
  ON supplier_sources (is_active);

-- ------------------------------------------------------------
-- supplier_products
-- ------------------------------------------------------------
CREATE INDEX idx_supplier_products_supplier
  ON supplier_products (supplier);

CREATE INDEX idx_supplier_products_normalized_name
  ON supplier_products (normalized_name);

CREATE INDEX idx_supplier_products_cas_number
  ON supplier_products (cas_number)
  WHERE cas_number IS NOT NULL;

CREATE INDEX idx_supplier_products_canonical_material
  ON supplier_products (canonical_material_id)
  WHERE canonical_material_id IS NOT NULL;

CREATE INDEX idx_supplier_products_supplier_source_id
  ON supplier_products (supplier, source_product_id)
  WHERE source_product_id IS NOT NULL;

-- Note: UNIQUE constraint on (supplier, source_url) already creates an implicit unique index.
-- This explicit named index provides a predictable name for query plans / EXPLAIN output.
CREATE UNIQUE INDEX idx_supplier_products_supplier_url
  ON supplier_products (supplier, source_url);

-- ------------------------------------------------------------
-- product_variants
-- ------------------------------------------------------------
CREATE INDEX idx_product_variants_product_id
  ON product_variants (supplier_product_id);

CREATE INDEX idx_product_variants_unit
  ON product_variants (unit);

CREATE INDEX idx_product_variants_normalized_g
  ON product_variants (normalized_quantity_g)
  WHERE normalized_quantity_g IS NOT NULL;

-- ------------------------------------------------------------
-- price_observations
-- ------------------------------------------------------------
CREATE INDEX idx_price_observations_variant_id
  ON price_observations (product_variant_id);

CREATE INDEX idx_price_observations_observed_at
  ON price_observations (observed_at DESC);

CREATE INDEX idx_price_observations_variant_observed
  ON price_observations (product_variant_id, observed_at DESC);

CREATE INDEX idx_price_observations_currency
  ON price_observations (currency);

CREATE INDEX idx_price_observations_scrape_run
  ON price_observations (scrape_run_id)
  WHERE scrape_run_id IS NOT NULL;

-- ------------------------------------------------------------
-- match_mappings
-- ------------------------------------------------------------
CREATE INDEX idx_match_mappings_source
  ON match_mappings (source_product_id);

CREATE INDEX idx_match_mappings_target
  ON match_mappings (target_material_id);

CREATE INDEX idx_match_mappings_type
  ON match_mappings (match_type);

CREATE INDEX idx_match_mappings_confidence
  ON match_mappings (confidence DESC);

-- ------------------------------------------------------------
-- user_match_overrides
-- ------------------------------------------------------------
CREATE INDEX idx_user_match_overrides_user_id
  ON user_match_overrides (user_id);

CREATE INDEX idx_user_match_overrides_source
  ON user_match_overrides (source_product_id);

CREATE INDEX idx_user_match_overrides_target
  ON user_match_overrides (target_material_id);

-- ------------------------------------------------------------
-- scrape_runs
-- ------------------------------------------------------------
CREATE INDEX idx_scrape_runs_supplier
  ON scrape_runs (supplier);

CREATE INDEX idx_scrape_runs_started_at
  ON scrape_runs (started_at DESC);

CREATE INDEX idx_scrape_runs_status
  ON scrape_runs (status);

-- ------------------------------------------------------------
-- currency_rates
-- ------------------------------------------------------------
CREATE INDEX idx_currency_rates_pair
  ON currency_rates (base_currency, target_currency);

CREATE INDEX idx_currency_rates_observed
  ON currency_rates (observed_at DESC);

-- ------------------------------------------------------------
-- crawl_errors
-- ------------------------------------------------------------
CREATE INDEX idx_crawl_errors_scrape_run
  ON crawl_errors (scrape_run_id);

CREATE INDEX idx_crawl_errors_supplier
  ON crawl_errors (supplier);

CREATE INDEX idx_crawl_errors_created_at
  ON crawl_errors (created_at DESC);

-- ------------------------------------------------------------
-- export_jobs
-- ------------------------------------------------------------
CREATE INDEX idx_export_jobs_requested_by
  ON export_jobs (requested_by)
  WHERE requested_by IS NOT NULL;

CREATE INDEX idx_export_jobs_status
  ON export_jobs (status);
