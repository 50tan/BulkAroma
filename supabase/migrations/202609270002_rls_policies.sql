-- ============================================================
-- FILE: 202609270002_rls_policies.sql
-- PROJECT: BulkAroma Price Intelligence
-- DESCRIPTION: Row Level Security policies for all tables
-- ============================================================

-- ------------------------------------------------------------
-- Enable RLS on all tables
-- ------------------------------------------------------------
ALTER TABLE materials              ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_aliases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_sources       ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_observations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_errors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_mappings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_match_overrides   ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_rates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs            ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PUBLIC READ POLICIES
-- Non-sensitive catalogue / price data is publicly readable.
-- Backend writes use the service-role key which bypasses RLS.
-- ============================================================

-- materials
CREATE POLICY "Public can read materials"
  ON materials FOR SELECT
  USING (true);

-- material_aliases
CREATE POLICY "Public can read material_aliases"
  ON material_aliases FOR SELECT
  USING (true);

-- supplier_sources
CREATE POLICY "Public can read supplier_sources"
  ON supplier_sources FOR SELECT
  USING (true);

-- supplier_products
CREATE POLICY "Public can read supplier_products"
  ON supplier_products FOR SELECT
  USING (true);

-- product_variants
CREATE POLICY "Public can read product_variants"
  ON product_variants FOR SELECT
  USING (true);

-- price_observations
CREATE POLICY "Public can read price_observations"
  ON price_observations FOR SELECT
  USING (true);

-- match_mappings
CREATE POLICY "Public can read match_mappings"
  ON match_mappings FOR SELECT
  USING (true);

-- currency_rates
CREATE POLICY "Public can read currency_rates"
  ON currency_rates FOR SELECT
  USING (true);

-- scrape_runs (status info is public – no sensitive data)
CREATE POLICY "Public can read scrape_runs"
  ON scrape_runs FOR SELECT
  USING (true);

-- crawl_errors (public read for observability dashboards)
CREATE POLICY "Public can read crawl_errors"
  ON crawl_errors FOR SELECT
  USING (true);

-- ============================================================
-- USER_MATCH_OVERRIDES – users manage their own overrides
-- ============================================================

CREATE POLICY "Users can read own overrides"
  ON user_match_overrides FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own overrides"
  ON user_match_overrides FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own overrides"
  ON user_match_overrides FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own overrides"
  ON user_match_overrides FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- EXPORT_JOBS – users manage their own export jobs
-- ============================================================

CREATE POLICY "Users can read own export jobs"
  ON export_jobs FOR SELECT
  USING (auth.uid() = requested_by OR requested_by IS NULL);

CREATE POLICY "Users can insert export jobs"
  ON export_jobs FOR INSERT
  WITH CHECK (auth.uid() = requested_by OR requested_by IS NULL);

CREATE POLICY "Users can update own export jobs"
  ON export_jobs FOR UPDATE
  USING (auth.uid() = requested_by OR requested_by IS NULL)
  WITH CHECK (auth.uid() = requested_by OR requested_by IS NULL);
