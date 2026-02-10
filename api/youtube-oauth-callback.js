/**
 * Vercel Serverless Function - YouTube OAuth Callback
 * Handles OAuth redirect, exchanges code for tokens, encrypts and stores them.
 *
 * Security:
 * - Validates PKCE state (prevents CSRF and code injection)
 * - Server-side token exchange (client secret never exposed)
 * - AES-256-GCM encryption before storage
 * - Comprehensive audit logging
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get encryption key from environment (32 bytes, base64 encoded)
function getEncryptionKey() {
  const keyBase64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error('TOKEN_ENCRYPTION_KEY not configured');
  }
  return Buffer.from(keyBase64, 'base64');
}

// AES-256-GCM encryption
// Returns: base64(iv):base64(ciphertext):base64(authTag)
function encryptToken(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16); // 128-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${encrypted}:${authTag.toString('base64')}`;
}

// Log audit event helper
async function logAuditEvent(userId, eventType, data = {}) {
  try {
    await supabase.from('youtube_oauth_audit_log').insert({
      user_id: userId,
      event_type: eventType,
      youtube_channel_id: data.youtube_channel_id || null,
      ip_address: data.ip_address || null,
      user_agent: data.user_agent || null,
      error_message: data.error_message || null,
      metadata: data.metadata || {}
    });
  } catch (err) {
    console.warn('Failed to log audit event:', err.message);
  }
}

// Fetch YouTube channel info using access token
async function fetchYouTubeChannelInfo(accessToken) {
  // Get user email from Google userinfo
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!userInfoRes.ok) {
    throw new Error('Failed to fetch user info');
  }

  const userInfo = await userInfoRes.json();

  // Get YouTube channel for this user
  const channelRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!channelRes.ok) {
    const errorData = await channelRes.json();
    throw new Error(errorData.error?.message || 'Failed to fetch YouTube channel');
  }

  const channelData = await channelRes.json();

  if (!channelData.items?.length) {
    throw new Error('No YouTube channel found for this Google account');
  }

  const channel = channelData.items[0];
  return {
    channelId: channel.id,
    title: channel.snippet.title,
    thumbnail: channel.snippet.thumbnails?.default?.url || channel.snippet.thumbnails?.medium?.url,
    email: userInfo.email
  };
}

export default async function handler(req, res) {
  // This endpoint receives GET requests from Google OAuth redirect
  const { code, state, error: oauthError, error_description } = req.query;

  // Determine frontend URL for redirects
  const frontendUrl = process.env.FRONTEND_URL ||
                      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');

  // Handle OAuth errors from Google
  if (oauthError) {
    console.error('OAuth error from Google:', oauthError, error_description);
    await logAuditEvent(null, 'oauth_failed', {
      error_message: error_description || oauthError,
      metadata: { source: 'google_error' }
    });
    return res.redirect(`${frontendUrl}?tab=api-keys&oauth_error=${encodeURIComponent(error_description || oauthError)}`);
  }

  // Validate required params
  if (!code || !state) {
    await logAuditEvent(null, 'oauth_failed', {
      error_message: 'Missing code or state parameter',
      metadata: { has_code: !!code, has_state: !!state }
    });
    return res.redirect(`${frontendUrl}?tab=api-keys&oauth_error=missing_params`);
  }

  try {
    // Retrieve and validate state from database
    const { data: stateRecord, error: stateError } = await supabase
      .from('youtube_oauth_state')
      .select('*')
      .eq('state', state)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (stateError || !stateRecord) {
      await logAuditEvent(null, 'oauth_failed', {
        error_message: 'Invalid or expired state',
        metadata: { state_lookup_error: stateError?.message }
      });
      return res.redirect(`${frontendUrl}?tab=api-keys&oauth_error=invalid_state`);
    }

    // Mark state as used immediately (prevents replay attacks)
    await supabase
      .from('youtube_oauth_state')
      .update({ used: true })
      .eq('id', stateRecord.id);

    // Log callback received
    await logAuditEvent(stateRecord.user_id, 'oauth_callback', {
      ip_address: stateRecord.ip_address,
      user_agent: stateRecord.user_agent,
      metadata: { state_age_seconds: Math.floor((Date.now() - new Date(stateRecord.created_at).getTime()) / 1000) }
    });

    // Determine redirect URI (must match what was sent in init)
    const baseUrl = process.env.FRONTEND_URL ||
                    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const redirectUri = `${baseUrl}/api/youtube-oauth-callback`;

    // Exchange authorization code for tokens using PKCE
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: stateRecord.code_verifier // PKCE verification
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Token exchange failed:', errorData);

      await logAuditEvent(stateRecord.user_id, 'oauth_failed', {
        ip_address: stateRecord.ip_address,
        error_message: errorData.error_description || errorData.error,
        metadata: { error_code: errorData.error }
      });

      return res.redirect(`${frontendUrl}?tab=api-keys&oauth_error=token_exchange_failed`);
    }

    const tokens = await tokenResponse.json();

    // Validate we got both tokens
    if (!tokens.access_token || !tokens.refresh_token) {
      await logAuditEvent(stateRecord.user_id, 'oauth_failed', {
        ip_address: stateRecord.ip_address,
        error_message: 'Missing tokens in response',
        metadata: { has_access: !!tokens.access_token, has_refresh: !!tokens.refresh_token }
      });
      return res.redirect(`${frontendUrl}?tab=api-keys&oauth_error=missing_tokens`);
    }

    // Fetch YouTube channel info
    let channelInfo;
    try {
      channelInfo = await fetchYouTubeChannelInfo(tokens.access_token);
    } catch (err) {
      await logAuditEvent(stateRecord.user_id, 'oauth_failed', {
        ip_address: stateRecord.ip_address,
        error_message: err.message,
        metadata: { stage: 'channel_fetch' }
      });
      return res.redirect(`${frontendUrl}?tab=api-keys&oauth_error=${encodeURIComponent(err.message)}`);
    }

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

    // Encrypt tokens before storage
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = encryptToken(tokens.refresh_token);

    // Store or update connection (upsert on user_id + channel_id)
    const { error: upsertError } = await supabase
      .from('youtube_oauth_connections')
      .upsert({
        user_id: stateRecord.user_id,
        youtube_channel_id: channelInfo.channelId,
        youtube_channel_title: channelInfo.title,
        youtube_channel_thumbnail: channelInfo.thumbnail,
        youtube_email: channelInfo.email,
        encrypted_access_token: encryptedAccessToken,
        encrypted_refresh_token: encryptedRefreshToken,
        token_expires_at: expiresAt.toISOString(),
        scopes: ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly', 'https://www.googleapis.com/auth/yt-analytics-monetary.readonly'],
        is_active: true,
        connection_error: null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,youtube_channel_id'
      });

    if (upsertError) {
      console.error('Failed to store OAuth connection:', upsertError);
      await logAuditEvent(stateRecord.user_id, 'oauth_failed', {
        ip_address: stateRecord.ip_address,
        youtube_channel_id: channelInfo.channelId,
        error_message: 'Database storage failed',
        metadata: { db_error: upsertError.message }
      });
      return res.redirect(`${frontendUrl}?tab=api-keys&oauth_error=storage_failed`);
    }

    // Log success
    await logAuditEvent(stateRecord.user_id, 'oauth_success', {
      ip_address: stateRecord.ip_address,
      user_agent: stateRecord.user_agent,
      youtube_channel_id: channelInfo.channelId,
      metadata: {
        channel_title: channelInfo.title,
        email: channelInfo.email,
        scopes: ['youtube.readonly', 'yt-analytics.readonly', 'yt-analytics-monetary.readonly']
      }
    });

    // Clean up used state record
    await supabase
      .from('youtube_oauth_state')
      .delete()
      .eq('id', stateRecord.id);

    // Check if a client already exists with this YouTube channel ID
    const { data: existingClient } = await supabase
      .from('channels')
      .select('id, name')
      .eq('youtube_channel_id', channelInfo.channelId)
      .eq('is_competitor', false)
      .maybeSingle();

    // Redirect to settings with success
    const successParams = new URLSearchParams({
      tab: 'api-keys',
      oauth_success: 'true',
      channel: channelInfo.title
    });

    // If no existing client, prompt user to add one
    if (!existingClient) {
      successParams.set('prompt_add_client', 'true');
      successParams.set('channel_id', channelInfo.channelId);
      successParams.set('channel_thumbnail', channelInfo.thumbnail || '');
    } else {
      successParams.set('linked_client', existingClient.name);
    }

    return res.redirect(`${frontendUrl}?${successParams.toString()}`);

  } catch (error) {
    console.error('OAuth callback error:', error);
    await logAuditEvent(null, 'oauth_failed', {
      error_message: error.message,
      metadata: { stage: 'unexpected_error' }
    });
    return res.redirect(`${frontendUrl}?tab=api-keys&oauth_error=server_error`);
  }
}
