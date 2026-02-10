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

    // Fetch video-level analytics
    // The Analytics API returns data per video when using video dimension
    const analyticsUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
    analyticsUrl.searchParams.append('ids', `channel==${channelId}`);
    analyticsUrl.searchParams.append('startDate', start);
    analyticsUrl.searchParams.append('endDate', end);
    analyticsUrl.searchParams.append('dimensions', 'video');
    analyticsUrl.searchParams.append('metrics', 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained');
    analyticsUrl.searchParams.append('sort', '-views');
    analyticsUrl.searchParams.append('maxResults', '200');

    // If specific video IDs provided, filter to those
    if (videoIds && videoIds.length > 0) {
      analyticsUrl.searchParams.append('filters', `video==${videoIds.join(',')}`);
    }

    const analyticsResponse = await fetch(analyticsUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

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

    // Now fetch impressions data separately
    // YouTube has a 3-day data latency for impressions - adjust end date
    const impressionsEnd = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    console.log(`[Analytics] Using impressions end date: ${impressionsEnd} (3 days ago)`);

    let impressionsData = null;
    let impressionsError = null;
    let testedMetrics = [];
    let channelSummary = null; // Channel-level totals (if available)

    // Try multiple metric combinations to find what works
    // Key insight: thumbnailImpressions may only work with NO dimension (channel totals)
    const metricAttempts = [
      { name: 'thumbnailImpressions-none', metrics: 'videoThumbnailImpressions,videoThumbnailImpressionsClickRate', dimension: null },
      { name: 'thumbnailImpressions-day', metrics: 'videoThumbnailImpressions,videoThumbnailImpressionsClickRate', dimension: 'day' },
      { name: 'annotationImpressions', metrics: 'views,annotationImpressions,annotationClickableImpressions', dimension: 'video' },
      { name: 'cardImpressions', metrics: 'views,cardImpressions,cardClickRate', dimension: 'video' }
    ];

    for (const attempt of metricAttempts) {
      const testUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
      testUrl.searchParams.append('ids', `channel==${channelId}`);
      testUrl.searchParams.append('startDate', start);
      testUrl.searchParams.append('endDate', impressionsEnd);
      testUrl.searchParams.append('metrics', attempt.metrics);
      // Only add dimension if specified (null = channel totals)
      if (attempt.dimension) {
        testUrl.searchParams.append('dimensions', attempt.dimension);
      }
      if (attempt.dimension === 'video') {
        testUrl.searchParams.append('maxResults', '200');
      }

      console.log(`[Analytics] Trying ${attempt.name}...`);
      const testResponse = await fetch(testUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (testResponse.ok) {
        const data = await testResponse.json();
        console.log(`[Analytics] ${attempt.name} SUCCESS: ${data.rows?.length || 0} rows`);
        if (data.rows?.length > 0) {
          console.log(`[Analytics] ${attempt.name} sample row:`, JSON.stringify(data.rows[0]));
        }
        testedMetrics.push({ name: attempt.name, success: true, rows: data.rows?.length || 0 });

        // Capture channel-level totals (no dimension or day dimension)
        if (!attempt.dimension && data.rows?.length > 0 && !channelSummary) {
          // No dimension = single row with totals [impressions, ctr]
          channelSummary = {
            totalImpressions: data.rows[0][0] ?? 0,
            averageCtr: data.rows[0][1] ?? 0,
            period: `${start} to ${impressionsEnd}`
          };
          console.log(`[Analytics] Channel summary:`, channelSummary);
        }

        // If this is a per-video metric and we got data, use it
        if (attempt.dimension === 'video' && data.rows?.length > 0) {
          impressionsData = data;
          break;
        }
      } else {
        const errorData = await testResponse.json();
        const errorMsg = errorData.error?.message || 'Unknown';
        console.log(`[Analytics] ${attempt.name} FAILED: ${errorMsg}`);
        testedMetrics.push({ name: attempt.name, success: false, error: errorMsg });
      }
    }

    if (!impressionsData) {
      impressionsError = `Tested metrics: ${testedMetrics.map(m => `${m.name}=${m.success ? 'OK' : 'FAIL'}`).join(', ')}`;
    }

    // Combine the data by video ID
    // analyticsData columns: video, views, estimatedMinutesWatched, averageViewPercentage, subscribersGained
    // impressionsData columns: video, views, videoThumbnailImpressions, videoThumbnailImpressionsClickRate

    const videoAnalytics = {};

    // Process main analytics data
    if (analyticsData.rows) {
      for (const row of analyticsData.rows) {
        const videoId = row[0];
        videoAnalytics[videoId] = {
          views: row[1] ?? 0,
          watchMinutes: row[2] ?? 0,
          watchHours: (row[2] ?? 0) / 60,
          avgViewPercentage: row[3] ?? 0,
          subscribersGained: row[4] ?? 0
        };
      }
    }

    // Merge impressions data (if available)
    // Note: Different metrics have different column layouts
    // annotationImpressions: video, views, annotationImpressions, annotationClickableImpressions
    // cardImpressions: video, views, cardImpressions, cardClickRate
    if (impressionsData?.rows) {
      for (const row of impressionsData.rows) {
        const videoId = row[0];
        if (!videoAnalytics[videoId]) {
          videoAnalytics[videoId] = {};
        }
        // Column 2 is the impressions-like metric, column 3 is the CTR-like metric
        videoAnalytics[videoId].impressions = row[2] ?? 0;
        videoAnalytics[videoId].ctr = row[3] ?? 0;
      }
      console.log(`[Analytics] Merged impressions for ${impressionsData.rows.length} videos`);
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
            const { error: updateError } = await supabase
              .from('videos')
              .update({
                impressions: analytics.impressions != null ? analytics.impressions : null,
                ctr: analytics.ctr != null ? analytics.ctr : null,
                avg_view_percentage: analytics.avgViewPercentage != null ? analytics.avgViewPercentage / 100 : null,
                watch_hours: analytics.watchHours != null ? analytics.watchHours : null,
                subscribers_gained: analytics.subscribersGained != null ? analytics.subscribersGained : null,
                last_synced_at: new Date().toISOString()
              })
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
      impressionsDateRange: { start, end: impressionsEnd },
      videoCount: Object.keys(videoAnalytics).length,
      analytics: videoAnalytics,
      updatedCount,
      matchedCount,
      impressionsAvailable: impressionsData?.rows?.length > 0,
      impressionsError: impressionsError || null,
      testedMetrics: testedMetrics,
      channelSummary: channelSummary // Channel-level impressions/CTR if available
    });

  } catch (error) {
    console.error('Analytics fetch error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
