-- Migration 009: Audit Feature Schema
-- Full View Analytics - Crux Media
-- Adds audit tables, detected series, and extends channels/videos for audit support

-- ============================================
-- PART A: ALTER existing tables
-- ============================================

-- channels: size tier for stratified benchmarking
-- (existing 'tier' column from M008 is client priority; this is subscriber-count-based)
ALTER TABLE channels ADD COLUMN IF NOT EXISTS size_tier TEXT
  CHECK (size_tier IN ('emerging', 'growing', 'established', 'major', 'elite'));
-- emerging: <10K, growing: 10K-100K, established: 100K-500K, major: 500K-1M, elite: 1M+

ALTER TABLE channels ADD COLUMN IF NOT EXISTS monitoring_tier TEXT
  CHECK (monitoring_tier IN ('audit_only', 'tracked', 'full_sync'));

ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_client BOOLEAN DEFAULT false;

ALTER TABLE channels ADD COLUMN IF NOT EXISTS created_via TEXT
  CHECK (created_via IN ('manual', 'competitor_import', 'audit', 'csv_upload'));

-- videos: series detection and audit enrichment
ALTER TABLE videos ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE videos ADD COLUMN IF NOT EXISTS detected_series_id UUID;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_short BOOLEAN;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMPTZ;

-- categories: track origin
ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_via TEXT
  CHECK (created_via IN ('manual', 'seed', 'audit'));

-- Backfill is_short from existing video_type data
UPDATE videos SET is_short = (video_type = 'short') WHERE is_short IS NULL AND video_type IS NOT NULL;

-- ============================================
-- PART B: Detected Series table
-- ============================================
CREATE TABLE IF NOT EXISTS detected_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  audit_id UUID,  -- FK added after audits table is created

  -- Series identity
  name TEXT NOT NULL,
  detection_method TEXT NOT NULL CHECK (detection_method IN ('pattern', 'semantic', 'manual')),
  pattern_regex TEXT,
  semantic_cluster TEXT,

  -- Aggregated metrics (computed at detection time)
  video_count INTEGER DEFAULT 0,
  total_views BIGINT DEFAULT 0,
  avg_views NUMERIC DEFAULT 0,
  avg_engagement_rate NUMERIC DEFAULT 0,
  first_published TIMESTAMPTZ,
  last_published TIMESTAMPTZ,
  cadence_days NUMERIC,

  -- AI analysis
  performance_trend TEXT CHECK (performance_trend IN ('growing', 'stable', 'declining', 'new')),
  ai_notes TEXT,

  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_detected_series_channel ON detected_series(channel_id);

-- FK from videos.detected_series_id → detected_series
ALTER TABLE videos
  ADD CONSTRAINT fk_videos_detected_series
  FOREIGN KEY (detected_series_id) REFERENCES detected_series(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_videos_detected_series ON videos(detected_series_id);
CREATE INDEX IF NOT EXISTS idx_videos_tags ON videos USING GIN(tags);

-- ============================================
-- PART C: Audits table (core audit record)
-- ============================================
CREATE TABLE IF NOT EXISTS audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target channel (nullable at creation, set after ingestion resolves the channel)
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,

  -- Classification
  audit_type TEXT NOT NULL CHECK (audit_type IN ('prospect', 'client_baseline')),
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'running', 'completed', 'failed')),

  -- Configuration (frozen at creation time)
  config JSONB NOT NULL DEFAULT '{}',
  -- Expected: { lookback_months, max_videos, include_shorts, competitor_channel_ids[], tier_benchmarks }

  -- Progress tracking (polled by UI)
  progress JSONB DEFAULT '{"step":"created","pct":0}',
  -- Shape: { step: string, pct: 0-100, message?: string }

  -- Results (populated as sections complete)
  channel_snapshot JSONB,
  series_summary JSONB,
  benchmark_data JSONB,
  opportunities JSONB,
  recommendations JSONB,
  executive_summary TEXT,

  -- Cost tracking
  total_tokens INTEGER DEFAULT 0,
  total_cost NUMERIC(10,6) DEFAULT 0,
  youtube_api_calls INTEGER DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audits_channel ON audits(channel_id);
CREATE INDEX IF NOT EXISTS idx_audits_status ON audits(status);
CREATE INDEX IF NOT EXISTS idx_audits_type ON audits(audit_type);
CREATE INDEX IF NOT EXISTS idx_audits_created ON audits(created_at DESC);

-- Auto-update updated_at (reuses existing function from M001)
CREATE TRIGGER audits_updated_at
  BEFORE UPDATE ON audits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Now add the FK from detected_series.audit_id → audits
ALTER TABLE detected_series
  ADD CONSTRAINT fk_detected_series_audit
  FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_detected_series_audit ON detected_series(audit_id);

-- ============================================
-- PART D: Audit Sections table (per-step progress)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,

  section_key TEXT NOT NULL,
  -- Values: 'ingestion', 'series_detection', 'competitor_matching',
  --         'benchmarking', 'opportunity_analysis', 'recommendations', 'executive_summary'

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Cost tracking per section
  tokens_used INTEGER DEFAULT 0,
  cost NUMERIC(10,6) DEFAULT 0,

  result_data JSONB,

  UNIQUE(audit_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_audit_sections_audit ON audit_sections(audit_id);

-- ============================================
-- PART E: RLS Policies
-- ============================================
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE detected_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_sections ENABLE ROW LEVEL SECURITY;

-- Audits
CREATE POLICY "Authenticated users can read audits"
  ON audits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert audits"
  ON audits FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update audits"
  ON audits FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete audits"
  ON audits FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- Detected Series
CREATE POLICY "Authenticated users can read detected_series"
  ON detected_series FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert detected_series"
  ON detected_series FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update detected_series"
  ON detected_series FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete detected_series"
  ON detected_series FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- Audit Sections
CREATE POLICY "Authenticated users can read audit_sections"
  ON audit_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert audit_sections"
  ON audit_sections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update audit_sections"
  ON audit_sections FOR UPDATE TO authenticated USING (true);

-- ============================================
-- PART F: Additional indexes for audit queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_channels_size_tier ON channels(size_tier);
CREATE INDEX IF NOT EXISTS idx_channels_is_client ON channels(is_client);
