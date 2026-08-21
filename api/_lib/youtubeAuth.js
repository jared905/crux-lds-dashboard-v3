/**
 * Shared YouTube OAuth token handling + Analytics API query runner.
 *
 * Extracted from youtube-analytics-spike.js (which noted "when Phase
 * 2.5 lands, the auth + token-refresh logic moves into a shared
 * module" — this is that module). The spike keeps its own copy since
 * it's disposable; new endpoints import from here.
 *
 * Tokens are AES-256-GCM encrypted at rest in youtube_oauth_connections
 * (iv:ciphertext:authTag, base64). TOKEN_ENCRYPTION_KEY is the base64
 * key. Never log token values.
 */

import crypto from 'crypto';

function getEncryptionKey() {
  const keyBase64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyBase64) throw new Error('TOKEN_ENCRYPTION_KEY not configured');
  return Buffer.from(keyBase64, 'base64');
}

export function decryptToken(encrypted) {
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

export function encryptToken(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${encrypted}:${authTag.toString('base64')}`;
}

/**
 * Returns a valid access token for the connection, refreshing (and
 * persisting the refreshed token) when the stored one is expired or
 * within 5 minutes of expiry. `supabase` must be a service-role client.
 */
export async function getValidAccessToken(supabase, connection) {
  const tokenExpiresAt = new Date(connection.token_expires_at);
  const bufferMs = 5 * 60 * 1000;
  const isExpired = tokenExpiresAt.getTime() - bufferMs < Date.now();
  if (!isExpired) return decryptToken(connection.encrypted_access_token);

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
  await supabase
    .from('youtube_oauth_connections')
    .update({
      encrypted_access_token: encryptToken(tokens.access_token),
      token_expires_at: expiresAt.toISOString(),
      last_refreshed_at: new Date().toISOString(),
      connection_error: null,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);
  return tokens.access_token;
}

/**
 * One YouTube Analytics API v2 report query. Returns
 * { ok, rows, columnHeaders } or { ok: false, error, errorReason }.
 * Never throws on API-level errors so callers can degrade per-query.
 */
export async function runAnalyticsQuery({ channelId, accessToken, dimensions, filters, metrics, startDate, endDate, sort, maxResults }) {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.append('ids', `channel==${channelId}`);
  url.searchParams.append('startDate', startDate);
  url.searchParams.append('endDate', endDate);
  url.searchParams.append('dimensions', dimensions);
  url.searchParams.append('metrics', metrics);
  if (filters) url.searchParams.append('filters', filters);
  if (sort) url.searchParams.append('sort', sort);
  if (maxResults) url.searchParams.append('maxResults', String(maxResults));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });

  if (!response.ok) {
    let errorBody = null;
    try { errorBody = await response.json(); } catch { /* non-JSON body — the null fallback is the answer */ }
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
    columnHeaders: body.columnHeaders || [],
    rows: body.rows || [],
  };
}
