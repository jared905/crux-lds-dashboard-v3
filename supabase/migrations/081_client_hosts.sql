-- 081: client_hosts — multiple host profiles per client.
--
-- The original schema assumed one on-camera host per channel
-- (client_strategy_spine.host_archetype as a single TEXT field). Many
-- channels run multiple series with distinct hosts — a doctrine series
-- with The Sage, a practical Q&A with The Companion, etc. Each host
-- needs its own archetype, voice refinement, and audition rubric.
--
-- Migration approach:
--   - Add client_hosts table for multi-host profiles.
--   - Add nullable host_id to client_talent_audition_rubric — existing
--     rubrics (host_id NULL) continue to work as "client-level rubric"
--     for backward compat; new rubrics scope to a specific host.
--   - Replace the rubric uniqueness index so each (client, host) pair
--     can have its own active rubric.
--
-- Auto-migration from the legacy single host_archetype field happens
-- at application read time, not in SQL — see clientHostsService.js
-- (first load of the Hosts panel seeds a "Primary host" row from the
-- existing spine.host_archetype when client_hosts is empty).

CREATE TABLE IF NOT EXISTS client_hosts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,

  -- Host profile fields
  name                    TEXT,                          -- candidate name; nullable when pre-casting
  archetype               TEXT,                          -- catalog label or composed string (matches host_archetype shape from migration 077)
  voice_tone_refinement   TEXT,                          -- host-specific overlay on the channel's voice/tone
  series_label            TEXT,                          -- which series this host fronts (free text — "Doctrine deep-dives", "Daily Q&A", etc.)
  notes                   TEXT,                          -- strategist notes (casting status, audition outcomes, anything off-template)

  sort_order              INT NOT NULL DEFAULT 0,        -- strategist-controlled order in the spine UI

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_hosts_client
  ON client_hosts(client_id, sort_order);

COMMENT ON TABLE client_hosts IS
  'Per-client host profiles for multi-series channels. Each row is one on-camera persona with its own archetype, voice refinement, and (optionally) audition rubric. Replaces the implicit "one host per client" assumption of client_strategy_spine.host_archetype.';

ALTER TABLE client_hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read hosts"
  ON client_hosts FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert hosts"
  ON client_hosts FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update hosts"
  ON client_hosts FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete hosts"
  ON client_hosts FOR DELETE
  TO authenticated USING (true);

-- ──────────────────────────────────────────────────
-- Rubric per host
-- ──────────────────────────────────────────────────

ALTER TABLE client_talent_audition_rubric
  ADD COLUMN IF NOT EXISTS host_id UUID REFERENCES client_hosts(id) ON DELETE CASCADE;

COMMENT ON COLUMN client_talent_audition_rubric.host_id IS
  'When set, this rubric is scoped to a specific host profile. NULL means it''s a client-level rubric from the pre-multi-host era — still valid, just unscoped.';

-- Replace the "one active per client" unique index with "one active per (client, host)".
-- COALESCE host_id to a sentinel so NULLs collapse correctly under uniqueness.
DROP INDEX IF EXISTS idx_talent_rubric_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_talent_rubric_active
  ON client_talent_audition_rubric(client_id, COALESCE(host_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'active';
