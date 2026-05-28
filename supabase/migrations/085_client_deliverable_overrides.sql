-- 085: client_deliverable_overrides — persisted inline edits the
-- strategist makes inside the rendered deliverable.
--
-- Why this exists: the deliverable is computed from the spine + audit
-- data. The strategist often wants to rewrite a header, sharpen a
-- "Why" rationale, fix a host name, or rename an "In practice" tag
-- before sending it to the client. Without persistence, those edits
-- only survive the current session — close the deliverable and the
-- prose snaps back to the auto-generated default.
--
-- Architecture:
--   - Spine remains the canonical source for positioning data (editorial_pov,
--     voice_tone, host fields). The deliverable still renders FROM the spine.
--   - Overrides live in this table, keyed by (client_id, field_path).
--   - On render: load overrides for the client, render override-or-default
--     per element.
--   - On save: capture innerHTML of every path-tagged <E> element, upsert
--     the diff.
--   - Reset wipes overrides for this client.
--
-- field_path is a stable, human-readable string like:
--   - 'positioning.editorial_pov.why'
--   - 'positioning.voice_tone.in_practice'
--   - 'positioning.host_archetype.kicker'
--   - 'host.<host_id>.name'
--   - 'host.<host_id>.archetype'
--   - 'audit.topsheet.title'
--
-- content_type is 'html' (innerHTML, may contain inline tags like
-- <strong>) or 'text' (plain text only). Renderer dangerouslySetInnerHTML
-- when 'html', textContent when 'text'.

CREATE TABLE IF NOT EXISTS client_deliverable_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  field_path  TEXT NOT NULL,
  content     TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'html'
    CHECK (content_type IN ('html', 'text')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per (client, field) — upsert pattern.
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_deliverable_overrides_field
  ON client_deliverable_overrides(client_id, field_path);

CREATE INDEX IF NOT EXISTS idx_client_deliverable_overrides_client
  ON client_deliverable_overrides(client_id, updated_at DESC);

COMMENT ON TABLE client_deliverable_overrides IS
  'Per-(client, field_path) inline-edit overrides for the rendered deliverable. Spine stays canonical; this layer is the strategist''s prose layer over computed/AI-generated rendering.';
COMMENT ON COLUMN client_deliverable_overrides.field_path IS
  'Stable, human-readable identifier for the rendered element being overridden — e.g. "positioning.editorial_pov.why" or "host.<uuid>.name". Path is set in the React component; it does not need to be exhaustive — only paths that are tagged in the rendered tree can be saved.';

ALTER TABLE client_deliverable_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read deliverable overrides"
  ON client_deliverable_overrides FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert deliverable overrides"
  ON client_deliverable_overrides FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update deliverable overrides"
  ON client_deliverable_overrides FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete deliverable overrides"
  ON client_deliverable_overrides FOR DELETE
  TO authenticated USING (true);
