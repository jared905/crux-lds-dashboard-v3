/**
 * Vercel Serverless Function - YouTube Reporting API
 * Combined endpoint for setup, fetch, and backfill operations.
 * POST with action: "setup" - Creates a reporting job
 * POST with action: "fetch" - Downloads and processes latest report
 * POST with action: "backfill" - Downloads ALL available reports (up to 180 days)
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

function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index]; });
    rows.push(row);
  }
  return { headers, rows };
}

async function handleSetup(connection, accessToken, res) {
  // List available report types
  const reportTypesResponse = await fetch(
    'https://youtubereporting.googleapis.com/v1/reportTypes',
    { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
  );
  if (!reportTypesResponse.ok) {
    const errorData = await reportTypesResponse.json();
    console.error('[Reporting] Failed to list report types:', JSON.stringify(errorData));
    return res.status(400).json({
      error: 'Failed to list report types',
      details: errorData.error?.message || JSON.stringify(errorData),
      code: errorData.error?.code,
      status: errorData.error?.status
    });
  }
  const reportTypes = await reportTypesResponse.json();
  const availableTypes = reportTypes.reportTypes?.map(rt => rt.id) || [];
  console.log('[Reporting] Available report types:', availableTypes);

  // Look for any channel report type that includes reach/impressions data
  const reachReportType = reportTypes.reportTypes?.find(rt =>
    rt.id === 'channel_combined_a2' ||
    rt.id === 'channel_basic_a2' ||
    rt.id.includes('channel_') // fallback to any channel report
  );
  if (!reachReportType) {
    return res.status(400).json({
      error: 'Reach report type not available',
      availableTypes,
      message: 'You may need to disconnect and reconnect your YouTube account to grant the new reporting scope.'
    });
  }

  // Check for existing job
  const jobsResponse = await fetch(
    'https://youtubereporting.googleapis.com/v1/jobs',
    { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
  );
  if (!jobsResponse.ok) {
    const errorData = await jobsResponse.json();
    return res.status(400).json({ error: 'Failed to list jobs', details: errorData.error?.message });
  }
  const jobsData = await jobsResponse.json();
  const existingJob = jobsData.jobs?.find(j => j.reportTypeId === reachReportType.id);

  if (existingJob) {
    await supabase
      .from('youtube_oauth_connections')
      .update({ reporting_job_id: existingJob.id, reporting_job_type: existingJob.reportTypeId, updated_at: new Date().toISOString() })
      .eq('id', connection.id);
    return res.status(200).json({ success: true, jobId: existingJob.id, reportType: existingJob.reportTypeId, message: 'Reporting job already exists' });
  }

  // Create new job
  const createJobResponse = await fetch(
    'https://youtubereporting.googleapis.com/v1/jobs',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ reportTypeId: reachReportType.id, name: `Dashboard Reach Report - ${connection.youtube_channel_title}` })
    }
  );
  if (!createJobResponse.ok) {
    const errorData = await createJobResponse.json();
    return res.status(400).json({ error: 'Failed to create reporting job', details: errorData.error?.message });
  }
  const newJob = await createJobResponse.json();
  await supabase
    .from('youtube_oauth_connections')
    .update({ reporting_job_id: newJob.id, reporting_job_type: newJob.reportTypeId, updated_at: new Date().toISOString() })
    .eq('id', connection.id);
  return res.status(200).json({ success: true, jobId: newJob.id, reportType: newJob.reportTypeId, message: 'Reporting job created. First report will be available in ~24 hours.' });
}

async function handleFetch(connection, accessToken, res) {
  if (!connection.reporting_job_id) {
    return res.status(400).json({ error: 'No reporting job configured', message: 'Please set up a reporting job first' });
  }

  // List reports
  const reportsResponse = await fetch(
    `https://youtubereporting.googleapis.com/v1/jobs/${connection.reporting_job_id}/reports`,
    { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
  );
  if (!reportsResponse.ok) {
    const errorData = await reportsResponse.json();
    return res.status(400).json({ error: 'Failed to list reports', details: errorData.error?.message });
  }
  const reportsData = await reportsResponse.json();
  const reports = reportsData.reports || [];
  if (reports.length === 0) {
    return res.status(200).json({ success: true, message: 'No reports available yet. Reports are generated daily, please check back in 24 hours.', reportsAvailable: 0 });
  }

  reports.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
  const latestReport = reports[0];

  // Download report
  const reportResponse = await fetch(latestReport.downloadUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  if (!reportResponse.ok) {
    return res.status(400).json({ error: 'Failed to download report', status: reportResponse.status });
  }
  const csvContent = await reportResponse.text();
  const { headers, rows } = parseCSV(csvContent);

  const videoIdCol = headers.find(h => h.toLowerCase().includes('video_id'));
  const impressionsCol = headers.find(h => h.toLowerCase() === 'impressions' || h.toLowerCase().includes('thumbnail_impressions'));
  const ctrCol = headers.find(h => h.toLowerCase().includes('click_through_rate') || h.toLowerCase() === 'ctr');

  if (!videoIdCol) {
    return res.status(200).json({ success: true, message: 'Report downloaded but no video_id column found', headers });
  }

  // Get client channel
  const { data: dbChannel } = await supabase
    .from('channels')
    .select('id')
    .eq('youtube_channel_id', connection.youtube_channel_id)
    .eq('is_client', true)
    .single();

  if (!dbChannel) {
    return res.status(200).json({ success: true, message: 'Report downloaded but no matching client channel found', videoCount: rows.length });
  }

  // Aggregate by video
  const videoData = {};
  for (const row of rows) {
    const videoId = row[videoIdCol];
    if (!videoId) continue;
    if (!videoData[videoId]) videoData[videoId] = { impressions: 0, ctrSum: 0, ctrCount: 0 };
    if (impressionsCol && row[impressionsCol]) videoData[videoId].impressions += parseInt(row[impressionsCol]) || 0;
    if (ctrCol && row[ctrCol]) {
      videoData[videoId].ctrSum += parseFloat(row[ctrCol]) || 0;
      videoData[videoId].ctrCount++;
    }
  }

  // Update videos
  let updatedCount = 0, matchedCount = 0;
  for (const [videoId, data] of Object.entries(videoData)) {
    const { data: existingVideo } = await supabase.from('videos').select('id').eq('youtube_video_id', videoId).eq('channel_id', dbChannel.id).single();
    if (existingVideo) {
      matchedCount++;
      const updateData = { last_synced_at: new Date().toISOString() };
      if (data.impressions > 0) updateData.impressions = data.impressions;
      if (data.ctrCount > 0) updateData.ctr = data.ctrSum / data.ctrCount;
      const { error } = await supabase.from('videos').update(updateData).eq('id', existingVideo.id);
      if (!error) updatedCount++;
    }
  }

  await supabase
    .from('youtube_oauth_connections')
    .update({ last_report_downloaded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', connection.id);

  return res.status(200).json({ success: true, reportId: latestReport.id, reportDate: latestReport.createTime, videosInReport: Object.keys(videoData).length, matchedCount, updatedCount });
}

async function handleBackfill(connection, accessToken, res) {
  if (!connection.reporting_job_id) {
    return res.status(400).json({ error: 'No reporting job configured', message: 'Please set up a reporting job first' });
  }

  // List all reports
  const reportsResponse = await fetch(
    `https://youtubereporting.googleapis.com/v1/jobs/${connection.reporting_job_id}/reports`,
    { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
  );
  if (!reportsResponse.ok) {
    const errorData = await reportsResponse.json();
    return res.status(400).json({ error: 'Failed to list reports', details: errorData.error?.message });
  }
  const reportsData = await reportsResponse.json();
  const reports = reportsData.reports || [];

  if (reports.length === 0) {
    return res.status(200).json({ success: true, message: 'No reports available yet. Reports are generated daily, please check back in 24 hours.', reportsAvailable: 0 });
  }

  // Get client channel
  const { data: dbChannel } = await supabase
    .from('channels')
    .select('id')
    .eq('youtube_channel_id', connection.youtube_channel_id)
    .eq('is_client', true)
    .single();

  if (!dbChannel) {
    return res.status(200).json({ success: true, message: 'No matching client channel found', reportsAvailable: reports.length });
  }

  // Get all videos for this channel
  const { data: videos } = await supabase
    .from('videos')
    .select('id, youtube_video_id')
    .eq('channel_id', dbChannel.id);

  if (!videos || videos.length === 0) {
    return res.status(200).json({ success: true, message: 'No videos found for channel', reportsAvailable: reports.length });
  }

  const videoMap = {};
  for (const v of videos) {
    videoMap[v.youtube_video_id] = v.id;
  }

  // Sort reports oldest to newest (so latest data overwrites older)
  reports.sort((a, b) => new Date(a.createTime) - new Date(b.createTime));

  let totalSnapshots = 0;
  let reportsProcessed = 0;
  const errors = [];

  // Process each report
  for (const report of reports) {
    try {
      const reportResponse = await fetch(report.downloadUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      if (!reportResponse.ok) {
        errors.push(`Failed to download report ${report.id}`);
        continue;
      }

      const csvContent = await reportResponse.text();
      const { headers, rows } = parseCSV(csvContent);

      const videoIdCol = headers.find(h => h.toLowerCase().includes('video_id'));
      const dateCol = headers.find(h => h.toLowerCase() === 'date');
      const impressionsCol = headers.find(h => h.toLowerCase() === 'impressions' || h.toLowerCase().includes('thumbnail_impressions'));
      const ctrCol = headers.find(h => h.toLowerCase().includes('click_through_rate') || h.toLowerCase() === 'ctr');
      const viewsCol = headers.find(h => h.toLowerCase() === 'views');
      const watchTimeCol = headers.find(h => h.toLowerCase().includes('watch_time'));
      const avgDurationCol = headers.find(h => h.toLowerCase().includes('average_view_duration'));
      const subsGainedCol = headers.find(h => h.toLowerCase().includes('subscribers_gained'));

      if (!videoIdCol) continue;

      // Group by video+date for snapshots
      const dailyData = {};
      for (const row of rows) {
        const ytVideoId = row[videoIdCol];
        const dbVideoId = videoMap[ytVideoId];
        if (!dbVideoId) continue;

        const date = dateCol ? row[dateCol] : report.createTime.split('T')[0];
        const key = `${dbVideoId}:${date}`;

        if (!dailyData[key]) {
          dailyData[key] = {
            video_id: dbVideoId,
            snapshot_date: date,
            impressions: 0,
            ctrSum: 0,
            ctrCount: 0,
            views: 0,
            watchTimeMinutes: 0,
            avgDurationSum: 0,
            avgDurationCount: 0,
            subscribersGained: 0
          };
        }

        if (impressionsCol && row[impressionsCol]) {
          dailyData[key].impressions += parseInt(row[impressionsCol]) || 0;
        }
        if (ctrCol && row[ctrCol]) {
          dailyData[key].ctrSum += parseFloat(row[ctrCol]) || 0;
          dailyData[key].ctrCount++;
        }
        if (viewsCol && row[viewsCol]) {
          dailyData[key].views += parseInt(row[viewsCol]) || 0;
        }
        if (watchTimeCol && row[watchTimeCol]) {
          dailyData[key].watchTimeMinutes += parseFloat(row[watchTimeCol]) || 0;
        }
        if (avgDurationCol && row[avgDurationCol]) {
          dailyData[key].avgDurationSum += parseFloat(row[avgDurationCol]) || 0;
          dailyData[key].avgDurationCount++;
        }
        if (subsGainedCol && row[subsGainedCol]) {
          dailyData[key].subscribersGained += parseInt(row[subsGainedCol]) || 0;
        }
      }

      // Upsert snapshots
      for (const data of Object.values(dailyData)) {
        const snapshotData = {
          video_id: data.video_id,
          snapshot_date: data.snapshot_date,
          impressions: data.impressions > 0 ? data.impressions : null,
          ctr: data.ctrCount > 0 ? data.ctrSum / data.ctrCount : null,
          view_count: data.views > 0 ? data.views : null,
          watch_hours: data.watchTimeMinutes > 0 ? data.watchTimeMinutes / 60 : null,
          avg_view_duration_seconds: data.avgDurationCount > 0 ? data.avgDurationSum / data.avgDurationCount : null,
          subscribers_gained: data.subscribersGained > 0 ? data.subscribersGained : null
        };

        const { error } = await supabase
          .from('video_snapshots')
          .upsert(snapshotData, { onConflict: 'video_id,snapshot_date' });

        if (!error) totalSnapshots++;
      }

      reportsProcessed++;
    } catch (e) {
      errors.push(`Error processing report ${report.id}: ${e.message}`);
    }
  }

  // Update connection
  await supabase
    .from('youtube_oauth_connections')
    .update({
      last_report_downloaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', connection.id);

  return res.status(200).json({
    success: true,
    reportsAvailable: reports.length,
    reportsProcessed,
    snapshotsCreated: totalSnapshots,
    errors: errors.length > 0 ? errors : undefined
  });
}

export default async function handler(req, res) {
  const allowedOrigin = process.env.FRONTEND_URL || process.env.VERCEL_URL || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization header required' });

    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid or expired session' });

    const { connectionId, action } = req.body;
    if (!connectionId) return res.status(400).json({ error: 'connectionId required' });
    if (!action || !['setup', 'fetch', 'backfill'].includes(action)) return res.status(400).json({ error: 'action must be "setup", "fetch", or "backfill"' });

    const { data: connection, error: connError } = await supabase
      .from('youtube_oauth_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single();

    if (connError || !connection) return res.status(404).json({ error: 'Connection not found' });

    // Get valid token
    const tokenExpiresAt = new Date(connection.token_expires_at);
    const isExpired = tokenExpiresAt.getTime() - 5 * 60 * 1000 < Date.now();
    let accessToken;
    try {
      accessToken = isExpired ? await refreshAccessToken(connection) : decryptToken(connection.encrypted_access_token);
    } catch (e) {
      return res.status(401).json({ error: 'Failed to get valid token', details: e.message });
    }

    if (action === 'setup') {
      return await handleSetup(connection, accessToken, res);
    } else if (action === 'backfill') {
      return await handleBackfill(connection, accessToken, res);
    } else {
      return await handleFetch(connection, accessToken, res);
    }
  } catch (error) {
    console.error('Reporting API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
