/**
 * Vercel Serverless Function - YouTube Analytics Fetch
 * Fetches analytics data (impressions, CTR, retention, watch hours) for videos
 * using the YouTube Analytics API.
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

// Refresh access token if expired
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

  // Update connection with new token
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

    const { connectionId, videoIds, startDate, endDate } = req.body;

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

    // Check if token is expired (with 5-minute buffer)
    const tokenExpiresAt = new Date(connection.token_expires_at);
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    const isExpired = tokenExpiresAt.getTime() - bufferMs < Date.now();

    let accessToken;
    try {
      if (isExpired) {
        console.log('[Analytics] Token expired, refreshing...');
        accessToken = await refreshAccessToken(connection);
        console.log('[Analytics] Token refreshed successfully');
      } else {
        accessToken = decryptToken(connection.encrypted_access_token);
      }
    } catch (e) {
      console.error('Token error:', e.message);
      return res.status(401).json({ error: 'Failed to get valid token', details: e.message });
    }

    const channelId = connection.youtube_channel_id;

    // Calculate date range (default to last 28 days)
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch video-level analytics — two separate calls to ensure base metrics
    // always succeed even if impressions metrics aren't available
    const baseMetrics = 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained';
    const impressionMetrics = 'videoThumbnailImpressions,videoThumbnailImpressionsClickRate';

    const buildAnalyticsUrl = (metrics) => {
      const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
      url.searchParams.append('ids', `channel==${channelId}`);
      url.searchParams.append('startDate', start);
      url.searchParams.append('endDate', end);
      url.searchParams.append('dimensions', 'video');
      url.searchParams.append('metrics', metrics);
      url.searchParams.append('sort', '-views');
      url.searchParams.append('maxResults', '200');
      if (videoIds && videoIds.length > 0) {
        url.searchParams.append('filters', `video==${videoIds.join(',')}`);
      }
      return url;
    };

    const headers = { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' };

    // Call 1: Base analytics (views, watch time, retention, subs)
    const analyticsResponse = await fetch(buildAnalyticsUrl(baseMetrics).toString(), { headers });

    if (!analyticsResponse.ok) {
      const errorData = await analyticsResponse.json();
      console.error('Analytics API error:', errorData);
      return res.status(200).json({
        success: false,
        error: errorData.error?.message || 'Failed to fetch analytics',
        errorCode: errorData.error?.errors?.[0]?.reason
      });
    }

    const analyticsData = await analyticsResponse.json();
    const videoAnalytics = {};

    if (analyticsData.rows) {
      for (const row of analyticsData.rows) {
        const videoId = row[0];
        videoAnalytics[videoId] = {
          views: row[1] ?? 0,
          watchMinutes: row[2] ?? 0,
          watchHours: (row[2] ?? 0) / 60,
          avgViewPercentage: row[3] ?? 0,
          subscribersGained: row[4] ?? 0,
          impressions: 0,
          ctr: 0
        };
      }
    }

    // Call 2: Impressions/CTR (separate call — fails gracefully if not available)
    let impressionsDiag = { attempted: true, success: false, videosWithData: 0, error: null };
    try {
      const impUrl = buildAnalyticsUrl(impressionMetrics).toString();
      console.log('[Analytics] Impressions URL:', impUrl.replace(/Bearer [^ ]+/, 'Bearer ***'));
      const impressionsResponse = await fetch(impUrl, { headers });
      console.log('[Analytics] Impressions response status:', impressionsResponse.status);
      if (impressionsResponse.ok) {
        const impressionsData = await impressionsResponse.json();
        impressionsDiag.rowCount = impressionsData.rows?.length || 0;
        impressionsDiag.columnHeaders = impressionsData.columnHeaders?.map(h => h.name);
        if (impressionsData.rows) {
          for (const row of impressionsData.rows) {
            const videoId = row[0];
            if (videoAnalytics[videoId]) {
              videoAnalytics[videoId].impressions = row[1] ?? 0;
              videoAnalytics[videoId].ctr = row[2] ?? 0;
            } else {
              videoAnalytics[videoId] = {
                views: 0, watchMinutes: 0, watchHours: 0,
                avgViewPercentage: 0, subscribersGained: 0,
                impressions: row[1] ?? 0, ctr: row[2] ?? 0
              };
            }
            if ((row[1] ?? 0) > 0) impressionsDiag.videosWithData++;
          }
        }
        impressionsDiag.success = true;
        console.log(`[Analytics] Impressions data fetched for ${impressionsData.rows?.length || 0} videos, ${impressionsDiag.videosWithData} with data`);
      } else {
        const errData = await impressionsResponse.json().catch(() => ({}));
        impressionsDiag.error = errData.error?.message || `HTTP ${impressionsResponse.status}`;
        impressionsDiag.errorDetails = errData.error;
        console.warn('[Analytics] Impressions metrics not available:', impressionsDiag.error);
      }
    } catch (impErr) {
      impressionsDiag.error = impErr.message;
      console.warn('[Analytics] Impressions fetch failed:', impErr.message);
    }

    // Update videos in the database with analytics data
    // This is done server-side to bypass RLS restrictions
    const { updateVideos } = req.body;
    let updatedCount = 0;
    let matchedCount = 0;

    if (updateVideos !== false) {
      // Find the client channel in the database (prefer is_client=true)
      const { data: dbChannel } = await supabase
        .from('channels')
        .select('id')
        .eq('youtube_channel_id', channelId)
        .eq('is_client', true)
        .single();

      console.log(`[Analytics] Looking for channel ${channelId}, found:`, dbChannel?.id || 'none');

      if (dbChannel) {
        for (const [videoId, analytics] of Object.entries(videoAnalytics)) {
          // Check if video exists and belongs to this channel
          const { data: existingVideo } = await supabase
            .from('videos')
            .select('id')
            .eq('youtube_video_id', videoId)
            .eq('channel_id', dbChannel.id)
            .single();

          if (existingVideo) {
            matchedCount++;
            const updateFields = {
                avg_view_percentage: analytics.avgViewPercentage != null ? analytics.avgViewPercentage / 100 : null,
                watch_hours: analytics.watchHours != null ? analytics.watchHours : null,
                subscribers_gained: analytics.subscribersGained != null ? analytics.subscribersGained : null,
                last_synced_at: new Date().toISOString()
            };
            // Impressions/CTR from Analytics API (videoThumbnailImpressions)
            if (analytics.impressions > 0) {
              updateFields.impressions = analytics.impressions;
            }
            if (analytics.ctr > 0) {
              updateFields.ctr = analytics.ctr;
            }
            const { error: updateError } = await supabase
              .from('videos')
              .update(updateFields)
              .eq('id', existingVideo.id);

            if (!updateError) {
              updatedCount++;
            }
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      dateRange: { start, end },
      videoCount: Object.keys(videoAnalytics).length,
      analytics: videoAnalytics,
      updatedCount,
      matchedCount,
      impressionsDiag
    });

  } catch (error) {
    console.error('Analytics fetch error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
