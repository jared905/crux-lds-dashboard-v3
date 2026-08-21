/**
 * auth.js — shared request authorisation for serverless handlers.
 *
 * Files under api/_lib/ are not routed by Vercel, so this is a plain module.
 *
 * Replaces the `?manual=true` pattern that used to guard the sync/cron
 * endpoints. That check read an attacker-controlled query parameter, so the
 * CRON_SECRET comparison could be skipped by anyone who appended it to the
 * URL. Every one of those handlers runs with the service-role key and spends
 * YouTube or LLM quota, so the bypass was worth a denial-of-service.
 *
 * Two callers are legitimate:
 *   1. Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`.
 *   2. A signed-in admin clicking "run now" in the UI, which sends the
 *      user's Supabase access token in the same header.
 *
 * Both are checked here. Anything else gets a 401/403.
 */
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

/** Constant-time compare so the secret can't be recovered byte-by-byte. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function bearer(req) {
  const header = req.headers?.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/**
 * True when the request carries the Vercel Cron secret.
 * Returns false — never true — when CRON_SECRET is unset, so a missing
 * env var can't silently open the endpoint the way it used to.
 */
export function isCronRequest(req) {
  const secret = process.env.CRON_SECRET;
  const token = bearer(req);
  if (!secret || !token) return false;
  return safeEqual(token, secret);
}

/** Resolves the Supabase user behind a request's bearer token, or null. */
export async function getSessionUser(req) {
  const token = bearer(req);
  if (!token || !supabaseUrl || !serviceKey) return null;
  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

/** True when the given user id has role='admin' in user_profiles. */
export async function isAdmin(userId) {
  if (!userId || !supabaseUrl || !serviceKey) return false;
  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (error) return false;
    return data?.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * Guard for expensive sync/generation endpoints.
 *
 * Allows Vercel Cron, or a signed-in admin. Writes the response and returns
 * null when the caller is rejected, so handlers can do:
 *
 *   const caller = await requireCronOrAdmin(req, res);
 *   if (!caller) return;
 *
 * @returns {Promise<{via:'cron'}|{via:'user', user:object}|null>}
 */
export async function requireCronOrAdmin(req, res) {
  if (!process.env.CRON_SECRET) {
    // Loud misconfiguration beats a silently open endpoint.
    console.error('[auth] CRON_SECRET is not set — refusing the request.');
    res.status(503).json({ error: 'Server auth is not configured' });
    return null;
  }

  if (isCronRequest(req)) return { via: 'cron' };

  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  if (!(await isAdmin(user.id))) {
    res.status(403).json({ error: 'Admin role required' });
    return null;
  }
  return { via: 'user', user };
}

/** Guard for endpoints any signed-in user may call. */
export async function requireUser(req, res) {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return user;
}
