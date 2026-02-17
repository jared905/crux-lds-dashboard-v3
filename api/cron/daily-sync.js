/**
 * Vercel Cron Job - Daily YouTube Data Sync
 * Runs automatically to sync videos, analytics, and reporting data for all connected channels.
 * Stores daily snapshots for historical trend tracking.
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

// Get valid access token for connection
async function getAccessToken(connection) {
  const tokenExpiresAt = new Date(connection.token_expires_at);
  const bufferMs = 5 * 60 * 1000;
  const isExpired = tokenExpiresAt.getTime() - bufferMs < Date.now();

  if (isExpired) {
    return await refreshAccessToken(connection);
  } else {
    return decryptToken(connection.encrypted_access_token);
  }
}

// Fetch base analytics data from YouTube Analytics API
// Note: Impressions/CTR are NOT available via Analytics API with video dimension.
// They come from the Reporting API (fetchReportingData) instead.
async function fetchAnalytics(accessToken, channelId, startDate, endDate) {
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' };

  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.append('ids', `channel==${channelId}`);
  url.searchParams.append('startDate', startDate);
  url.searchParams.append('endDate', endDate);
  url.searchParams.append('dimensions', 'video');
  url.searchParams.append('metrics', 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained');
  url.searchParams.append('sort', '-views');
  url.searchParams.append('maxResults', '200');

  const response = await fetch(url.toString(), { headers });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Analytics API failed');
  }

  return await response.json();
}

// Parse CSV content
function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    rows.push(row);
  }

  return { headers, rows };
}

// Fetch impressions data from YouTube Reporting API
async function fetchReportingData(accessToken, jobId) {
  // List reports
  const reportsResponse = await fetch(
    `https://youtubereporting.googleapis.com/v1/jobs/${jobId}/reports`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    }
  );

  if (!reportsResponse.ok) {
    throw new Error('Failed to list reports');
  }

  const reportsData = await reportsResponse.json();
  const reports = reportsData.reports || [];

  if (reports.length === 0) {
    return null; // No reports available yet
  }

  // Get the most recent report
  reports.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
  const latestReport = reports[0];

  // Download the report
  const reportResponse = await fetch(latestReport.downloadUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!reportResponse.ok) {
    throw new Error('Failed to download report');
  }

  const csvContent = await reportResponse.text();
  const { headers, rows } = parseCSV(csvContent);

  // Find columns
  const videoIdCol = headers.find(h => h.toLowerCase().includes('video_id') || h === 'video_id');
  const impressionsCol = headers.find(h => h.toLowerCase() === 'impressions' || h.toLowerCase().includes('thumbnail_impressions'));
  const ctrCol = headers.find(h => h.toLowerCase().includes('click_through_rate') || h.toLowerCase() === 'ctr' || h.toLowerCase().endsWith('_ctr'));
  const likesCol = headers.find(h => h.toLowerCase() === 'likes');
  const commentsCol = headers.find(h => h.toLowerCase() === 'comments');
  const sharesCol = headers.find(h => h.toLowerCase() === 'shares');
  const subsLostCol = headers.find(h => h.toLowerCase().includes('subscribers_lost'));

  if (!videoIdCol) return null;

  // Aggregate by video
  const videoData = {};
  for (const row of rows) {
    const videoId = row[videoIdCol];
    if (!videoId) continue;

    if (!videoData[videoId]) {
      videoData[videoId] = {
        impressions: 0,
        ctrSum: 0,
        ctrCount: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        subscribersLost: 0
      };
    }

    if (impressionsCol && row[impressionsCol]) {
      videoData[videoId].impressions += parseInt(row[impressionsCol]) || 0;
    }

    if (ctrCol && row[ctrCol]) {
      const ctr = parseFloat(row[ctrCol]) || 0;
      videoData[videoId].ctrSum += ctr;
      videoData[videoId].ctrCount++;
    }

    if (likesCol && row[likesCol]) {
      videoData[videoId].likes += parseInt(row[likesCol]) || 0;
    }

    if (commentsCol && row[commentsCol]) {
      videoData[videoId].comments += parseInt(row[commentsCol]) || 0;
    }

    if (sharesCol && row[sharesCol]) {
      videoData[videoId].shares += parseInt(row[sharesCol]) || 0;
    }

    if (subsLostCol && row[subsLostCol]) {
      videoData[videoId].subscribersLost += parseInt(row[subsLostCol]) || 0;
    }
  }

  // Calculate average CTR and finalize data
  for (const videoId of Object.keys(videoData)) {
    if (videoData[videoId].ctrCount > 0) {
      videoData[videoId].ctr = videoData[videoId].ctrSum / videoData[videoId].ctrCount;
    }
    // Clean up aggregation fields
    delete videoData[videoId].ctrSum;
    delete videoData[videoId].ctrCount;
  }

  return { videoData, reportDate: latestReport.createTime };
}

// Parse ISO 8601 duration (PT4M13S) to seconds
function parseDuration(iso8601) {
  if (!iso8601) return 0;
  const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1]) || 0) * 3600 + (parseInt(match[2]) || 0) * 60 + (parseInt(match[3]) || 0);
}

// Discover and upsert videos from YouTube Data API
async function discoverVideos(accessToken, youtubeChannelId, dbChannelId, channelName) {
  // Step 1: Get the uploads playlist ID
  const channelResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${youtubeChannelId}`,
    { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
  );

  if (!channelResponse.ok) {
    throw new Error('Failed to fetch channel details from Data API');
  }

  const channelData = await channelResponse.json();
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error('No uploads playlist found');
  }

  // Step 2: Fetch recent videos from uploads playlist (up to 200)
  const allVideoIds = [];
  let nextPageToken = null;
  let pages = 0;
  const MAX_PAGES = 4;

  do {
    const playlistUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    playlistUrl.searchParams.append('part', 'snippet');
    playlistUrl.searchParams.append('playlistId', uploadsPlaylistId);
    playlistUrl.searchParams.append('maxResults', '50');
    if (nextPageToken) {
      playlistUrl.searchParams.append('pageToken', nextPageToken);
    }

    const playlistResponse = await fetch(playlistUrl.toString(), {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    });

    if (!playlistResponse.ok) break;

    const playlistData = await playlistResponse.json();
    for (const item of (playlistData.items || [])) {
      allVideoIds.push(item.snippet.resourceId.videoId);
    }

    nextPageToken = playlistData.nextPageToken;
    pages++;
  } while (nextPageToken && pages < MAX_PAGES);

  if (allVideoIds.length === 0) return 0;

  // Step 3: Fetch video details in batches of 50
  const videosToUpsert = [];

  for (let i = 0; i < allVideoIds.length; i += 50) {
    const batch = allVideoIds.slice(i, i + 50);
    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    videosUrl.searchParams.append('part', 'snippet,contentDetails,statistics');
    videosUrl.searchParams.append('id', batch.join(','));

    const videosResponse = await fetch(videosUrl.toString(), {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    });

    if (!videosResponse.ok) continue;

    const videosData = await videosResponse.json();

    for (const video of (videosData.items || [])) {
      const durationSeconds = parseDuration(video.contentDetails?.duration);
      const isShort = durationSeconds > 0 && durationSeconds <= 180;
      const views = parseInt(video.statistics?.viewCount) || 0;
      const likes = parseInt(video.statistics?.likeCount) || 0;
      const comments = parseInt(video.statistics?.commentCount) || 0;

      videosToUpsert.push({
        youtube_video_id: video.id,
        channel_id: dbChannelId,
        title: video.snippet?.title,
        published_at: video.snippet?.publishedAt,
        thumbnail_url: `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`,
        view_count: views,
        like_count: likes,
        comment_count: comments,
        duration_seconds: durationSeconds,
        video_type: isShort ? 'short' : 'long',
        engagement_rate: views > 0 ? (likes + comments) / views : 0,
        content_source: channelName,
      });
    }
  }

  // Step 4: Upsert to database (only updates columns present in data — preserves impressions/ctr)
  if (videosToUpsert.length > 0) {
    const { error } = await supabase
      .from('videos')
      .upsert(videosToUpsert, { onConflict: 'youtube_video_id' });

    if (error) {
      throw new Error(`Failed to upsert videos: ${error.message}`);
    }
  }

  return videosToUpsert.length;
}

// Sync a single connection
async function syncConnection(connection) {
  const results = {
    connectionId: connection.id,
    channelTitle: connection.youtube_channel_title,
    videosUpdated: 0,
    snapshotsCreated: 0,
    errors: []
  };

  try {
    const accessToken = await getAccessToken(connection);
    const channelId = connection.youtube_channel_id;
    const today = new Date().toISOString().split('T')[0];

    // Find the client channel in our database
    const { data: dbChannel } = await supabase
      .from('channels')
      .select('id, name')
      .eq('youtube_channel_id', channelId)
      .eq('is_client', true)
      .single();

    if (!dbChannel) {
      results.errors.push('No matching client channel in database');
      return results;
    }

    // Discover and upsert videos from YouTube Data API
    try {
      const discovered = await discoverVideos(accessToken, channelId, dbChannel.id, dbChannel.name);
      console.log(`[Daily Sync] Discovered/updated ${discovered} videos for ${connection.youtube_channel_title}`);
      results.videosDiscovered = discovered;
    } catch (e) {
      results.errors.push(`Video discovery: ${e.message}`);
    }

    // Fetch analytics (yesterday's data, as today's isn't complete)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let analyticsData = {};

    try {
      const analytics = await fetchAnalytics(accessToken, channelId, yesterday, yesterday);
      if (analytics.rows) {
        for (const row of analytics.rows) {
          analyticsData[row[0]] = {
            views: row[1] ?? 0,
            watchHours: (row[2] ?? 0) / 60,
            avgViewPercentage: (row[3] ?? 0) / 100,
            subscribersGained: row[4] ?? 0,
            impressions: 0,
            ctr: 0
          };
        }
        console.log(`[Daily Sync] Analytics: ${analytics.rows.length} videos`);
      }
    } catch (e) {
      results.errors.push(`Analytics: ${e.message}`);
    }

    // Fetch reporting data (impressions/CTR)
    let reportingData = null;
    if (connection.reporting_job_id) {
      try {
        reportingData = await fetchReportingData(accessToken, connection.reporting_job_id);
      } catch (e) {
        results.errors.push(`Reporting: ${e.message}`);
      }
    }

    // Get all videos for this channel (include Data API stats for cumulative snapshots)
    const { data: videos } = await supabase
      .from('videos')
      .select('id, youtube_video_id, view_count, like_count, comment_count')
      .eq('channel_id', dbChannel.id);

    if (!videos || videos.length === 0) {
      return results;
    }

    // Process each video
    for (const video of videos) {
      const videoId = video.youtube_video_id;
      const analytics = analyticsData[videoId] || {};
      const reporting = reportingData?.videoData?.[videoId] || {};

      // Update current video stats
      const updateData = {
        last_synced_at: new Date().toISOString()
      };

      if (analytics.avgViewPercentage != null) {
        updateData.avg_view_percentage = analytics.avgViewPercentage;
      }
      if (analytics.watchHours != null) {
        updateData.watch_hours = analytics.watchHours;
      }
      if (analytics.subscribersGained != null) {
        updateData.subscribers_gained = analytics.subscribersGained;
      }
      // Impressions/CTR from Reporting API (only source — Analytics API doesn't support per-video impressions)
      if (reporting.impressions != null && reporting.impressions > 0) {
        updateData.impressions = reporting.impressions;
      }
      if (reporting.ctr != null) {
        updateData.ctr = reporting.ctr;
      }

      if (Object.keys(updateData).length > 1) {
        await supabase
          .from('videos')
          .update(updateData)
          .eq('id', video.id);
        results.videosUpdated++;
      }

      // Create daily snapshot (upsert to handle re-runs)
      const snapshotData = {
        video_id: video.id,
        snapshot_date: yesterday,
        view_count: analytics.views || null,
        impressions: reporting.impressions || analytics.impressions || null,
        ctr: reporting.ctr || analytics.ctr || null,
        avg_view_percentage: analytics.avgViewPercentage || null,
        watch_hours: analytics.watchHours || null,
        subscribers_gained: analytics.subscribersGained || null,
        subscribers_lost: reporting.subscribersLost || null,
        likes: reporting.likes || null,
        comments: reporting.comments || null,
        shares: reporting.shares || null,
        // Cumulative Data API counts — always available from discoverVideos
        // Period views = MAX(total_view_count) - MIN(total_view_count)
        total_view_count: video.view_count || null,
        total_like_count: video.like_count || null,
        total_comment_count: video.comment_count || null,
      };

      // Only create snapshot if we have some data (include cumulative counts)
      const hasData = snapshotData.view_count || snapshotData.impressions || snapshotData.watch_hours ||
                      snapshotData.likes || snapshotData.comments || snapshotData.shares ||
                      snapshotData.total_view_count;
      if (hasData) {
        const { error: snapshotError } = await supabase
          .from('video_snapshots')
          .upsert(snapshotData, { onConflict: 'video_id,snapshot_date' });

        if (!snapshotError) {
          results.snapshotsCreated++;
        }
      }
    }

    // Update connection last sync time
    await supabase
      .from('youtube_oauth_connections')
      .update({
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id);

  } catch (e) {
    results.errors.push(e.message);

    // Mark connection error
    await supabase
      .from('youtube_oauth_connections')
      .update({
        connection_error: e.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id);
  }

  return results;
}

export default async function handler(req, res) {
  // Verify this is a legitimate cron request from Vercel
  const authHeader = req.headers.authorization;
  const manualTrigger = req.query?.manual === 'true';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !manualTrigger) {
    // In development, allow without secret
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('[Daily Sync] Starting...');
  const startTime = Date.now();

  try {
    // Get all active OAuth connections
    const { data: connections, error: connError } = await supabase
      .from('youtube_oauth_connections')
      .select('*')
      .eq('is_active', true);

    if (connError) {
      throw connError;
    }

    if (!connections || connections.length === 0) {
      console.log('[Daily Sync] No active connections');
      return res.status(200).json({
        success: true,
        message: 'No active connections to sync',
        duration: Date.now() - startTime
      });
    }

    console.log(`[Daily Sync] Syncing ${connections.length} connection(s)`);

    // Sync each connection
    const results = [];
    for (const connection of connections) {
      console.log(`[Daily Sync] Syncing ${connection.youtube_channel_title}...`);
      const result = await syncConnection(connection);
      results.push(result);
      console.log(`[Daily Sync] ${connection.youtube_channel_title}: ${result.videosUpdated} videos, ${result.snapshotsCreated} snapshots`);
    }

    const duration = Date.now() - startTime;
    console.log(`[Daily Sync] Complete in ${duration}ms`);

    return res.status(200).json({
      success: true,
      connectionsProcessed: connections.length,
      results,
      duration
    });

  } catch (error) {
    console.error('[Daily Sync] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    });
  }
}
