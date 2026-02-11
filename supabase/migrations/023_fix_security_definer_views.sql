-- 023_fix_security_definer_views.sql
-- Fix Supabase linter errors: views defaulting to SECURITY DEFINER.
-- Set security_invoker = true so views respect the querying user's RLS policies.

ALTER VIEW category_tree SET (security_invoker = true);
ALTER VIEW title_pattern_performance SET (security_invoker = true);
ALTER VIEW top_competitor_videos SET (security_invoker = true);
ALTER VIEW channel_comparison SET (security_invoker = true);
ALTER VIEW category_hierarchy_debug SET (security_invoker = true);
ALTER VIEW channels_with_categories SET (security_invoker = true);
ALTER VIEW latest_report_periods SET (security_invoker = true);
