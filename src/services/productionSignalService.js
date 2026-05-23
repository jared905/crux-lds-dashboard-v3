/**
 * Production Signal service — runs Claude Vision over a channel's recent
 * thumbnails and caches the structured extraction in
 * channel_production_signals (migration 078).
 *
 * Powers the "Production Approach" section of the client-facing audit
 * deliverable. Refresh is strategist-triggered per cohort (this module
 * exposes the per-channel orchestrator; the cohort UI iterates channels).
 *
 * Lifecycle:
 *   - Caller picks a channel (client's own or a pinned competitor)
 *   - extractAndStoreProductionSignals() fetches recent thumbnails,
 *     calls Claude Vision, parses the structured signals
 *   - Previous active row → 'superseded', new row inserted as 'active'
 *   - Audit pack reads the active row via getActiveProductionSignals
 *
 * Cost: ~12 thumbnails × ~1.5K tokens ≈ $0.02–0.04 per channel per refresh.
 */

import { supabase } from './supabaseClient';
import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';

const DEFAULT_THUMBNAIL_COUNT = 12;

// ──────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────

export async function getActiveProductionSignals(channelId) {
  if (!supabase || !channelId) return null;
  const { data } = await supabase
    .from('channel_production_signals')
    .select('*')
    .eq('channel_id', channelId)
    .eq('status', 'active')
    .maybeSingle();
  return data;
}

/**
 * Batch read — returns `{ [channelId]: row }` for all channels with an
 * active cached extraction. Used by the audit-pack renderer to look up
 * cohort signals in one round-trip.
 */
export async function getActiveProductionSignalsForChannels(channelIds) {
  if (!supabase || !Array.isArray(channelIds) || !channelIds.length) return {};
  const { data } = await supabase
    .from('channel_production_signals')
    .select('channel_id, signals, extracted_at, thumbnail_count, source_video_ids')
    .eq('status', 'active')
    .in('channel_id', channelIds);
  const byChannel = {};
  for (const r of (data || [])) byChannel[r.channel_id] = r;
  return byChannel;
}

// ──────────────────────────────────────────────────
// Extract + store
// ──────────────────────────────────────────────────

async function fetchRecentThumbnails(channelId, thumbnailCount) {
  const { data: videos } = await supabase
    .from('videos')
    .select('youtube_video_id, title, published_at, thumbnail_url')
    .eq('channel_id', channelId)
    .order('published_at', { ascending: false })
    .limit(thumbnailCount);

  if (!videos?.length) return [];
  return videos.filter(v => v.thumbnail_url);
}

async function extractSignalsFromThumbnails(thumbnails, { channelName }) {
  const prompt = buildExtractionPrompt(thumbnails, channelName);
  const systemPrompt = `You are a visual production analyst for a YouTube strategist. You look at a channel's recent thumbnails and extract structured signals about how the channel visually presents itself: composition, framing, typography, brand consistency, production tier. Be honest and specific — vague descriptors are useless to the strategist. Return ONLY valid JSON.`;

  try {
    const result = await claudeAPI.call(
      prompt,
      systemPrompt,
      'production_signal_extraction',
      2048,
      { images: thumbnails.map(t => ({ url: t.thumbnail_url })) },
    );
    const parsed = parseClaudeJSON(result.text, null);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (e) {
    console.error('[productionSignal] extraction failed:', e);
    return null;
  }
}

/**
 * Full refresh for a single channel: fetch thumbnails, extract signals,
 * supersede the previous active row and insert the new one.
 */
export async function extractAndStoreProductionSignals(channelId, { channelName, thumbnailCount = DEFAULT_THUMBNAIL_COUNT, onProgress } = {}) {
  if (!supabase || !channelId) return { ok: false, error: 'missing' };

  onProgress?.({ step: 'starting', channelId, channelName });
  const thumbnails = await fetchRecentThumbnails(channelId, thumbnailCount);
  if (!thumbnails.length) {
    return { ok: false, error: 'No recent videos with thumbnails found for this channel.' };
  }

  onProgress?.({ step: 'analyzing', channelId, channelName, thumbnailCount: thumbnails.length });
  const signals = await extractSignalsFromThumbnails(thumbnails, { channelName });
  if (!signals) {
    return { ok: false, error: 'Failed to extract production signals. The Vision call may have failed.' };
  }

  await supabase
    .from('channel_production_signals')
    .update({ status: 'superseded' })
    .eq('channel_id', channelId)
    .eq('status', 'active');

  const { data: row, error } = await supabase
    .from('channel_production_signals')
    .insert({
      channel_id: channelId,
      status: 'active',
      source_video_ids: thumbnails.map(t => t.youtube_video_id).filter(Boolean),
      thumbnail_count: thumbnails.length,
      signals,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };

  onProgress?.({ step: 'done', channelId, channelName });
  return { ok: true, signals: row };
}

/**
 * Refresh production signals for an entire client cohort: the client's
 * own channel plus every pinned competitor in `client_channels`. Runs
 * channels sequentially so the strategist sees per-channel progress and
 * the API budget doesn't spike. Returns a per-channel result list.
 *
 * `clientId` is the client's channel UUID (matches the `is_client`
 * convention — a client is itself a row in `channels`).
 */
export async function refreshCohortProductionSignals(clientId, { thumbnailCount = DEFAULT_THUMBNAIL_COUNT, onProgress } = {}) {
  if (!supabase || !clientId) return { ok: false, error: 'missing clientId' };

  onProgress?.({ step: 'resolving-cohort' });

  const [ownRes, pinnedRes] = await Promise.all([
    supabase.from('channels').select('id, name').eq('id', clientId).maybeSingle(),
    supabase
      .from('client_channels')
      .select('channel_id, channels(id, name)')
      .eq('client_id', clientId),
  ]);

  const channels = [];
  const seen = new Set();
  if (ownRes.data?.id) {
    channels.push({ id: ownRes.data.id, name: ownRes.data.name });
    seen.add(ownRes.data.id);
  }
  for (const r of (pinnedRes.data || [])) {
    const ch = r.channels;
    if (ch?.id && !seen.has(ch.id)) {
      channels.push({ id: ch.id, name: ch.name });
      seen.add(ch.id);
    }
  }

  if (!channels.length) return { ok: false, error: 'No channels in cohort (client + pinned competitors).' };

  const results = [];
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    onProgress?.({ step: 'channel-start', index: i + 1, total: channels.length, channelName: ch.name });
    try {
      const r = await extractAndStoreProductionSignals(ch.id, {
        channelName: ch.name,
        thumbnailCount,
        onProgress: (sub) => onProgress?.({ ...sub, index: i + 1, total: channels.length, channelName: ch.name }),
      });
      results.push({ channelId: ch.id, channelName: ch.name, ok: r.ok, error: r.error });
    } catch (e) {
      results.push({ channelId: ch.id, channelName: ch.name, ok: false, error: e.message });
    }
  }

  const okCount = results.filter(r => r.ok).length;
  onProgress?.({ step: 'cohort-done', okCount, total: channels.length });
  return { ok: true, results, okCount, total: channels.length };
}

// ──────────────────────────────────────────────────
// Prompt formatting
// ──────────────────────────────────────────────────

function buildExtractionPrompt(thumbnails, channelName) {
  const titleList = thumbnails
    .map((t, i) => `  ${i + 1}. ${t.title || '(untitled)'}`)
    .join('\n');

  return `Analyze the ${thumbnails.length} thumbnails below from the YouTube channel${channelName ? ` "${channelName}"` : ''}. They are this channel's most recent videos, in reverse-chronological order. The corresponding video titles:

${titleList}

Extract structured visual production signals. Return JSON with this exact shape:

{
  "visual_treatment": {
    "face_pct": number,                  // 0-100, % of thumbnails featuring a human face prominently
    "text_pct": number,                  // 0-100, % with overlaid text/headline
    "scene_pct": number,                 // 0-100, % that are scene/B-roll/object-driven (no face, no headline)
    "brand_consistency_score": number,   // 0-100, how visually consistent is the set — palette, typography, framing
    "dominant_palette": [string]         // 2-5 color names actually recurring across thumbnails (e.g. "warm beige", "navy", "deep red")
  },
  "host_framing": {
    "close_pct": number,                 // 0-100, close-up portraits (head + shoulders)
    "mid_pct": number,                   // 0-100, medium shots (waist up)
    "wide_pct": number,                  // 0-100, wide shots / environmental
    "host_visible_pct": number,          // 0-100, % where the same recurring host/person is visible
    "notes": string                      // 1-2 sentences on host presence, expressions, gaze, recurring posing
  },
  "typography": {
    "large_text_pct": number,            // 0-100, % with dominant/large headline text
    "headline_pattern": string,          // 1 sentence on headline style (e.g. "short 2-4 word phrases", "question format", "all-caps shouty")
    "all_caps_pct": number               // 0-100, % using all-caps headlines
  },
  "production_tier": "high" | "medium" | "low" | "mixed",
  "summary": string                      // 2-3 sentence prose summary describing how this channel visually presents itself
}

CRITICAL:
- Percentages are estimates from the actual thumbnails — be honest, not flattering.
- "production_tier" judges the polish/budget/craft level visible: lighting, composition, design quality, post work. "mixed" if the set is inconsistent.
- Brand consistency rewards a recognizable look across thumbnails. A channel that swings between unrelated styles scores low.
- The summary must be useful to a strategist — describe what the channel looks like, not what it is about. Avoid generic phrases like "professional looking" or "high quality" unless backed by specifics.
- Return ONLY valid JSON. No prose outside the JSON.`;
}
