/**
 * db.js — paging helper for PostgREST queries.
 *
 * PostgREST returns at most 1000 rows by default and gives no signal that it
 * truncated. Any query without an explicit `.range()` therefore silently
 * returns a partial result, and the caller treats it as the whole set.
 *
 * For `videos` filtered by channel_id this is not just slow — the queries
 * carry no ORDER BY, so *which* 1000 rows come back is unspecified. A channel
 * past 1000 videos syncs a nondeterministic subset each run.
 *
 * Usage:
 *   const videos = await selectAll(() => supabase
 *     .from('videos')
 *     .select('id, youtube_video_id')
 *     .eq('channel_id', id), 'videos for channel');
 */

/**
 * Page a query to completion.
 *
 * @param {() => any} buildQuery - returns a fresh query builder each call.
 *   It must be a factory: a PostgREST builder is single-use, so reusing one
 *   instance across pages does not work.
 * @param {string} label - used in error messages
 * @param {object} [opts]
 * @param {number} [opts.pageSize=1000] - rows per request
 * @param {number} [opts.maxRows=200000] - runaway guard
 * @returns {Promise<any[]>} every matching row
 */
export async function selectAll(buildQuery, label = 'query', opts = {}) {
  const pageSize = opts.pageSize ?? 1000;
  const maxRows = opts.maxRows ?? 200_000;
  const out = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw new Error(`${label}: page at ${offset} failed — ${error.message}`);
    const rows = data || [];
    out.push(...rows);
    // A short page means we've reached the end.
    if (rows.length < pageSize) return out;
  }

  console.warn(`[db] ${label} hit the ${maxRows}-row ceiling; result may be incomplete.`);
  return out;
}

export default { selectAll };
