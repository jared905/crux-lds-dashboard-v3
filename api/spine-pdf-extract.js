/**
 * Vercel Serverless Function — server-side PDF text extraction for
 * Strategy Spine auto-fill.
 *
 * Why this exists: pitch decks and brand books contain canonical
 * positioning that's clearer and more deliberate than website copy.
 * For institutional brand clients with a thin marketing site but a
 * polished deck, this is the higher-signal Spine input.
 *
 * Accepts: POST { pdfBase64: '<base64-encoded PDF bytes>', filename? }
 * Returns: { ok, text, pageCount, sizeChars, filename, truncated, fetchedAt }
 *
 * Constraints:
 *   - Max ~4MB raw PDF (base64 inflates to ~5.5MB; Vercel hobby body
 *     cap is 4.5MB so callers should pre-validate file size).
 *   - Text output capped at MAX_TEXT_CHARS so the downstream Claude
 *     prompt stays under context budget.
 *   - Uses pdfjs-dist legacy ESM build; falls back to in-process
 *     "fake worker" parsing in Node (no worker thread required).
 *
 * Defensive: validates magic-bytes (%PDF-) before handing the buffer
 * to pdfjs to avoid wasting cycles on garbage uploads.
 */

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAX_TEXT_CHARS = 35_000;   // ~9K tokens — same budget as multi-page crawl
const MAX_PDF_BYTES  = 4_500_000;  // ~4.3MB raw PDF
const MAX_PAGES      = 60;        // cap parse cost on dictionary-sized PDFs

export const config = {
  api: {
    bodyParser: { sizeLimit: '6mb' },  // base64 inflates ~33%
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  const { pdfBase64, filename = 'upload.pdf' } = req.body || {};
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    return res.status(400).json({ ok: false, error: 'pdfBase64 required' });
  }

  let buffer;
  try {
    buffer = Buffer.from(pdfBase64, 'base64');
  } catch {
    return res.status(400).json({ ok: false, error: 'invalid base64' });
  }
  if (buffer.length === 0) {
    return res.status(400).json({ ok: false, error: 'empty file' });
  }
  if (buffer.length > MAX_PDF_BYTES) {
    return res.status(413).json({
      ok: false,
      error: `PDF too large: ${(buffer.length / 1_000_000).toFixed(1)}MB (max ${(MAX_PDF_BYTES / 1_000_000).toFixed(1)}MB)`,
    });
  }

  // Magic-bytes check — every valid PDF starts with %PDF-
  const head = buffer.slice(0, 5).toString('ascii');
  if (head !== '%PDF-') {
    return res.status(400).json({ ok: false, error: 'not a PDF (missing %PDF- header)' });
  }

  try {
    const { text, pageCount } = await extractText(new Uint8Array(buffer));
    const truncated = text.length > MAX_TEXT_CHARS;
    const finalText = truncated ? text.slice(0, MAX_TEXT_CHARS) : text;

    if (!finalText.trim()) {
      return res.status(422).json({
        ok: false,
        error: 'PDF contained no extractable text (likely scanned images — OCR required)',
        pageCount,
      });
    }

    return res.status(200).json({
      ok: true,
      filename,
      pageCount,
      text: finalText,
      sizeChars: finalText.length,
      truncated,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[spine-pdf-extract] parse failed:', err?.message);
    return res.status(500).json({ ok: false, error: err?.message || 'PDF parse failed' });
  }
}

/**
 * Extract text from a PDF buffer using pdfjs in synchronous in-process
 * mode (no worker thread). Returns the concatenated text plus a per-page
 * marker so the downstream LLM can attribute claims back to a page.
 */
async function extractText(data) {
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pageCount = Math.min(doc.numPages, MAX_PAGES);
  const pages = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Join string items with single-space; pdfjs returns them in
    // visual reading order, so collapsing whitespace is safe.
    const pageText = content.items
      .map(it => (typeof it.str === 'string' ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) {
      pages.push(`## PAGE ${i}\n\n${pageText}`);
    }
  }

  const text = pages.join('\n\n---\n\n');
  return { text, pageCount: doc.numPages };
}
