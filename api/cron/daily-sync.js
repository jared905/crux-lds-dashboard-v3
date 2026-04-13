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

// Fetch per-video analytics from YouTube Analytics API for a single date range.
// Note: dimensions=day,video is NOT supported — to get per-day data, call this
// once per day with startDate === endDate.
// Impressions/CTR are NOT available via Analytics API with video dimension.
// They come from the Reporting API (fetchReportingData) instead.
//
// Tries the full metric set first; if the API rejects it (some channels don't
// support all metrics with dimensions=video), falls back to basic metrics.
async function fetchAnalytics(accessToken, channelId, startDate, endDate) {
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' };

  const metricSets = [
    { metrics: 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained', hasRetention: true, hasSubs: true },
    { metrics: 'views,estimatedMinutesWatched,averageViewPercentage', hasRetention: true, hasSubs: false },
    { metrics: 'views,estimatedMinutesWatched', hasRetention: false, hasSubs: false },
  ];

  const idsToTry = [`channel==${channelId}`, 'channel==MINE'];
  const attempts = []; // Diagnostic log

  for (const ids of idsToTry) {
    for (const metricSet of metricSets) {
      const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
      url.searchParams.append('ids', ids);
      url.searchParams.append('startDate', startDate);
      url.searchParams.append('endDate', endDate);
      url.searchParams.append('dimensions', 'video');
      url.searchParams.append('metrics', metricSet.metrics);
      url.searchParams.append('sort', '-views');
      url.searchParams.append('maxResults', '200');

      const response = await fetch(url.toString(), { headers });

      if (response.ok) {
        const data = await response.json();
        data._metricSet = metricSet;
        data._idsUsed = ids;
        data._attempts = attempts;
        return data;
      }

      const status = response.status;
      await response.json().catch(() => {}); // Consume body
      attempts.push(`${ids} [${metricSet.metrics.split(',').length} metrics] → ${status}`);

      if (status === 401 || status === 403) {
        break;
      }
    }
  }

  const err = new Error('No supported metric combination found for this channel');
  err.attempts = attempts;
  throw err;
}

// Build list of date strings between start and end (inclusive)
function getDateRange(startDate, endDate) {
  const dates = [];
  const cur = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
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

// Parse a single Reporting API CSV and extract per-video metrics
function parseReportCSV(csvContent) {
  const { headers, rows } = parseCSV(csvContent);

  const videoIdCol = headers.find(h => h.toLowerCase().includes('video_id') || h === 'video_id');
  const dateCol = headers.find(h => h.toLowerCase() === 'date');
  const impressionsCol = headers.find(h => h.toLowerCase() === 'impressions' || h.toLowerCase().includes('thumbnail_impressions'));
  const ctrCol = headers.find(h => h.toLowerCase().includes('click_through_rate') || h.toLowerCase() === 'ctr' || h.toLowerCase().endsWith('_ctr'));
  const viewsCol = headers.find(h => h.toLowerCase() === 'views');
  const watchTimeCol = headers.find(h => h.toLowerCase() === 'watch_time_minutes' || h.toLowerCase().includes('watch_time'));
  const likesCol = headers.find(h => h.toLowerCase() === 'likes');
  const commentsCol = headers.find(h => h.toLowerCase() === 'comments');
  const sharesCol = headers.find(h => h.toLowerCase() === 'shares');
  const subsGainedCol = headers.find(h => h.toLowerCase().includes('subscribers_gained'));
  const subsLostCol = headers.find(h => h.toLowerCase().includes('subscribers_lost'));
  const avgViewPercentageCol = headers.find(h => h.toLowerCase().includes('average_view_duration_percentage') || h.toLowerCase().includes('avg_view_percentage'));

  if (!videoIdCol) return { headers, videoData: {}, byDate: {} };

  console.log(`[Reporting] CSV columns: ${headers.join(', ')}`);
  if (viewsCol) console.log(`[Reporting] Found views column: "${viewsCol}"`);
  if (watchTimeCol) console.log(`[Reporting] Found watch_time column: "${watchTimeCol}"`);

  const videoData = {};
  const byDate = {}; // { [date]: { [videoId]: { views, impressions, ... } } }

  for (const row of rows) {
    const videoId = row[videoIdCol];
    if (!videoId) continue;
    const date = dateCol ? row[dateCol] : null;

    const rowViews = viewsCol ? (parseInt(row[viewsCol]) || 0) : 0;
    const rowWatchMins = watchTimeCol ? (parseFloat(row[watchTimeCol]) || 0) : 0;
    const rowImpressions = impressionsCol ? (parseInt(row[impressionsCol]) || 0) : 0;
    const rowCtr = ctrCol ? (parseFloat(row[ctrCol]) || 0) : 0;
    const rowLikes = likesCol ? (parseInt(row[likesCol]) || 0) : 0;
    const rowComments = commentsCol ? (parseInt(row[commentsCol]) || 0) : 0;
    const rowShares = sharesCol ? (parseInt(row[sharesCol]) || 0) : 0;
    const rowSubsGained = subsGainedCol ? (parseInt(row[subsGainedCol]) || 0) : 0;
    const rowSubsLost = subsLostCol ? (parseInt(row[subsLostCol]) || 0) : 0;
    const rowAvgViewPct = avgViewPercentageCol ? (parseFloat(row[avgViewPercentageCol]) || 0) : 0;

    // Aggregate totals per video (backward compat)
    if (!videoData[videoId]) {
      videoData[videoId] = {
        impressions: 0, ctrSum: 0, ctrCount: 0,
        views: 0, watchMinutes: 0,
        likes: 0, comments: 0, shares: 0,
        subscribersGained: 0, subscribersLost: 0
      };
    }
    videoData[videoId].impressions += rowImpressions;
    videoData[videoId].views += rowViews;
    videoData[videoId].watchMinutes += rowWatchMins;
    videoData[videoId].likes += rowLikes;
    videoData[videoId].comments += rowComments;
    videoData[videoId].shares += rowShares;
    videoData[videoId].subscribersGained += rowSubsGained;
    videoData[videoId].subscribersLost += rowSubsLost;
    if (rowCtr > 0) {
      videoData[videoId].ctrSum += rowCtr;
      videoData[videoId].ctrCount++;
    }

    // Per-day breakdown for historical backfill
    if (date) {
      if (!byDate[date]) byDate[date] = {};
      byDate[date][videoId] = {
        views: rowViews,
        watchHours: rowWatchMins / 60,
        impressions: rowImpressions,
        ctr: rowCtr,
        likes: rowLikes,
        comments: rowComments,
        shares: rowShares,
        subscribersGained: rowSubsGained,
        subscribersLost: rowSubsLost,
        avgViewPercentage: rowAvgViewPct
      };
    }
  }

  // Finalize aggregated video data
  for (const videoId of Object.keys(videoData)) {
    if (videoData[videoId].ctrCount > 0) {
      videoData[videoId].ctr = videoData[videoId].ctrSum / videoData[videoId].ctrCount;
    }
    delete videoData[videoId].ctrSum;
    delete videoData[videoId].ctrCount;
  }

  return { headers, videoData, byDate };
}

// Fetch impressions/views data from YouTube Reporting API
// Downloads up to 14 recent reports and returns per-day-per-video data
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

  // Get the 30 most recent reports (each covers one day)
  reports.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
  const recentReports = reports.slice(0, 30);
  console.log(`[Reporting] Downloading ${recentReports.length} reports for historical backfill`);

  // Merged results across all reports
  const mergedVideoData = {};
  const mergedByDate = {};

  for (const report of recentReports) {
    try {
      const reportResponse = await fetch(report.downloadUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!reportResponse.ok) {
        console.warn(`[Reporting] Failed to download report from ${report.startTime}`);
        continue;
      }

      const csvContent = await reportResponse.text();
      const { videoData, byDate } = parseReportCSV(csvContent);

      // Merge per-day data
      for (const [date, videos] of Object.entries(byDate)) {
        if (!mergedByDate[date]) mergedByDate[date] = {};
        Object.assign(mergedByDate[date], videos);
      }

      // Merge aggregated video data
      for (const [videoId, data] of Object.entries(videoData)) {
        if (!mergedVideoData[videoId]) {
          mergedVideoData[videoId] = { ...data };
        } else {
          mergedVideoData[videoId].impressions += data.impressions || 0;
          mergedVideoData[videoId].views += data.views || 0;
          mergedVideoData[videoId].watchMinutes += data.watchMinutes || 0;
          mergedVideoData[videoId].likes += data.likes || 0;
          mergedVideoData[videoId].comments += data.comments || 0;
          mergedVideoData[videoId].shares += data.shares || 0;
          mergedVideoData[videoId].subscribersGained += data.subscribersGained || 0;
          mergedVideoData[videoId].subscribersLost += data.subscribersLost || 0;
        }
      }
    } catch (e) {
      console.warn(`[Reporting] Error processing report: ${e.message}`);
    }
  }

  const dateCount = Object.keys(mergedByDate).length;
  const videoCount = Object.keys(mergedVideoData).length;
  console.log(`[Reporting] Got data for ${videoCount} videos across ${dateCount} days`);

  return {
    videoData: mergedVideoData,
    byDate: mergedByDate,
    reportDate: recentReports[0].createTime
  };
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
    dataSources: {
      analyticsAPI: false,     // per-video views, watch hours, retention, subs
      reachReporting: false,   // impressions, CTR
      basicReporting: false,   // views, subs, watch from Reporting API
      dataAPI: false,          // cumulative video stats
      channelSnapshot: false,  // channel-level subscriber tracking
    },
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
      results.dataSources.dataAPI = true;
    } catch (e) {
      results.errors.push(`Video discovery: ${e.message}`);
    }

    // Fetch per-day analytics for the last 7 days (one API call per day)
    // YouTube finalizes retention/subscriber data 2-3 days after upload,
    // so fetching a wider window ensures we catch updates for recent videos
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const syncDates = getDateRange(weekAgo, yesterday);
    // analyticsData[videoId] = aggregated 7-day totals (used for updating videos table)
    let analyticsData = {};
    // analyticsByDay[date][videoId] = single-day metrics (used for accurate snapshots)
    let analyticsByDay = {};

    for (const date of syncDates) {
      try {
        const analytics = await fetchAnalytics(accessToken, channelId, date, date);
        const ms = analytics._metricSet || {};
        if (analytics.rows) {
          for (const row of analytics.rows) {
            // row shape depends on which metrics succeeded:
            // Full:  [videoId, views, watchMinutes, avgViewPct, subsGained]
            // NoSub: [videoId, views, watchMinutes, avgViewPct]
            // Basic: [videoId, views, watchMinutes]
            const videoId = row[0];
            const metrics = {
              views: row[1] ?? 0,
              watchHours: (row[2] ?? 0) / 60,
              avgViewPercentage: ms.hasRetention ? (row[3] ?? 0) / 100 : 0,
              subscribersGained: ms.hasSubs ? (row[ms.hasRetention ? 4 : 3] ?? 0) : 0,
              impressions: 0,
              ctr: 0
            };

            // Per-day storage for snapshots
            if (!analyticsByDay[date]) analyticsByDay[date] = {};
            analyticsByDay[date][videoId] = metrics;

            // Aggregate across days for the videos table update
            if (!analyticsData[videoId]) {
              analyticsData[videoId] = { views: 0, watchHours: 0, avgViewPercentage: 0, subscribersGained: 0, impressions: 0, ctr: 0, _dayCount: 0 };
            }
            const agg = analyticsData[videoId];
            agg.views += metrics.views;
            agg.watchHours += metrics.watchHours;
            agg.subscribersGained += metrics.subscribersGained;
            agg.avgViewPercentage += metrics.avgViewPercentage;
            agg._dayCount++;
          }
        }
      } catch (e) {
        results.errors.push(`Analytics ${date}: ${e.message}`);
      }
      // Rate limit between API calls
      await new Promise(r => setTimeout(r, 100));
    }
    // Average the rate-based metrics
    for (const vid of Object.values(analyticsData)) {
      if (vid._dayCount > 0) vid.avgViewPercentage = vid.avgViewPercentage / vid._dayCount;
      delete vid._dayCount;
    }
    if (Object.keys(analyticsData).length > 0) results.dataSources.analyticsAPI = true;
    console.log(`[Daily Sync] Analytics: ${syncDates.length} days fetched, ${Object.keys(analyticsData).length} videos`);

    // FALLBACK: If per-video analytics failed (OAuth verification pending), try
    // channel-level daily analytics (dimensions=day). This gives us total daily
    // views, watch hours, and subscribers for the channel — not per-video, but
    // critical for quarterly reports where per-video isn't required.
    let channelDailyAnalytics = null;
    if (Object.keys(analyticsData).length === 0) {
      try {
        const headers = { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' };
        const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
        url.searchParams.append('ids', `channel==${channelId}`);
        url.searchParams.append('startDate', weekAgo);
        url.searchParams.append('endDate', yesterday);
        url.searchParams.append('dimensions', 'day');
        url.searchParams.append('metrics', 'views,estimatedMinutesWatched,subscribersGained');
        url.searchParams.append('sort', 'day');

        const resp = await fetch(url.toString(), { headers });
        if (resp.ok) {
          const data = await resp.json();
          if (data.rows?.length) {
            channelDailyAnalytics = {};
            let totalViews = 0, totalWatchHours = 0, totalSubs = 0;
            for (const row of data.rows) {
              // row: [date, views, watchMinutes, subsGained]
              const date = row[0];
              channelDailyAnalytics[date] = {
                views: row[1] || 0,
                watchHours: (row[2] || 0) / 60,
                subscribersGained: row[3] || 0,
              };
              totalViews += row[1] || 0;
              totalWatchHours += (row[2] || 0) / 60;
              totalSubs += row[3] || 0;
            }
            results.dataSources.channelAnalytics = true;
            results.channelAnalyticsSummary = {
              days: data.rows.length,
              views: totalViews,
              watchHours: Math.round(totalWatchHours * 10) / 10,
              subsGained: totalSubs,
            };
            console.log(`[Daily Sync] Channel-level analytics: ${data.rows.length} days, ${totalViews} views, ${totalSubs} subs for ${connection.youtube_channel_title}`);
          }
        } else {
          const errBody = await resp.json().catch(() => ({}));
          console.log(`[Daily Sync] Channel-level analytics also failed for ${connection.youtube_channel_title}: ${errBody.error?.message || resp.status}`);
        }
      } catch (e) {
        console.warn(`[Daily Sync] Channel analytics fallback failed: ${e.message}`);
      }
    }

    // Fetch reporting data from BOTH report types:
    // - Reach report (reporting_job_id): impressions, CTR
    // - Basic report (basic_reporting_job_id): views, watch time, subs, likes, comments, shares
    let reportingData = null;
    let basicReportingData = null;

    if (connection.reporting_job_id) {
      try {
        reportingData = await fetchReportingData(accessToken, connection.reporting_job_id);
        if (reportingData) results.dataSources.reachReporting = true;
      } catch (e) {
        results.errors.push(`Reach reporting: ${e.message}`);
      }
    }

    if (connection.basic_reporting_job_id) {
      try {
        basicReportingData = await fetchReportingData(accessToken, connection.basic_reporting_job_id);
        if (basicReportingData) results.dataSources.basicReporting = true;
      } catch (e) {
        results.errors.push(`Basic reporting: ${e.message}`);
      }
    }

    // Merge basic report data into reporting data (basic has views/subs/watch, reach has impressions/CTR)
    if (basicReportingData?.byDate) {
      if (!reportingData) reportingData = { videoData: {}, byDate: {} };
      for (const [date, videos] of Object.entries(basicReportingData.byDate)) {
        if (!reportingData.byDate[date]) reportingData.byDate[date] = {};
        for (const [videoId, metrics] of Object.entries(videos)) {
          if (!reportingData.byDate[date][videoId]) {
            reportingData.byDate[date][videoId] = metrics;
          } else {
            // Merge: basic report fills views/subs/watch, reach report fills impressions/CTR
            const existing = reportingData.byDate[date][videoId];
            if (metrics.views && !existing.views) existing.views = metrics.views;
            if (metrics.watchHours && !existing.watchHours) existing.watchHours = metrics.watchHours;
            if (metrics.subscribersGained) existing.subscribersGained = metrics.subscribersGained;
            if (metrics.subscribersLost) existing.subscribersLost = metrics.subscribersLost;
            if (metrics.likes && !existing.likes) existing.likes = metrics.likes;
            if (metrics.comments && !existing.comments) existing.comments = metrics.comments;
            if (metrics.shares && !existing.shares) existing.shares = metrics.shares;
          }
        }
      }
      // Merge aggregated video data too
      for (const [videoId, metrics] of Object.entries(basicReportingData.videoData || {})) {
        if (!reportingData.videoData[videoId]) {
          reportingData.videoData[videoId] = metrics;
        } else {
          const existing = reportingData.videoData[videoId];
          if (metrics.views && !existing.views) existing.views = metrics.views;
          if (metrics.subscribersGained) existing.subscribersGained += metrics.subscribersGained;
        }
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

      // Update current video stats using most recent day's analytics (not 7-day sum)
      const latestDayAnalytics = analyticsByDay[yesterday]?.[videoId] || {};
      const updateData = {
        last_synced_at: new Date().toISOString()
      };

      // avg_view_percentage is a rate — use most recent day's value
      if (latestDayAnalytics.avgViewPercentage != null) {
        updateData.avg_view_percentage = latestDayAnalytics.avgViewPercentage;
      }
      // watch_hours and subscribers_gained on the videos table are period totals —
      // use the 7-day aggregate since this represents the full sync window
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

      // Create per-day snapshots from Analytics API data (upsert to handle re-runs)
      // Each day in the 7-day window gets its own snapshot with that day's actual views
      const analyticsDays = Object.keys(analyticsByDay).sort();
      for (const date of analyticsDays) {
        const dayAnalytics = analyticsByDay[date]?.[videoId];
        const reportingDay = reportingData?.byDate?.[date]?.[videoId] || {};

        const snapshotData = {
          video_id: video.id,
          snapshot_date: date,
          view_count: dayAnalytics?.views || reportingDay.views || null,
          impressions: reportingDay.impressions || null,
          ctr: reportingDay.ctr || null,
          avg_view_percentage: dayAnalytics?.avgViewPercentage || null,
          watch_hours: dayAnalytics?.watchHours || reportingDay.watchHours || null,
          subscribers_gained: dayAnalytics?.subscribersGained || reportingDay.subscribersGained || null,
          subscribers_lost: reportingDay.subscribersLost || null,
          likes: reportingDay.likes || null,
          comments: reportingDay.comments || null,
          shares: reportingDay.shares || null,
          // Cumulative Data API counts — written on every day so the delta
          // MAX(total_view_count) - MIN(total_view_count) works across any date range
          total_view_count: video.view_count || null,
          total_like_count: video.like_count || null,
          total_comment_count: video.comment_count || null,
        };

        const hasData = snapshotData.view_count || snapshotData.impressions || snapshotData.watch_hours ||
                        snapshotData.likes || snapshotData.total_view_count;
        if (hasData) {
          const { error: snapshotError } = await supabase
            .from('video_snapshots')
            .upsert(snapshotData, { onConflict: 'video_id,snapshot_date' });

          if (!snapshotError) {
            results.snapshotsCreated++;
          }
        }
      }

      // If no analytics days had data for this video, still store cumulative counts for yesterday
      if (!analyticsDays.some(d => analyticsByDay[d]?.[videoId])) {
        const reportingDay = reportingData?.byDate?.[yesterday]?.[videoId] || {};
        const fallback = {
          video_id: video.id,
          snapshot_date: yesterday,
          view_count: reportingDay.views || null,
          impressions: reportingDay.impressions || reporting.impressions || null,
          ctr: reportingDay.ctr || reporting.ctr || null,
          watch_hours: reportingDay.watchHours || null,
          total_view_count: video.view_count || null,
          total_like_count: video.like_count || null,
          total_comment_count: video.comment_count || null,
        };
        if (fallback.view_count || fallback.impressions || fallback.total_view_count) {
          await supabase
            .from('video_snapshots')
            .upsert(fallback, { onConflict: 'video_id,snapshot_date' });
          results.snapshotsCreated++;
        }
      }
    }

    // Backfill historical snapshots from Reporting API per-day data
    // Uses COALESCE-based RPC so Reporting API data only fills gaps —
    // it never overwrites accurate Analytics API values (views, watch hours, etc.)
    if (reportingData?.byDate && videos) {
      const videoMap = {};
      for (const v of videos) { videoMap[v.youtube_video_id] = v; }

      const dates = Object.keys(reportingData.byDate).sort();
      console.log(`[Daily Sync] Backfilling ${dates.length} days of historical snapshots`);

      let backfillCount = 0;
      const batchSize = 50;
      let batch = [];

      for (const date of dates) {
        const dayData = reportingData.byDate[date];
        for (const [ytVideoId, metrics] of Object.entries(dayData)) {
          const dbVideo = videoMap[ytVideoId];
          if (!dbVideo) continue;

          const hasMetrics = metrics.views || metrics.impressions || metrics.watchHours || metrics.likes;
          if (!hasMetrics) continue;

          // Only include ACTUAL Reporting API values — no estimates.
          // Columns the report doesn't have (e.g. views in reach reports) stay null,
          // and the COALESCE RPC preserves existing Analytics API data.
          batch.push({
            video_id: dbVideo.id,
            snapshot_date: date,
            view_count: metrics.views || null,
            impressions: metrics.impressions || null,
            ctr: metrics.ctr || null,
            watch_hours: metrics.watchHours || null,
            likes: metrics.likes || null,
            comments: metrics.comments || null,
            shares: metrics.shares || null,
            subscribers_gained: metrics.subscribersGained || null,
            subscribers_lost: metrics.subscribersLost || null,
            avg_view_percentage: metrics.avgViewPercentage || null,
          });

          if (batch.length >= batchSize) {
            const { data: count, error } = await supabase
              .rpc('upsert_video_snapshots_safe', { snapshots: batch });
            if (!error) backfillCount += (count || batch.length);
            batch = [];
          }
        }
      }

      // Flush remaining batch
      if (batch.length > 0) {
        const { data: count, error } = await supabase
          .rpc('upsert_video_snapshots_safe', { snapshots: batch });
        if (!error) backfillCount += (count || batch.length);
      }

      console.log(`[Daily Sync] Backfilled ${backfillCount} historical snapshots across ${dates.length} days`);
      results.historicalBackfill = backfillCount;
    }

    // Auto-create Reporting API job if missing (enables impressions/CTR data)
    if (!connection.reporting_job_id) {
      try {
        const reportTypesRes = await fetch(
          'https://youtubereporting.googleapis.com/v1/reportTypes',
          { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
        );
        if (reportTypesRes.ok) {
          const reportTypes = await reportTypesRes.json();
          const reachType = reportTypes.reportTypes?.find(rt =>
            rt.id === 'channel_reach_basic_a1' || rt.id === 'channel_reach_combined_a1' || rt.id.includes('channel_reach_')
          );
          if (reachType) {
            const jobsRes = await fetch('https://youtubereporting.googleapis.com/v1/jobs',
              { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
            const jobsData = jobsRes.ok ? await jobsRes.json() : {};
            const existingJob = jobsData.jobs?.find(j => j.reportTypeId?.includes('channel_reach_'));
            if (existingJob) {
              await supabase.from('youtube_oauth_connections').update({
                reporting_job_id: existingJob.id, reporting_job_type: existingJob.reportTypeId, updated_at: new Date().toISOString(),
              }).eq('id', connection.id);
              console.log(`[Daily Sync] Linked existing reporting job for ${connection.youtube_channel_title}`);
            } else {
              const createRes = await fetch('https://youtubereporting.googleapis.com/v1/jobs', {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ reportTypeId: reachType.id, name: `Dashboard Reach Report - ${connection.youtube_channel_title}` }),
              });
              if (createRes.ok) {
                const newJob = await createRes.json();
                await supabase.from('youtube_oauth_connections').update({
                  reporting_job_id: newJob.id, reporting_job_type: newJob.reportTypeId, updated_at: new Date().toISOString(),
                }).eq('id', connection.id);
                console.log(`[Daily Sync] Created reporting job for ${connection.youtube_channel_title}`);
              }
            }
          }
        }
      } catch (reportErr) {
        console.warn(`[Daily Sync] Reporting job setup failed for ${connection.youtube_channel_title}:`, reportErr.message);
      }
    }

    // Create channel_snapshot for subscriber/view tracking (same as competitor sync).
    // This is critical for quarterly reports: channel-level subscriber deltas are
    // the most reliable source when per-video Analytics API subs are unavailable.
    try {
      const channelStatsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}`,
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
      );
      if (channelStatsRes.ok) {
        const channelStats = await channelStatsRes.json();
        const stats = channelStats.items?.[0]?.statistics;
        if (stats) {
          const subCount = parseInt(stats.subscriberCount) || 0;
          const viewCount = parseInt(stats.viewCount) || 0;
          const vidCount = parseInt(stats.videoCount) || 0;

          // Get previous snapshot for delta calculation
          const { data: prevSnap } = await supabase
            .from('channel_snapshots')
            .select('subscriber_count, total_view_count, video_count')
            .eq('channel_id', dbChannel.id)
            .order('snapshot_date', { ascending: false })
            .limit(1)
            .single();

          await supabase
            .from('channel_snapshots')
            .upsert({
              channel_id: dbChannel.id,
              snapshot_date: yesterday,
              subscriber_count: subCount,
              total_view_count: viewCount,
              video_count: vidCount,
              subscriber_change: prevSnap ? subCount - prevSnap.subscriber_count : null,
              view_change: prevSnap ? viewCount - prevSnap.total_view_count : null,
              video_change: prevSnap ? vidCount - prevSnap.video_count : null,
            }, { onConflict: 'channel_id,snapshot_date' });

          // Also update the channels table with current stats
          await supabase
            .from('channels')
            .update({
              subscriber_count: subCount,
              total_view_count: viewCount,
              video_count: vidCount,
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', dbChannel.id);

          results.channelSnapshot = { subscribers: subCount, views: viewCount };
          results.dataSources.channelSnapshot = true;
        }
      }
    } catch (snapErr) {
      results.errors.push(`Channel snapshot: ${snapErr.message}`);
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

// Backfill mode: download ALL available Reporting API CSV reports and write
// per-day-per-video snapshots. Processes one channel per request.
//
// The YouTube Analytics API doesn't work for these channel types, but the
// Reporting API provides per-day CSVs going back ~60-180 days.
//
// Usage: /api/cron/daily-sync?backfill=true&manual=true
// Or target a specific channel:
//   /api/cron/daily-sync?backfill=true&channel=CONNECTION_ID&manual=true
async function handleBackfill(req, res) {
  const startTime = Date.now();
  const targetConnectionId = req.query.channel || null;

  // Get connections
  let connQuery = supabase
    .from('youtube_oauth_connections')
    .select('*')
    .eq('is_active', true)
    .order('id');

  if (targetConnectionId) {
    connQuery = connQuery.eq('id', targetConnectionId);
  }

  const { data: connections, error: connError } = await connQuery;
  if (connError) throw connError;
  if (!connections?.length) {
    return res.status(200).json({ success: true, done: true, message: 'No active connections' });
  }

  const allResults = [];

  for (const connection of connections) {
    const result = {
      channel: connection.youtube_channel_title,
      connectionId: connection.id,
      snapshotsCreated: 0,
      daysFound: 0,
      reportsDownloaded: 0,
      errors: []
    };

    try {
      const accessToken = await getAccessToken(connection);
      const channelId = connection.youtube_channel_id;

      const { data: dbChannel } = await supabase
        .from('channels')
        .select('id, name')
        .eq('youtube_channel_id', channelId)
        .eq('is_client', true)
        .single();

      if (!dbChannel) {
        result.errors.push('No matching client channel');
        allResults.push(result);
        continue;
      }

      if (!connection.reporting_job_id) {
        result.errors.push('No reporting job configured — Reporting API unavailable');
        allResults.push(result);
        continue;
      }

      const { data: videos } = await supabase
        .from('videos')
        .select('id, youtube_video_id, view_count, like_count, comment_count')
        .eq('channel_id', dbChannel.id);

      if (!videos?.length) {
        result.errors.push('No videos in database');
        allResults.push(result);
        continue;
      }

      const videoMap = {};
      for (const v of videos) { videoMap[v.youtube_video_id] = v; }

      // Auto-setup both reporting jobs: reach (impressions/CTR) + basic (views/subs/watch)
      try {
        const jobsResp = await fetch(
          'https://youtubereporting.googleapis.com/v1/jobs',
          { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
        );
        const jobsData = jobsResp.ok ? await jobsResp.json() : {};
        const allJobs = jobsData.jobs || [];

        const rtResponse = await fetch(
          'https://youtubereporting.googleapis.com/v1/reportTypes',
          { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
        );
        const rtData = rtResponse.ok ? await rtResponse.json() : {};
        const allTypes = rtData.reportTypes || [];

        // Ensure reach job exists
        if (!connection.reporting_job_id) {
          const reachJob = allJobs.find(j => j.reportTypeId?.includes('channel_reach_'));
          if (reachJob) {
            connection.reporting_job_id = reachJob.id;
            await supabase.from('youtube_oauth_connections')
              .update({ reporting_job_id: reachJob.id, reporting_job_type: reachJob.reportTypeId })
              .eq('id', connection.id);
          } else {
            const reachType = allTypes.find(rt => rt.id === 'channel_reach_basic_a1' || rt.id?.includes('channel_reach_'));
            if (reachType) {
              const resp = await fetch('https://youtubereporting.googleapis.com/v1/jobs', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportTypeId: reachType.id, name: `Reach - ${connection.youtube_channel_title}` })
              });
              if (resp.ok) {
                const job = await resp.json();
                connection.reporting_job_id = job.id;
                await supabase.from('youtube_oauth_connections')
                  .update({ reporting_job_id: job.id, reporting_job_type: job.reportTypeId })
                  .eq('id', connection.id);
                result.errors.push('Reach reporting job created — reports in ~24 hours.');
              }
            }
          }
        }

        // Ensure basic job exists (views, subs, watch time per video per day)
        if (!connection.basic_reporting_job_id) {
          const basicJob = allJobs.find(j => j.reportTypeId?.includes('channel_basic_'));
          if (basicJob) {
            connection.basic_reporting_job_id = basicJob.id;
            await supabase.from('youtube_oauth_connections')
              .update({ basic_reporting_job_id: basicJob.id, basic_reporting_job_type: basicJob.reportTypeId })
              .eq('id', connection.id);
            result.errors.push(`Found existing basic job: ${basicJob.reportTypeId}`);
          } else {
            const basicType = allTypes.find(rt => rt.id === 'channel_basic_a2' || rt.id?.includes('channel_basic_'));
            if (basicType) {
              const resp = await fetch('https://youtubereporting.googleapis.com/v1/jobs', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportTypeId: basicType.id, name: `Basic - ${connection.youtube_channel_title}` })
              });
              if (resp.ok) {
                const job = await resp.json();
                connection.basic_reporting_job_id = job.id;
                await supabase.from('youtube_oauth_connections')
                  .update({ basic_reporting_job_id: job.id, basic_reporting_job_type: job.reportTypeId })
                  .eq('id', connection.id);
                result.errors.push('Basic reporting job created — reports with subs/views in ~24 hours.');
              } else {
                const err = await resp.json().catch(() => ({}));
                result.errors.push(`Failed to create basic job: ${err.error?.message || resp.status}`);
              }
            } else {
              result.errors.push(`No channel_basic_ report type available. Types: ${allTypes.map(t => t.id).join(', ')}`);
            }
          }
        }
      } catch (e) {
        result.errors.push(`Auto-setup jobs: ${e.message}`);
      }

      if (!connection.reporting_job_id) {
        result.errors.push('No reporting job and could not auto-create one');
        allResults.push(result);
        continue;
      }

      // Download ALL available Reporting API reports (up to 180 days)
      console.log(`[Backfill] ${connection.youtube_channel_title}: fetching all Reporting API reports...`);

      let reportsResponse = await fetch(
        `https://youtubereporting.googleapis.com/v1/jobs/${connection.reporting_job_id}/reports`,
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
      );

      // If the stored job ID is stale, try to find or create a valid one
      if (!reportsResponse.ok) {
        console.log(`[Backfill] ${connection.youtube_channel_title}: stored job ID failed, searching for valid job...`);
        let recovered = false;
        try {
          const jobsResp = await fetch(
            'https://youtubereporting.googleapis.com/v1/jobs',
            { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
          );
          if (jobsResp.ok) {
            const jobsData = await jobsResp.json();
            const reachJob = jobsData.jobs?.find(j => j.reportTypeId?.includes('channel_reach_'));
            if (reachJob && reachJob.id !== connection.reporting_job_id) {
              await supabase.from('youtube_oauth_connections')
                .update({ reporting_job_id: reachJob.id, reporting_job_type: reachJob.reportTypeId })
                .eq('id', connection.id);
              console.log(`[Backfill] Recovered job for ${connection.youtube_channel_title}: ${reachJob.id}`);
              reportsResponse = await fetch(
                `https://youtubereporting.googleapis.com/v1/jobs/${reachJob.id}/reports`,
                { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
              );
              recovered = reportsResponse.ok;
            }
            if (!recovered) {
              // Create a new reporting job
              const rtResponse = await fetch(
                'https://youtubereporting.googleapis.com/v1/reportTypes',
                { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
              );
              if (rtResponse.ok) {
                const rtData = await rtResponse.json();
                const reachType = rtData.reportTypes?.find(rt =>
                  rt.id === 'channel_reach_basic_a1' || rt.id?.includes('channel_reach_')
                );
                if (reachType) {
                  const createResp = await fetch(
                    'https://youtubereporting.googleapis.com/v1/jobs',
                    {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ reportTypeId: reachType.id, name: `Backfill - ${connection.youtube_channel_title}` })
                    }
                  );
                  if (createResp.ok) {
                    const newJob = await createResp.json();
                    await supabase.from('youtube_oauth_connections')
                      .update({ reporting_job_id: newJob.id, reporting_job_type: newJob.reportTypeId })
                      .eq('id', connection.id);
                    result.errors.push(`Created new reporting job — reports available in ~24 hours. Run backfill again tomorrow.`);
                  } else {
                    result.errors.push('Could not create reporting job');
                  }
                } else {
                  result.errors.push('No reach report type available for this channel');
                }
              }
            }
          }
        } catch (e) {
          result.errors.push(`Job recovery failed: ${e.message}`);
        }
        if (!recovered) {
          allResults.push(result);
          continue;
        }
      }

      const reportsData = await reportsResponse.json();
      const reports = (reportsData.reports || [])
        .sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

      if (!reports.length) {
        result.errors.push('No reports available yet from Reporting API');
        allResults.push(result);
        continue;
      }

      console.log(`[Backfill] Found ${reports.length} reports available`);

      // Download all reports — collect into a deduped map keyed by video_id+date
      // Multiple CSV reports can contain the same video+date; last write wins
      const snapshotMap = {}; // key: `${video_id}|${date}` → snapshot data

      for (const report of reports) {
        try {
          const reportResponse = await fetch(report.downloadUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });

          if (!reportResponse.ok) continue;

          const csvContent = await reportResponse.text();
          const { byDate } = parseReportCSV(csvContent);
          result.reportsDownloaded++;

          for (const [date, dayVideos] of Object.entries(byDate)) {
            for (const [ytVideoId, metrics] of Object.entries(dayVideos)) {
              const dbVideo = videoMap[ytVideoId];
              if (!dbVideo) continue;

              const hasData = metrics.views || metrics.impressions || metrics.watchHours || metrics.likes || metrics.subscribersGained;
              if (!hasData) continue;

              const key = `${dbVideo.id}|${date}`;
              snapshotMap[key] = {
                video_id: dbVideo.id,
                snapshot_date: date,
                view_count: metrics.views || null,
                watch_hours: metrics.watchHours || null,
                impressions: metrics.impressions || null,
                ctr: metrics.ctr || null,
                avg_view_percentage: metrics.avgViewPercentage || null,
                subscribers_gained: metrics.subscribersGained ?? null,
                subscribers_lost: metrics.subscribersLost ?? null,
                likes: metrics.likes || null,
                comments: metrics.comments || null,
                shares: metrics.shares || null,
                // Include cumulative Data API count so the delta calculation works
                total_view_count: dbVideo.view_count || null,
              };
            }
          }
        } catch (e) {
          result.errors.push(`Report ${report.startTime}: ${e.message}`);
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 50));
      }

      // Also download basic reports (views, subs, watch time) if available
      if (connection.basic_reporting_job_id) {
        try {
          const basicResp = await fetch(
            `https://youtubereporting.googleapis.com/v1/jobs/${connection.basic_reporting_job_id}/reports`,
            { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
          );
          if (basicResp.ok) {
            const basicData = await basicResp.json();
            const basicReports = (basicData.reports || []).sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
            console.log(`[Backfill] ${connection.youtube_channel_title}: ${basicReports.length} basic reports`);

            for (const report of basicReports) {
              try {
                const reportResponse = await fetch(report.downloadUrl, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (!reportResponse.ok) continue;
                const csvContent = await reportResponse.text();
                const { byDate } = parseReportCSV(csvContent);
                result.reportsDownloaded++;

                for (const [date, dayVideos] of Object.entries(byDate)) {
                  for (const [ytVideoId, metrics] of Object.entries(dayVideos)) {
                    const dbVideo = videoMap[ytVideoId];
                    if (!dbVideo) continue;

                    const key = `${dbVideo.id}|${date}`;
                    if (snapshotMap[key]) {
                      // Merge: basic fills views/subs/watch, reach fills impressions/CTR
                      const existing = snapshotMap[key];
                      if (metrics.views && !existing.view_count) existing.view_count = metrics.views;
                      if (metrics.watchHours && !existing.watch_hours) existing.watch_hours = metrics.watchHours;
                      if (metrics.subscribersGained) existing.subscribers_gained = metrics.subscribersGained;
                      if (metrics.subscribersLost) existing.subscribers_lost = metrics.subscribersLost;
                      if (metrics.likes && !existing.likes) existing.likes = metrics.likes;
                      if (metrics.comments && !existing.comments) existing.comments = metrics.comments;
                      if (metrics.shares && !existing.shares) existing.shares = metrics.shares;
                    } else {
                      const hasData = metrics.views || metrics.watchHours || metrics.subscribersGained || metrics.likes;
                      if (!hasData) continue;
                      snapshotMap[key] = {
                        video_id: dbVideo.id,
                        snapshot_date: date,
                        view_count: metrics.views || null,
                        watch_hours: metrics.watchHours || null,
                        subscribers_gained: metrics.subscribersGained ?? null,
                        subscribers_lost: metrics.subscribersLost ?? null,
                        likes: metrics.likes || null,
                        comments: metrics.comments || null,
                        shares: metrics.shares || null,
                        total_view_count: dbVideo.view_count || null,
                      };
                    }
                  }
                }
              } catch (e) {
                result.errors.push(`Basic report: ${e.message}`);
              }
              await new Promise(r => setTimeout(r, 50));
            }
          }
        } catch (e) {
          result.errors.push(`Basic reports: ${e.message}`);
        }
      }

      // Write deduped snapshots in batches
      const allSnapshots = Object.values(snapshotMap);
      result.daysFound = new Set(allSnapshots.map(s => s.snapshot_date)).size;
      const batchSize = 100;

      for (let i = 0; i < allSnapshots.length; i += batchSize) {
        const batch = allSnapshots.slice(i, i + batchSize);
        const { error } = await supabase
          .from('video_snapshots')
          .upsert(batch, { onConflict: 'video_id,snapshot_date' });
        if (!error) result.snapshotsCreated += batch.length;
        else result.errors.push(`Upsert: ${error.message}`);
      }

      console.log(`[Backfill] ${connection.youtube_channel_title}: ${result.reportsDownloaded} reports, ${result.daysFound} days, ${result.snapshotsCreated} snapshots`);

    } catch (e) {
      result.errors.push(e.message);
    }

    allResults.push(result);
  }

  const totalSnapshots = allResults.reduce((s, r) => s + r.snapshotsCreated, 0);
  const duration = Date.now() - startTime;

  return res.status(200).json({
    success: true,
    done: true,
    totalSnapshots,
    duration,
    results: allResults,
    message: `Backfilled ${totalSnapshots} snapshots across ${allResults.length} channels. Data covers ~60-180 days back depending on report availability.`
  });
}

// Sync-all mode: run Analytics API fetch for every channel to refresh
// subscribers_gained, watch_hours, and avg_view_percentage on the videos table.
// Same API call the manual sync uses from the dashboard.
// Usage: /api/cron/daily-sync?syncall=true&manual=true
async function handleSyncAll(req, res) {
  const startTime = Date.now();

  const { data: connections } = await supabase
    .from('youtube_oauth_connections')
    .select('*')
    .eq('is_active', true)
    .order('id');

  if (!connections?.length) {
    return res.status(200).json({ success: true, message: 'No active connections' });
  }

  const allResults = [];

  for (const connection of connections) {
    const result = { channel: connection.youtube_channel_title, videosUpdated: 0, errors: [] };

    try {
      const accessToken = await getAccessToken(connection);
      const channelId = connection.youtube_channel_id;

      const { data: dbChannel } = await supabase
        .from('channels')
        .select('id')
        .eq('youtube_channel_id', channelId)
        .eq('is_client', true)
        .single();

      if (!dbChannel) { result.errors.push('No client channel'); allResults.push(result); continue; }

      // Fetch Analytics API — uses fetchAnalytics which handles Brand Account fallback
      // YouTube Analytics data has 2-3 day processing delay
      const end = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
      const start = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      let analytics;
      try {
        analytics = await fetchAnalytics(accessToken, channelId, start, end);
      } catch (e) {
        result.errors.push(`Analytics API: ${e.message}`);
        if (e.attempts) result.attempts = e.attempts;
        allResults.push(result);
        continue;
      }

      if (!analytics?.rows?.length) {
        result.errors.push('No analytics data returned');
        allResults.push(result);
        continue;
      }

      // Row shape depends on metricSet: Full [vid,views,watch,ret,subs], NoSub [vid,views,watch,ret], Basic [vid,views,watch]
      const ms = analytics._metricSet || {};
      result.idsUsed = analytics._idsUsed;

      const { data: videos } = await supabase
        .from('videos')
        .select('id, youtube_video_id')
        .eq('channel_id', dbChannel.id);

      const videoMap = {};
      for (const v of (videos || [])) { videoMap[v.youtube_video_id] = v; }

      for (const row of analytics.rows) {
        const ytVideoId = row[0];
        const dbVideo = videoMap[ytVideoId];
        if (!dbVideo) continue;

        const updateData = { last_synced_at: new Date().toISOString() };
        const watchHours = (row[2] ?? 0) / 60;
        const avgViewPct = ms.hasRetention ? (row[3] ?? 0) / 100 : 0;
        const subsGained = ms.hasSubs ? (row[ms.hasRetention ? 4 : 3] ?? 0) : 0;

        if (avgViewPct > 0) updateData.avg_view_percentage = avgViewPct;
        if (watchHours > 0) updateData.watch_hours = watchHours;
        if (ms.hasSubs) updateData.subscribers_gained = subsGained;

        await supabase.from('videos').update(updateData).eq('id', dbVideo.id);
        result.videosUpdated++;
      }

      console.log(`[SyncAll] ${connection.youtube_channel_title}: ${result.videosUpdated} videos updated`);
    } catch (e) {
      result.errors.push(e.message);
    }

    allResults.push(result);
  }

  return res.status(200).json({
    success: true,
    duration: Date.now() - startTime,
    results: allResults,
  });
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

  // Backfill mode
  if (req.query?.backfill) {
    return handleBackfill(req, res);
  }

  // Sync-all mode: run Analytics API fetch for all channels to update subs/retention/watch hours
  // Usage: /api/cron/daily-sync?syncall=true&manual=true
  if (req.query?.syncall) {
    return handleSyncAll(req, res);
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

    // Sync each connection — with time guard to avoid Vercel timeout.
    // Process as many channels as possible within the time limit.
    const MAX_DURATION_MS = 270_000; // 270s of 300s max — leave 30s buffer
    const results = [];
    for (const connection of connections) {
      if (Date.now() - startTime > MAX_DURATION_MS) {
        console.log(`[Daily Sync] Time limit reached after ${results.length}/${connections.length} channels`);
        break;
      }
      console.log(`[Daily Sync] Syncing ${connection.youtube_channel_title}...`);
      const result = await syncConnection(connection);
      results.push(result);
      console.log(`[Daily Sync] ${connection.youtube_channel_title}: ${result.videosUpdated} videos, ${result.snapshotsCreated} snapshots, sources: ${JSON.stringify(result.dataSources)}`);
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
