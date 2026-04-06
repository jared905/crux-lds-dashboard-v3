/**
 * Vercel Serverless Function - YouTube OAuth Management
 * GET:    Returns connection status without exposing tokens
 * POST:   Refreshes expired YouTube OAuth tokens
 * DELETE: Revokes tokens and removes connection
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

async function logAuditEvent(userId, eventType, data = {}) {
  try {
    await supabase.from('youtube_oauth_audit_log').insert({
      user_id: userId,
      event_type: eventType,
      youtube_channel_id: data.youtube_channel_id || null,
      ip_address: data.ip_address || null,
      user_agent: data.user_agent || null,
      error_message: data.error_message || null,
      metadata: data.metadata || {}
    });
  } catch (err) {
    console.warn('Failed to log audit event:', err.message);
  }
}

/* ── GET: list connections ── */
async function handleGet(user, res) {
  const { data: connections, error } = await supabase
    .from('youtube_oauth_connections')
    .select(`
      id, youtube_channel_id, youtube_channel_title, youtube_channel_thumbnail,
      youtube_email, token_expires_at, scopes, is_active, last_used_at,
      last_refreshed_at, connection_error, reporting_job_id, reporting_job_type,
      last_report_downloaded_at, created_at, updated_at
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch connections:', error);
    return res.status(500).json({ error: 'Failed to fetch connections' });
  }

  const now = new Date();
  const enrichedConnections = (connections || []).map(conn => {
    const expiresAt = new Date(conn.token_expires_at);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    return {
      ...conn,
      isExpired: expiresAt < now,
      needsRefresh: expiresAt < fiveMinutesFromNow,
      expiresInSeconds: Math.floor((expiresAt - now) / 1000)
    };
  });

  return res.status(200).json({ connections: enrichedConnections, count: enrichedConnections.length });
}

/* ── POST ?action=init: start OAuth flow ── */
async function handleInit(user, req, res) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'OAuth not configured' });
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const codeVerifier = crypto.randomBytes(48).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || null;
  const userAgent = req.headers['user-agent'] || null;

  const { error: stateError } = await supabase
    .from('youtube_oauth_state')
    .insert({ user_id: user.id, state, code_verifier: codeVerifier, code_challenge: codeChallenge, ip_address: ipAddress, user_agent: userAgent });

  if (stateError) {
    console.error('Failed to store OAuth state:', stateError);
    return res.status(500).json({ error: 'Failed to initialize OAuth flow' });
  }

  await logAuditEvent(user.id, 'oauth_initiated', {
    ip_address: ipAddress, user_agent: userAgent,
    metadata: { scopes: ['youtube.readonly', 'yt-analytics-monetary.readonly', 'userinfo.email'], pkce_method: 'S256' }
  });

  const baseUrl = process.env.FRONTEND_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${baseUrl}/api/youtube-oauth-callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics-monetary.readonly https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  return res.status(200).json({ authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, state });
}

/* ── POST: refresh token ── */
async function handlePost(user, req, res) {
  const { connectionId } = req.body;
  if (!connectionId) return res.status(400).json({ error: 'connectionId required' });

  const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || null;
  const userAgent = req.headers['user-agent'] || null;

  const { data: connection, error: connError } = await supabase
    .from('youtube_oauth_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .single();

  if (connError || !connection) return res.status(404).json({ error: 'Connection not found' });

  let refreshToken;
  try {
    refreshToken = decryptToken(connection.encrypted_refresh_token);
  } catch (err) {
    console.error('Failed to decrypt refresh token:', err.message);
    return res.status(500).json({ error: 'Failed to decrypt token' });
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json();
    await supabase
      .from('youtube_oauth_connections')
      .update({
        connection_error: errorData.error_description || errorData.error,
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', connectionId);

    await logAuditEvent(user.id, 'token_refresh_failed', {
      youtube_channel_id: connection.youtube_channel_id,
      ip_address: ipAddress,
      user_agent: userAgent,
      error_message: errorData.error_description || errorData.error,
      metadata: { error_code: errorData.error }
    });

    return res.status(400).json({
      error: 'Token refresh failed',
      details: errorData.error_description || errorData.error
    });
  }

  const tokens = await tokenResponse.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
  const encryptedAccessToken = encryptToken(tokens.access_token);

  const updateData = {
    encrypted_access_token: encryptedAccessToken,
    token_expires_at: expiresAt.toISOString(),
    last_refreshed_at: new Date().toISOString(),
    connection_error: null,
    is_active: true,
    updated_at: new Date().toISOString()
  };

  if (tokens.refresh_token) {
    updateData.encrypted_refresh_token = encryptToken(tokens.refresh_token);
  }

  await supabase
    .from('youtube_oauth_connections')
    .update(updateData)
    .eq('id', connectionId);

  await logAuditEvent(user.id, 'token_refresh', {
    youtube_channel_id: connection.youtube_channel_id,
    ip_address: ipAddress,
    user_agent: userAgent,
    metadata: { new_expiry: expiresAt.toISOString(), new_refresh_token_issued: !!tokens.refresh_token }
  });

  return res.status(200).json({ success: true, expiresAt: expiresAt.toISOString() });
}

/* ── DELETE: revoke + remove ── */
async function handleDelete(user, req, res) {
  const connectionId = req.query?.connectionId || req.body?.connectionId;
  if (!connectionId) return res.status(400).json({ error: 'connectionId required' });

  const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || null;
  const userAgent = req.headers['user-agent'] || null;

  const { data: connection, error: connError } = await supabase
    .from('youtube_oauth_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .single();

  if (connError || !connection) return res.status(404).json({ error: 'Connection not found' });

  try {
    const accessToken = decryptToken(connection.encrypted_access_token);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  } catch (e) {
    console.warn('Token revocation failed:', e.message);
  }

  const { error: deleteError } = await supabase
    .from('youtube_oauth_connections')
    .delete()
    .eq('id', connectionId);

  if (deleteError) {
    console.error('Failed to delete connection:', deleteError);
    return res.status(500).json({ error: 'Failed to remove connection' });
  }

  await logAuditEvent(user.id, 'token_revoked', {
    youtube_channel_id: connection.youtube_channel_id,
    ip_address: ipAddress,
    user_agent: userAgent,
    metadata: { channel_title: connection.youtube_channel_title, email: connection.youtube_email }
  });

  return res.status(200).json({ success: true, message: 'YouTube account disconnected successfully' });
}

export default async function handler(req, res) {
  const allowedOrigin = process.env.FRONTEND_URL || process.env.VERCEL_URL || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization header required' });

    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid or expired session' });

    if (req.method === 'GET') return await handleGet(user, res);
    if (req.method === 'POST') {
      if (req.query?.action === 'init') return await handleInit(user, req, res);
      return await handlePost(user, req, res);
    }
    if (req.method === 'DELETE') return await handleDelete(user, req, res);
  } catch (error) {
    console.error('OAuth handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
