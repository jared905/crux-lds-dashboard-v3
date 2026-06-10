/**
 * Vercel Serverless Function — server-side fetch of a client's website
 * for business-context extraction.
 *
 * Why server-side: arbitrary cross-origin browser fetches are blocked
 * by CORS. This endpoint pulls the page server-side, strips HTML to
 * plain text, and returns the cleaned text so the client can run
 * Claude on it.
 *
 * Two modes:
 *   - Single-page (default, backwards-compatible):
 *       POST { url: 'https://...' }
 *       → { ok, url, title, text, fetchedAt, sizeChars, truncated }
 *
 *   - Multi-page (opt-in, Spine auto-fill):
 *       POST { url: 'https://...', multiPage: true }
 *       → { ok, url, pages: [{ url, title, sizeChars }], text,
 *           fetchedAt, sizeChars, pagesFetched, discoverySource }
 *     Discovers same-origin URLs via sitemap.xml first, then probes
 *     common-path fallbacks (/about, /team, /mission, …). Concatenates
 *     up to MAX_PAGES pages with `## PAGE: <url>` headers so the LLM
 *     can attribute claims back to source pages.
 *
 * Defensive: hard text cap per page AND total, SSRF guards, redirect
 * follow, real-browser UA so bot-blocker pages don't poison extraction.
 */

const MAX_TEXT_CHARS       = 12_000;  // single-page cap (~3K tokens — homepage prose)
const MAX_PAGES            = 8;       // multi-page page cap
const PER_PAGE_CHARS       = 6_000;   // multi-page per-page text cap (lower so more pages fit)
const MAX_TOTAL_TEXT_CHARS = 35_000;  // multi-page total cap (~9K tokens — fits Claude with prompt headroom)
const FETCH_CONCURRENCY    = 4;
const FETCH_TIMEOUT_MS     = 15_000;
const PROBE_TIMEOUT_MS     = 6_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; FullViewBot/1.0; +https://crux.media)';

// Common information-rich paths on institutional / brand sites. Tried in
// order; same-origin only. Anchored to the root, not the requested URL,
// because deep landing pages still have an /about page at the root.
const COMMON_PATHS = [
  '/about', '/about-us', '/who-we-are',
  '/team', '/people', '/leadership',
  '/mission', '/vision', '/values',
  '/services', '/products', '/work', '/approach', '/how-we-work',
  '/case-studies', '/portfolio', '/clients',
  '/manifesto', '/story',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  const url = req.body?.url?.trim();
  if (!url) return res.status(400).json({ ok: false, error: 'url required' });

  let parsed;
  try { parsed = new URL(url); }
  catch { return res.status(400).json({ ok: false, error: 'invalid URL' }); }
  if (!/^https?:$/.test(parsed.protocol)) {
    return res.status(400).json({ ok: false, error: 'only http/https URLs supported' });
  }

  const guardErr = ssrfGuard(parsed.hostname);
  if (guardErr) return res.status(400).json({ ok: false, error: guardErr });

  if (req.body?.multiPage === true) {
    return handleMultiPage(parsed, res);
  }
  return handleSinglePage(parsed, res);
}

// ──────────────────────────────────────────────────
// Single-page (default, backwards compatible)
// ──────────────────────────────────────────────────

async function handleSinglePage(parsed, res) {
  const fetched = await fetchPage(parsed.toString(), FETCH_TIMEOUT_MS);
  if (!fetched.ok) {
    const code = fetched.code || 500;
    return res.status(code).json({ ok: false, error: fetched.error || 'Fetch failed' });
  }
  const truncated = fetched.text.length > MAX_TEXT_CHARS;
  const finalText = truncated ? fetched.text.slice(0, MAX_TEXT_CHARS) : fetched.text;
  return res.status(200).json({
    ok: true,
    url: parsed.toString(),
    title: fetched.title,
    text: finalText,
    fetchedAt: new Date().toISOString(),
    sizeChars: finalText.length,
    truncated,
  });
}

// ──────────────────────────────────────────────────
// Multi-page (Spine auto-fill)
// ──────────────────────────────────────────────────

async function handleMultiPage(parsed, res) {
  const origin = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
  const seedUrl = parsed.toString();

  // 1. Discover candidate URLs: requested URL + sitemap + common-path probes.
  let discoverySource = 'requested_url_only';
  const candidates = new Set([seedUrl]);

  const sitemapUrls = await discoverSitemapUrls(origin).catch(() => []);
  if (sitemapUrls.length > 0) {
    discoverySource = 'sitemap';
    sitemapUrls.forEach(u => candidates.add(u));
  } else {
    const probed = await probeCommonPaths(origin).catch(() => []);
    if (probed.length > 0) {
      discoverySource = 'common_path_probes';
      probed.forEach(u => candidates.add(u));
    }
  }

  // 2. Rank: requested URL first, then sitemap/probe order. Cap at MAX_PAGES.
  const ordered = [seedUrl, ...[...candidates].filter(u => u !== seedUrl)].slice(0, MAX_PAGES);

  // 3. Fetch with concurrency cap.
  const fetched = await fetchWithConcurrency(ordered, FETCH_CONCURRENCY);

  // 4. Concatenate with page headers, enforcing per-page + total caps.
  const pages = [];
  let totalChars = 0;
  const sections = [];
  for (const r of fetched) {
    if (!r.ok || !r.text) continue;
    if (totalChars >= MAX_TOTAL_TEXT_CHARS) break;
    const headroom = MAX_TOTAL_TEXT_CHARS - totalChars;
    const slice = r.text.slice(0, Math.min(PER_PAGE_CHARS, headroom)).trim();
    if (!slice) continue;
    sections.push(`## PAGE: ${r.url}${r.title ? ` — ${r.title}` : ''}\n\n${slice}`);
    pages.push({ url: r.url, title: r.title || null, sizeChars: slice.length });
    totalChars += slice.length;
  }

  if (pages.length === 0) {
    return res.status(502).json({
      ok: false,
      error: 'No pages could be fetched from the site',
      discoverySource,
      attempted: ordered.length,
    });
  }

  const text = sections.join('\n\n---\n\n');
  return res.status(200).json({
    ok: true,
    url: seedUrl,
    pages,
    pagesFetched: pages.length,
    pagesAttempted: ordered.length,
    discoverySource,
    text,
    sizeChars: text.length,
    fetchedAt: new Date().toISOString(),
  });
}

// ──────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────

function ssrfGuard(hostname) {
  const h = hostname.toLowerCase();
  if (
    h === 'localhost'
    || h === '127.0.0.1'
    || h.startsWith('192.168.')
    || h.startsWith('10.')
    || h.startsWith('169.254.')
    || h === '0.0.0.0'
  ) {
    return 'private hostnames not allowed';
  }
  return null;
}

/**
 * Fetch one HTML page, strip to text. Returns
 *   { ok, url, title, text } on success,
 *   { ok: false, error, code } on failure.
 */
async function fetchPage(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      return { ok: false, url, code: 502, error: `Site returned HTTP ${response.status}` };
    }
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/.test(contentType) && !/text\/plain/.test(contentType)) {
      return { ok: false, url, code: 415, error: `Unsupported content-type: ${contentType}` };
    }
    const rawHtml = await response.text();
    const { title, text } = stripHtmlToText(rawHtml);
    return { ok: true, url: response.url || url, title, text };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') return { ok: false, url, code: 504, error: 'Fetch timed out' };
    return { ok: false, url, code: 500, error: err.message || 'Fetch failed' };
  }
}

/**
 * Try /sitemap.xml + /sitemap_index.xml on the origin. Returns up to
 * MAX_PAGES same-origin URLs ranked by a cheap relevance heuristic
 * (prefer short paths and known information-rich segments).
 */
async function discoverSitemapUrls(origin) {
  const tried = ['/sitemap.xml', '/sitemap_index.xml'];
  for (const path of tried) {
    const res = await fetchSitemap(`${origin}${path}`);
    if (res.length > 0) {
      return rankSitemapUrls(res, origin).slice(0, MAX_PAGES * 2);
    }
  }
  return [];
}

async function fetchSitemap(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/xml,text/xml,*/*' },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return [];
    const xml = await response.text();
    // Pull <loc>...</loc> values. Works for both urlset and sitemapindex.
    const locMatches = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)];
    return locMatches.map(m => m[1]).filter(Boolean);
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/**
 * Rank sitemap URLs by likely-relevance for Spine extraction.
 * - Same origin only
 * - Score boosts for known information-rich path segments
 * - Penalties for blog-post-shaped URLs (/blog/<slug>) and pagination
 */
function rankSitemapUrls(urls, origin) {
  const originHost = new URL(origin).hostname.toLowerCase();
  const rich = ['about', 'team', 'mission', 'values', 'approach', 'who', 'people', 'leadership', 'services', 'products', 'work', 'manifesto', 'story', 'vision'];
  const penalties = ['/blog/', '/news/', '/press/', '/podcast/', '/page/', '?page=', '/tag/', '/category/', '/author/', '/202'];

  const scored = [];
  for (const raw of urls) {
    let u;
    try { u = new URL(raw); } catch { continue; }
    if (u.hostname.toLowerCase() !== originHost) continue;
    const path = u.pathname.toLowerCase();
    let score = 0;
    if (path === '/' || path === '') score += 5;
    for (const r of rich) if (path.includes(`/${r}`)) score += 4;
    for (const p of penalties) if (path.includes(p)) score -= 6;
    // Prefer shallower paths (depth 1-2 over depth 4+)
    const depth = path.split('/').filter(Boolean).length;
    score -= Math.max(0, depth - 2);
    scored.push({ url: u.toString(), score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.url);
}

/**
 * Probe COMMON_PATHS via lightweight GET (HEAD often misbehaves on
 * CDN-fronted sites). Returns paths that responded with HTML 200.
 */
async function probeCommonPaths(origin) {
  const targets = COMMON_PATHS.map(p => `${origin}${p}`);
  // Parallel probes — short timeout, we just want to see who's home.
  const results = await Promise.all(targets.map(async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!r.ok) return null;
      const ct = r.headers.get('content-type') || '';
      if (!/text\/html|application\/xhtml/.test(ct)) return null;
      return r.url || url;
    } catch {
      clearTimeout(timer);
      return null;
    }
  }));
  // Dedupe by final URL (handles /about and /about/ collapsing to same canonical).
  return [...new Set(results.filter(Boolean))];
}

/**
 * Fetch a list of URLs with a concurrency cap. Returns results in the
 * same order as the input urls array. Failures are returned as
 * { ok: false, url, error } so callers can skip and continue.
 */
async function fetchWithConcurrency(urls, concurrency) {
  const results = new Array(urls.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= urls.length) return;
      results[i] = await fetchPage(urls[i], FETCH_TIMEOUT_MS);
    }
  });
  await Promise.all(workers);
  return results;
}

// Cheap HTML→text reducer. Pulls <title>, strips scripts/styles/nav,
// then takes the rest as plain text with whitespace collapsed. Not a
// full DOM parse — good enough for marketing pages, which is the
// target audience.
function stripHtmlToText(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return { title, text: cleaned };
}
