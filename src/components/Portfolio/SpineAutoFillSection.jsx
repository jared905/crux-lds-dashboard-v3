/**
 * SpineAutoFillSection — auto-fill the Strategy Spine from a client's
 * website using the same audit-website + Claude extraction pattern
 * that BusinessContextSection already uses.
 *
 * Why: Kendall's first weekly brief (2026-06-05) revealed that without
 * Spine context the brief generator hallucinates specifics. Filling
 * the Spine manually is 15-30 minutes per client and gets skipped.
 * This is the automation that gets every client's Spine 70% populated
 * in under a minute.
 *
 * Lives at the top of StrategySpine just below BusinessContextSection
 * so it's the first thing a strategist sees when opening a freshly-
 * configured client.
 *
 * UX:
 *   - Collapsed by default. Shows freshness signal: "Spine X% complete"
 *     or "Spine empty — auto-fill from website".
 *   - Expanded: URL input (prefilled from latest business_context
 *     source_url if available) + Extract button.
 *   - After extract: per-field draft preview with character counts.
 *     "Apply to empty fields only" (safe default) vs "Overwrite all".
 *   - Status banner after apply: "Wrote X fields, skipped Y (already
 *     filled)" so the strategist knows what landed.
 */

import {useRef, useState} from 'react';
import {
  extractSpineFromWebsite,
  extractSpineFromPdf,
  applySpineExtraction,
} from '../../services/spineAutoFillService.js';
import { Check, ChevronDown, ChevronRight, FileText, Globe, Loader, Sparkles, Upload, XIcon } from 'lucide-react';

const MAX_PDF_BYTES = 4_500_000;

const SPINE_FIELDS = [
  { key: 'positioning_oneliner',  label: 'Positioning one-liner' },
  { key: 'positioning_hypothesis',label: 'Positioning hypothesis' },
  { key: 'audience_read',         label: 'Audience read' },
  { key: 'editorial_pov',         label: 'Editorial POV' },
  { key: 'voice_tone',            label: 'Voice + tone' },
  { key: 'competitive_posture',   label: 'Competitive posture' },
  { key: 'guardrails',            label: 'Guardrails' },
];

export default function SpineAutoFillSection({ clientId, clientName, spine, businessContext, onApplied }) {
  const [open, setOpen]             = useState(false);
  const [mode, setMode]             = useState('url');  // 'url' | 'pdf'
  const [url, setUrl]               = useState(businessContext?.source_url || '');
  const [pdfFile, setPdfFile]       = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [applying, setApplying]     = useState(false);
  const [draft, setDraft]           = useState(null);
  const [fetched, setFetched]       = useState(null);
  const [error, setError]           = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [overwriteMode, setOverwriteMode] = useState(false);
  const fileInputRef = useRef(null);

  // Compute Spine completeness for the collapsed-state signal.
  const completeness = (() => {
    if (!spine) return 0;
    const fields = SPINE_FIELDS.map(f => spine[f.key]);
    const filled = fields.filter(v => v?.trim?.()).length;
    return Math.round((filled / fields.length) * 100);
  })();

  const handleExtract = async (e) => {
    e?.preventDefault?.();
    if (extracting) return;
    if (mode === 'url' && !url.trim()) return;
    if (mode === 'pdf' && !pdfFile)    return;
    setError(null);
    setApplyResult(null);
    setExtracting(true);
    setDraft(null);
    setFetched(null);
    try {
      const r = mode === 'pdf'
        ? await extractSpineFromPdf({ clientId, file: pdfFile, clientName })
        : await extractSpineFromWebsite({ clientId, url: url.trim(), clientName });
      if (!r.ok) setError(r.error || 'extraction failed');
      else { setDraft(r.draft); setFetched(r.fetched || null); }
    } catch (err) {
      setError(err?.message || 'unknown error');
    } finally {
      setExtracting(false);
    }
  };

  const handlePdfPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setError('File must be a PDF.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(`PDF too large: ${(file.size / 1_000_000).toFixed(1)}MB. Max ${(MAX_PDF_BYTES / 1_000_000).toFixed(1)}MB.`);
      return;
    }
    setError(null);
    setPdfFile(file);
  };

  const handleClearPdf = () => {
    setPdfFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleApply = async () => {
    if (!draft) return;
    setApplying(true);
    setError(null);
    try {
      const r = await applySpineExtraction({
        clientId,
        draft,
        mode: overwriteMode ? 'overwrite' : 'fill_empty',
      });
      if (r.ok) {
        setApplyResult(r);
        await onApplied?.();
      } else {
        setError(r.error || 'apply failed');
      }
    } catch (err) {
      setError(err?.message || 'unknown error');
    } finally {
      setApplying(false);
    }
  };

  const handleDiscardDraft = () => {
    setDraft(null);
    setApplyResult(null);
    setError(null);
  };

  // ── Collapsed state ──
  if (!open) {
    const tone = completeness >= 70 ? 'good' : completeness >= 30 ? 'warn' : 'empty';
    const accent = tone === 'good' ? 'var(--pos-text)' : tone === 'warn' ? 'var(--warn-text)' : 'var(--accent-text)';
    return (
      <button onClick={() => setOpen(true)} style={collapsedBtnStyle(accent)}>
        <Sparkles size={14} style={{ color: accent }} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          <strong style={{ color: accent }}>Auto-fill Strategy Spine from website</strong>
          {' · '}
          <span style={{ color: 'var(--outline)' }}>
            Spine {completeness}% complete — populate positioning, audience, voice from the client's site in under a minute
          </span>
        </span>
        <ChevronDown size={14} style={{ color: 'var(--faint)' }} />
      </button>
    );
  }

  // ── Expanded state ──
  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={14} style={{ color: 'var(--accent-text)' }} />
          <strong style={{ color: 'var(--text)', fontSize: 13 }}>Auto-fill Strategy Spine</strong>
          <span style={{ fontSize: 11, color: 'var(--faint)' }}>· {completeness}% complete</span>
        </div>
        <button onClick={() => setOpen(false)} style={iconBtnStyle} title="Collapse">
          <ChevronRight size={14} />
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--outline)', lineHeight: 1.5, marginBottom: 10 }}>
        Extract positioning, audience, editorial POV, voice/tone, competitive posture, and guardrails from
        the client's website (multi-page crawl via sitemap.xml) <strong style={{ color: 'var(--text)' }}>or</strong> an
        uploaded pitch deck / brand book PDF. Strategist reviews the draft below before applying.
      </div>

      {/* Mode picker */}
      <div style={modeTabsStyle}>
        <button
          type="button"
          onClick={() => { setMode('url'); setError(null); }}
          disabled={extracting}
          style={modeTabStyle(mode === 'url')}
        >
          <Globe size={12} /> Website
        </button>
        <button
          type="button"
          onClick={() => { setMode('pdf'); setError(null); }}
          disabled={extracting}
          style={modeTabStyle(mode === 'pdf')}
        >
          <FileText size={12} /> PDF (deck / brand book)
        </button>
      </div>

      {/* Source input */}
      {mode === 'url' ? (
        <form onSubmit={handleExtract} style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://client.com/about"
            disabled={extracting}
            style={inputStyle}
          />
          <button type="submit" disabled={!url.trim() || extracting} style={primaryBtnStyle}>
            {extracting ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Extracting…</> : 'Extract'}
          </button>
        </form>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handlePdfPick}
            disabled={extracting}
            style={{ display: 'none' }}
          />
          {!pdfFile ? (
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={extracting} style={uploadBtnStyle}>
              <Upload size={14} /> Choose PDF
              <span style={{ fontSize: 11, color: 'var(--faint)', marginLeft: 8 }}>
                · max {(MAX_PDF_BYTES / 1_000_000).toFixed(1)}MB · text-based PDFs only (scanned images need OCR)
              </span>
            </button>
          ) : (
            <div style={pdfChosenStyle}>
              <FileText size={14} style={{ color: 'var(--accent-text)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pdfFile.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--faint)' }}>
                  {(pdfFile.size / 1_000_000).toFixed(2)}MB
                </div>
              </div>
              <button type="button" onClick={handleClearPdf} disabled={extracting} style={ghostBtnStyle}>
                <XIcon size={11} /> Clear
              </button>
              <button type="button" onClick={handleExtract} disabled={extracting} style={primaryBtnStyle}>
                {extracting ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Extracting…</> : 'Extract'}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={errorBoxStyle}>{error}</div>
      )}

      {/* Draft preview */}
      {draft && (
        <div style={draftBoxStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 12, color: "var(--warn-text)", textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Extracted draft · review before applying
            </strong>
            <button onClick={handleDiscardDraft} style={ghostBtnStyle}>
              <XIcon size={12} /> Discard
            </button>
          </div>

          {(fetched?.pagesFetched > 0 || fetched?.filename) && (
            <CrawlSummary fetched={fetched} />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {SPINE_FIELDS.map(f => {
              const v = draft[f.key];
              const has = v?.trim?.();
              const existing = spine?.[f.key]?.trim?.();
              return (
                <div key={f.key} style={fieldRowStyle(has)}>
                  <div style={{ fontSize: 10, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>
                    {f.label}
                    {existing && (
                      <span style={{ marginLeft: 8, color: "var(--warn-text)" }}>· current value will be {overwriteMode ? 'OVERWRITTEN' : 'KEPT'}</span>
                    )}
                    {!has && (
                      <span style={{ marginLeft: 8, color: 'var(--faint)' }}>· extraction empty</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: has ? 'var(--text)' : 'var(--outline-variant)', lineHeight: 1.45, fontStyle: has ? 'normal' : 'italic' }}>
                    {has ? v : '(empty)'}
                  </div>
                </div>
              );
            })}
            {draft.notes && (
              <div style={notesBoxStyle}>
                <strong>Notes from extractor:</strong> {draft.notes}
              </div>
            )}
          </div>

          {/* Apply controls */}
          <div style={applyBarStyle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={overwriteMode}
                onChange={e => setOverwriteMode(e.target.checked)}
                disabled={applying}
              />
              Overwrite existing values
              <span style={{ fontSize: 11, color: 'var(--faint)' }}>
                ({overwriteMode ? 'every field gets the extracted value' : 'safe — only empty fields get written'})
              </span>
            </label>
            <button onClick={handleApply} disabled={applying} style={applyBtnStyle(applying)}>
              {applying ? 'Applying…' : <><Check size={12} /> Apply to Spine</>}
            </button>
          </div>
        </div>
      )}

      {/* Apply result */}
      {applyResult && (
        <div style={resultBoxStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Check size={14} style={{ color: "var(--pos-text)" }} />
            <strong style={{ color: "var(--pos-text)", fontSize: 12 }}>Applied to Spine</strong>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text)' }}>{applyResult.written.length}</strong> field{applyResult.written.length === 1 ? '' : 's'} written:
            {' '}{applyResult.written.join(', ') || '(none)'}
            {applyResult.skipped.length > 0 && (
              <>
                <br />
                <strong style={{ color: 'var(--outline)' }}>{applyResult.skipped.length}</strong> skipped:
                {' '}{applyResult.skipped.join(', ')}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Crawl summary — what got fetched, and how
// ──────────────────────────────────────────────────

function CrawlSummary({ fetched }) {
  const [open, setOpen] = useState(false);
  const isPdf = !!fetched?.filename;
  const pages = Array.isArray(fetched?.pages) ? fetched.pages : [];
  const sourceLabel = {
    sitemap:             'sitemap.xml',
    common_path_probes:  'common-path probes',
    requested_url_only:  'requested URL only',
  }[fetched?.discoverySource] || fetched?.discoverySource || 'single page';

  return (
    <div style={crawlSummaryStyle}>
      <button onClick={() => setOpen(o => !o)} style={crawlSummaryHeaderStyle}>
        {(open && !isPdf) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {isPdf ? (
          <span>
            Extracted from PDF{' '}
            <strong style={{ color: 'var(--text)' }}>{fetched.filename}</strong>
            {' '}· <strong style={{ color: 'var(--text)' }}>{fetched.pageCount} page{fetched.pageCount === 1 ? '' : 's'}</strong>
            {fetched.sizeChars ? <> · {fetched.sizeChars.toLocaleString()} chars</> : null}
            {fetched.truncated ? <span style={{ color: "var(--warn-text)" }}> · truncated</span> : null}
          </span>
        ) : (
          <span>
            Extracted from <strong style={{ color: 'var(--text)' }}>{fetched.pagesFetched} page{fetched.pagesFetched === 1 ? '' : 's'}</strong>
            {' '}· discovery: <strong style={{ color: 'var(--text)' }}>{sourceLabel}</strong>
            {fetched.sizeChars ? <> · {fetched.sizeChars.toLocaleString()} chars</> : null}
          </span>
        )}
      </button>
      {open && pages.length > 0 && !isPdf && (
        <ul style={crawlPageListStyle}>
          {pages.map((p, i) => (
            <li key={i} style={crawlPageItemStyle}>
              <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}>{p.title || '(untitled)'}</span>
              {' · '}
              <span style={{ color: 'var(--faint)' }}>{p.url}</span>
              {' · '}
              <span style={{ color: 'var(--faint)' }}>{p.sizeChars?.toLocaleString?.() || '?'} chars</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const crawlSummaryStyle = {
  marginBottom: 10,
  background: 'rgba(76,214,255,0.04)',
  border: '1px solid rgba(76,214,255,0.20)',
  borderRadius: 5,
  padding: '6px 10px',
};
const crawlSummaryHeaderStyle = {
  background: 'transparent', border: 'none', padding: 0,
  color: 'var(--outline)', fontSize: 11, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 5, width: '100%', textAlign: 'left',
};
const crawlPageListStyle = {
  margin: '6px 0 0', paddingLeft: 16, listStyle: 'disc',
  fontSize: 11, color: 'var(--outline)',
};
const crawlPageItemStyle = { lineHeight: 1.5, marginBottom: 2 };

const collapsedBtnStyle = (accent) => ({
  display: 'flex', alignItems: 'center', gap: 10,
  width: '100%',
  background: 'rgba(76, 214, 255, 0.04)',
  border: `1px dashed color-mix(in srgb, ${accent} 40%, transparent)`,
  borderRadius: 8, padding: '10px 14px',
  fontSize: 12, color: 'var(--text)', cursor: 'pointer',
  marginBottom: 16,
});

const panelStyle = {
  background: 'rgba(76, 214, 255, 0.04)',
  border: '1px solid rgba(76, 214, 255, 0.30)',
  borderLeft: '2px solid var(--border)',
  borderRadius: 8, padding: 16,
  marginBottom: 16,
};
const panelHeaderStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
};
const inputStyle = {
  flex: 1,
  background: 'var(--card)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 5,
  padding: '7px 10px', fontSize: 12,
};

const modeTabsStyle = {
  display: 'flex', gap: 4, marginBottom: 10,
  borderBottom: '1px solid var(--border)',
};
const modeTabStyle = (active) => ({
  background: 'transparent',
  color: active ? 'var(--accent-text)' : 'var(--outline)',
  border: 'none',
  borderBottom: active ? '2px solid #4cd6ff' : '2px solid transparent',
  padding: '6px 12px',
  fontSize: 12, fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 5,
  marginBottom: -1,
});

const uploadBtnStyle = {
  background: 'var(--card)',
  color: 'var(--text)',
  border: '1px dashed rgba(76,214,255,0.4)',
  borderRadius: 6,
  padding: '14px 16px',
  fontSize: 12, fontWeight: 600,
  cursor: 'pointer', width: '100%',
  display: 'inline-flex', alignItems: 'center', gap: 8,
  textAlign: 'left',
};

const pdfChosenStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  padding: '8px 10px',
  display: 'flex', alignItems: 'center', gap: 8,
};
const primaryBtnStyle = {
  background: 'var(--accent-text)', color: 'var(--bg)',
  border: 'none', borderRadius: 5,
  padding: '7px 14px', fontSize: 12, fontWeight: 700,
  cursor: 'pointer', letterSpacing: 0.3,
  display: 'inline-flex', alignItems: 'center', gap: 6,
};
const ghostBtnStyle = {
  background: 'transparent', color: 'var(--outline)',
  border: '1px solid var(--border)', borderRadius: 5,
  padding: '4px 10px', fontSize: 11, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
const iconBtnStyle = {
  background: 'transparent', color: 'var(--faint)',
  border: 'none', cursor: 'pointer', padding: 4,
};
const errorBoxStyle = {
  background: 'rgba(239,107,107,0.08)',
  border: '1px solid rgba(239,107,107,0.30)',
  color: 'var(--neg-text)',
  borderRadius: 5, padding: '8px 12px',
  fontSize: 12, marginBottom: 10,
};
const draftBoxStyle = {
  background: 'var(--card)',
  border: '1px solid rgba(251,191,36,0.30)',
  borderRadius: 6, padding: 12,
};
const fieldRowStyle = (has) => ({
  background: 'var(--input-bg)',
  border: `1px solid ${has ? 'var(--outline-variant)' : 'var(--surface-high)'}`,
  borderRadius: 4, padding: 10,
});
const notesBoxStyle = {
  background: 'var(--input-bg)',
  border: '1px dashed #2a2a30',
  borderRadius: 4, padding: 8,
  fontSize: 11, color: 'var(--outline)', lineHeight: 1.4,
};
const applyBarStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  borderTop: '1px solid var(--border)',
  paddingTop: 10, marginTop: 4,
  gap: 12, flexWrap: 'wrap',
};
const applyBtnStyle = (applying) => ({
  background: applying ? 'var(--input-bg)' : 'var(--pos-text)',
  color: applying ? 'var(--faint)' : 'var(--bg)',
  border: applying ? '1px solid var(--border)' : 'none',
  padding: '7px 14px', borderRadius: 5,
  fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
  cursor: applying ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
});
const resultBoxStyle = {
  background: 'rgba(52,211,153,0.06)',
  border: '1px solid rgba(52,211,153,0.30)',
  borderRadius: 6, padding: 12, marginTop: 10,
};
