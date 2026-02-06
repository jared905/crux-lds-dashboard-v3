-- Report Periods for Client Analytics
-- Full View Analytics - Crux Media
-- Migration 014: Enable period-based reporting (weekly, monthly, lifetime)
--
-- This allows clients to upload multiple CSV exports for different time periods
-- and view accurate period-specific stats for ALL videos (not just newly published ones)

-- ============================================
-- REPORT PERIODS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS report_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  -- Period identification
  name TEXT NOT NULL,  -- "January 2025", "Week of Jan 6-12", "Lifetime Baseline"
  period_type TEXT NOT NULL CHECK (period_type IN ('lifetime', 'monthly', 'weekly', 'quarterly', 'custom')),

  -- Actual date range covered by this export
  start_date DATE,
  end_date DATE,

  -- Store the normalized video data for this period as JSONB
  -- This preserves period-specific stats without overwriting other periods
  video_data JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Summary stats for quick display in period selector
  video_count INTEGER DEFAULT 0,
  total_views BIGINT DEFAULT 0,
  total_watch_hours NUMERIC DEFAULT 0,
  total_impressions BIGINT DEFAULT 0,
  subscribers_gained INTEGER DEFAULT 0,

  -- Metadata
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by UUID,  -- References auth.users if you want to track who uploaded
  notes TEXT,  -- Optional notes about this period

  -- Flags
  is_baseline BOOLEAN DEFAULT FALSE,  -- Mark as the lifetime/baseline period
  is_active BOOLEAN DEFAULT TRUE,  -- Soft delete support

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Fast lookup of periods by channel
CREATE INDEX IF NOT EXISTS idx_report_periods_channel_id ON report_periods(channel_id);

-- Find periods by date range
CREATE INDEX IF NOT EXISTS idx_report_periods_dates ON report_periods(channel_id, start_date, end_date);

-- Find baseline period quickly
CREATE INDEX IF NOT EXISTS idx_report_periods_baseline ON report_periods(channel_id, is_baseline) WHERE is_baseline = TRUE;

-- Sort by upload date
CREATE INDEX IF NOT EXISTS idx_report_periods_uploaded ON report_periods(channel_id, uploaded_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE report_periods ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (matches existing RLS pattern)
CREATE POLICY "Allow all for authenticated users" ON report_periods
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow read access for anon users (for public dashboards if needed)
CREATE POLICY "Allow read for anon" ON report_periods
  FOR SELECT
  TO anon
  USING (true);

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_report_periods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER report_periods_updated_at
  BEFORE UPDATE ON report_periods
  FOR EACH ROW
  EXECUTE FUNCTION update_report_periods_updated_at();

-- ============================================
-- ADD ACTIVE PERIOD REFERENCE TO CHANNELS
-- ============================================

-- Add column to track which period is currently being viewed (optional, for UX)
ALTER TABLE channels
ADD COLUMN IF NOT EXISTS active_period_id UUID REFERENCES report_periods(id) ON DELETE SET NULL;

-- ============================================
-- HELPER VIEW: Latest period per channel
-- ============================================

CREATE OR REPLACE VIEW latest_report_periods AS
SELECT DISTINCT ON (channel_id)
  id,
  channel_id,
  name,
  period_type,
  start_date,
  end_date,
  video_count,
  total_views,
  total_watch_hours,
  uploaded_at
FROM report_periods
WHERE is_active = TRUE
ORDER BY channel_id, uploaded_at DESC;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE report_periods IS 'Stores period-specific video analytics data for client reporting. Each upload creates a new period with its own stats snapshot.';
COMMENT ON COLUMN report_periods.video_data IS 'JSONB array of normalized video rows with period-specific stats (views, watch hours, etc. for that period only)';
COMMENT ON COLUMN report_periods.is_baseline IS 'TRUE for lifetime/all-time data, used as reference baseline';
COMMENT ON COLUMN report_periods.period_type IS 'Type of period: lifetime (baseline), monthly, weekly, quarterly, or custom date range';
