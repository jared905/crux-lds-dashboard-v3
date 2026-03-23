-- 048: Enable RLS on pdf_report_drafts
-- Fixes Supabase security warning: table was public without RLS.

ALTER TABLE pdf_report_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read drafts"
  ON pdf_report_drafts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert drafts"
  ON pdf_report_drafts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update drafts"
  ON pdf_report_drafts FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete drafts"
  ON pdf_report_drafts FOR DELETE
  TO authenticated
  USING (true);
