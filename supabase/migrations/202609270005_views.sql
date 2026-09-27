-- ============================================================
-- FILE: 202609270005_views.sql
-- PROJECT: BulkAroma Price Intelligence
-- DESCRIPTION: Analytical and reporting views
-- ============================================================

-- ------------------------------------------------------------
-- VIEW: latest_price_per_variant
-- Most recent price observation per product variant.
-- Uses DISTINCT ON for a single efficient index scan.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW latest_price_per_variant AS
SELECT DISTINCT ON (po.product_variant_id)
  po.product_variant_id,
  po.price_amount,
  po.currency,
  po.original_price_text,
  po.sale_price,
  po.original_list_price,
  po.availability,
  po.observed_at,
  po.source_url,
  po.scrape_run_id
FROM price_observations po
ORDER BY po.product_variant_id, po.observed_at DESC;

-- ------------------------------------------------------------
-- VIEW: current_supplier_prices
-- Flat view joining materials → supplier_products → variants →
-- latest price, scoped to matched (canonical) materials only.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW current_supplier_prices AS
SELECT
  m.id                        AS material_id,
  m.canonical_name,
  m.cas_number,
  m.category,
  sp.id                       AS supplier_product_id,
  sp.supplier,
  ss.display_name             AS supplier_display_name,
  sp.original_name            AS supplier_product_name,
  sp.manufacturer,
  sp.brand,
  sp.source_url               AS product_url,
  pv.id                       AS variant_id,
  pv.variant_name,
  pv.quantity,
  pv.unit,
  pv.normalized_quantity_g,
  pv.normalized_quantity_ml,
  pv.availability             AS variant_availability,
  lp.price_amount,
  lp.currency,
  lp.original_price_text,
  lp.sale_price,
  lp.observed_at              AS price_observed_at,
  lp.source_url               AS price_source_url
FROM materials m
JOIN supplier_products          sp ON sp.canonical_material_id = m.id
JOIN supplier_sources           ss ON ss.supplier = sp.supplier
JOIN product_variants           pv ON pv.supplier_product_id = sp.id
LEFT JOIN latest_price_per_variant lp ON lp.product_variant_id = pv.id
WHERE sp.canonical_material_id IS NOT NULL;

-- ------------------------------------------------------------
-- VIEW: common_materials_view
-- Materials available from 2 or more distinct suppliers.
-- Includes per-supplier boolean flags and aggregate counts.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW common_materials_view AS
SELECT
  m.id,
  m.canonical_name,
  m.normalized_name,
  m.cas_number,
  m.chemical_name,
  m.category,
  COUNT(DISTINCT sp.supplier)                              AS supplier_count,
  BOOL_OR(sp.supplier = 'psh')                            AS available_at_psh,
  BOOL_OR(sp.supplier = 'fraterworks')                    AS available_at_fraterworks,
  BOOL_OR(sp.supplier = 'pa')                             AS available_at_pa,
  COUNT(DISTINCT sp.id)                                   AS total_products,
  COUNT(DISTINCT pv.id)                                   AS total_variants,
  MAX(lp.observed_at)                                     AS last_price_update
FROM materials m
JOIN supplier_products             sp ON sp.canonical_material_id = m.id
LEFT JOIN product_variants         pv ON pv.supplier_product_id = sp.id
LEFT JOIN latest_price_per_variant lp ON lp.product_variant_id = pv.id
GROUP BY
  m.id,
  m.canonical_name,
  m.normalized_name,
  m.cas_number,
  m.chemical_name,
  m.category
HAVING COUNT(DISTINCT sp.supplier) >= 2;

-- ------------------------------------------------------------
-- VIEW: supplier_coverage_summary
-- Per-supplier aggregate: product/variant counts, match rates,
-- crawl timestamps, total errors and blocked requests.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW supplier_coverage_summary AS
SELECT
  ss.supplier,
  ss.display_name,
  COUNT(DISTINCT sp.id)                                                AS total_products,
  COUNT(DISTINCT pv.id)                                               AS total_variants,
  COUNT(DISTINCT lp.product_variant_id)                               AS variants_with_prices,
  COUNT(DISTINCT sp.canonical_material_id)                            AS matched_materials,
  COUNT(DISTINCT sp.id) FILTER (WHERE sp.canonical_material_id IS NULL) AS unmatched_products,
  MAX(sr.started_at)                                                  AS last_crawl_started,
  MAX(sr.completed_at)                                                AS last_crawl_completed,
  COALESCE(SUM(sr.errors_count), 0)                                   AS total_errors,
  COALESCE(SUM(sr.blocked_count), 0)                                  AS total_blocked
FROM supplier_sources ss
LEFT JOIN supplier_products            sp ON sp.supplier          = ss.supplier
LEFT JOIN product_variants             pv ON pv.supplier_product_id = sp.id
LEFT JOIN latest_price_per_variant     lp ON lp.product_variant_id = pv.id
LEFT JOIN scrape_runs                  sr ON sr.supplier           = ss.supplier
GROUP BY ss.supplier, ss.display_name;

-- ------------------------------------------------------------
-- VIEW: price_history_view
-- Full price observation history with material and supplier
-- context. Ordered most-recent-first.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW price_history_view AS
SELECT
  m.canonical_name            AS material_name,
  m.cas_number,
  sp.supplier,
  ss.display_name             AS supplier_name,
  sp.original_name            AS product_name,
  pv.variant_name,
  pv.quantity,
  pv.unit,
  po.price_amount,
  po.currency,
  po.original_price_text,
  po.sale_price,
  po.observed_at,
  po.source_url
FROM price_observations po
JOIN product_variants    pv ON pv.id      = po.product_variant_id
JOIN supplier_products   sp ON sp.id      = pv.supplier_product_id
JOIN supplier_sources    ss ON ss.supplier = sp.supplier
LEFT JOIN materials      m  ON m.id       = sp.canonical_material_id
ORDER BY po.observed_at DESC;

-- ------------------------------------------------------------
-- VIEW: data_quality_summary
-- Per-supplier data quality metrics: match rates, missing CAS,
-- missing prices, recent crawl errors and blocks.
-- Subqueries for per-supplier scrape run aggregates avoid
-- row multiplication from the multiple LEFT JOINs above.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW data_quality_summary AS
SELECT
  ss.supplier,
  ss.display_name,
  COUNT(DISTINCT sp.id)                                                    AS products_crawled,
  COUNT(DISTINCT sp.id) FILTER (WHERE sp.canonical_material_id IS NOT NULL) AS products_matched,
  COUNT(DISTINCT pv.id)                                                    AS variants_found,
  COUNT(DISTINCT lp.product_variant_id)                                    AS variants_with_prices,
  COUNT(DISTINCT sp.id) FILTER (WHERE sp.cas_number IS NULL)               AS missing_cas,
  COUNT(DISTINCT pv.id) FILTER (WHERE lp.price_amount IS NULL)             AS missing_price,
  (
    SELECT MAX(sr2.started_at)
    FROM scrape_runs sr2
    WHERE sr2.supplier = ss.supplier
  )                                                                        AS last_crawl_started,
  (
    SELECT COALESCE(SUM(sr2.errors_count), 0)
    FROM scrape_runs sr2
    WHERE sr2.supplier   = ss.supplier
      AND sr2.started_at > NOW() - INTERVAL '7 days'
  )                                                                        AS recent_errors,
  (
    SELECT COALESCE(SUM(sr2.blocked_count), 0)
    FROM scrape_runs sr2
    WHERE sr2.supplier   = ss.supplier
      AND sr2.started_at > NOW() - INTERVAL '7 days'
  )                                                                        AS recent_blocked
FROM supplier_sources ss
LEFT JOIN supplier_products            sp ON sp.supplier           = ss.supplier
LEFT JOIN product_variants             pv ON pv.supplier_product_id = sp.id
LEFT JOIN latest_price_per_variant     lp ON lp.product_variant_id  = pv.id
GROUP BY ss.supplier, ss.display_name;
