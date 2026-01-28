-- Fix RLS Policies for Anonymous Access
-- Full View Analytics - Crux Media
-- Migration 004: Allow anon key to read/write data
--
-- The original policies only worked for "authenticated" users (logged in),
-- but this app uses the anon key without requiring authentication.

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all for authenticated users" ON channels;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON channel_snapshots;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON videos;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON video_snapshots;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON content_insights;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON sync_log;

-- Create new policies that allow anon access
-- Using "anon" role which is what the Supabase anon key uses

-- Channels: full access for anon
CREATE POLICY "Allow anon full access" ON channels
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Channel snapshots: full access for anon
CREATE POLICY "Allow anon full access" ON channel_snapshots
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Videos: full access for anon
CREATE POLICY "Allow anon full access" ON videos
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Video snapshots: full access for anon
CREATE POLICY "Allow anon full access" ON video_snapshots
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Content insights: full access for anon
CREATE POLICY "Allow anon full access" ON content_insights
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Sync log: full access for anon
CREATE POLICY "Allow anon full access" ON sync_log
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Also handle the categories table from migration 002
DROP POLICY IF EXISTS "Allow all access to categories" ON categories;
DROP POLICY IF EXISTS "Allow all access to analysis_presets" ON analysis_presets;

CREATE POLICY "Allow anon full access" ON categories
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon full access" ON analysis_presets
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
