-- Intelligence Briefs: Weekly auto-generated strategy briefs per client
CREATE TABLE IF NOT EXISTS intelligence_briefs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id TEXT NOT NULL,
  brief_date DATE NOT NULL,
  brief_type TEXT DEFAULT 'weekly',
  status TEXT DEFAULT 'generated',

  -- Structured sections
  executive_summary TEXT,
  primary_constraint JSONB,
  top_patterns JSONB,
  competitor_highlights JSONB,
  content_gaps JSONB,
  growth_projection JSONB,
  recommended_actions JSONB,
  metrics_snapshot JSONB,

  -- Metadata
  generation_cost DECIMAL(10,4),
  generated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(client_id, brief_date, brief_type)
);

CREATE INDEX IF NOT EXISTS idx_intelligence_briefs_client
  ON intelligence_briefs(client_id, brief_date DESC);

-- Enable RLS
ALTER TABLE intelligence_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read briefs"
  ON intelligence_briefs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert briefs"
  ON intelligence_briefs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update briefs"
  ON intelligence_briefs FOR UPDATE
  TO service_role
  USING (true);
