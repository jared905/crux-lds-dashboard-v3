-- 109_fix_public_rls_policies.sql
--
-- Closes anon read/write access on five tables.
--
-- WHAT WAS WRONG
-- Migrations 001/002/033 created policies with no TO clause:
--
--     CREATE POLICY "Allow all for authenticated users"
--       ON categories FOR ALL USING (true);
--
-- Despite the name, a policy with no TO clause applies to PUBLIC, and PUBLIC
-- includes `anon`. With WITH CHECK omitted, USING is reused for writes. So
-- this granted SELECT/INSERT/UPDATE/DELETE to anyone holding the anon key —
-- which ships in the browser bundle.
--
-- Two earlier migrations tried to clean this up and both missed, because
-- DROP POLICY IF EXISTS silently no-ops on a name that doesn't exist:
--   004: dropped "Allow all access to categories"   (actual: "Allow all for authenticated users")
--   024: dropped "Allow anon full access"           (actual: "Allow all for authenticated users")
-- Migration 024 then added a correct `TO authenticated` policy *alongside*
-- the permissive one. Postgres OR's permissive policies together, so the
-- open policy still won. 033 reintroduced the same pattern afterwards.
--
-- Affected: categories, channel_categories, analysis_presets,
--           competitor_groups, competitor_group_members
-- (channels/videos/video_snapshots/etc. were genuinely fixed by 004.)
--
-- This migration drops by exact name, recreates with an explicit
-- TO authenticated, and then VERIFIES — raising an exception rather than
-- reporting success if anything permissive is still addressable by anon.

BEGIN;

-- ── 1. Drop the permissive policies, by their real names ────────────────────
DROP POLICY IF EXISTS "Allow all for authenticated users" ON categories;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON channel_categories;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON analysis_presets;
DROP POLICY IF EXISTS "Allow all for competitor_groups" ON competitor_groups;
DROP POLICY IF EXISTS "Allow all for competitor_group_members" ON competitor_group_members;

-- ── 2. Ensure each table has exactly one authenticated-only policy ──────────
-- 024 already created "Allow authenticated full access" on categories and
-- analysis_presets; drop first so this migration is re-runnable.
DROP POLICY IF EXISTS "Allow authenticated full access" ON categories;
DROP POLICY IF EXISTS "Allow authenticated full access" ON channel_categories;
DROP POLICY IF EXISTS "Allow authenticated full access" ON analysis_presets;
DROP POLICY IF EXISTS "Allow authenticated full access" ON competitor_groups;
DROP POLICY IF EXISTS "Allow authenticated full access" ON competitor_group_members;

CREATE POLICY "Allow authenticated full access" ON categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON channel_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON analysis_presets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON competitor_groups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON competitor_group_members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RLS must actually be on for a policy to matter.
ALTER TABLE categories               ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_presets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_group_members ENABLE ROW LEVEL SECURITY;

-- ── 3. Verify, don't assume ────────────────────────────────────────────────
-- The original bug was a cleanup that reported success while doing nothing.
-- Fail loudly instead.
--
-- Note on roles: the pg_policies view renders a TO-less (PUBLIC) policy as
-- roles = '{public}', not '{0}' — '{0}' is the raw pg_policy.polroles oid
-- form. Match on the rendered names.
DO $$
DECLARE
  fixed_tables CONSTANT TEXT[] := ARRAY[
    'categories', 'channel_categories', 'analysis_presets',
    'competitor_groups', 'competitor_group_members'
  ];
  offending TEXT;
  elsewhere TEXT;
BEGIN
  -- 3a. Hard check, scoped to the tables this migration is responsible for.
  SELECT string_agg(format('  %s."%s" (roles: %s)', tablename, policyname, roles::text), E'\n')
    INTO offending
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = ANY(fixed_tables)
    AND permissive = 'PERMISSIVE'
    AND roles::text[] && ARRAY['anon', 'public'];

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION E'RLS fix failed - still anon-reachable:\n%', offending;
  END IF;

  -- 3b. Soft check: report anon-reachable policies on OTHER tables without
  -- failing, since some (e.g. invite lookups) may be deliberate. Review them.
  SELECT string_agg(format('  %s."%s" (roles: %s)', tablename, policyname, roles::text), E'\n')
    INTO elsewhere
  FROM pg_policies
  WHERE schemaname = 'public'
    AND NOT (tablename = ANY(fixed_tables))
    AND permissive = 'PERMISSIVE'
    AND roles::text[] && ARRAY['anon', 'public'];

  RAISE NOTICE 'RLS fix verified on % tables.', array_length(fixed_tables, 1);
  IF elsewhere IS NOT NULL THEN
    RAISE NOTICE E'Other anon-reachable policies (review, not fixed here):\n%', elsewhere;
  END IF;
END $$;

COMMIT;

-- ── Follow-up, deliberately NOT in this migration ──────────────────────────
-- `TO authenticated USING (true)` still means every signed-in user can read
-- every client's data. A `user_client_access` table exists but no policy
-- consults it. Scoping these to it is a real behavioural change that needs
-- testing against the admin flows, so it belongs in its own migration.
