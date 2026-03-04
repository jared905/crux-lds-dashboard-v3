/**
 * Vercel Serverless Function - YouTube Lifetime Stats
 * Fetches channel-level lifetime watch hours from YouTube Analytics API.
 * No auth required (uses service role key to look up OAuth connections).
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

async function refreshAccessToken(connection) {
  const refreshToken = decryptToken(connection.encrypted_refresh_token);
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
    throw new Error(errorData.error_description || errorData.error || 'Token refresh failed');
  }
  const tokens = await tokenResponse.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
  const encryptedAccessToken = encryptToken(tokens.access_token);
  await supabase
    .from('youtube_oauth_connections')
    .update({
      encrypted_access_token: encryptedAccessToken,
      token_expires_at: expiresAt.toISOString(),
      last_refreshed_at: new Date().toISOString(),
      connection_error: null,
      is_active: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', connection.id);
  return tokens.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { channelIds } = req.body; // Supabase channel UUIDs

    if (!channelIds || !Array.isArray(channelIds) || channelIds.length === 0) {
      return res.status(400).json({ error: 'channelIds array required' });
    }

    // Look up YouTube channel IDs from Supabase channels table
    const { data: channels, error: chError } = await supabase
      .from('channels')
      .select('id, youtube_channel_id, name')
      .in('id', channelIds);

    if (chError || !channels?.length) {
      return res.status(200).json({ totalWatchHours: null, error: 'No channels found' });
    }

    // Find OAuth connections for these YouTube channel IDs
    const ytChannelIds = channels.map(c => c.youtube_channel_id).filter(Boolean);
    if (ytChannelIds.length === 0) {
      return res.status(200).json({ totalWatchHours: null, error: 'No YouTube channel IDs found' });
    }

    const { data: connections, error: connError } = await supabase
      .from('youtube_oauth_connections')
      .select('*')
      .in('youtube_channel_id', ytChannelIds)
      .eq('is_active', true);

    if (connError || !connections?.length) {
      return res.status(200).json({ totalWatchHours: null, error: 'No active OAuth connections' });
    }

    let totalWatchHours = 0;
    const perChannel = {};

    for (const connection of connections) {
      try {
        // Get access token (refresh if needed)
        const tokenExpiresAt = new Date(connection.token_expires_at);
        const isExpired = tokenExpiresAt.getTime() - 5 * 60 * 1000 < Date.now();
        const accessToken = isExpired
          ? await refreshAccessToken(connection)
          : decryptToken(connection.encrypted_access_token);

        // Query YouTube Analytics API for channel-level lifetime estimatedMinutesWatched
        // Use 2005-01-01 (YouTube launch) as start date to cover full lifetime
        const analyticsUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
        analyticsUrl.searchParams.append('ids', `channel==${connection.youtube_channel_id}`);
        analyticsUrl.searchParams.append('startDate', '2005-01-01');
        analyticsUrl.searchParams.append('endDate', new Date().toISOString().split('T')[0]);
        analyticsUrl.searchParams.append('metrics', 'estimatedMinutesWatched,views,subscribersGained');

        const analyticsResponse = await fetch(analyticsUrl.toString(), {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
        });

        if (!analyticsResponse.ok) {
          console.error(`[LifetimeStats] Analytics error for ${connection.youtube_channel_title}:`, await analyticsResponse.text());
          continue;
        }

        const data = await analyticsResponse.json();

        if (data.rows && data.rows.length > 0) {
          const minutesWatched = data.rows[0][0] || 0;
          const views = data.rows[0][1] || 0;
          const subsGained = data.rows[0][2] || 0;
          const watchHours = minutesWatched / 60;

          totalWatchHours += watchHours;
          perChannel[connection.youtube_channel_title || connection.youtube_channel_id] = {
            watchHours,
            views,
            subscribersGained: subsGained,
          };

          console.log(`[LifetimeStats] ${connection.youtube_channel_title}: ${watchHours.toFixed(1)} watch hours, ${views.toLocaleString()} views`);
        }
      } catch (err) {
        console.error(`[LifetimeStats] Error for ${connection.youtube_channel_title}:`, err.message);
      }
    }

    return res.status(200).json({
      totalWatchHours,
      perChannel,
    });

  } catch (err) {
    console.error('[LifetimeStats] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
