/**
 * /api/resolve-handles — convert placeholder `handle_<name>` channel IDs into
 * real UC… IDs by calling YouTube's `channels?forHandle=` endpoint.
 *
 * Channels imported by handle (no real channel ID known yet) sit with
 * youtube_channel_id like 'handle_studiocandsofficial'. The sync skips them
 * every pass. This endpoint sweeps them, resolves each handle once, and
 * updates the row so the next sync picks them up normally.
 *
 * Idempotent: only operates on rows where youtube_channel_id LIKE 'handle_%'.
 * Cost: 1 YouTube quota unit per channel (free under the 10K daily cap).
 *
 * Usage:
 *   POST /api/resolve-handles?manual=true
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

async function resolveHandleToChannelId(handle, apiKey) {
  // Try `forHandle` first (the newer @handle API)
  const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;
  const handleUrl = `${YOUTUBE_API_BASE}/channels?part=id,snippet&forHandle=${encodeURIComponent('@' + cleanHandle)}&key=${apiKey}`;
  const resp = await fetch(handleUrl);
  const data = await resp.json();
  if (data?.items?.[0]?.id) {
    return { channelId: data.items[0].id, name: data.items[0].snippet?.title || null, source: 'forHandle' };
  }
  // Fallback: legacy `forUsername`
  const userUrl = `${YOUTUBE_API_BASE}/channels?part=id,snippet&forUsername=${encodeURIComponent(cleanHandle)}&key=${apiKey}`;
  const resp2 = await fetch(userUrl);
  const data2 = await resp2.json();
  if (data2?.items?.[0]?.id) {
    return { channelId: data2.items[0].id, name: data2.items[0].snippet?.title || null, source: 'forUsername' };
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  const manual = req.query?.manual === 'true';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !manual) {
    if (process.env.NODE_ENV === 'production') return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'YOUTUBE_API_KEY not configured' });

  const startTime = Date.now();
  const TIME_BUDGET_MS = 270_000;

  try {
    // Pull all unresolved rows
    const { data: targets, error: fetchErr } = await supabase
      .from('channels')
      .select('id, name, youtube_channel_id, custom_url')
      .like('youtube_channel_id', 'handle_%')
      .limit(500);

    if (fetchErr) throw fetchErr;
    if (!targets?.length) {
      return res.status(200).json({ success: true, message: 'No unresolved handles found', resolved: 0, failed: 0 });
    }

    const resolved = [];
    const failed = [];

    for (const ch of targets) {
      if (Date.now() - startTime > TIME_BUDGET_MS) break;

      // Prefer the custom_url (e.g. "@studiocandsofficial") if available;
      // otherwise strip the synthetic "handle_" prefix
      const handle = ch.custom_url || ch.youtube_channel_id.replace(/^handle_/, '');
      try {
        const result = await resolveHandleToChannelId(handle, apiKey);
        if (!result?.channelId) {
          failed.push({ id: ch.id, name: ch.name, handle, reason: 'not found' });
          await supabase.from('channels').update({
            last_sync_attempt_at: new Date().toISOString(),
            last_sync_error: `Handle resolution failed for "${handle}" — channel not found on YouTube`,
          }).eq('id', ch.id);
          continue;
        }

        // Check for collision (another row already owns this UC id)
        const { data: existing } = await supabase
          .from('channels')
          .select('id')
          .eq('youtube_channel_id', result.channelId)
          .neq('id', ch.id)
          .maybeSingle();

        if (existing) {
          failed.push({
            id: ch.id, name: ch.name, handle,
            reason: `Resolved to ${result.channelId} but another channel row already owns that ID (id=${existing.id}). Skipping to avoid duplicates.`,
          });
          continue;
        }

        await supabase.from('channels').update({
          youtube_channel_id: result.channelId,
          last_sync_error: null, // clear any prior error so next sync runs clean
        }).eq('id', ch.id);

        resolved.push({ id: ch.id, name: ch.name, handle, channel_id: result.channelId, source: result.source });
      } catch (err) {
        failed.push({ id: ch.id, name: ch.name, handle, reason: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      total: targets.length,
      resolved: resolved.length,
      failed: failed.length,
      duration_ms: Date.now() - startTime,
      details: { resolved, failed },
    });
  } catch (err) {
    console.error('[resolve-handles] error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
