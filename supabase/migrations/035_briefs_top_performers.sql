-- Add top_performers column to intelligence_briefs
ALTER TABLE intelligence_briefs ADD COLUMN IF NOT EXISTS top_performers JSONB;

-- Also relax the insert policy to allow authenticated users to generate briefs
DROP POLICY IF EXISTS "Authenticated users can insert briefs" ON intelligence_briefs;
CREATE POLICY "Authenticated users can insert briefs"
  ON intelligence_briefs FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update briefs" ON intelligence_briefs;
CREATE POLICY "Authenticated users can update briefs"
  ON intelligence_briefs FOR UPDATE
  TO authenticated
  USING (true);
