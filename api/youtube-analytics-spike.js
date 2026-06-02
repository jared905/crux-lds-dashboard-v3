/**
 * Vercel Serverless Function - Phase 2.5 Analytics API spike
 *
 * One-off diagnostic endpoint that confirms two YouTube Analytics API
 * query paths Phase 2.5 needs:
 *   (A) Traffic-source breakdown per video — splits views across
 *       Search / Browse / Suggested / Shorts Feed / External via
 *       dimensions=insightTrafficSourceType.
 *   (B) Suggested-Video adjacency — returns the source videos that
 *       drove suggested-video impressions, via
 *       dimensions=insightTrafficSourceDetail filtered to
 *       insightTrafficSourceType==SUGGESTED_VIDEO.
 *
 * Returns both raw responses + parsed summaries + error diagnostics
 * so we can confirm:
 *   1. Auth flow works (same as youtube-analytics-fetch).
 *   2. Neither query trips the known dimensions=video block on Brand
 *      Account channels (logged April 5 2026).
 *   3. Response shapes match what we expect to wire into Phase 2.5
 *      schemas.
 *
 * This endpoint is a disposable spike — when Phase 2.5 ships its real
 * pull service, this gets replaced or generalized.
 *
 * Request: POST { connectionId, videoId, startDate?, endDate? }
 * Response: { ok, trafficSource, adjacency, diagnostics }
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ─────────────────────────────────────────────────────
// Auth helpers — duplicated from youtube-analytics-fetch.js so this
// endpoint is self-contained (it's disposable). When Phase 2.5 lands,
// the auth + token-refresh logic moves into a shared module.
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
// Analytics query helpers
// ─────────────────────────────────────────────────────

async function runAnalyticsQuery({ channelId, accessToken, dimensions, filters, metrics, startDate, endDate, sort, maxResults }) {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.append('ids', `channel==${channelId}`);
  url.searchParams.append('startDate', startDate);
  url.searchParams.append('endDate', endDate);
  url.searchParams.append('dimensions', dimensions);
  url.searchParams.append('metrics', metrics);
  if (filters) url.searchParams.append('filters', filters);
  if (sort)    url.searchParams.append('sort', sort);
  if (maxResults) url.searchParams.append('maxResults', String(maxResults));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });

  const requestSummary = {
    url: url.toString().replace(/access_token=[^&]+/g, 'access_token=REDACTED'),
    status: response.status,
  };

  if (!response.ok) {
    let errorBody = null;
    try { errorBody = await response.json(); } catch {}
    return {
      ok: false,
      request: requestSummary,
      error: errorBody?.error?.message || `HTTP ${response.status}`,
      errorReason: errorBody?.error?.errors?.[0]?.reason || null,
      errorDetail: errorBody || null,
    };
  }

  const body = await response.json();
  return {
    ok: true,
    request: requestSummary,
    columnHeaders: body.columnHeaders || [],
    rowCount: (body.rows || []).length,
    rows: body.rows || [],
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Auth — match youtube-analytics-fetch.js pattern
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' });
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const { connectionId, videoId, startDate, endDate } = req.body;
    if (!connectionId) return res.status(400).json({ error: 'connectionId required' });
    if (!videoId)      return res.status(400).json({ error: 'videoId required' });

    // Get OAuth connection
    const { data: connection, error: connError } = await supabase
      .from('youtube_oauth_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single();
    if (connError || !connection) return res.status(404).json({ error: 'Connection not found' });

    // Refresh token if expired
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

    // Window — default last 90 days
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];

    const channelId = connection.youtube_channel_id;

    // ── Query A: traffic-source breakdown for the target video ──
    // dimensions=insightTrafficSourceType, filters=video==<id>
    // Returns view counts per surface (YT_SEARCH, BROWSE_FEATURES,
    // RELATED_VIDEO, SHORTS, EXT_URL, NOTIFICATION, etc.).
    const trafficSource = await runAnalyticsQuery({
      channelId,
      accessToken,
      dimensions: 'insightTrafficSourceType',
      filters: `video==${videoId}`,
      metrics: 'views',
      startDate: start,
      endDate: end,
      sort: '-views',
      maxResults: 25,
    });

    // ── Query B: suggested-video adjacency ──
    //
    // dimensions=insightTrafficSourceDetail requires an
    // insightTrafficSourceType filter. Per the API docs only a subset
    // of source types support this dimension. We try several variants
    // so we can pin down exactly which (if any) works for this account.
    //
    //   1. RELATED_VIDEO — the current canonical enum for Suggested.
    //   2. SUGGESTED_VIDEO — deprecated legacy alias; sometimes still
    //      accepted on older API versions.
    //   3. YT_SEARCH probe — sanity check. Even with very low search
    //      data the API should return ok=true with 0 or 1 rows. If
    //      this ALSO fails the issue isn't RELATED_VIDEO-specific.
    //   4. Reordered filter — some accounts have been seen to require
    //      insightTrafficSourceType before video in the filter list.
    //
    // Every attempt is captured in adjacencyAttempts so the response
    // surfaces all errors, not just the last one (the bug in v1 that
    // hid the real RELATED_VIDEO failure behind the SUGGESTED_VIDEO
    // rejection).
    const adjacencyAttempts = [];
    const tryAdjacency = async (label, filters) => {
      const result = await runAnalyticsQuery({
        channelId,
        accessToken,
        dimensions: 'insightTrafficSourceDetail',
        filters,
        metrics: 'views',
        startDate: start,
        endDate: end,
        sort: '-views',
        maxResults: 50,
      });
      adjacencyAttempts.push({ label, filters, ...result });
      return result;
    };

    let adjacency = await tryAdjacency('RELATED_VIDEO', `video==${videoId};insightTrafficSourceType==RELATED_VIDEO`);
    if (!adjacency.ok) {
      adjacency = await tryAdjacency('SUGGESTED_VIDEO_legacy', `video==${videoId};insightTrafficSourceType==SUGGESTED_VIDEO`);
    }
    if (!adjacency.ok) {
      adjacency = await tryAdjacency('YT_SEARCH_probe', `video==${videoId};insightTrafficSourceType==YT_SEARCH`);
    }
    if (!adjacency.ok) {
      adjacency = await tryAdjacency('RELATED_VIDEO_filter_order', `insightTrafficSourceType==RELATED_VIDEO;video==${videoId}`);
    }

    // ── Parse traffic-source response into a tidy summary ──
    let trafficSourceSummary = null;
    if (trafficSource.ok) {
      const totalViews = trafficSource.rows.reduce((s, r) => s + (r[1] || 0), 0);
      trafficSourceSummary = {
        totalViews,
        bySurface: trafficSource.rows.map(r => ({
          surface: r[0],
          views: r[1] || 0,
          sharePct: totalViews ? Math.round(((r[1] || 0) / totalViews) * 1000) / 10 : 0,
        })),
      };
    }

    // ── Parse adjacency response ──
    let adjacencySummary = null;
    if (adjacency?.ok) {
      adjacencySummary = {
        sourceVideoCount: adjacency.rows.length,
        totalSuggestedViews: adjacency.rows.reduce((s, r) => s + (r[1] || 0), 0),
        topSources: adjacency.rows.slice(0, 20).map(r => ({
          sourceVideoId: r[0],
          views: r[1] || 0,
        })),
      };
    }

    return res.status(200).json({
      ok: trafficSource.ok && (adjacency?.ok ?? false),
      window: { startDate: start, endDate: end },
      channelId,
      videoId,
      trafficSource: {
        ...trafficSource,
        summary: trafficSourceSummary,
      },
      adjacency: {
        ...(adjacency || { ok: false, error: 'no adjacency result' }),
        summary: adjacencySummary,
        // Every attempt with its filter, error, and status code so
        // failures don't hide each other.
        attempts: adjacencyAttempts.map(a => ({
          label: a.label,
          filters: a.filters,
          ok: a.ok,
          status: a.request?.status,
          error: a.error,
          errorReason: a.errorReason,
          rowCount: a.rowCount,
        })),
      },
      diagnostics: {
        connectionId,
        userId: user.id,
        tokenRefreshed: isExpired,
        note: 'Phase 2.5 spike — confirms Suggested-Video + traffic-source paths. Both queries must return ok=true for Phase 2.5 to proceed without auth work.',
      },
    });
  } catch (err) {
    console.error('[analytics-spike] unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
