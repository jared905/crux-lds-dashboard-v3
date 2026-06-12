-- 106: alert dismissals — strategist-side snooze for the This Week
-- / Command Center alerts feed.
--
-- Reported 2026-06-12: alerts that aren't currently actionable need a
-- way to be ignored. Two ignore modes:
--   - snooze for N days → alert hides until snooze_until, then reappears
--   - permanent dismiss → alert hides indefinitely (still re-fires if
--     the underlying signal disappears and comes back later)
--
-- Composite key (client_id, alert_type) — one active dismissal per
-- (client, type). Global dismissals (no specific client) use a NULL
-- client_id, useful for the pending OAuth invite alerts which aren't
-- client-scoped.

CREATE TABLE IF NOT EXISTS alert_dismissals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID REFERENCES channels(id) ON DELETE CASCADE,
                 -- nullable on purpose: global alerts (oauth_invite_pending,
                 -- etc.) have no client_id; matching on (NULL, type) works
                 -- through the unique index below using COALESCE.

  alert_type     TEXT NOT NULL,
                 -- mirrors the `type` field in thisWeekService alerts
                 -- (sync_error, stale_brief, intake_pending_confirm, …).
                 -- Stable strings; never refactor without a migration.

  -- Lifecycle
  dismissed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_by   TEXT,
  reason         TEXT,
  snooze_until   TIMESTAMPTZ,
                 -- NULL = permanent dismissal (until manually undone).
                 -- Non-null = the alert resurfaces after this timestamp.

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active dismissal per (client, type). Re-dismissal updates the row.
-- COALESCE handles the global-alert case where client_id IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_dismissals_active
  ON alert_dismissals(COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid), alert_type);

-- Secondary index for the per-client lookup path. We intentionally do
-- NOT use a `WHERE snooze_until IS NULL OR snooze_until > NOW()`
-- predicate because Postgres rejects non-IMMUTABLE functions
-- (including NOW()) in index predicates — the index would need to
-- be reorganized as time advances, which the planner can't do.
-- The runtime query in loadActiveDismissals applies the snooze_until
-- filter parametrically, which uses this index normally.
CREATE INDEX IF NOT EXISTS idx_alert_dismissals_lookup
  ON alert_dismissals(client_id, alert_type);

COMMENT ON TABLE alert_dismissals IS
  'Strategist-side snooze for the This Week / Command Center alerts feed (2026-06-12). One active row per (client, alert_type). snooze_until=NULL means permanent dismissal; non-null means resurfaces after that timestamp. Service-layer filtering in thisWeekService treats expired snoozes as no-op so resurfaced alerts behave correctly.';

COMMENT ON COLUMN alert_dismissals.snooze_until IS
  'NULL = permanent dismissal. Non-null = alert hidden until this timestamp passes. Common values: 1 day, 7 days, 30 days. The strategist can re-dismiss after resurface — that updates the row, doesn''t insert a new one.';

-- ──────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────

ALTER TABLE alert_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read dismissals"
  ON alert_dismissals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can write dismissals"
  ON alert_dismissals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update dismissals"
  ON alert_dismissals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete dismissals"
  ON alert_dismissals FOR DELETE TO authenticated USING (true);
