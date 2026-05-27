/**
 * Vercel Serverless Function — server-side fetch of a client's website
 * for business-context extraction.
 *
 * Why server-side: arbitrary cross-origin browser fetches are blocked
 * by CORS. This endpoint pulls the page server-side, strips HTML to
 * plain text, and returns the cleaned text so the client can run
 * Claude on it.
 *
 * Accepts: POST { url: 'https://...' }
 * Returns: { ok, url, title, text, fetchedAt, sizeChars }
 *
 * Defensive: enforces a hard text cap so the response stays small
 * enough to feed straight into a Claude prompt without paginating,
 * follows redirects, sets a real-browser User-Agent so a few sites
 * don't return their bot-blocker page.
 */

const MAX_TEXT_CHARS = 12_000; // ~3K tokens — enough for homepage prose
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; FullViewBot/1.0; +https://crux.media)';

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

  // SSRF guard: block private network ranges. Cheap heuristic — block
  // hostnames that resolve to obvious internal patterns.
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.startsWith('192.168.')
    || hostname.startsWith('10.')
    || hostname.startsWith('169.254.')
    || hostname === '0.0.0.0'
  ) {
    return res.status(400).json({ ok: false, error: 'private hostnames not allowed' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(parsed.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ ok: false, error: `Site returned HTTP ${response.status}` });
    }
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/.test(contentType) && !/text\/plain/.test(contentType)) {
      return res.status(415).json({ ok: false, error: `Unsupported content-type: ${contentType}` });
    }

    const rawHtml = await response.text();
    const { title, text } = stripHtmlToText(rawHtml);
    const truncated = text.length > MAX_TEXT_CHARS;
    const finalText = truncated ? text.slice(0, MAX_TEXT_CHARS) : text;

    return res.status(200).json({
      ok: true,
      url: parsed.toString(),
      title,
      text: finalText,
      fetchedAt: new Date().toISOString(),
      sizeChars: finalText.length,
      truncated,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return res.status(504).json({ ok: false, error: 'Fetch timed out' });
    }
    return res.status(500).json({ ok: false, error: err.message || 'Fetch failed' });
  }
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
