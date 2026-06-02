/**
 * Vercel Serverless Function - Phase 2.5 surface intelligence pull
 *
 * Populates client_video_traffic_sources + client_search_queries from
 * YouTube Analytics for a single client connection. One on-demand
 * snapshot per invocation — snapshots accumulate so we can trend
 * surface shift over time without overwriting history.
 *
 * Two queries per pull:
 *   A. Per-video traffic source breakdown — for each of the channel's
 *      recent N videos (default 20), pulls dimensions=insightTraffic-
 *      SourceType, filters=video==<id>. Persists one row per
 *      (video, surface) into client_video_traffic_sources.
 *   B. Channel-level search query detail — single query with
 *      dimensions=insightTrafficSourceDetail filtered to YT_SEARCH.
 *      Persists one row per query into client_search_queries with
 *      is_branded flagged at ingest.
 *
 * Confirmed by the Phase 2.5 spike (commits c567edf … 2270e7b):
 *   Both query paths work on Brand Account channels. RELATED_VIDEO
 *   detail is blocked on Brand Accounts; that's the deferred
 *   adjacency cohort, not in scope here.
 *
 * Quota: 1 unit per video query + 1 for the channel search query =
 * roughly N+1 units per pull. Default N=20 ≈ 21 units. Trivial vs.
 * the 50,000-unit daily Analytics quota.
 *
 * Request: POST { connectionId, videoLimit?, windowDays? }
 * Response: { ok, summary, errors }
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ─────────────────────────────────────────────────────
// Auth + token helpers (duplicated from youtube-analytics-fetch /
// youtube-analytics-spike — when Phase 2.5 stabilizes these move into
// a shared module; for now keep each endpoint self-contained).
// ─────────────────────────────────────────────────────

function getEncryptionKey() {
  const keyBase64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyBase64) throw new Error('TOKEN_ENCRYPTION_KEY not configured');
  return Buffer.from(keyBase64, 'base64');
}

function decryptToken(encrypted) {
  const key = getEncryptionKey();
  const [ivB64, dataB64, tagB64] = encrypted.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(data, null, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encryptToken(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${encrypted}:${authTag.toString('base64')}`;
}

async function refreshAccessToken(connection) {
  const refreshToken = decryptToken(connection.encrypted_refresh_token);
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json();
    throw new Error(errorData.error_description || errorData.error || 'Token refresh failed');
  }
  const tokens = await tokenResponse.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const encryptedAccessToken = encryptToken(tokens.access_token);
  await supabase
    .from('youtube_oauth_connections')
    .update({
      encrypted_access_token: encryptedAccessToken,
      token_expires_at: expiresAt.toISOString(),
      last_refreshed_at: new Date().toISOString(),
      connection_error: null,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);
  return tokens.access_token;
}

// ─────────────────────────────────────────────────────
// Analytics helpers
// ─────────────────────────────────────────────────────

async function runAnalyticsQuery({ channelId, accessToken, dimensions, filters, metrics, startDate, endDate, sort, maxResults }) {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.append('ids', `channel==${channelId}`);
  url.searchParams.append('startDate', startDate);
  url.searchParams.append('endDate', endDate);
  url.searchParams.append('dimensions', dimensions);
  url.searchParams.append('metrics', metrics);
  if (filters)    url.searchParams.append('filters', filters);
  if (sort)       url.searchParams.append('sort', sort);
  if (maxResults) url.searchParams.append('maxResults', String(maxResults));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });

  if (!response.ok) {
    let errorBody = null;
    try { errorBody = await response.json(); } catch {}
    return {
      ok: false,
      status: response.status,
      error: errorBody?.error?.message || `HTTP ${response.status}`,
      errorReason: errorBody?.error?.errors?.[0]?.reason || null,
    };
  }

  const body = await response.json();
  return {
    ok: true,
    status: 200,
    rows: body.rows || [],
  };
}

// ─────────────────────────────────────────────────────
// Branded-query detection
// ─────────────────────────────────────────────────────

/**
 * Build a list of lowercase tokens that, if found as a substring in a
 * search query, indicate the searcher already knew the brand.
 *
 * Sources: the channel's title (multiple normalizations) + custom URL
 * handle if available. The squash variant ("fullviewanalytics" for
 * "Full View Analytics") catches handle-style searches.
 *
 * Conservative by design — false negatives (treating a branded query
 * as non-branded) just pollutes the keyword pool with branded views,
 * which the strategist can filter manually. False positives (treating
 * a generic query as branded) would HIDE useful keyword signal —
 * worse outcome. So we match conservatively rather than aggressively.
 */
function buildBrandedTokens({ channelTitle, customUrl }) {
  const tokens = new Set();
  const add = (s) => {
    const v = (s || '').toLowerCase().trim();
    if (v && v.length >= 3) tokens.add(v);
  };
  if (channelTitle) {
    add(channelTitle);
    // Squashed (no spaces): "Full View Analytics" → "fullviewanalytics".
    // Catches handle-style searches.
    add(channelTitle.replace(/\s+/g, ''));
  }
  if (customUrl) {
    add(customUrl.replace(/^@/, ''));
  }
  return [...tokens];
}

function isQueryBranded(query, brandedTokens) {
  if (!query || !brandedTokens.length) return false;
  const q = query.toLowerCase();
  return brandedTokens.some(t => q.includes(t));
}

// ─────────────────────────────────────────────────────
// Pulls
// ─────────────────────────────────────────────────────

/**
 * Pull traffic-source breakdown for each video and bulk-insert rows
 * into client_video_traffic_sources. Returns counters + per-video
 * errors so partial successes are visible.
 */
async function pullVideoTrafficSources({
  clientChannelId, ytChannelId, accessToken, videoIds, startDate, endDate,
}) {
  const rowsToInsert = [];
  const errors = [];
  let videosOk = 0;

  for (const videoId of videoIds) {
    const result = await runAnalyticsQuery({
      channelId: ytChannelId,
      accessToken,
      dimensions: 'insightTrafficSourceType',
      filters: `video==${videoId}`,
      metrics: 'views',
      startDate,
      endDate,
      sort: '-views',
      maxResults: 25,
    });
    if (!result.ok) {
      errors.push({ videoId, error: result.error, status: result.status });
      continue;
    }
    videosOk++;
    for (const row of result.rows) {
      const surface = row[0];
      const views = row[1] || 0;
      if (!surface || views <= 0) continue;
      rowsToInsert.push({
        client_id: clientChannelId,
        youtube_video_id: videoId,
        surface,
        views,
        window_start: startDate,
        window_end: endDate,
      });
    }
  }

  let insertedCount = 0;
  if (rowsToInsert.length > 0) {
    const { data, error } = await supabase
      .from('client_video_traffic_sources')
      .insert(rowsToInsert)
      .select('id');
    if (error) {
      return {
        videosOk,
        videosFailed: errors.length,
        rowsAttempted: rowsToInsert.length,
        rowsInserted: 0,
        errors: [...errors, { stage: 'insert', error: error.message }],
      };
    }
    insertedCount = data?.length || 0;
  }

  return {
    videosOk,
    videosFailed: errors.length,
    rowsAttempted: rowsToInsert.length,
    rowsInserted: insertedCount,
    errors,
  };
}

/**
 * Pull channel-level YT_SEARCH detail (the actual search queries) and
 * bulk-insert rows into client_search_queries with is_branded flagged.
 */
async function pullSearchQueries({
  clientChannelId, ytChannelId, accessToken, brandedTokens, startDate, endDate,
}) {
  const result = await runAnalyticsQuery({
    channelId: ytChannelId,
    accessToken,
    dimensions: 'insightTrafficSourceDetail',
    filters: 'insightTrafficSourceType==YT_SEARCH',
    metrics: 'views',
    startDate,
    endDate,
    sort: '-views',
    maxResults: 200,
  });
  if (!result.ok) {
    return {
      rowsAttempted: 0,
      rowsInserted: 0,
      brandedCount: 0,
      errors: [{ stage: 'query', error: result.error, status: result.status }],
    };
  }

  const rowsToInsert = [];
  let brandedCount = 0;
  for (const row of result.rows) {
    const query = row[0];
    const views = row[1] || 0;
    if (!query || views <= 0) continue;
    const isBranded = isQueryBranded(query, brandedTokens);
    if (isBranded) brandedCount++;
    rowsToInsert.push({
      client_id: clientChannelId,
      query,
      views,
      is_branded: isBranded,
      window_start: startDate,
      window_end: endDate,
    });
  }

  let insertedCount = 0;
  if (rowsToInsert.length > 0) {
    const { data, error } = await supabase
      .from('client_search_queries')
      .insert(rowsToInsert)
      .select('id');
    if (error) {
      return {
        rowsAttempted: rowsToInsert.length,
        rowsInserted: 0,
        brandedCount,
        errors: [{ stage: 'insert', error: error.message }],
      };
    }
    insertedCount = data?.length || 0;
  }

  return {
    rowsAttempted: rowsToInsert.length,
    rowsInserted: insertedCount,
    brandedCount,
    errors: [],
  };
}

// ─────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────

export default async function handler(req, res) {
  const allowedOrigin = process.env.FRONTEND_URL || process.env.VERCEL_URL || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Auth
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' });
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const { connectionId, videoLimit, windowDays } = req.body;
    if (!connectionId) return res.status(400).json({ error: 'connectionId required' });

    const N = Math.min(Math.max(parseInt(videoLimit, 10) || 20, 1), 50);
    const days = Math.min(Math.max(parseInt(windowDays, 10) || 90, 7), 365);

    // Connection + access token
    const { data: connection, error: connError } = await supabase
      .from('youtube_oauth_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single();
    if (connError || !connection) return res.status(404).json({ error: 'Connection not found' });

    const tokenExpiresAt = new Date(connection.token_expires_at);
    const bufferMs = 5 * 60 * 1000;
    const isExpired = tokenExpiresAt.getTime() - bufferMs < Date.now();
    let accessToken;
    try {
      accessToken = isExpired
        ? await refreshAccessToken(connection)
        : decryptToken(connection.encrypted_access_token);
    } catch (e) {
      return res.status(401).json({ error: 'Failed to get valid token', details: e.message });
    }

    // Resolve the client_id (channels.id) for this connection. The
    // youtube_channel_id is the public UC… id; client_id in our tables
    // is the internal UUID. Without this join the inserts violate the
    // FK to channels(id).
    const { data: channelRow } = await supabase
      .from('channels')
      .select('id, name, custom_url')
      .eq('youtube_channel_id', connection.youtube_channel_id)
      .maybeSingle();
    if (!channelRow) {
      return res.status(404).json({
        error: 'Channel not found in channels table',
        detail: `youtube_channel_id ${connection.youtube_channel_id} has an OAuth connection but no row in channels — ingest the channel first.`,
      });
    }

    // Pull recent video IDs from our videos table — same path the
    // spike's recent-videos picker uses. Filters to views > 0 so we
    // skip private/unlisted and brand-new uploads with no data yet.
    const { data: videoRows } = await supabase
      .from('videos')
      .select('youtube_video_id')
      .eq('channel_id', channelRow.id)
      .gt('view_count', 0)
      .order('published_at', { ascending: false })
      .limit(N);

    const videoIds = (videoRows || []).map(r => r.youtube_video_id).filter(Boolean);
    if (!videoIds.length) {
      return res.status(200).json({
        ok: false,
        error: 'No recent videos with views > 0 found for this channel — ingest videos first.',
        summary: { videoIds: 0, traffic: null, search: null },
      });
    }

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

    const brandedTokens = buildBrandedTokens({
      channelTitle: connection.youtube_channel_title || channelRow.name,
      customUrl: channelRow.custom_url,
    });

    // Run both pulls — traffic-source per video, then channel search queries
    const traffic = await pullVideoTrafficSources({
      clientChannelId: channelRow.id,
      ytChannelId: connection.youtube_channel_id,
      accessToken,
      videoIds,
      startDate,
      endDate,
    });

    const search = await pullSearchQueries({
      clientChannelId: channelRow.id,
      ytChannelId: connection.youtube_channel_id,
      accessToken,
      brandedTokens,
      startDate,
      endDate,
    });

    return res.status(200).json({
      ok: true,
      window: { startDate, endDate, days },
      channelId: channelRow.id,
      videoCount: videoIds.length,
      summary: {
        traffic,
        search,
        brandedTokens,
      },
    });
  } catch (err) {
    console.error('[surface-pull] unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
