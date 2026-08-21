-- 113: network_tag — client networks (2026-08-20 request).
--
-- Strategists run families of related channels (e.g. the LDS apostles'
-- channels) and want them grouped: a "network" chip on every client
-- card, assignable per client, filterable on the portfolio views.
--
-- One nullable text column, not a join table: a network here is just a
-- shared label. Renaming a network = UPDATE all rows carrying the old
-- value; deleting = SET NULL. The tag list itself is derived from the
-- data (SELECT DISTINCT), so there is nothing extra to keep in sync.
-- The frontend degrades gracefully while this migration is unapplied.

ALTER TABLE channels ADD COLUMN IF NOT EXISTS network_tag TEXT;

CREATE INDEX IF NOT EXISTS idx_channels_network_tag
  ON channels (network_tag) WHERE network_tag IS NOT NULL;

COMMENT ON COLUMN channels.network_tag IS
  'Free-text network/group label (e.g. "LDS Apostles"). Null = no network.';

-- ── Self-verification ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'channels' AND column_name = 'network_tag'
  ) THEN
    RAISE EXCEPTION 'channels.network_tag missing after migration';
  END IF;
  RAISE NOTICE 'migration 113 verified: channels.network_tag present';
END $$;
