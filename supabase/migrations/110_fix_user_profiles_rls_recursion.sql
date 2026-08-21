-- 110_fix_user_profiles_rls_recursion.sql
--
-- Fixes infinite RLS recursion on user_profiles.
--
-- SYMPTOM
-- `fetchUserProfile` times out ("Profile fetch timed out after 8000ms"),
-- `isAdmin` falls back to false, and the app silently degrades every admin to
-- DEFAULT_VIEWER_TABS — the nav collapses to Performance + Strategy, the client
-- list comes back empty, and the "Connect your YouTube channel" onboarding
-- shows even though the account has clients. It is intermittent, because it
-- depends on whether the statement times out before the page gives up.
--
-- CAUSE
-- Migration 005 created this SELECT policy ON user_profiles:
--
--   CREATE POLICY "Admins can read all profiles"
--     ON user_profiles FOR SELECT TO authenticated
--     USING (EXISTS (SELECT 1 FROM user_profiles
--                    WHERE user_id = auth.uid() AND role = 'admin'));
--
-- The USING clause queries the very table the policy guards, so evaluating it
-- re-triggers itself. Postgres detects this as infinite recursion; through
-- PostgREST it surfaces as a hung request rather than a clean error.
--
-- FIX
-- Read the role through a SECURITY DEFINER function, which runs as the
-- function owner and therefore bypasses RLS on the inner read. That breaks the
-- cycle. The function is the canonical way to express "is the caller an admin"
-- and can be reused by any other policy that needs it.

BEGIN;

-- ── 1. Non-recursive admin check ───────────────────────────────────────────
-- SECURITY DEFINER: runs as owner, so the SELECT below is not itself
-- subject to user_profiles RLS. search_path is pinned so the function cannot
-- be hijacked by a caller-controlled schema.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ── 2. Replace the recursive policies ──────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all profiles"   ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles"     ON user_profiles;

CREATE POLICY "Admins can read all profiles"
  ON user_profiles FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete profiles"
  ON user_profiles FOR DELETE TO authenticated
  USING (public.is_admin());

-- The self-read policy from 005 stays as-is and is what makes the fix work:
--   "Users can read own profile" USING (auth.uid() = user_id)
-- It is non-recursive, so a user can always resolve their own role even if
-- every other policy is evaluated.

-- ── 3. Verify ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  recursive_policies TEXT;
BEGIN
  -- Any remaining policy ON user_profiles whose expression selects FROM
  -- user_profiles is still recursive.
  SELECT string_agg(format('  "%s" (%s)', policyname, cmd), E'\n')
    INTO recursive_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'user_profiles'
    AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) ILIKE '%user_profiles%';

  IF recursive_policies IS NOT NULL THEN
    RAISE EXCEPTION E'user_profiles still has self-referencing policies:\n%', recursive_policies;
  END IF;

  RAISE NOTICE 'user_profiles RLS is non-recursive; profile reads will resolve.';
END $$;

COMMIT;

-- ── Follow-up ──────────────────────────────────────────────────────────────
-- Other tables carry the same inline pattern:
--   EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role='admin')
-- in migrations 007, 009 and 027. Those are NOT recursive (different table),
-- so they work — but they re-query user_profiles on every row check. Swapping
-- them to public.is_admin() would be both faster and consistent.
