/**
 * Vercel Serverless Function - YouTube Token Refresh
 * Refreshes expired YouTube OAuth tokens.
 *
 * Security:
 * - Requires authenticated user
 * - Decrypts refresh token server-side only
 * - Re-encrypts new access token
 * - Audit logging for compliance
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get encryption key from environment
function getEncryptionKey() {
  const keyBase64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error('TOKEN_ENCRYPTION_KEY not configured');
  }
  return Buffer.from(keyBase64, 'base64');
}

// AES-256-GCM decryption
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

// AES-256-GCM encryption
function encryptToken(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${encrypted}:${authTag.toString('base64')}`;
}

// Log audit event helper
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

export default async function handler(req, res) {
  // CORS headers
  const allowedOrigin = process.env.FRONTEND_URL || process.env.VERCEL_URL || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const { connectionId } = req.body;

    if (!connectionId) {
      return res.status(400).json({ error: 'connectionId required' });
    }

    // Get request context
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] ||
                      req.headers['x-real-ip'] || null;
    const userAgent = req.headers['user-agent'] || null;

    // Get the connection (verify it belongs to this user)
    const { data: connection, error: connError } = await supabase
      .from('youtube_oauth_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single();

    if (connError || !connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Decrypt refresh token
    let refreshToken;
    try {
      refreshToken = decryptToken(connection.encrypted_refresh_token);
    } catch (err) {
      console.error('Failed to decrypt refresh token:', err.message);
      return res.status(500).json({ error: 'Failed to decrypt token' });
    }

    // Request new access token from Google
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

      // Mark connection as having an error
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

    // Encrypt new access token
    const encryptedAccessToken = encryptToken(tokens.access_token);

    // Build update object
    const updateData = {
      encrypted_access_token: encryptedAccessToken,
      token_expires_at: expiresAt.toISOString(),
      last_refreshed_at: new Date().toISOString(),
      connection_error: null,
      is_active: true,
      updated_at: new Date().toISOString()
    };

    // If Google returned a new refresh token (rare but possible), update it too
    if (tokens.refresh_token) {
      updateData.encrypted_refresh_token = encryptToken(tokens.refresh_token);
    }

    // Update connection
    await supabase
      .from('youtube_oauth_connections')
      .update(updateData)
      .eq('id', connectionId);

    // Log success
    await logAuditEvent(user.id, 'token_refresh', {
      youtube_channel_id: connection.youtube_channel_id,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata: {
        new_expiry: expiresAt.toISOString(),
        new_refresh_token_issued: !!tokens.refresh_token
      }
    });

    return res.status(200).json({
      success: true,
      expiresAt: expiresAt.toISOString()
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
