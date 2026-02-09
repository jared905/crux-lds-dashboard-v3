-- Migration 017: Backfill is_client field
-- Full View Analytics - Crux Media
--
-- This migration ensures proper separation between:
-- - Client channels (is_client = true): Channels added via CSV upload
-- - Competitor channels (is_competitor = true): Research/competitor channels
-- - Audit-only channels (is_competitor = null, is_client = false): Channels created via audits
--
-- The is_client field was added in M009 but wasn't being set consistently.
-- This backfill sets is_client = true for existing channels that were created as clients.

-- Backfill: Set is_client = true for channels that are clients (is_competitor = false)
-- These are channels that were added via CSV upload before we started setting is_client
UPDATE channels
SET is_client = true
WHERE is_competitor = false
  AND (is_client IS NULL OR is_client = false);

-- Ensure competitor channels have is_client = false
UPDATE channels
SET is_client = false
WHERE is_competitor = true
  AND is_client IS NULL;

-- Ensure audit-only channels (is_competitor = null) have is_client = false
UPDATE channels
SET is_client = false
WHERE is_competitor IS NULL
  AND is_client IS NULL;

-- Add a comment explaining the field semantics
COMMENT ON COLUMN channels.is_client IS 'True for client channels (CSV uploads). False for competitors and audit-only channels.';
COMMENT ON COLUMN channels.is_competitor IS 'True for competitor channels. False for clients. NULL for audit-only channels.';
COMMENT ON COLUMN channels.created_via IS 'Origin of channel: manual, competitor_import, audit, csv_upload';
