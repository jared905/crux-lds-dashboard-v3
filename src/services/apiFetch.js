/**
 * apiFetch.js — fetch wrapper that attaches the caller's Supabase session.
 *
 * The sync/generation endpoints under /api used to accept `?manual=true` as
 * proof of authorisation, which meant anyone could trigger them. They now
 * require either the Vercel cron secret or a signed-in admin, so UI-initiated
 * runs have to send the user's access token.
 *
 * Use this instead of bare `fetch` for any /api route that mutates data or
 * spends YouTube / LLM quota.
 */
import { supabase } from './supabaseClient';

/**
 * fetch() with `Authorization: Bearer <access_token>` attached.
 * Throws a clear error when there is no session, rather than letting the
 * request go out unauthenticated and come back as an opaque 401.
 */
export async function apiFetch(path, options = {}) {
  const { data, error } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (error || !token) {
    throw new Error('You need to be signed in to run this. Try reloading the page.');
  }

  return fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

export default apiFetch;
