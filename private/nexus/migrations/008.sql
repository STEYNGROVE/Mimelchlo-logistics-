CREATE TABLE IF NOT EXISTS freight_source_cursor (
  source text PRIMARY KEY,
  window_start date NOT NULL,
  next_page integer NOT NULL DEFAULT 1 CHECK (next_page > 0),
  lease uuid,
  lease_until timestamptz,
  retry_after timestamptz,
  failures integer NOT NULL DEFAULT 0,
  last_checked timestamptz,
  last_error text,
  pages_processed bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS freight_procurement_candidates (
  reference text PRIMARY KEY,
  source_url text NOT NULL,
  release_at timestamptz NOT NULL,
  title text NOT NULL,
  buyer text,
  closes_at timestamptz,
  source_status text,
  match_evidence text NOT NULL,
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','verified','rejected')),
  review_reason text,
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS freight_procurement_order ON freight_procurement_candidates(release_at DESC);
