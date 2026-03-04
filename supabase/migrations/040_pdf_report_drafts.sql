-- 040: PDF Report Drafts
-- Stores saved PDF export drafts so they can be re-opened, edited, and re-exported.

CREATE TABLE pdf_report_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,

  -- Display metadata
  name TEXT NOT NULL,

  -- Export context
  date_range TEXT,
  custom_date_range JSONB,
  selected_channel TEXT,
  client_name TEXT,

  -- Editable content
  opportunities JSONB NOT NULL DEFAULT '[]',
  opening_text TEXT DEFAULT '',
  closing_text TEXT DEFAULT '',
  top_comments JSONB DEFAULT '[]',
  published_html TEXT DEFAULT '',

  -- Status
  status TEXT DEFAULT 'draft',
  last_exported_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pdf_drafts_client ON pdf_report_drafts(client_id);
