/**
 * Vercel Serverless Function - YouTube Reporting API Setup
 * Creates a reporting job for the channel_combined_a2 report type
 * which includes impressions and CTR data per video.
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

    // First, list available report types to find the reach report
    console.log('[Reporting] Listing available report types...');
    const reportTypesResponse = await fetch(
      'https://youtubereporting.googleapis.com/v1/reportTypes',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!reportTypesResponse.ok) {
      const errorData = await reportTypesResponse.json();
      console.error('[Reporting] Failed to list report types:', errorData);
      return res.status(400).json({
        error: 'Failed to list report types',
        details: errorData.error?.message || 'Unknown error'
      });
    }

    const reportTypes = await reportTypesResponse.json();
    console.log('[Reporting] Available report types:', reportTypes.reportTypes?.length || 0);

    // Find the channel_combined_a2 or channel_basic_a2 report type
    // channel_combined_a2 includes reach metrics (impressions, CTR)
    const reachReportType = reportTypes.reportTypes?.find(rt =>
      rt.id === 'channel_combined_a2' || rt.id === 'channel_basic_a2'
    );

    if (!reachReportType) {
      // List what's available for debugging
      const availableTypes = reportTypes.reportTypes?.map(rt => rt.id).join(', ') || 'none';
      return res.status(400).json({
        error: 'Reach report type not available',
        availableTypes
      });
    }

    console.log('[Reporting] Using report type:', reachReportType.id);

    // Check if a job already exists for this channel
    const jobsResponse = await fetch(
      'https://youtubereporting.googleapis.com/v1/jobs',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!jobsResponse.ok) {
      const errorData = await jobsResponse.json();
      return res.status(400).json({
        error: 'Failed to list jobs',
        details: errorData.error?.message || 'Unknown error'
      });
    }

    const jobsData = await jobsResponse.json();
    const existingJob = jobsData.jobs?.find(j =>
      j.reportTypeId === reachReportType.id
    );

    if (existingJob) {
      console.log('[Reporting] Job already exists:', existingJob.id);

      // Update connection with job ID
      await supabase
        .from('youtube_oauth_connections')
        .update({
          reporting_job_id: existingJob.id,
          reporting_job_type: existingJob.reportTypeId,
          updated_at: new Date().toISOString()
        })
        .eq('id', connectionId);

      return res.status(200).json({
        success: true,
        jobId: existingJob.id,
        reportType: existingJob.reportTypeId,
        message: 'Reporting job already exists',
        createTime: existingJob.createTime
      });
    }

    // Create new reporting job
    console.log('[Reporting] Creating new job...');
    const createJobResponse = await fetch(
      'https://youtubereporting.googleapis.com/v1/jobs',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          reportTypeId: reachReportType.id,
          name: `Dashboard Reach Report - ${connection.youtube_channel_title}`
        })
      }
    );

    if (!createJobResponse.ok) {
      const errorData = await createJobResponse.json();
      console.error('[Reporting] Failed to create job:', errorData);
      return res.status(400).json({
        error: 'Failed to create reporting job',
        details: errorData.error?.message || 'Unknown error'
      });
    }

    const newJob = await createJobResponse.json();
    console.log('[Reporting] Created job:', newJob.id);

    // Update connection with job ID
    await supabase
      .from('youtube_oauth_connections')
      .update({
        reporting_job_id: newJob.id,
        reporting_job_type: newJob.reportTypeId,
        updated_at: new Date().toISOString()
      })
      .eq('id', connectionId);

    return res.status(200).json({
      success: true,
      jobId: newJob.id,
      reportType: newJob.reportTypeId,
      message: 'Reporting job created. First report will be available in ~24 hours.',
      createTime: newJob.createTime
    });

  } catch (error) {
    console.error('Reporting setup error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
