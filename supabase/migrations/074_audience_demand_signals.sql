-- 074: client_audience_demand_signals — cached demand mining from a
-- client's own video comments.
--
-- Purpose: pure anti-echo signal for series ideation. Cohort patterns
-- and structural gaps tell us what's working in the competitive set.
-- Demand signals tell us what THIS CLIENT'S AUDIENCE is actually
-- asking for and not being served. The two together are the difference
-- between "best practices for this category" and "what this audience
-- has been requesting from this specific channel."
--
-- Why persistent (vs. live-mined per generation):
--   - Comment fetch is expensive (YouTube quota, ~5 videos × 100 comments)
--   - Demand themes change slowly (weeks/months, not minutes)
--   - Series ideation needs to be fast; refresh is an explicit action
--   - History matters — diffing demand over time shows what shifted
--
-- Lifecycle: strategist clicks "Refresh demand signals" → service
-- fetches comments → Claude extracts demand themes → row inserted with
-- status='active' and previous active row marked superseded.

CREATE TABLE IF NOT EXISTS client_audience_demand_signals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  -- Lifecycle
  status      TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded')),
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Source — which videos and how many comments fed this extraction
  source_video_ids JSONB NOT NULL DEFAULT '[]'::jsonb,    -- array of youtube_video_id strings
  video_count INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,

  -- Extracted signal — Claude output kept in structured shape so prompt
  -- formatting can evolve without re-extraction.
  -- Shape:
  --   {
  --     unserved_requests: [{ topic, mentions, sample_quote }],
  --     recurring_themes:  [{ pattern, count, examples: [...] }],
  --     engagement_peaks:  [{ quote, signal_strength, context }],
  --   }
  signals     JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Audit
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active row per client at a time (enforced via partial index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_demand_signals_active
  ON client_audience_demand_signals(client_id) WHERE status = 'active';

-- Historical lookups
CREATE INDEX IF NOT EXISTS idx_demand_signals_client_extracted
  ON client_audience_demand_signals(client_id, extracted_at DESC);

COMMENT ON TABLE client_audience_demand_signals IS
  'Cached audience demand mining from a clients video comments. Refreshed manually by the strategist; read by series ideation for anti-echo signal (what audience asks for that isn''t being made).';
COMMENT ON COLUMN client_audience_demand_signals.signals IS
  'Structured demand extraction from Claude. Shape: { unserved_requests, recurring_themes, engagement_peaks }. Each item carries source samples for traceability.';

-- RLS — match the team-tool pattern
ALTER TABLE client_audience_demand_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read demand signals"
  ON client_audience_demand_signals FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert demand signals"
  ON client_audience_demand_signals FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update demand signals"
  ON client_audience_demand_signals FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete demand signals"
  ON client_audience_demand_signals FOR DELETE
  TO authenticated USING (true);
