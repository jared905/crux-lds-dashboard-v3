-- 062: Research v2 foundation — tiers, tags, saved views, views-at-48h
--
-- New surfaces for the redesigned Research/Competitor hub:
--   • channel_tier  → priority / tracked / archive (drives alerts and default filters)
--   • channel_tags  → free-form tags independent of categories
--   • saved_views   → reusable scope+lens+filter presets
--   • videos.views_at_48h → snapshot of view_count 48h after publish, for clean velocity comparisons

-- ============================================
-- 1. Channel tier
-- ============================================
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS tier TEXT
    DEFAULT 'tracked'
    CHECK (tier IN ('priority', 'tracked', 'archive'));

CREATE INDEX IF NOT EXISTS idx_channels_tier ON channels(tier);

COMMENT ON COLUMN channels.tier IS
  'Research tier. priority = alerts fire, view velocity computed. tracked = synced but quiet. archive = excluded from default views.';

-- ============================================
-- 2. Channel tags (free-form, cross-cutting)
-- ============================================
CREATE TABLE IF NOT EXISTS channel_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  UNIQUE(channel_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_channel_tags_channel ON channel_tags(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_tags_tag ON channel_tags(tag);

ALTER TABLE channel_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tags" ON channel_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage tags" ON channel_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE channel_tags IS
  'Cross-cutting tags on channels (creator-led, brand-owned, monetized, shorts-heavy, etc). Independent of categories.';

-- ============================================
-- 3. Saved views — reusable scope/lens/filter presets
-- ============================================
CREATE TABLE IF NOT EXISTS saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,                          -- nullable for org-wide views
  name TEXT NOT NULL,
  surface TEXT NOT NULL DEFAULT 'research',  -- 'research' for now; future expansion
  lens TEXT,                             -- 'landscape' | 'patterns' | 'whitespace' | 'movement'
  config JSONB NOT NULL,                 -- { filters, sort, group, columns, scope }
  pinned BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_user ON saved_views(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_views_pinned ON saved_views(pinned) WHERE pinned;

ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read saved views" ON saved_views FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage saved views" ON saved_views FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE saved_views IS
  'Reusable scope+lens+filter presets. The pinned ones appear in sidebar saved-view shortcuts.';

-- ============================================
-- 4. Views at 48 hours — for clean velocity comparison
-- ============================================
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS views_at_48h BIGINT;

CREATE INDEX IF NOT EXISTS idx_videos_views_at_48h ON videos(views_at_48h) WHERE views_at_48h IS NOT NULL;

COMMENT ON COLUMN videos.views_at_48h IS
  'Snapshot of view_count taken once between 36-60 hours after published_at. Frozen after capture. Used as the canonical short-window velocity metric.';

-- ============================================
-- 5. Engagement rate snapshot in video_snapshots
-- ============================================
ALTER TABLE video_snapshots
  ADD COLUMN IF NOT EXISTS engagement_rate NUMERIC;

COMMENT ON COLUMN video_snapshots.engagement_rate IS
  '(likes + comments) / views captured at snapshot time. The public-data proxy for content resonance.';

-- ============================================
-- 6. Competitor alerts (Movement lens feed)
-- ============================================
CREATE TABLE IF NOT EXISTS competitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('breakout', 'format_shift', 'rank_change', 'trend', 'new_entrant')),
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_by_user_id UUID,
  dismissed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_competitor_alerts_generated ON competitor_alerts(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_channel ON competitor_alerts(channel_id);
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_type ON competitor_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_active ON competitor_alerts(generated_at DESC) WHERE dismissed_at IS NULL;

ALTER TABLE competitor_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read alerts" ON competitor_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can dismiss alerts" ON competitor_alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages alerts" ON competitor_alerts FOR ALL TO service_role USING (true);

COMMENT ON TABLE competitor_alerts IS
  'Movement lens feed. One row per detected event. Generated by the daily cron, dismissable per user.';
