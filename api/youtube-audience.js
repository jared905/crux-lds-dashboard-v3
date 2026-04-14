/**
 * Vercel Serverless Function - YouTube Audience Data
 * Fetches demographics, geography, traffic sources, and device data
 * from the YouTube Analytics API for a channel.
 *
 * POST: { connectionId, startDate, endDate }
 * Also supports GET with query params for cron/manual sync:
 *   ?sync=true&manual=true  — sync all channels
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
    const err = await tokenResponse.json();
    throw new Error(err.error_description || err.error || 'Token refresh failed');
  }
  const tokens = await tokenResponse.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
  await supabase
    .from('youtube_oauth_connections')
    .update({
      encrypted_access_token: encryptToken(tokens.access_token),
      token_expires_at: expiresAt.toISOString(),
      last_refreshed_at: new Date().toISOString(),
      connection_error: null,
      is_active: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', connection.id);
  return tokens.access_token;
}

async function getAccessToken(connection) {
  const tokenExpiresAt = new Date(connection.token_expires_at);
  if (tokenExpiresAt.getTime() - 5 * 60 * 1000 < Date.now()) {
    return await refreshAccessToken(connection);
  }
  return decryptToken(connection.encrypted_access_token);
}

/**
 * Fetch a YouTube Analytics report with error handling
 */
async function fetchReport(accessToken, channelId, startDate, endDate, dimensions, metrics, options = {}) {
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' };
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.append('ids', `channel==${channelId}`);
  url.searchParams.append('startDate', startDate);
  url.searchParams.append('endDate', endDate);
  url.searchParams.append('dimensions', dimensions);
  url.searchParams.append('metrics', metrics);
  if (options.sort) url.searchParams.append('sort', options.sort);
  if (options.maxResults) url.searchParams.append('maxResults', String(options.maxResults));
  if (options.filters) url.searchParams.append('filters', options.filters);

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return null; // Gracefully return null for unsupported queries
  }
  return await response.json();
}

/**
 * Fetch all audience data for a single channel
 */
async function fetchAudienceData(accessToken, channelId, startDate, endDate) {
  const result = {
    gender: null,
    age: null,
    country: null,
    province: null,
    city: null,
    trafficSource: null,
    deviceType: null,
  };

  // 1. Demographics: gender + age group (combined dimension)
  const demoData = await fetchReport(accessToken, channelId, startDate, endDate,
    'ageGroup,gender', 'viewerPercentage');
  if (demoData?.rows) {
    const genderTotals = {};
    const ageTotals = {};
    for (const row of demoData.rows) {
      const [ageGroup, gender, pct] = row;
      genderTotals[gender] = (genderTotals[gender] || 0) + pct;
      ageTotals[ageGroup] = (ageTotals[ageGroup] || 0) + pct;
    }
    result.gender = genderTotals;
    result.age = ageTotals;
  }

  // 2. Geography: top countries by views and watch hours
  const geoData = await fetchReport(accessToken, channelId, startDate, endDate,
    'country', 'views,estimatedMinutesWatched', { sort: '-views', maxResults: 50 });
  if (geoData?.rows) {
    const totalViews = geoData.rows.reduce((s, r) => s + (r[1] || 0), 0);
    const countries = {};
    for (const row of geoData.rows) {
      const [countryCode, views, watchMins] = row;
      countries[countryCode] = {
        views,
        watchHours: Math.round((watchMins / 60) * 10) / 10,
        pct: totalViews > 0 ? Math.round((views / totalViews) * 1000) / 10 : 0,
      };
    }
    result.country = countries;
  }

  // 2b. US States (province dimension, requires country==US filter)
  const provinceData = await fetchReport(accessToken, channelId, startDate, endDate,
    'province', 'views,estimatedMinutesWatched', { sort: '-views', maxResults: 55, filters: 'country==US' });
  if (provinceData?.rows) {
    const totalViews = provinceData.rows.reduce((s, r) => s + (r[1] || 0), 0);
    const provinces = {};
    for (const row of provinceData.rows) {
      const [provinceCode, views, watchMins] = row;
      provinces[provinceCode] = {
        views,
        watchHours: Math.round((watchMins / 60) * 10) / 10,
        pct: totalViews > 0 ? Math.round((views / totalViews) * 1000) / 10 : 0,
      };
    }
    result.province = provinces;
  }

  // 2c. Top cities
  const cityData = await fetchReport(accessToken, channelId, startDate, endDate,
    'city', 'views,estimatedMinutesWatched', { sort: '-views', maxResults: 25 });
  if (cityData?.rows) {
    const cities = {};
    for (const row of cityData.rows) {
      const [cityName, views, watchMins] = row;
      cities[cityName] = {
        views,
        watchHours: Math.round((watchMins / 60) * 10) / 10,
      };
    }
    result.city = cities;
  }

  // 3. Traffic sources
  const trafficData = await fetchReport(accessToken, channelId, startDate, endDate,
    'insightTrafficSourceType', 'views,estimatedMinutesWatched', { sort: '-views' });
  if (trafficData?.rows) {
    const totalViews = trafficData.rows.reduce((s, r) => s + (r[1] || 0), 0);
    const sources = {};
    for (const row of trafficData.rows) {
      const [sourceType, views, watchMins] = row;
      sources[sourceType] = {
        views,
        watchHours: Math.round((watchMins / 60) * 10) / 10,
        pct: totalViews > 0 ? Math.round((views / totalViews) * 1000) / 10 : 0,
      };
    }
    result.trafficSource = sources;
  }

  // 4. Device types
  const deviceData = await fetchReport(accessToken, channelId, startDate, endDate,
    'deviceType', 'views,estimatedMinutesWatched', { sort: '-views' });
  if (deviceData?.rows) {
    const totalViews = deviceData.rows.reduce((s, r) => s + (r[1] || 0), 0);
    const devices = {};
    for (const row of deviceData.rows) {
      const [deviceType, views, watchMins] = row;
      devices[deviceType] = {
        views,
        watchHours: Math.round((watchMins / 60) * 10) / 10,
        pct: totalViews > 0 ? Math.round((views / totalViews) * 1000) / 10 : 0,
      };
    }
    result.deviceType = devices;
  }

  return result;
}

/**
 * Sync audience data for all active connections
 */
async function handleSync(req, res) {
  const startTime = Date.now();
  const endDate = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];

  const { data: connections } = await supabase
    .from('youtube_oauth_connections')
    .select('*')
    .eq('is_active', true)
    .order('id');

  if (!connections?.length) {
    return res.status(200).json({ success: true, message: 'No active connections' });
  }

  const results = [];

  for (const connection of connections) {
    if (Date.now() - startTime > 250_000) break; // Time guard

    const result = { channel: connection.youtube_channel_title, saved: false, errors: [] };

    try {
      const accessToken = await getAccessToken(connection);
      const channelId = connection.youtube_channel_id;

      const { data: dbChannel } = await supabase
        .from('channels')
        .select('id')
        .eq('youtube_channel_id', channelId)
        .eq('is_client', true)
        .single();

      if (!dbChannel) { result.errors.push('No client channel'); results.push(result); continue; }

      const audience = await fetchAudienceData(accessToken, channelId, startDate, endDate);

      // Upsert to channel_audience_snapshots
      const { error } = await supabase
        .from('channel_audience_snapshots')
        .upsert({
          channel_id: dbChannel.id,
          snapshot_date: endDate,
          gender_distribution: audience.gender,
          age_distribution: audience.age,
          country_data: audience.country,
          province_data: audience.province,
          city_data: audience.city,
          traffic_sources: audience.trafficSource,
          device_types: audience.deviceType,
        }, { onConflict: 'channel_id,snapshot_date' });

      if (error) {
        result.errors.push(error.message);
      } else {
        result.saved = true;
        result.hasGender = !!audience.gender;
        result.hasAge = !!audience.age;
        result.countries = audience.country ? Object.keys(audience.country).length : 0;
        result.trafficSources = audience.trafficSource ? Object.keys(audience.trafficSource).length : 0;
        result.deviceTypes = audience.deviceType ? Object.keys(audience.deviceType).length : 0;
      }
    } catch (e) {
      result.errors.push(e.message);
    }

    results.push(result);
  }

  return res.status(200).json({
    success: true,
    duration: Date.now() - startTime,
    dateRange: `${startDate} to ${endDate}`,
    results,
  });
}

/**
 * Fetch audience data for a specific channel (authenticated user request)
 */
async function handleFetch(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization required' });

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

  const { channelId, startDate, endDate } = req.body;
  if (!channelId) return res.status(400).json({ error: 'channelId required' });

  // Get the most recent audience snapshot for this channel
  const { data: snapshot } = await supabase
    .from('channel_audience_snapshots')
    .select('*')
    .eq('channel_id', channelId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  if (!snapshot) {
    return res.status(200).json({ success: true, data: null, message: 'No audience data available. Run sync first.' });
  }

  return res.status(200).json({
    success: true,
    data: {
      snapshotDate: snapshot.snapshot_date,
      gender: snapshot.gender_distribution,
      age: snapshot.age_distribution,
      country: snapshot.country_data,
      trafficSources: snapshot.traffic_sources,
      deviceTypes: snapshot.device_types,
    },
  });
}

export default async function handler(req, res) {
  const allowedOrigin = process.env.FRONTEND_URL || process.env.VERCEL_URL || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Sync mode (cron or manual)
  if (req.query?.sync === 'true') {
    const manualTrigger = req.query?.manual === 'true';
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !manualTrigger) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }
    return handleSync(req, res);
  }

  // Authenticated user fetch
  if (req.method === 'POST') {
    return handleFetch(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
