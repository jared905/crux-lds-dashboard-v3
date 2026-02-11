-- 024_remove_anon_data_access.sql
-- Remove anonymous (unauthenticated) access to data tables.
-- The anon key is visible in frontend JS — anyone could use it to query Supabase directly.
-- After this migration, only authenticated (logged-in) users can read/write data.
-- The user_invites anon SELECT policy is preserved (needed for signup flow).

-- ============================================
-- 1. Drop anon policies from migration 004
--    These were "Allow anon full access" TO anon, authenticated
-- ============================================

DROP POLICY IF EXISTS "Allow anon full access" ON channels;
DROP POLICY IF EXISTS "Allow anon full access" ON channel_snapshots;
DROP POLICY IF EXISTS "Allow anon full access" ON videos;
DROP POLICY IF EXISTS "Allow anon full access" ON video_snapshots;
DROP POLICY IF EXISTS "Allow anon full access" ON content_insights;
DROP POLICY IF EXISTS "Allow anon full access" ON sync_log;
DROP POLICY IF EXISTS "Allow anon full access" ON categories;
DROP POLICY IF EXISTS "Allow anon full access" ON analysis_presets;

-- ============================================
-- 2. Drop anon policy from migration 014 (report_periods)
-- ============================================

DROP POLICY IF EXISTS "Allow read for anon" ON report_periods;

-- ============================================
-- 3. Drop anon policy from migration 022 (brand_context)
-- ============================================

DROP POLICY IF EXISTS "Allow all for anon" ON brand_context;

-- ============================================
-- 4. Recreate as authenticated-only
--    (some tables already have authenticated policies from other migrations;
--     these tables from 004 had anon+authenticated bundled in one policy)
-- ============================================

CREATE POLICY "Allow authenticated full access" ON channels
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON channel_snapshots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON videos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON video_snapshots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON content_insights
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON sync_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON analysis_presets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
