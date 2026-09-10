-- 117: sync quarantine — stop retrying channels that keep failing, without
-- deleting anything (2026-09-10).
--
-- Thirteen competitor channels had failed every nightly sync for 30+ days:
-- dead handles, renamed handles, and three with mistyped UC ids — including
-- LDS Church (Official). They were retried every night with a 2h backoff,
-- burning attempts and making healthy runs log as "failed".
--
-- Deleting them automatically was considered and rejected: channels(id) is
-- referenced with ON DELETE CASCADE from ~50 tables (videos, snapshots,
-- audits, cohort memberships, brand context). An auto-remove rule would
-- have erased a core-vertical channel and its audits over a typo.
--
-- So: after QUARANTINE_AFTER consecutive HARD failures (channel not found,
-- handle unresolvable — never quota or network errors), the sync flips
-- sync_enabled to false and records why. The channel and every row that
-- hangs off it stay put. The "Failing sync" modal lists quarantined
-- channels with Retry / Archive, and a human decides.

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS consecutive_sync_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_disabled_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_disabled_reason      TEXT;

COMMENT ON COLUMN channels.consecutive_sync_failures IS
  'Hard sync failures in a row (channel not found / handle unresolvable). Reset to 0 on any successful sync. Transient errors (quota, 5xx, network) do not count. At 7 the sync sets sync_enabled=false and fills sync_disabled_*.';
COMMENT ON COLUMN channels.sync_disabled_at IS
  'When the sync was switched off for this channel, by quarantine or by an operator archiving it. NULL while syncing.';
COMMENT ON COLUMN channels.sync_disabled_reason IS
  'Why sync_enabled is false: the last hard error at quarantine time, or "archived by operator". Shown in the Failing sync modal.';

-- Channels already stuck: seed the counter so the first hop after deploy
-- quarantines them instead of waiting another week. Anything with a
-- recorded hard error and no successful sync in 14+ days has, in
-- practice, failed every attempt in that window.
UPDATE channels
   SET consecutive_sync_failures = 7
 WHERE sync_enabled = true
   AND last_sync_error IS NOT NULL
   AND (last_sync_error ILIKE '%not found%' OR last_sync_error ILIKE '%handle resolution failed%')
   AND (last_synced_at IS NULL OR last_synced_at < now() - INTERVAL '14 days')
   AND consecutive_sync_failures = 0;

CREATE INDEX IF NOT EXISTS idx_channels_sync_disabled
  ON channels (sync_disabled_at)
  WHERE sync_disabled_at IS NOT NULL;

-- ── Self-verification ────────────────────────────────────────────────
DO $$
DECLARE seeded INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'channels' AND column_name = 'consecutive_sync_failures') THEN
    RAISE EXCEPTION 'channels.consecutive_sync_failures missing after migration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'channels' AND column_name = 'sync_disabled_reason') THEN
    RAISE EXCEPTION 'channels.sync_disabled_reason missing after migration';
  END IF;
  SELECT count(*) INTO seeded FROM channels WHERE consecutive_sync_failures >= 7 AND sync_enabled = true;
  RAISE NOTICE '117 ok: quarantine columns present; % channel(s) pre-seeded for quarantine on the next sync.', seeded;
END $$;
