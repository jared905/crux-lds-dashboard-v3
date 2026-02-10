/**
 * Vercel Serverless Function - YouTube OAuth Status & Disconnect
 * GET: Returns connection status without exposing tokens
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

async function handleDelete(user, req, res) {
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

  // Revoke token with Google (best effort)
  try {
    const accessToken = decryptToken(connection.encrypted_access_token);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  } catch (e) {
    console.warn('Token revocation failed:', e.message);
  }

  // Delete connection
  const { error: deleteError } = await supabase
    .from('youtube_oauth_connections')
    .delete()
    .eq('id', connectionId);

  if (deleteError) {
    console.error('Failed to delete connection:', deleteError);
    return res.status(500).json({ error: 'Failed to remove connection' });
  }

  // Audit log
  await supabase.from('youtube_oauth_audit_log').insert({
    user_id: user.id,
    event_type: 'token_revoked',
    youtube_channel_id: connection.youtube_channel_id,
    ip_address: ipAddress,
    user_agent: userAgent,
    metadata: { channel_title: connection.youtube_channel_title, email: connection.youtube_email }
  }).catch(() => {});

  return res.status(200).json({ success: true, message: 'YouTube account disconnected successfully' });
}

export default async function handler(req, res) {
  const allowedOrigin = process.env.FRONTEND_URL || process.env.VERCEL_URL || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization header required' });

    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid or expired session' });

    if (req.method === 'GET') return await handleGet(user, res);
    if (req.method === 'DELETE') return await handleDelete(user, req, res);
  } catch (error) {
    console.error('OAuth status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
