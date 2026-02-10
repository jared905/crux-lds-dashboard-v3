/**
 * Vercel Serverless Function - YouTube OAuth Status
 * Returns connection status without exposing tokens.
 *
 * Security:
 * - Requires authenticated user
 * - Never returns encrypted tokens
 * - Only returns user's own connections
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // CORS headers
  const allowedOrigin = process.env.FRONTEND_URL || process.env.VERCEL_URL || '*';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
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

    // Get connections for this user (WITHOUT token fields)
    const { data: connections, error } = await supabase
      .from('youtube_oauth_connections')
      .select(`
        id,
        youtube_channel_id,
        youtube_channel_title,
        youtube_channel_thumbnail,
        youtube_email,
        token_expires_at,
        scopes,
        is_active,
        last_used_at,
        last_refreshed_at,
        connection_error,
        reporting_job_id,
        reporting_job_type,
        last_report_downloaded_at,
        created_at,
        updated_at
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch connections:', error);
      return res.status(500).json({ error: 'Failed to fetch connections' });
    }

    // Add computed fields for UI convenience
    const now = new Date();
    const enrichedConnections = (connections || []).map(conn => {
      const expiresAt = new Date(conn.token_expires_at);
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      return {
        ...conn,
        isExpired: expiresAt < now,
        needsRefresh: expiresAt < fiveMinutesFromNow,
        expiresInSeconds: Math.floor((expiresAt - now) / 1000)
      };
    });

    return res.status(200).json({
      connections: enrichedConnections,
      count: enrichedConnections.length
    });

  } catch (error) {
    console.error('Status check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
