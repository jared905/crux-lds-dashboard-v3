/**
 * Vercel Serverless Function - YouTube Reporting API Fetch
 * Downloads and processes reach reports to get impressions/CTR data per video.
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

// Parse CSV content into rows
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

    if (!connection.reporting_job_id) {
      return res.status(400).json({
        error: 'No reporting job configured',
        message: 'Please set up a reporting job first using /api/youtube-reporting-setup'
      });
    }

    // Check if token is expired
    const tokenExpiresAt = new Date(connection.token_expires_at);
    const bufferMs = 5 * 60 * 1000;
    const isExpired = tokenExpiresAt.getTime() - bufferMs < Date.now();

    let accessToken;
    try {
      if (isExpired) {
        accessToken = await refreshAccessToken(connection);
      } else {
        accessToken = decryptToken(connection.encrypted_access_token);
      }
    } catch (e) {
      return res.status(401).json({ error: 'Failed to get valid token', details: e.message });
    }

    // List available reports for this job
    console.log('[Reporting] Listing reports for job:', connection.reporting_job_id);
    const reportsResponse = await fetch(
      `https://youtubereporting.googleapis.com/v1/jobs/${connection.reporting_job_id}/reports`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!reportsResponse.ok) {
      const errorData = await reportsResponse.json();
      console.error('[Reporting] Failed to list reports:', errorData);
      return res.status(400).json({
        error: 'Failed to list reports',
        details: errorData.error?.message || 'Unknown error'
      });
    }

    const reportsData = await reportsResponse.json();
    const reports = reportsData.reports || [];

    console.log('[Reporting] Available reports:', reports.length);

    if (reports.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No reports available yet. Reports are generated daily, please check back in 24 hours.',
        reportsAvailable: 0
      });
    }

    // Sort reports by createTime (most recent first)
    reports.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

    // Get the most recent report
    const latestReport = reports[0];
    console.log('[Reporting] Latest report:', latestReport.id, 'from', latestReport.createTime);

    // Download the report
    const downloadUrl = latestReport.downloadUrl;
    console.log('[Reporting] Downloading report...');

    const reportResponse = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!reportResponse.ok) {
      return res.status(400).json({
        error: 'Failed to download report',
        status: reportResponse.status
      });
    }

    const csvContent = await reportResponse.text();
    console.log('[Reporting] Downloaded report, size:', csvContent.length, 'bytes');

    // Parse the CSV
    const { headers, rows } = parseCSV(csvContent);
    console.log('[Reporting] Parsed', rows.length, 'rows with headers:', headers.join(', '));

    // Find the columns we need
    // Common column names: video_id, impressions, impressions_click_through_rate
    const videoIdCol = headers.find(h => h.toLowerCase().includes('video_id') || h === 'video_id');
    const impressionsCol = headers.find(h => h.toLowerCase() === 'impressions' || h.toLowerCase().includes('thumbnail_impressions'));
    const ctrCol = headers.find(h => h.toLowerCase().includes('click_through_rate') || h.toLowerCase() === 'ctr');

    console.log('[Reporting] Column mapping:', { videoIdCol, impressionsCol, ctrCol });

    if (!videoIdCol) {
      return res.status(200).json({
        success: true,
        message: 'Report downloaded but no video_id column found',
        headers,
        sampleRow: rows[0]
      });
    }

    // Get the client channel
    const channelId = connection.youtube_channel_id;
    const { data: dbChannel } = await supabase
      .from('channels')
      .select('id')
      .eq('youtube_channel_id', channelId)
      .eq('is_client', true)
      .single();

    if (!dbChannel) {
      return res.status(200).json({
        success: true,
        message: 'Report downloaded but no matching client channel found',
        videoCount: rows.length
      });
    }

    // Aggregate data by video (reports may have multiple rows per video for different dates)
    const videoData = {};
    for (const row of rows) {
      const videoId = row[videoIdCol];
      if (!videoId) continue;

      if (!videoData[videoId]) {
        videoData[videoId] = {
          impressions: 0,
          ctrSum: 0,
          ctrCount: 0
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
    }

    // Update videos in the database
    let updatedCount = 0;
    let matchedCount = 0;

    for (const [videoId, data] of Object.entries(videoData)) {
      // Check if video exists in our database
      const { data: existingVideo } = await supabase
        .from('videos')
        .select('id')
        .eq('youtube_video_id', videoId)
        .eq('channel_id', dbChannel.id)
        .single();

      if (existingVideo) {
        matchedCount++;

        const updateData = {
          last_synced_at: new Date().toISOString()
        };

        if (data.impressions > 0) {
          updateData.impressions = data.impressions;
        }

        if (data.ctrCount > 0) {
          // Average CTR across all days
          updateData.ctr = data.ctrSum / data.ctrCount;
        }

        const { error: updateError } = await supabase
          .from('videos')
          .update(updateData)
          .eq('id', existingVideo.id);

        if (!updateError) {
          updatedCount++;
        }
      }
    }

    // Update last report downloaded timestamp
    await supabase
      .from('youtube_oauth_connections')
      .update({
        last_report_downloaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', connectionId);

    return res.status(200).json({
      success: true,
      reportId: latestReport.id,
      reportDate: latestReport.createTime,
      videosInReport: Object.keys(videoData).length,
      matchedCount,
      updatedCount,
      columns: { videoIdCol, impressionsCol, ctrCol }
    });

  } catch (error) {
    console.error('Reporting fetch error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
