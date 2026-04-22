-- 059: Honorifics lookup table for proper titles in AI-generated reports
--
-- Apostolic callings change multiple times per year. Storing honorifics as
-- data (not static prompt text) lets us update without code deploys.
-- The quarterly narrative generator looks up the proper title+name for each
-- channel so Claude addresses people correctly (Elder vs President vs Sister).

CREATE TABLE IF NOT EXISTS honorifics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,           -- "Dallin H. Oaks"
  title TEXT NOT NULL,               -- "President" | "Elder" | "Sister"
  role TEXT,                         -- "President of the Church", etc.
  youtube_channel_id TEXT,           -- optional direct match via YouTube ID
  channel_name_aliases TEXT[],       -- alternate display names to match
  calling_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_honorifics_full_name ON honorifics(full_name);
CREATE INDEX IF NOT EXISTS idx_honorifics_youtube_channel_id ON honorifics(youtube_channel_id);
CREATE INDEX IF NOT EXISTS idx_honorifics_active ON honorifics(calling_active);

ALTER TABLE honorifics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read honorifics"
  ON honorifics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage honorifics"
  ON honorifics FOR ALL TO service_role USING (true);

-- Seed: First Presidency (verified April 2026)
INSERT INTO honorifics (full_name, title, role, sort_order, notes) VALUES
  ('Dallin H. Oaks', 'President', 'President of the Church', 1, NULL),
  ('Henry B. Eyring', 'President', 'First Counselor in the First Presidency', 2,
   'Remains a member of the Quorum of the Twelve but referenced as President while in the First Presidency.'),
  ('D. Todd Christofferson', 'President', 'Second Counselor in the First Presidency', 3,
   'Remains a member of the Quorum of the Twelve but referenced as President while in the First Presidency.');

-- Seed: Quorum of the Twelve Apostles
INSERT INTO honorifics (full_name, title, role, sort_order) VALUES
  ('Dieter F. Uchtdorf', 'President', 'Acting President of the Quorum of the Twelve Apostles', 10),
  ('David A. Bednar', 'Elder', 'Quorum of the Twelve Apostles', 11),
  ('Quentin L. Cook', 'Elder', 'Quorum of the Twelve Apostles', 12),
  ('Neil L. Andersen', 'Elder', 'Quorum of the Twelve Apostles', 13),
  ('Ronald A. Rasband', 'Elder', 'Quorum of the Twelve Apostles', 14),
  ('Gary E. Stevenson', 'Elder', 'Quorum of the Twelve Apostles', 15),
  ('Dale G. Renlund', 'Elder', 'Quorum of the Twelve Apostles', 16),
  ('Gerrit W. Gong', 'Elder', 'Quorum of the Twelve Apostles', 17),
  ('Ulisses Soares', 'Elder', 'Quorum of the Twelve Apostles', 18),
  ('Patrick Kearon', 'Elder', 'Quorum of the Twelve Apostles', 19),
  ('Gérald Caussé', 'Elder', 'Quorum of the Twelve Apostles', 20),
  ('Clark G. Gilbert', 'Elder', 'Quorum of the Twelve Apostles', 21);

COMMENT ON TABLE honorifics IS
  'Proper titles for public figures referenced in AI-generated reports. Update via direct SQL or admin UI — do not hardcode in prompts.';
