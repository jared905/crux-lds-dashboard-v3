/**
 * Vercel Serverless Function - YouTube Analytics API Test
 * Tests if the user has Analytics API access for their connected channel.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get encryption key from environment (must match youtube-oauth-callback.js)
function getEncryptionKey() {
  const keyBase64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error('TOKEN_ENCRYPTION_KEY not configured');
  }
  return Buffer.from(keyBase64, 'base64');
}

// AES-256-GCM decryption (matches youtube-oauth-callback.js format)
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

    // Get the OAuth connection
    const { data: connection, error: connError } = await supabase
      .from('youtube_oauth_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single();

    if (connError || !connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Decrypt access token
    let accessToken;
    try {
      accessToken = decryptToken(connection.encrypted_access_token);
    } catch (e) {
      console.error('Token decryption failed:', e.message);
      return res.status(500).json({ error: 'Failed to decrypt token' });
    }

    const channelId = connection.youtube_channel_id;

    // Test 1: Check if Analytics API is accessible at all
    // Try to get basic channel analytics for the last 7 days
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const analyticsUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
    analyticsUrl.searchParams.append('ids', `channel==${channelId}`);
    analyticsUrl.searchParams.append('startDate', startDate);
    analyticsUrl.searchParams.append('endDate', endDate);
    analyticsUrl.searchParams.append('metrics', 'views,estimatedMinutesWatched,subscribersGained');
    analyticsUrl.searchParams.append('dimensions', 'day');

    const analyticsResponse = await fetch(analyticsUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const analyticsData = await analyticsResponse.json();

    if (!analyticsResponse.ok) {
      // Check specific error types
      const errorReason = analyticsData.error?.errors?.[0]?.reason;
      const errorMessage = analyticsData.error?.message;

      if (errorReason === 'forbidden' || analyticsResponse.status === 403) {
        return res.status(200).json({
          hasAccess: false,
          reason: 'forbidden',
          message: 'You do not have Analytics API access for this channel. You may need to be added as a channel manager.',
          needsReauth: analyticsData.error?.message?.includes('scope') || false,
          details: errorMessage
        });
      }

      if (errorReason === 'insufficientPermissions') {
        return res.status(200).json({
          hasAccess: false,
          reason: 'insufficientPermissions',
          message: 'Your OAuth token does not include Analytics API scope. Please disconnect and reconnect your account.',
          needsReauth: true,
          details: errorMessage
        });
      }

      return res.status(200).json({
        hasAccess: false,
        reason: errorReason || 'unknown',
        message: errorMessage || 'Failed to access Analytics API',
        needsReauth: false,
        details: analyticsData.error
      });
    }

    // Success! User has Analytics access
    return res.status(200).json({
      hasAccess: true,
      message: 'Analytics API access confirmed!',
      channelId,
      channelName: connection.youtube_channel_title,
      sampleData: {
        dateRange: `${startDate} to ${endDate}`,
        columnHeaders: analyticsData.columnHeaders?.map(h => h.name),
        rowCount: analyticsData.rows?.length || 0
      }
    });

  } catch (error) {
    console.error('Analytics test error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
