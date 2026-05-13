-- 068: RPC helper for accurate cadence on young channels.
--
-- Cadence is computed as uploads ÷ window weeks. If a channel started
-- publishing less than `windowDays` ago, the full divisor over-divides
-- and the cadence reads ~3× lower than reality. The fix is to clip the
-- divisor to the channel's actual observed publishing span.
--
-- This function returns the earliest published_at per channel — Supabase's
-- JS client can't do GROUP BY directly, so we expose it as an RPC.
--
-- Stable + read-only so it's safe to call from the anon role.

CREATE OR REPLACE FUNCTION channel_earliest_video(ids uuid[])
RETURNS TABLE (channel_id uuid, earliest timestamptz)
LANGUAGE sql
STABLE
AS $$
  SELECT channel_id, MIN(published_at) AS earliest
  FROM videos
  WHERE channel_id = ANY(ids)
    AND published_at IS NOT NULL
  GROUP BY channel_id;
$$;

GRANT EXECUTE ON FUNCTION channel_earliest_video(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION channel_earliest_video(uuid[]) TO anon;
