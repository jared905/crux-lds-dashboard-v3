/**
 * Vercel Serverless Function - YouTube Collaboration Discovery
 *
 * Discovers videos where the OAuth-connected channel is a guest collaborator
 * by diffing YouTube Analytics video IDs against known uploads in the database.
 *
 * Flow:
 * 1. Query YouTube Analytics API for ALL video IDs with views (no filter)
 * 2. Query our videos table for known uploads for this channel
 * 3. Diff: any video ID in analytics but NOT in our DB is a potential collab
 * 4. Fetch metadata for unknown videos via YouTube Data API
 * 5. Optionally insert them into the videos table with is_collaboration=true
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// ===== ENCRYPTION HELPERS =====
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
  // CORS headers
  const allowedOrigin = process.env.FRONTEND_URL || process.env.VERCEL_URL || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Authenticate user
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const { connectionId, save = false } = req.body;
    if (!connectionId) {
      return res.status(400).json({ error: 'connectionId required' });
    }

    // 2. Get OAuth connection
    const { data: connection, error: connError } = await supabase
      .from('youtube_oauth_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single();

    if (connError || !connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // 3. Get valid access token
    const tokenExpiresAt = new Date(connection.token_expires_at);
    const isExpired = tokenExpiresAt.getTime() - 5 * 60 * 1000 < Date.now();
    let accessToken;
    try {
      accessToken = isExpired
        ? await refreshAccessToken(connection)
        : decryptToken(connection.encrypted_access_token);
    } catch (e) {
      return res.status(401).json({ error: 'Failed to get valid token', details: e.message });
    }

    const channelId = connection.youtube_channel_id;
    const headers = { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' };

    // 4. Query YouTube Analytics API for ALL video IDs with views (last 365 days)
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const analyticsUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
    analyticsUrl.searchParams.append('ids', `channel==${channelId}`);
    analyticsUrl.searchParams.append('startDate', start);
    analyticsUrl.searchParams.append('endDate', end);
    analyticsUrl.searchParams.append('dimensions', 'video');
    analyticsUrl.searchParams.append('metrics', 'views,estimatedMinutesWatched');
    analyticsUrl.searchParams.append('sort', '-views');
    analyticsUrl.searchParams.append('maxResults', '500');

    console.log(`[CollabDiscovery] Fetching analytics for channel ${channelId}...`);
    const analyticsResponse = await fetch(analyticsUrl.toString(), { headers });

    if (!analyticsResponse.ok) {
      const errorData = await analyticsResponse.json();
      return res.status(200).json({
        success: false,
        error: errorData.error?.message || 'Failed to fetch analytics',
      });
    }

    const analyticsData = await analyticsResponse.json();
    const analyticsVideoIds = new Set();
    const analyticsMap = {};

    if (analyticsData.rows) {
      for (const row of analyticsData.rows) {
        const videoId = row[0];
        analyticsVideoIds.add(videoId);
        analyticsMap[videoId] = {
          views: row[1] ?? 0,
          watchMinutes: row[2] ?? 0,
        };
      }
    }

    console.log(`[CollabDiscovery] Analytics returned ${analyticsVideoIds.size} video IDs`);

    // 5. Get known video IDs from our database for this channel
    const { data: dbChannel } = await supabase
      .from('channels')
      .select('id')
      .eq('youtube_channel_id', channelId)
      .eq('is_client', true)
      .single();

    if (!dbChannel) {
      return res.status(404).json({ error: 'Channel not found in database' });
    }

    const { data: knownVideos } = await supabase
      .from('videos')
      .select('youtube_video_id')
      .eq('channel_id', dbChannel.id);

    const knownVideoIds = new Set((knownVideos || []).map(v => v.youtube_video_id));
    console.log(`[CollabDiscovery] Database has ${knownVideoIds.size} known videos`);

    // 6. Diff: find video IDs in analytics but NOT in our database
    const unknownVideoIds = [];
    for (const vid of analyticsVideoIds) {
      if (!knownVideoIds.has(vid)) {
        unknownVideoIds.push(vid);
      }
    }

    console.log(`[CollabDiscovery] Found ${unknownVideoIds.length} unknown video IDs (potential collabs)`);

    if (unknownVideoIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No collaboration videos found',
        analyticsVideoCount: analyticsVideoIds.size,
        knownVideoCount: knownVideoIds.size,
        collaborations: [],
      });
    }

    // 7. Fetch metadata for unknown videos via YouTube Data API
    const apiKey = process.env.YOUTUBE_API_KEY;
    const collaborations = [];

    // Batch in groups of 50 (API limit)
    for (let i = 0; i < unknownVideoIds.length; i += 50) {
      const batch = unknownVideoIds.slice(i, i + 50);
      const videosUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
      videosUrl.searchParams.append('part', 'snippet,statistics,contentDetails');
      videosUrl.searchParams.append('id', batch.join(','));
      videosUrl.searchParams.append('key', apiKey);

      const videosResponse = await fetch(videosUrl.toString());
      if (!videosResponse.ok) {
        console.warn(`[CollabDiscovery] Videos API error for batch ${i}:`, await videosResponse.text());
        continue;
      }

      const videosData = await videosResponse.json();
      for (const item of (videosData.items || [])) {
        const hostChannelId = item.snippet.channelId;
        const isCollab = hostChannelId !== channelId;

        collaborations.push({
          youtube_video_id: item.id,
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnail_url: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
          published_at: item.snippet.publishedAt,
          host_channel_id: hostChannelId,
          host_channel_title: item.snippet.channelTitle,
          is_collaboration: isCollab,
          view_count: parseInt(item.statistics?.viewCount) || 0,
          like_count: parseInt(item.statistics?.likeCount) || 0,
          comment_count: parseInt(item.statistics?.commentCount) || 0,
          duration_iso: item.contentDetails?.duration,
          analytics: analyticsMap[item.id] || null,
        });
      }
    }

    // Filter to only actual collabs (uploaded by a different channel)
    const confirmedGuests = collaborations.filter(c => c.is_collaboration);
    // Videos uploaded by this channel but missing from DB (sync gap)
    const missingUploads = collaborations.filter(c => !c.is_collaboration);

    console.log(`[CollabDiscovery] ${confirmedGuests.length} guest collabs, ${missingUploads.length} missing uploads`);

    // 8. Detect HOST-side collabs: scan our own uploads for collaboration indicators
    const collabPatterns = [
      /\bfeat\.?\s+/i,
      /\bft\.?\s+/i,
      /\bfeaturing\s+/i,
      /\bcollab(?:oration)?\s+(?:with\s+)?/i,
      /\bwith\s+@/i,
      /\bguest:\s*/i,
      /\bx\s+@/i,
    ];

    // Extract collaborator name from matched pattern
    function extractCollaborator(text, pattern) {
      const match = text.match(pattern);
      if (!match) return null;
      // Get text after the match, take first meaningful chunk
      const after = text.substring(match.index + match[0].length).trim();
      // Grab @handle or next few words (up to punctuation/newline)
      const nameMatch = after.match(/^@?([\w\s&'-]+?)(?:\s*[|\n\r,()[\]{}]|$)/);
      return nameMatch ? nameMatch[1].trim() : null;
    }

    const { data: ownVideos } = await supabase
      .from('videos')
      .select('id, youtube_video_id, title, description, is_collaboration')
      .eq('channel_id', dbChannel.id)
      .eq('is_collaboration', false);

    const detectedHosts = [];
    for (const video of (ownVideos || [])) {
      const textToScan = `${video.title || ''} ${video.description || ''}`;
      for (const pattern of collabPatterns) {
        if (pattern.test(textToScan)) {
          const collabName = extractCollaborator(textToScan, pattern);
          detectedHosts.push({
            id: video.id,
            youtube_video_id: video.youtube_video_id,
            title: video.title,
            detected_collaborator: collabName,
            role: 'host',
          });
          break; // one match per video is enough
        }
      }
    }

    console.log(`[CollabDiscovery] ${detectedHosts.length} host collabs detected via title/description`);

    // 9. Save results
    let savedGuests = 0;
    let savedHosts = 0;

    if (save) {
      // Save guest collabs (new videos from other channels)
      for (const collab of confirmedGuests) {
        const durationMatch = collab.duration_iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        const durationSeconds = durationMatch
          ? (parseInt(durationMatch[1] || 0) * 3600) + (parseInt(durationMatch[2] || 0) * 60) + parseInt(durationMatch[3] || 0)
          : 0;
        const isShort = durationSeconds > 0 && durationSeconds <= 60;

        const { error: insertError } = await supabase
          .from('videos')
          .upsert({
            youtube_video_id: collab.youtube_video_id,
            channel_id: dbChannel.id,
            title: collab.title,
            description: collab.description?.substring(0, 500) || null,
            thumbnail_url: collab.thumbnail_url,
            published_at: collab.published_at,
            view_count: collab.view_count,
            like_count: collab.like_count,
            comment_count: collab.comment_count,
            duration_seconds: durationSeconds,
            video_type: isShort ? 'short' : 'long',
            is_short: isShort,
            is_collaboration: true,
            collaboration_role: 'guest',
            collaboration_host_channel_id: collab.host_channel_id,
            collaboration_host_channel_title: collab.host_channel_title,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: 'youtube_video_id' });

        if (!insertError) savedGuests++;
        else console.warn(`[CollabDiscovery] Failed to save guest ${collab.youtube_video_id}:`, insertError.message);
      }

      // Flag host collabs (existing videos we uploaded)
      for (const host of detectedHosts) {
        const { error: updateError } = await supabase
          .from('videos')
          .update({
            is_collaboration: true,
            collaboration_role: 'host',
            collaboration_host_channel_title: host.detected_collaborator,
          })
          .eq('id', host.id);

        if (!updateError) savedHosts++;
        else console.warn(`[CollabDiscovery] Failed to flag host ${host.youtube_video_id}:`, updateError.message);
      }

      console.log(`[CollabDiscovery] Saved ${savedGuests} guests, flagged ${savedHosts} hosts`);
    }

    return res.status(200).json({
      success: true,
      analyticsVideoCount: analyticsVideoIds.size,
      knownVideoCount: knownVideoIds.size,
      guestCollabs: confirmedGuests,
      hostCollabs: detectedHosts,
      missingUploads: missingUploads.length > 0 ? missingUploads : undefined,
      savedGuests: save ? savedGuests : undefined,
      savedHosts: save ? savedHosts : undefined,
    });

  } catch (error) {
    console.error('[CollabDiscovery] Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
