/**
 * Vercel Serverless Function - YouTube Analytics Fetch
 * Fetches analytics data (retention, watch hours, subs) via YouTube Analytics API
 * and impressions/CTR via YouTube Reporting API (bulk CSV reports).
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

    // Fetch video-level analytics from YouTube Analytics API
    // Note: Impressions/CTR are NOT available via Analytics API with video dimension.
    // They come from the YouTube Reporting API (bulk CSV reports) below.
    const baseMetrics = 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained';

    const analyticsUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
    analyticsUrl.searchParams.append('ids', `channel==${channelId}`);
    analyticsUrl.searchParams.append('startDate', start);
    analyticsUrl.searchParams.append('endDate', end);
    analyticsUrl.searchParams.append('dimensions', 'video');
    analyticsUrl.searchParams.append('metrics', baseMetrics);
    analyticsUrl.searchParams.append('sort', '-views');
    analyticsUrl.searchParams.append('maxResults', '200');
    if (videoIds && videoIds.length > 0) {
      analyticsUrl.searchParams.append('filters', `video==${videoIds.join(',')}`);
    }

    const headers = { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' };

    // Analytics API: Base metrics (views, watch time, retention, subs)
    const analyticsResponse = await fetch(analyticsUrl.toString(), { headers });

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

    // Impressions/CTR: Fetch from YouTube Reporting API (bulk CSV reports)
    // The Analytics API does NOT support per-video impressions — only the Reporting API does
    let impressionsDiag = {
      source: 'reporting_api',
      success: false,
      videosWithData: 0,
      error: null,
      jobId: connection.reporting_job_id || null,
      jobType: connection.reporting_job_type || null
    };

    if (connection.reporting_job_id) {
      try {
        // Step 1: List available reports for this job
        const reportsResponse = await fetch(
          `https://youtubereporting.googleapis.com/v1/jobs/${connection.reporting_job_id}/reports`,
          { headers }
        );

        if (!reportsResponse.ok) {
          impressionsDiag.error = `Failed to list reports: HTTP ${reportsResponse.status}`;
        } else {
          const reportsData = await reportsResponse.json();
          const reports = (reportsData.reports || []).sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
          impressionsDiag.reportCount = reports.length;

          if (reports.length === 0) {
            impressionsDiag.error = 'No reports available yet (reports take ~48h after job creation)';
          } else {
            // Step 2: Download recent reports (14 days) and aggregate
            // A single day's data is too sparse for meaningful CTR — need multi-day aggregation
            // Limited to 14 to stay under YouTube API rate limits when syncing multiple channels
            const reportsToProcess = reports.slice(0, 14);
            impressionsDiag.reportDate = reports[0].createTime;
            impressionsDiag.reportsProcessed = reportsToProcess.length;

            // Download all reports in parallel for speed
            const reportContents = await Promise.all(
              reportsToProcess.map(async (report) => {
                try {
                  const resp = await fetch(report.downloadUrl, { headers });
                  if (!resp.ok) return null;
                  return await resp.text();
                } catch {
                  return null;
                }
              })
            );

            const videoAgg = {};
            let csvHeaders = null;
            let videoIdCol = null, impressionsCol = null, ctrCol = null;
            let reportsSuccessful = 0;

            for (const csvContent of reportContents) {
              if (!csvContent) continue;
              const lines = csvContent.trim().split('\n');
              if (lines.length < 2) continue;
              reportsSuccessful++;

              // Parse headers from first successful report
              if (!csvHeaders) {
                csvHeaders = lines[0].split(',').map(h => h.trim());
                impressionsDiag.csvColumns = csvHeaders;

                videoIdCol = csvHeaders.find(h => h.toLowerCase().includes('video_id'));
                impressionsCol = csvHeaders.find(h =>
                  h.toLowerCase().includes('thumbnail_impressions') ||
                  (h.toLowerCase() === 'impressions')
                );
                ctrCol = csvHeaders.find(h =>
                  h.toLowerCase().includes('click_through_rate') ||
                  h.toLowerCase().includes('impressions_ctr') ||
                  h.toLowerCase() === 'ctr'
                );

                impressionsDiag.matchedColumns = {
                  videoId: videoIdCol || null,
                  impressions: impressionsCol || null,
                  ctr: ctrCol || null
                };

                if (!videoIdCol) {
                  impressionsDiag.error = `No video_id column found. Columns: ${csvHeaders.join(', ')}`;
                  break;
                }
                if (!impressionsCol) {
                  impressionsDiag.error = `No impressions column found. Columns: ${csvHeaders.join(', ')}`;
                  break;
                }
              }

              // Aggregate rows from this report
              for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                const row = {};
                csvHeaders.forEach((header, idx) => { row[header] = values[idx]; });

                const vid = row[videoIdCol];
                if (!vid) continue;

                if (!videoAgg[vid]) {
                  videoAgg[vid] = { impressions: 0, clicks: 0 };
                }

                const dayImpressions = parseInt(row[impressionsCol]) || 0;
                videoAgg[vid].impressions += dayImpressions;

                // Compute clicks from CTR: clicks = impressions * ctr
                // This lets us compute a properly weighted aggregate CTR
                if (ctrCol && row[ctrCol]) {
                  const dayCtr = parseFloat(row[ctrCol]) || 0;
                  videoAgg[vid].clicks += dayImpressions * dayCtr;
                }
              }
            }

            if (!impressionsDiag.error && csvHeaders) {
              // Merge into videoAnalytics with properly weighted CTR
              for (const [vid, agg] of Object.entries(videoAgg)) {
                const aggregateCtr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0;
                if (videoAnalytics[vid]) {
                  videoAnalytics[vid].impressions = agg.impressions;
                  videoAnalytics[vid].ctr = aggregateCtr;
                } else {
                  videoAnalytics[vid] = {
                    views: 0, watchMinutes: 0, watchHours: 0,
                    avgViewPercentage: 0, subscribersGained: 0,
                    impressions: agg.impressions, ctr: aggregateCtr
                  };
                }
                if (agg.impressions > 0) impressionsDiag.videosWithData++;
                if (aggregateCtr > 0) impressionsDiag.videosWithCtr = (impressionsDiag.videosWithCtr || 0) + 1;
              }

              impressionsDiag.success = true;
              impressionsDiag.reportsDownloaded = reportsSuccessful;
              impressionsDiag.totalVideosInReport = Object.keys(videoAgg).length;
              impressionsDiag.videosWithCtr = impressionsDiag.videosWithCtr || 0;
              console.log(`[Analytics] Reporting API: ${reportsSuccessful} reports, ${impressionsDiag.videosWithData} videos with impressions, ${impressionsDiag.videosWithCtr} with CTR`);
            }
          }
        }
      } catch (reportErr) {
        impressionsDiag.error = reportErr.message;
        console.warn('[Analytics] Reporting API fetch failed:', reportErr.message);
      }
    } else {
      impressionsDiag.error = 'No reporting job configured. Go to Settings > Reporting API > Setup to enable impressions tracking.';
    }

    // Update videos in the database with analytics data
    // This is done server-side to bypass RLS restrictions
    const { updateVideos } = req.body;
    let updatedCount = 0;
    let matchedCount = 0;
    let ctrWrittenCount = 0;

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
            // Impressions/CTR from Reporting API (bulk CSV reports)
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
              if (updateFields.ctr) ctrWrittenCount++;
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
      ctrWrittenCount,
      impressionsDiag
    });

  } catch (error) {
    console.error('Analytics fetch error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
