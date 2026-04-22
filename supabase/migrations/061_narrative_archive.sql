-- 061: Narrative archive for cross-period memory in quarterly reports
--
-- Without this, every report starts stateless — Claude sees only current +
-- previous quarter. Retainer justification and continuity narratives both
-- benefit from "here's what we predicted last quarter, here's what happened."
-- Prompt injection reads the last 1-2 entries as read-only history.

CREATE TABLE IF NOT EXISTS narrative_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  -- Scope: network parent ID OR standalone channel ID. Both use channels.id.
  quarter_year INTEGER NOT NULL,           -- 2026
  quarter_number INTEGER NOT NULL CHECK (quarter_number BETWEEN 1 AND 4), -- 1..4
  executive_summary TEXT,                  -- top-of-narrative synthesis
  recommendations JSONB,                   -- array of rec objects with text/priority/assumption/invalidation
  wins JSONB,                              -- array of strings
  challenges JSONB,                        -- array of strings
  trend_narrative TEXT,
  raw_narrative JSONB,                     -- full parsed narrative object for future schema changes
  metrics_snapshot JSONB,                  -- key metrics at generation time (for delta retrospection)
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, quarter_year, quarter_number)
);

CREATE INDEX IF NOT EXISTS idx_narrative_archive_channel ON narrative_archive(channel_id);
CREATE INDEX IF NOT EXISTS idx_narrative_archive_period ON narrative_archive(quarter_year DESC, quarter_number DESC);

ALTER TABLE narrative_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read narratives"
  ON narrative_archive FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert narratives"
  ON narrative_archive FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service role can manage narratives"
  ON narrative_archive FOR ALL TO service_role USING (true);

COMMENT ON TABLE narrative_archive IS
  'Stores generated quarterly narratives per channel/network. Prior entries are injected into new prompts as read-only history for cross-period continuity.';
