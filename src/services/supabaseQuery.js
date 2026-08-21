/**
 * supabaseQuery.js — make a failed query look different from an empty one.
 *
 * The dominant shape in this codebase is:
 *
 *     const { data } = await supabase.from('videos').select('*')...
 *     for (const row of data || []) { ... }
 *
 * `error` is discarded and `|| []` turns any failure — network down, RLS
 * denial, expired session — into an empty result. Downstream that is
 * indistinguishable from "this client genuinely has no videos", so the app
 * renders a confident, wrong answer: Command Center says "all clear", audits
 * run against zero videos and ship, benchmarks compute against zero peers.
 *
 * For an analytics product, silently reporting good news on missing data is
 * the worst available failure mode. Wrap queries in `unwrap` so a failure
 * throws and the caller has to decide what to show.
 */

/**
 * Await a Supabase query and return its rows, throwing on error.
 *
 * @param {PromiseLike<{data: any, error: any}>} query - the query builder
 * @param {string} label - what was being fetched, used in the error message
 * @returns {Promise<any>} `data`, or `[]` when the query legitimately matched nothing
 */
export async function unwrap(query, label = 'query') {
  const { data, error } = await query;
  if (error) {
    const err = new Error(`${label} failed: ${error.message || error}`);
    err.cause = error;
    err.supabaseCode = error.code;
    throw err;
  }
  return data ?? [];
}

/**
 * Same as `unwrap`, but returns a fallback instead of throwing — for genuinely
 * optional data where a failure should degrade rather than block.
 *
 * Use this deliberately, not as the default. It still logs, so the failure is
 * visible in the console rather than vanishing.
 */
export async function unwrapOptional(query, label = 'query', fallback = []) {
  try {
    return await unwrap(query, label);
  } catch (e) {
    console.warn(`[supabaseQuery] ${e.message}`);
    return fallback;
  }
}

export default { unwrap, unwrapOptional };
