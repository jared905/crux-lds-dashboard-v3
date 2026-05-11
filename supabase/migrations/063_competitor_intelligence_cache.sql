-- 063: Generic cache for AI-generated intelligence (white space brief, topic clusters, etc.)
--
-- Used by Research v2 to avoid re-calling Claude on every page load.
-- Lookup by cache_key; consumers check updated_at vs their freshness policy.

CREATE TABLE IF NOT EXISTS competitor_intelligence_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_cache_key ON competitor_intelligence_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_competitor_cache_updated ON competitor_intelligence_cache(updated_at DESC);

ALTER TABLE competitor_intelligence_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read cache" ON competitor_intelligence_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can write cache" ON competitor_intelligence_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE competitor_intelligence_cache IS
  'Cache for AI-generated competitor analysis (topic clusters, opportunity briefs). Lookup by cache_key, freshness checked by consumer against updated_at.';
