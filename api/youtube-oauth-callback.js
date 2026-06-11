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

    // Store or update connection (upsert on user_id + channel_id).
    // Selecting the row so we can fire an immediate sync below — without
    // it the user waits up to 24h for the next daily-sync cron firing,
    // which is the "I connected but data is empty" UX problem.
    const { data: upsertedConn, error: upsertError } = await supabase
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
      })
      .select('id')
      .single();

    if (upsertError) {
      console.error('Failed to store OAuth connection:', upsertError);
      await logAuditEvent(stateRecord.user_id, 'oauth_failed', {
        ip_address: stateRecord.ip_address,
        youtube_channel_id: channelInfo.channelId,
        error_message: 'Database storage failed',
        metadata: { db_error: upsertError.message }
      });
      // For invite-backed grants, redirect to a guest-friendly error
      // page instead of the api-keys tab (the guest has no Crux account).
      if (stateRecord.invite_id) {
        return res.redirect(`${frontendUrl}?tab=guest-oauth&oauth_error=storage_failed`);
      }
      return res.redirect(`${frontendUrl}?tab=api-keys&oauth_error=storage_failed`);
    }

    // Migration 096: invite-backed grant — mark the invite redeemed so
    // the strategist sees confirmation in their invite list.
    if (stateRecord.invite_id) {
      try {
        await supabase
          .from('youtube_oauth_invites')
          .update({
            status:                          'redeemed',
            redeemed_at:                     new Date().toISOString(),
            redeemed_youtube_channel_id:     channelInfo.channelId,
            redeemed_youtube_channel_title:  channelInfo.title,
            redeemed_youtube_email:          channelInfo.email,
          })
          .eq('id', stateRecord.invite_id);
        await logAuditEvent(stateRecord.user_id, 'oauth_invite_redeemed', {
          ip_address: stateRecord.ip_address,
          youtube_channel_id: channelInfo.channelId,
          metadata: { invite_id: stateRecord.invite_id, channel_title: channelInfo.title },
        });
      } catch (err) {
        console.warn('[OAuth] failed to mark invite redeemed (non-fatal):', err.message);
      }
    }

    // Auto-setup Reporting API job for impressions/CTR data
    try {
      // List available report types
      const reportTypesRes = await fetch(
        'https://youtubereporting.googleapis.com/v1/reportTypes',
        { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' } }
      );
      if (reportTypesRes.ok) {
        const reportTypes = await reportTypesRes.json();
        const reachType = reportTypes.reportTypes?.find(rt =>
          rt.id === 'channel_reach_basic_a1' ||
          rt.id === 'channel_reach_combined_a1' ||
          rt.id.includes('channel_reach_')
        );

        if (reachType) {
          // Check for existing job first
          const jobsRes = await fetch(
            'https://youtubereporting.googleapis.com/v1/jobs',
            { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' } }
          );
          const jobsData = jobsRes.ok ? await jobsRes.json() : {};
          const existingJob = jobsData.jobs?.find(j =>
            j.reportTypeId === reachType.id || j.reportTypeId?.includes('channel_reach_')
          );

          if (existingJob) {
            // Link existing job
            await supabase
              .from('youtube_oauth_connections')
              .update({
                reporting_job_id: existingJob.id,
                reporting_job_type: existingJob.reportTypeId,
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', stateRecord.user_id)
              .eq('youtube_channel_id', channelInfo.channelId);
            console.log(`[OAuth] Linked existing reporting job ${existingJob.id} for ${channelInfo.title}`);
          } else {
            // Create new job
            const createRes = await fetch(
              'https://youtubereporting.googleapis.com/v1/jobs',
              {
                method: 'POST',
                headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ reportTypeId: reachType.id, name: `Dashboard Reach Report - ${channelInfo.title}` }),
              }
            );
            if (createRes.ok) {
              const newJob = await createRes.json();
              await supabase
                .from('youtube_oauth_connections')
                .update({
                  reporting_job_id: newJob.id,
                  reporting_job_type: newJob.reportTypeId,
                  updated_at: new Date().toISOString(),
                })
                .eq('user_id', stateRecord.user_id)
                .eq('youtube_channel_id', channelInfo.channelId);
              console.log(`[OAuth] Created reporting job ${newJob.id} for ${channelInfo.title}`);
            }
          }
        }
      }
    } catch (reportingErr) {
      // Non-fatal — reporting setup failure shouldn't block OAuth
      console.warn('[OAuth] Auto-setup reporting failed (non-fatal):', reportingErr.message);
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

    // Check if a client already exists with this YouTube channel ID.
    // Broader lookup than is_competitor=false — covers the case where
    // the channel was previously added as a competitor and we now need
    // to promote it to a client (e.g., strategist tracked it as a peer
    // before getting OAuth access).
    let { data: existingChannel } = await supabase
      .from('channels')
      .select('id, name, is_client, is_competitor')
      .eq('youtube_channel_id', channelInfo.channelId)
      .maybeSingle();

    // Bug fix 2026-06-08: invite-backed grants used to skip the
    // prompt_add_client flow entirely and redirect to the guest-success
    // page WITHOUT creating a channels row. Result: the OAuth
    // connection existed but the channel was invisible to the dashboard
    // (which reads channels WHERE is_client=true). Now we auto-create
    // or promote the row inline so the channel appears immediately.
    if (stateRecord.invite_id && !existingChannel) {
      const { data: created, error: createErr } = await supabase
        .from('channels')
        .insert({
          youtube_channel_id: channelInfo.channelId,
          name:               channelInfo.title || 'Untitled channel',
          thumbnail_url:      channelInfo.thumbnail || null,
          is_client:          true,
          is_competitor:      false,
          created_via:        'manual',
          subscriber_count:   0,
          total_view_count:   0,
          video_count:        0,
          // NB: last_synced_at intentionally NOT set here. OAuth connection
          // ≠ data sync. Stamping last_synced_at without actually fetching
          // videos makes the freshness badge lie about data recency and
          // hides "user never clicked Sync" as a state. The freshness chip
          // will correctly read "Channel: never" until syncOAuthChannelVideos
          // (or the daily competitor-sync cron) actually populates the row.
        })
        .select('id, name, is_client, is_competitor')
        .single();
      if (createErr) {
        console.warn('[OAuth] failed to auto-create channel from invite (non-fatal):', createErr.message);
      } else {
        existingChannel = created;
        console.log(`[OAuth] Auto-created client channel from invite: ${created.name} (${channelInfo.channelId})`);
      }
    } else if (stateRecord.invite_id && existingChannel && !existingChannel.is_client) {
      // Channel existed (probably as competitor) — promote to client.
      const { error: promoteErr } = await supabase
        .from('channels')
        .update({
          is_client: true,
          is_competitor: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingChannel.id);
      if (promoteErr) {
        console.warn('[OAuth] failed to promote channel to client (non-fatal):', promoteErr.message);
      } else {
        existingChannel = { ...existingChannel, is_client: true, is_competitor: false };
        console.log(`[OAuth] Promoted ${existingChannel.name} to client (was competitor)`);
      }
    }

    // For the legacy strategist-flow callers (non-invite), keep the
    // existing variable name pointing at a confirmed client only.
    const existingClient = existingChannel?.is_client ? existingChannel : null;

    // Auto-grant client access for the connecting user
    if (existingClient) {
      try {
        await supabase
          .from('user_client_access')
          .upsert({
            user_id: stateRecord.user_id,
            client_id: existingClient.id,
            has_access: true,
          }, { onConflict: 'user_id,client_id' });
        console.log(`[OAuth] Auto-granted client access: user ${stateRecord.user_id} -> ${existingClient.name}`);
      } catch (e) {
        console.warn('[OAuth] Failed to auto-grant client access (non-fatal):', e.message);
      }
    }

    // For invite-backed grants, redirect to a public guest-success page.
    // The guest has no Crux account and can't access api-keys; they
    // should land somewhere that says "access granted, you can close
    // this tab" and nothing else.
    if (stateRecord.invite_id) {
      const guestParams = new URLSearchParams({
        tab:           'guest-oauth',
        oauth_success: 'true',
        channel:       channelInfo.title,
      });
      return res.redirect(`${frontendUrl}?${guestParams.toString()}`);
    }

    // Trigger immediate first-sync (fire-and-forget) so the user sees
    // data within seconds instead of waiting up to 24h for the next
    // daily-sync cron firing. The cron endpoint accepts ?connectionId=
    // to scope to one connection — added in this same commit.
    // We intentionally DO NOT await the response; the redirect should
    // happen instantly. Worst case the sync fails and the daily cron
    // catches it tomorrow.
    if (upsertedConn?.id && process.env.CRON_SECRET) {
      const host = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : frontendUrl;
      const syncUrl = `${host}/api/cron/daily-sync?manual=true&connectionId=${upsertedConn.id}`;
      // Fire-and-forget. Use .catch to swallow rejection so we don't
      // crash the callback if the cron endpoint hiccups.
      fetch(syncUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      }).catch(err => console.warn('[OAuth callback] Immediate sync trigger failed (non-fatal):', err?.message));
      console.log(`[OAuth callback] Fired immediate sync for connection ${upsertedConn.id}`);
    }

    // Standard authenticated-user flow — redirect to settings with success
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
