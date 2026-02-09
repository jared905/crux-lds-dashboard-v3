/**
 * Vercel Serverless Function - YouTube OAuth Disconnect
 * Revokes tokens and removes the connection.
 *
 * Security:
 * - Requires authenticated user
 * - Revokes token with Google (best effort)
 * - Deletes all stored credentials
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

    // Attempt to revoke the token with Google (best effort)
    try {
      const accessToken = decryptToken(connection.encrypted_access_token);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
    } catch (revokeError) {
      // Token revocation is best-effort - continue even if it fails
      // (token may already be revoked or expired)
      console.warn('Token revocation failed (may already be revoked):', revokeError.message);
    }

    // Delete the connection from database
    const { error: deleteError } = await supabase
      .from('youtube_oauth_connections')
      .delete()
      .eq('id', connectionId);

    if (deleteError) {
      console.error('Failed to delete connection:', deleteError);
      return res.status(500).json({ error: 'Failed to remove connection' });
    }

    // Log audit event
    await logAuditEvent(user.id, 'token_revoked', {
      youtube_channel_id: connection.youtube_channel_id,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata: {
        channel_title: connection.youtube_channel_title,
        email: connection.youtube_email
      }
    });

    return res.status(200).json({
      success: true,
      message: 'YouTube account disconnected successfully'
    });

  } catch (error) {
    console.error('Disconnect error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
