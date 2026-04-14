-- 057: Audience demographics, traffic sources, geography, and device data
--
-- Channel-level audience data from YouTube Analytics API.
-- Stored as JSONB snapshots per channel per date for historical tracking.
-- Not per-video — YouTube only provides these at the channel level.

CREATE TABLE channel_audience_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,

  -- Demographics: { "male": 52.3, "female": 45.1, "user_specified": 2.6 }
  gender_distribution JSONB,

  -- Age groups: { "age13-17": 5.2, "age18-24": 32.1, "age25-34": 41.0, ... }
  age_distribution JSONB,

  -- Geography: { "US": { views: 50000, watchHours: 120.5, pct: 45.2 }, "BR": { ... } }
  country_data JSONB,

  -- Traffic sources: { "SUBSCRIBER": { views: 30000, pct: 35 }, "YT_SEARCH": { views: 15000, pct: 18 }, ... }
  traffic_sources JSONB,

  -- Device types: { "MOBILE": { views: 40000, pct: 48 }, "DESKTOP": { views: 20000, pct: 24 }, "TV": { ... } }
  device_types JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(channel_id, snapshot_date)
);

CREATE INDEX idx_audience_snapshots_channel ON channel_audience_snapshots(channel_id);
CREATE INDEX idx_audience_snapshots_date ON channel_audience_snapshots(snapshot_date);

-- RLS
ALTER TABLE channel_audience_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read audience snapshots"
  ON channel_audience_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage audience snapshots"
  ON channel_audience_snapshots FOR ALL TO service_role USING (true);
