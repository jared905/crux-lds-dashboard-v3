-- 070: is_portfolio_root flag for the operator-facing Portfolio view.
--
-- Background: is_client = true is used for two distinct meanings in the
-- existing data model:
--   (a) "this is a retainer client at the portfolio level"
--   (b) "this is an OAuth-tracked sub-channel managed under another client"
-- The Portfolio view needs to show (a), not (b). Without separation, the
-- 14 apostle channels granted OAuth under the Leadership umbrella each
-- appear as independent Portfolio rows.
--
-- New flag: is_portfolio_root. TRUE = appears in Portfolio. FALSE =
-- hidden as a sub-channel. NULL = not yet decided (Portfolio shows by
-- default; user can toggle off per-row).
--
-- Backfill: explicit-root clients that we can identify with high
-- confidence. Everyone else stays NULL so the user toggles them via the
-- UI ("Hide from portfolio" button per row).

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS is_portfolio_root BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_channels_portfolio_root
  ON channels(is_portfolio_root) WHERE is_portfolio_root IS NOT NULL;

-- Backfill 1: any client with a network_name self-referencing or pointing
-- elsewhere is a portfolio root (umbrella). Matches Leadership today.
UPDATE channels
SET is_portfolio_root = true
WHERE is_client = true
  AND is_portfolio_root IS NULL
  AND network_name IS NOT NULL
  AND TRIM(network_name) <> '';

-- Backfill 2: clients with pinned competitors via the client_channels
-- junction are clearly being managed as portfolio clients. Sub-channels
-- under an umbrella typically don't have their own competitor sets.
UPDATE channels
SET is_portfolio_root = true
WHERE is_client = true
  AND is_portfolio_root IS NULL
  AND id IN (SELECT DISTINCT client_id::uuid FROM client_channels WHERE client_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

COMMENT ON COLUMN channels.is_portfolio_root IS
  'TRUE = appears as an independent Portfolio row. FALSE = hidden as a sub-channel under an umbrella client. NULL = not yet decided; Portfolio view shows by default with a per-row hide control. Distinct from is_client because OAuth-tracked sub-channels need is_client=true for analytics access but should not appear as separate portfolio entries.';
