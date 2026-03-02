/**
 * Vercel Serverless Function - YouTube OAuth Initialization
 * Generates PKCE codes, stores state, and returns Google authorization URL.
 *
 * Security:
 * - PKCE (RFC 7636) with SHA-256 code challenge
 * - State stored server-side (code_verifier never sent to client)
 * - 10-minute expiration on state
 * - Audit logging for compliance
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Generate cryptographically secure random string (URL-safe base64)
function generateRandomString(length) {
  return crypto.randomBytes(Math.ceil(length * 0.75))
    .toString('base64url')
    .slice(0, length);
}

// Generate PKCE code challenge from verifier (SHA-256, base64url encoded)
function generateCodeChallenge(verifier) {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
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
    // Verify user is authenticated via Supabase JWT
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Validate required environment variables
    if (!process.env.GOOGLE_CLIENT_ID) {
      console.error('GOOGLE_CLIENT_ID not configured');
      return res.status(500).json({ error: 'OAuth not configured' });
    }

    // Generate PKCE parameters
    const state = generateRandomString(32);
    const codeVerifier = generateRandomString(64); // Min 43 chars per RFC 7636
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Get request context for audit
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] ||
                      req.headers['x-real-ip'] ||
                      req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    // Store state and verifier in database (verifier NEVER leaves server)
    const { error: stateError } = await supabase
      .from('youtube_oauth_state')
      .insert({
        user_id: user.id,
        state,
        code_verifier: codeVerifier,
        code_challenge: codeChallenge,
        ip_address: ipAddress,
        user_agent: userAgent
      });

    if (stateError) {
      console.error('Failed to store OAuth state:', stateError);
      return res.status(500).json({ error: 'Failed to initialize OAuth flow' });
    }

    // Log audit event
    await supabase.from('youtube_oauth_audit_log').insert({
      user_id: user.id,
      event_type: 'oauth_initiated',
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata: {
        scopes: ['youtube.readonly', 'yt-analytics.readonly', 'yt-analytics-monetary.readonly', 'userinfo.email'],
        pkce_method: 'S256'
      }
    });

    // Determine callback URL
    const baseUrl = process.env.FRONTEND_URL ||
                    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const redirectUri = `${baseUrl}/api/youtube-oauth-callback`;

    // Build Google OAuth URL
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/yt-analytics-monetary.readonly https://www.googleapis.com/auth/userinfo.email',
      access_type: 'offline',      // Request refresh token
      prompt: 'consent',           // Force consent to always get refresh token
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return res.status(200).json({
      authUrl,
      state // Client can verify this matches on callback (optional)
    });

  } catch (error) {
    console.error('OAuth init error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
