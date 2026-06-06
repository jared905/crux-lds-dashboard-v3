/**
 * Vercel Serverless Function — Guest OAuth invite flow.
 *
 *   POST   /api/youtube-oauth-invite                   — create invite (auth required)
 *   GET    /api/youtube-oauth-invite?token=X           — validate + describe invite (PUBLIC, used by landing page)
 *   GET    /api/youtube-oauth-invite?list=mine         — list invites for current user (auth required)
 *   POST   /api/youtube-oauth-invite?action=init&token=X — start OAuth flow for a valid invite (PUBLIC)
 *   POST   /api/youtube-oauth-invite?action=revoke     — revoke invite (auth required)
 *
 * The flow makes the channel owner's experience as short as physically
 * possible: click link → see what's being requested → click Grant → land
 * on Google's consent → done. No Crux signup, no password, no
 * permissions navigation. Tokens land under the inviting strategist's
 * user_id; team-OAuth model (2026-06-06) means everyone on Crux can
 * use the connection from their own login.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ──────────────────────────────────────────────────
// Auth helper (mirrors the pattern in youtube-oauth.js)
// ──────────────────────────────────────────────────

async function authenticateUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function logAuditEvent(userId, eventType, metadata = {}) {
  try {
    await supabase.from('youtube_oauth_audit_log').insert({
      user_id: userId,
      event_type: eventType,
      ip_address: metadata.ip_address || null,
      user_agent: metadata.user_agent || null,
      error_message: metadata.error_message || null,
      youtube_channel_id: metadata.youtube_channel_id || null,
      metadata: metadata.metadata || {},
    });
  } catch (err) {
    console.warn('audit log failed:', err.message);
  }
}

// ──────────────────────────────────────────────────
// Handlers
// ──────────────────────────────────────────────────

// POST — create invite (auth required)
async function handleCreate(user, req, res) {
  const { client_id = null, client_label = null, expected_youtube_email = null, notes = null, expires_in_days = 7 } = req.body || {};

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + Math.min(Math.max(Number(expires_in_days) || 7, 1), 30) * 86_400_000);

  const { data, error } = await supabase
    .from('youtube_oauth_invites')
    .insert({
      token,
      created_by:               user.id,
      created_by_email:         user.email || null,
      client_id,
      client_label,
      expected_youtube_email,
      notes,
      expires_at:               expiresAt.toISOString(),
    })
    .select('id, token, expires_at, created_at')
    .single();

  if (error) {
    console.error('create invite failed:', error);
    return res.status(500).json({ error: 'Failed to create invite' });
  }

  await logAuditEvent(user.id, 'oauth_invite_created', {
    metadata: { invite_id: data.id, client_id, expected_youtube_email },
  });

  return res.status(200).json({
    id:         data.id,
    token:      data.token,
    expiresAt:  data.expires_at,
    createdAt:  data.created_at,
  });
}

// GET — validate + describe invite (PUBLIC; used by landing page)
async function handleValidate(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token required' });

  const { data: invite, error } = await supabase
    .from('youtube_oauth_invites')
    .select('id, status, created_by_email, client_label, expected_youtube_email, notes, expires_at, redeemed_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (error || !invite) return res.status(404).json({ error: 'Invite not found' });

  if (invite.status === 'redeemed') {
    return res.status(410).json({ error: 'This invite has already been used.' });
  }
  if (invite.status === 'revoked') {
    return res.status(410).json({ error: 'This invite has been revoked.' });
  }
  if (new Date(invite.expires_at) < new Date()) {
    // Lazy-update status — no harm if it races with a parallel call.
    await supabase.from('youtube_oauth_invites').update({ status: 'expired' }).eq('id', invite.id);
    return res.status(410).json({ error: 'This invite has expired.' });
  }

  return res.status(200).json({
    requesterEmail:    invite.created_by_email,
    clientLabel:       invite.client_label,
    expectedEmail:     invite.expected_youtube_email,
    notes:             invite.notes,
    expiresAt:         invite.expires_at,
    status:            invite.status,
  });
}

// GET ?list=mine — list invites for current user (auth required)
async function handleList(user, req, res) {
  const { data, error } = await supabase
    .from('youtube_oauth_invites')
    .select('id, token, client_id, client_label, expected_youtube_email, notes, status, created_at, expires_at, redeemed_at, redeemed_youtube_channel_title, redeemed_youtube_email')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('list invites failed:', error);
    return res.status(500).json({ error: 'Failed to list invites' });
  }
  return res.status(200).json({ invites: data || [] });
}

// POST ?action=init&token=X — start OAuth flow from invite (PUBLIC)
async function handleInitFromInvite(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token required' });

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'OAuth not configured' });
  }

  // Validate invite first
  const { data: invite } = await supabase
    .from('youtube_oauth_invites')
    .select('id, status, created_by, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.status !== 'pending') return res.status(410).json({ error: `Invite is ${invite.status}` });
  if (new Date(invite.expires_at) < new Date()) {
    await supabase.from('youtube_oauth_invites').update({ status: 'expired' }).eq('id', invite.id);
    return res.status(410).json({ error: 'Invite expired' });
  }

  // Build PKCE state — same scheme as the authenticated init flow, but
  // user_id is the INVITE CREATOR so the resulting connection lands
  // under the strategist. invite_id is stored so the callback can mark
  // redemption.
  const state = crypto.randomBytes(24).toString('base64url');
  const codeVerifier = crypto.randomBytes(48).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || null;
  const userAgent = req.headers['user-agent'] || null;

  const { error: stateError } = await supabase
    .from('youtube_oauth_state')
    .insert({
      user_id:        invite.created_by,
      state,
      code_verifier:  codeVerifier,
      code_challenge: codeChallenge,
      invite_id:      invite.id,
      ip_address:     ipAddress,
      user_agent:     userAgent,
    });

  if (stateError) {
    console.error('Failed to store invite OAuth state:', stateError);
    return res.status(500).json({ error: 'Failed to initialize OAuth flow' });
  }

  await logAuditEvent(invite.created_by, 'oauth_invite_initiated', {
    ip_address: ipAddress, user_agent: userAgent,
    metadata: { invite_id: invite.id },
  });

  const baseUrl = process.env.FRONTEND_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const params = new URLSearchParams({
    client_id:                process.env.GOOGLE_CLIENT_ID,
    redirect_uri:             `${baseUrl}/api/youtube-oauth-callback`,
    response_type:            'code',
    scope:                    'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/yt-analytics-monetary.readonly https://www.googleapis.com/auth/userinfo.email',
    access_type:              'offline',
    prompt:                   'consent',
    include_granted_scopes:   'true',
    state,
    code_challenge:           codeChallenge,
    code_challenge_method:    'S256',
  });

  return res.status(200).json({
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  });
}

// POST ?action=revoke — revoke invite (auth required)
async function handleRevoke(user, req, res) {
  const { invite_id } = req.body || {};
  if (!invite_id) return res.status(400).json({ error: 'invite_id required' });

  const { error } = await supabase
    .from('youtube_oauth_invites')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: user.id })
    .eq('id', invite_id)
    .eq('status', 'pending'); // can only revoke pending invites

  if (error) {
    console.error('revoke failed:', error);
    return res.status(500).json({ error: 'Failed to revoke invite' });
  }

  await logAuditEvent(user.id, 'oauth_invite_revoked', { metadata: { invite_id } });
  return res.status(200).json({ ok: true });
}

// ──────────────────────────────────────────────────
// Router
// ──────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  try {
    // ── PUBLIC routes (no auth required) ──
    if (req.method === 'GET' && req.query?.token && !req.query?.list) {
      return await handleValidate(req, res);
    }
    if (req.method === 'POST' && req.query?.action === 'init' && req.query?.token) {
      return await handleInitFromInvite(req, res);
    }

    // ── Authenticated routes ──
    const user = await authenticateUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    if (req.method === 'POST' && req.query?.action === 'revoke') return await handleRevoke(user, req, res);
    if (req.method === 'POST') return await handleCreate(user, req, res);
    if (req.method === 'GET'  && req.query?.list === 'mine')      return await handleList(user, req, res);

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('youtube-oauth-invite handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
