/**
 * /api/add-channels — add competitors or non-OAuth clients in bulk.
 *
 * Accepts a list of YouTube URLs, @handles, or UC… IDs. Resolves each
 * via the YouTube Data API and inserts a row into `channels`. Designed
 * to handle both:
 *   - is_competitor = true (tier: priority | tracked | archive)
 *   - is_client     = true, no OAuth attached
 *
 * Body:
 *   {
 *     inputs: ["https://youtube.com/@channel", "@channel", "UCxxxxx"],
 *     kind: "competitor" | "client",
 *     tier: "priority" | "tracked" | "archive"   // competitor only
 *   }
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const YT_API = 'https://www.googleapis.com/youtube/v3';

function parseDuration(d) {
  if (!d) return 0;
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1]) || 0) * 3600 + (parseInt(m[2]) || 0) * 60 + (parseInt(m[3]) || 0);
}

// Decide how to query YouTube for a given input string.
function parseInput(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  // Direct UC… id
  if (/^UC[A-Za-z0-9_-]{22}$/.test(s)) return { type: 'id', value: s, original: s };
  // @handle alone
  if (/^@[A-Za-z0-9_.-]+$/.test(s)) return { type: 'handle', value: s, original: s };
  // URL with channel id
  const idMatch = s.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/i);
  if (idMatch) return { type: 'id', value: idMatch[1], original: s };
  // URL with @handle
  const handleMatch = s.match(/youtube\.com\/(@[A-Za-z0-9_.-]+)/i);
  if (handleMatch) return { type: 'handle', value: handleMatch[1], original: s };
  // URL with /user/ or /c/ — fall back to legacy lookups (less reliable)
  const userMatch = s.match(/youtube\.com\/(?:user|c)\/([A-Za-z0-9_.-]+)/i);
  if (userMatch) return { type: 'username', value: userMatch[1], original: s };
  return null;
}

async function resolveOne(parsed, apiKey) {
  const part = 'snippet,statistics,contentDetails';
  let url;
  if (parsed.type === 'id') {
    url = `${YT_API}/channels?part=${part}&id=${parsed.value}&key=${apiKey}`;
  } else if (parsed.type === 'handle') {
    url = `${YT_API}/channels?part=${part}&forHandle=${encodeURIComponent(parsed.value)}&key=${apiKey}`;
  } else if (parsed.type === 'username') {
    url = `${YT_API}/channels?part=${part}&forUsername=${encodeURIComponent(parsed.value)}&key=${apiKey}`;
  } else {
    return null;
  }
  const resp = await fetch(url);
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message);
  if (!json.items?.length) return null;
  const item = json.items[0];
  return {
    youtube_channel_id: item.id,
    name: item.snippet?.title || '(unknown)',
    description: item.snippet?.description || null,
    custom_url: item.snippet?.customUrl || null,
    thumbnail_url: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || null,
    country: item.snippet?.country || null,
    subscriber_count: parseInt(item.statistics?.subscriberCount) || 0,
    total_view_count: parseInt(item.statistics?.viewCount) || 0,
    video_count: parseInt(item.statistics?.videoCount) || 0,
    uploads_playlist_id: item.contentDetails?.relatedPlaylists?.uploads || null,
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'YOUTUBE_API_KEY not configured' });

  const body = req.body || {};
  const inputs = Array.isArray(body.inputs) ? body.inputs.filter(s => s && s.trim()) : [];
  const kind = body.kind === 'client' ? 'client' : 'competitor';
  const tier = ['priority', 'tracked', 'archive'].includes(body.tier) ? body.tier : 'tracked';
  const stubName = (body.name || '').trim();

  // Label-only client: no YouTube URL provided, just a name. Create one
  // channels row with a synthetic id so the rest of the app (Client picker,
  // client_channels junction, etc.) can reference it without breaking the
  // NOT NULL UNIQUE constraint on youtube_channel_id.
  if (kind === 'client' && !inputs.length) {
    if (!stubName) return res.status(400).json({ error: 'Either inputs[] or name is required' });
    const synthId = `stub_${stubName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)}_${Math.random().toString(36).slice(2, 8)}`;
    const { data: existing } = await supabase
      .from('channels').select('id, name')
      .eq('name', stubName).eq('is_client', true).maybeSingle();
    if (existing) {
      return res.status(200).json({
        success: true, kind, counts: { added: 0, skipped: 1, errors: 0 },
        added: [], errors: [],
        skipped: [{ input: stubName, reason: `Client "${stubName}" already exists`, channel_id: existing.id }],
      });
    }
    const { data: inserted, error: insErr } = await supabase.from('channels').insert({
      youtube_channel_id: synthId,
      name: stubName,
      is_competitor: false,
      is_client: true,
      sync_enabled: false, // no YouTube id to sync against
      tier: 'priority',
      tracked_since: new Date().toISOString(),
    }).select('id, name').single();
    if (insErr) return res.status(500).json({ error: insErr.message });
    return res.status(200).json({
      success: true, kind, counts: { added: 1, skipped: 0, errors: 0 },
      added: [{ input: stubName, id: inserted.id, name: inserted.name, youtube_channel_id: synthId }],
      skipped: [], errors: [],
    });
  }

  if (!inputs.length) return res.status(400).json({ error: 'inputs[] is required' });

  const added = [];
  const skipped = [];
  const errors = [];

  for (const raw of inputs) {
    const parsed = parseInput(raw);
    if (!parsed) {
      skipped.push({ input: raw, reason: 'Unrecognized format — expected URL, @handle, or UC… id' });
      continue;
    }
    try {
      const resolved = await resolveOne(parsed, apiKey);
      if (!resolved) {
        skipped.push({ input: raw, reason: 'Channel not found on YouTube' });
        continue;
      }

      // Skip if channel already exists
      const { data: existing } = await supabase
        .from('channels')
        .select('id, name, is_client, is_competitor')
        .eq('youtube_channel_id', resolved.youtube_channel_id)
        .maybeSingle();

      if (existing) {
        skipped.push({
          input: raw,
          reason: `Already in DB as ${existing.is_client ? 'client' : 'competitor'}: ${existing.name}`,
          channel_id: existing.id,
        });
        continue;
      }

      // Only columns that actually exist on the channels table. Earlier
      // version tried to write `country` which is captured from YouTube
      // but not in the schema — every insert errored out with a schema
      // cache miss. Drop it.
      const row = {
        youtube_channel_id: resolved.youtube_channel_id,
        name: resolved.name,
        description: resolved.description,
        custom_url: resolved.custom_url,
        thumbnail_url: resolved.thumbnail_url,
        subscriber_count: resolved.subscriber_count,
        total_view_count: resolved.total_view_count,
        video_count: resolved.video_count,
        is_competitor: kind === 'competitor',
        is_client: kind === 'client',
        sync_enabled: true,
        tier: kind === 'competitor' ? tier : 'priority',
        tracked_since: new Date().toISOString(),
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('channels')
        .insert(row)
        .select('id, name')
        .single();

      if (insertErr) {
        errors.push({ input: raw, reason: insertErr.message });
        continue;
      }
      added.push({
        input: raw,
        id: inserted.id,
        name: inserted.name,
        youtube_channel_id: resolved.youtube_channel_id,
      });
    } catch (err) {
      errors.push({ input: raw, reason: err.message });
    }
  }

  return res.status(200).json({
    success: true,
    kind,
    tier,
    counts: { added: added.length, skipped: skipped.length, errors: errors.length },
    added,
    skipped,
    errors,
  });
}
