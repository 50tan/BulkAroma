-- ============================================================
-- FILE: 202609270004_functions.sql
-- PROJECT: BulkAroma Price Intelligence
-- DESCRIPTION: Utility and domain-logic PostgreSQL functions
-- ============================================================

-- ------------------------------------------------------------
-- FUNCTION: normalize_material_name
-- Strips accents, lowercases, collapses non-alphanumeric chars
-- to spaces, and trims the result.
-- IMMUTABLE so it can be used in functional indexes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_material_name(name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN TRIM(
    LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          UNACCENT(name),
          '[^a-zA-Z0-9\s]', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ------------------------------------------------------------
-- FUNCTION: get_latest_price_for_variant
-- Returns the single most-recent price observation for a variant.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_latest_price_for_variant(variant_id UUID)
RETURNS TABLE (
  price_amount        DECIMAL,
  currency            TEXT,
  original_price_text TEXT,
  observed_at         TIMESTAMPTZ,
  source_url          TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    po.price_amount,
    po.currency,
    po.original_price_text,
    po.observed_at,
    po.source_url
  FROM price_observations po
  WHERE po.product_variant_id = variant_id
  ORDER BY po.observed_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ------------------------------------------------------------
-- FUNCTION: get_latest_exchange_rate
-- Returns the latest rate between two currencies.
-- Returns 1.0 when both currencies are the same.
-- Returns NULL if no rate exists in the database.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_latest_exchange_rate(from_currency TEXT, to_currency TEXT)
RETURNS DECIMAL AS $$
DECLARE
  rate_val DECIMAL;
BEGIN
  IF from_currency = to_currency THEN
    RETURN 1.0;
  END IF;

  SELECT cr.rate
  INTO rate_val
  FROM currency_rates cr
  WHERE cr.base_currency   = from_currency
    AND cr.target_currency = to_currency
  ORDER BY cr.observed_at DESC
  LIMIT 1;

  RETURN rate_val;  -- NULL when not found
END;
$$ LANGUAGE plpgsql STABLE;

-- ------------------------------------------------------------
-- FUNCTION: calculate_packages_required
-- Calculates the number of packages needed to reach a target
-- quantity given the size of each package (both in grams).
-- Returns NULL when package_quantity_g is zero or negative.
-- IMMUTABLE because result depends only on inputs.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_packages_required(
  target_quantity_g  DECIMAL,
  package_quantity_g DECIMAL
)
RETURNS INT AS $$
BEGIN
  IF package_quantity_g IS NULL OR package_quantity_g <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN CEIL(target_quantity_g / package_quantity_g)::INT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ------------------------------------------------------------
-- FUNCTION: get_supplier_coverage
-- Returns per-supplier product/variant counts and whether any
-- prices exist for a given canonical material.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_supplier_coverage(p_material_id UUID)
RETURNS TABLE (
  supplier      TEXT,
  display_name  TEXT,
  product_count BIGINT,
  variant_count BIGINT,
  has_price     BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.supplier,
    ss.display_name,
    COUNT(DISTINCT sp.id)                        AS product_count,
    COUNT(DISTINCT pv.id)                        AS variant_count,
    EXISTS (
      SELECT 1
      FROM price_observations po
      JOIN product_variants pv2 ON pv2.id = po.product_variant_id
      WHERE pv2.supplier_product_id = sp.id
    )                                            AS has_price
  FROM supplier_products sp
  LEFT JOIN product_variants  pv ON pv.supplier_product_id = sp.id
  LEFT JOIN supplier_sources  ss ON ss.supplier            = sp.supplier
  WHERE sp.canonical_material_id = p_material_id
  GROUP BY sp.supplier, ss.display_name;
END;
$$ LANGUAGE plpgsql STABLE;

-- ------------------------------------------------------------
-- FUNCTION: search_materials
-- Multi-strategy ranked material search:
--   1. Exact normalized name match        (relevance 1.00)
--   2. CAS number match                   (relevance 0.99)
--   3. Material alias match               (relevance 0.95)
--   4. Supplier product name match        (relevance 0.90)
--   5. Partial normalized name match      (relevance 0.70)
-- Returns up to 50 results ordered by relevance.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_materials(search_query TEXT)
RETURNS TABLE (
  material_id     UUID,
  canonical_name  TEXT,
  normalized_name TEXT,
  cas_number      TEXT,
  category        TEXT,
  match_source    TEXT,
  relevance       FLOAT
) AS $$
DECLARE
  normalized_query TEXT;
BEGIN
  normalized_query := normalize_material_name(search_query);

  RETURN QUERY

  -- 1. Exact normalized name match
  SELECT
    m.id,
    m.canonical_name,
    m.normalized_name,
    m.cas_number,
    m.category,
    'exact_name'::TEXT  AS match_source,
    1.0::FLOAT          AS relevance
  FROM materials m
  WHERE m.normalized_name = normalized_query

  UNION ALL

  -- 2. CAS number match (compare upper-cased input vs stored)
  SELECT
    m.id,
    m.canonical_name,
    m.normalized_name,
    m.cas_number,
    m.category,
    'cas_number'::TEXT  AS match_source,
    0.99::FLOAT         AS relevance
  FROM materials m
  WHERE m.cas_number IS NOT NULL
    AND m.cas_number = UPPER(search_query)

  UNION ALL

  -- 3. Alias normalized name match
  SELECT
    m.id,
    m.canonical_name,
    m.normalized_name,
    m.cas_number,
    m.category,
    'alias'::TEXT       AS match_source,
    0.95::FLOAT         AS relevance
  FROM materials m
  JOIN material_aliases ma ON ma.material_id = m.id
  WHERE ma.normalized_name = normalized_query

  UNION ALL

  -- 4. Supplier product normalized name contains match
  SELECT
    m.id,
    m.canonical_name,
    m.normalized_name,
    m.cas_number,
    m.category,
    'supplier_product'::TEXT AS match_source,
    0.9::FLOAT               AS relevance
  FROM materials m
  JOIN supplier_products sp ON sp.canonical_material_id = m.id
  WHERE sp.normalized_name LIKE '%' || normalized_query || '%'

  UNION ALL

  -- 5. Partial normalized name match (excludes exact, already covered above)
  SELECT
    m.id,
    m.canonical_name,
    m.normalized_name,
    m.cas_number,
    m.category,
    'partial_name'::TEXT AS match_source,
    0.7::FLOAT           AS relevance
  FROM materials m
  WHERE m.normalized_name LIKE '%' || normalized_query || '%'
    AND m.normalized_name != normalized_query

  ORDER BY relevance DESC, canonical_name
  LIMIT 50;
END;
$$ LANGUAGE plpgsql STABLE;
