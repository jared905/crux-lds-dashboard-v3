-- 069: Client lifecycle stage + primary strategist assignment.
--
-- Foundation for the operator-facing Portfolio view. Single-strategist
-- today (the founder) but the schema anticipates multi-strategist hiring.
--
-- Stages:
--   prospect       — pre-contract; we're producing an audit pack to win
--   non_oauth      — signed but no OAuth integration yet (early strategy)
--   oauth_active   — full OAuth, ongoing retainer
--   oauth_renewal  — within 60 days of contract renewal decision
--
-- Backfill heuristic:
--   stub channels (youtube_channel_id LIKE 'stub_%') → prospect
--   is_client AND has any OAuth connection → oauth_active
--   is_client AND no OAuth, real YouTube id → non_oauth
--   default (non-client rows) → null

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT
    CHECK (lifecycle_stage IN ('prospect', 'non_oauth', 'oauth_active', 'oauth_renewal'));

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS primary_strategist_id UUID;

CREATE INDEX IF NOT EXISTS idx_channels_lifecycle_stage
  ON channels(lifecycle_stage) WHERE lifecycle_stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_channels_primary_strategist
  ON channels(primary_strategist_id) WHERE primary_strategist_id IS NOT NULL;

-- Backfill: derive initial stage for is_client rows
UPDATE channels
SET lifecycle_stage = 'prospect'
WHERE is_client = true
  AND lifecycle_stage IS NULL
  AND (youtube_channel_id LIKE 'stub_%' OR youtube_channel_id IS NULL);

UPDATE channels
SET lifecycle_stage = 'oauth_active'
WHERE is_client = true
  AND lifecycle_stage IS NULL
  AND EXISTS (
    SELECT 1 FROM youtube_oauth_connections oc
    WHERE oc.youtube_channel_id = channels.youtube_channel_id
      AND oc.is_active = true
  );

UPDATE channels
SET lifecycle_stage = 'non_oauth'
WHERE is_client = true
  AND lifecycle_stage IS NULL;

COMMENT ON COLUMN channels.lifecycle_stage IS
  'Operator-facing lifecycle stage for client channels. Drives the Portfolio view''s grouping, default actions, and stage-appropriate widgets. NULL for is_client = false rows (competitors).';

COMMENT ON COLUMN channels.primary_strategist_id IS
  'User id of the primary strategist owning this client. Single-strategist firm today; schema anticipates multi-strategist hiring.';
