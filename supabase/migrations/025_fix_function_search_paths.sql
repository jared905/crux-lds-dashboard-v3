-- 025_fix_function_search_paths.sql
-- Pin search_path on all functions to prevent schema injection attacks.
-- Fixes Supabase linter warning: function_search_path_mutable

ALTER FUNCTION update_updated_at() SET search_path = public;
ALTER FUNCTION update_report_periods_updated_at() SET search_path = public;
ALTER FUNCTION update_oauth_connection_timestamp() SET search_path = public;
ALTER FUNCTION cleanup_expired_oauth_states() SET search_path = public;
ALTER FUNCTION handle_new_user() SET search_path = public;
ALTER FUNCTION is_admin() SET search_path = public;
