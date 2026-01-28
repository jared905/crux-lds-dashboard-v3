-- Competitor Database Schema
-- Full View Analytics - Crux Media
-- Migration 001: Initial competitor tracking tables

-- ============================================
-- CHANNELS: Core competitor/channel profiles
-- ============================================
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_channel_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  custom_url TEXT,                    -- @handle or custom URL

  -- Categorization
  category TEXT,                      -- e.g., 'religious', 'financial', 'entertainment'
  tags TEXT[],                        -- flexible tagging
  is_competitor BOOLEAN DEFAULT true, -- false = your own channel or reference channel
  client_id TEXT,                     -- links to your client if this is their channel

  -- Current stats (updated on each sync)
  subscriber_count BIGINT DEFAULT 0,
  total_view_count BIGINT DEFAULT 0,
  video_count INTEGER DEFAULT 0,

  -- Tracking metadata
  tracked_since TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  sync_enabled BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX idx_channels_category ON channels(category);
CREATE INDEX idx_channels_is_competitor ON channels(is_competitor);
CREATE INDEX idx_channels_client_id ON channels(client_id);

-- ============================================
-- CHANNEL_SNAPSHOTS: Daily state capture
-- ============================================
CREATE TABLE channel_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,

  -- Stats at this point in time
  subscriber_count BIGINT,
  total_view_count BIGINT,
  video_count INTEGER,

  -- Computed metrics
  subscriber_change INTEGER,          -- change since last snapshot
  view_change BIGINT,
  video_change INTEGER,

  -- Content mix at snapshot time
  shorts_count INTEGER DEFAULT 0,
  longs_count INTEGER DEFAULT 0,

  -- Engagement metrics (averaged across recent videos)
  avg_views_per_video NUMERIC,
  avg_engagement_rate NUMERIC,        -- (likes + comments) / views

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(channel_id, snapshot_date)
);

CREATE INDEX idx_channel_snapshots_date ON channel_snapshots(snapshot_date);
CREATE INDEX idx_channel_snapshots_channel ON channel_snapshots(channel_id);

-- ============================================
-- VIDEOS: Individual video records
-- ============================================
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_video_id TEXT UNIQUE NOT NULL,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  -- Core metadata
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  published_at TIMESTAMPTZ,

  -- Video properties
  duration_seconds INTEGER,
  video_type TEXT CHECK (video_type IN ('short', 'long')),

  -- Current stats (updated on each sync)
  view_count BIGINT DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,

  -- Derived metrics
  engagement_rate NUMERIC,            -- (likes + comments) / views

  -- Content analysis (populated by analysis job)
  detected_format TEXT,               -- 'tutorial', 'review', 'vlog', etc.
  title_patterns TEXT[],              -- ['question', 'number', 'power_word']
  hook_text TEXT,                     -- First line / hook if detected

  -- Tracking
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_videos_channel ON videos(channel_id);
CREATE INDEX idx_videos_published ON videos(published_at DESC);
CREATE INDEX idx_videos_type ON videos(video_type);
CREATE INDEX idx_videos_format ON videos(detected_format);

-- ============================================
-- VIDEO_SNAPSHOTS: Performance over time
-- ============================================
CREATE TABLE video_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,

  -- Stats at this point
  view_count BIGINT,
  like_count INTEGER,
  comment_count INTEGER,

  -- Velocity metrics
  view_velocity INTEGER,              -- views gained since last snapshot

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(video_id, snapshot_date)
);

CREATE INDEX idx_video_snapshots_date ON video_snapshots(snapshot_date);
CREATE INDEX idx_video_snapshots_video ON video_snapshots(video_id);

-- ============================================
-- CONTENT_INSIGHTS: Aggregated analysis
-- ============================================
CREATE TABLE content_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope: can be per-channel, per-category, or global
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  category TEXT,                      -- if channel_id is null, this is category-level

  insight_type TEXT NOT NULL,         -- 'title_pattern', 'posting_schedule', 'format_performance', 'trend'
  insight_date DATE NOT NULL,

  -- Flexible JSON payload for different insight types
  data JSONB NOT NULL,

  -- Validity
  valid_from DATE,
  valid_until DATE,                   -- insights expire and get refreshed

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(channel_id, category, insight_type, insight_date)
);

CREATE INDEX idx_content_insights_type ON content_insights(insight_type);
CREATE INDEX idx_content_insights_channel ON content_insights(channel_id);
CREATE INDEX idx_content_insights_date ON content_insights(insight_date DESC);

-- ============================================
-- SYNC_LOG: Track sync operations
-- ============================================
CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  sync_type TEXT NOT NULL,            -- 'manual', 'scheduled', 'initial'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Results
  channels_synced INTEGER DEFAULT 0,
  videos_synced INTEGER DEFAULT 0,
  errors TEXT[],

  -- API usage tracking
  youtube_api_calls INTEGER DEFAULT 0,

  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX idx_sync_log_started ON sync_log(started_at DESC);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- Top performing videos across all competitors (last 30 days)
CREATE VIEW top_competitor_videos AS
SELECT
  v.id,
  v.youtube_video_id,
  v.title,
  v.thumbnail_url,
  v.video_type,
  v.view_count,
  v.like_count,
  v.comment_count,
  v.engagement_rate,
  v.published_at,
  v.detected_format,
  v.title_patterns,
  c.name as channel_name,
  c.category as channel_category,
  c.subscriber_count as channel_subscribers
FROM videos v
JOIN channels c ON v.channel_id = c.id
WHERE v.published_at > NOW() - INTERVAL '30 days'
  AND c.is_competitor = true
ORDER BY v.view_count DESC;

-- Channel performance comparison
CREATE VIEW channel_comparison AS
SELECT
  c.id,
  c.name,
  c.category,
  c.subscriber_count,
  c.video_count,
  c.is_competitor,
  COUNT(v.id) FILTER (WHERE v.published_at > NOW() - INTERVAL '30 days') as videos_last_30d,
  AVG(v.view_count) FILTER (WHERE v.published_at > NOW() - INTERVAL '30 days') as avg_views_30d,
  AVG(v.engagement_rate) FILTER (WHERE v.published_at > NOW() - INTERVAL '30 days') as avg_engagement_30d,
  COUNT(v.id) FILTER (WHERE v.video_type = 'short' AND v.published_at > NOW() - INTERVAL '30 days') as shorts_last_30d,
  COUNT(v.id) FILTER (WHERE v.video_type = 'long' AND v.published_at > NOW() - INTERVAL '30 days') as longs_last_30d
FROM channels c
LEFT JOIN videos v ON c.id = v.channel_id
GROUP BY c.id;

-- Title pattern effectiveness
CREATE VIEW title_pattern_performance AS
SELECT
  unnest(v.title_patterns) as pattern,
  c.category,
  COUNT(*) as video_count,
  AVG(v.view_count) as avg_views,
  AVG(v.engagement_rate) as avg_engagement,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.view_count) as median_views
FROM videos v
JOIN channels c ON v.channel_id = c.id
WHERE v.title_patterns IS NOT NULL
  AND v.published_at > NOW() - INTERVAL '90 days'
GROUP BY unnest(v.title_patterns), c.category
HAVING COUNT(*) >= 5
ORDER BY avg_views DESC;

-- ============================================
-- ROW LEVEL SECURITY (optional, for multi-tenant)
-- ============================================
-- Enable RLS on all tables
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (you can restrict later for multi-tenant)
CREATE POLICY "Allow all for authenticated users" ON channels FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON channel_snapshots FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON videos FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON video_snapshots FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON content_insights FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON sync_log FOR ALL USING (true);

-- ============================================
-- SAMPLE DATA COMMENTS (not executed)
-- ============================================
-- After setup, you'll migrate existing localStorage competitors:
--
-- INSERT INTO channels (youtube_channel_id, name, category, subscriber_count, ...)
-- SELECT ... FROM your existing competitor data
--
-- The sync service will handle ongoing updates
