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

import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronRight, Check, X as XIcon, Loader } from 'lucide-react';
import {
  extractSpineFromWebsite,
  applySpineExtraction,
} from '../../services/spineAutoFillService.js';

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
  const [url, setUrl]               = useState(businessContext?.source_url || '');
  const [extracting, setExtracting] = useState(false);
  const [applying, setApplying]     = useState(false);
  const [draft, setDraft]           = useState(null);
  const [error, setError]           = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [overwriteMode, setOverwriteMode] = useState(false);

  // Compute Spine completeness for the collapsed-state signal.
  const completeness = (() => {
    if (!spine) return 0;
    const fields = SPINE_FIELDS.map(f => spine[f.key]);
    const filled = fields.filter(v => v?.trim?.()).length;
    return Math.round((filled / fields.length) * 100);
  })();

  const handleExtract = async (e) => {
    e?.preventDefault?.();
    if (extracting || !url.trim()) return;
    setError(null);
    setApplyResult(null);
    setExtracting(true);
    setDraft(null);
    try {
      const r = await extractSpineFromWebsite({ clientId, url: url.trim(), clientName });
      if (!r.ok) setError(r.error || 'extraction failed');
      else setDraft(r.draft);
    } catch (err) {
      setError(err?.message || 'unknown error');
    } finally {
      setExtracting(false);
    }
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
    const accent = tone === 'good' ? '#34d399' : tone === 'warn' ? '#fbbf24' : '#a78bfa';
    return (
      <button onClick={() => setOpen(true)} style={collapsedBtnStyle(accent)}>
        <Sparkles size={14} style={{ color: accent }} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          <strong style={{ color: accent }}>Auto-fill Strategy Spine from website</strong>
          {' · '}
          <span style={{ color: '#888' }}>
            Spine {completeness}% complete — populate positioning, audience, voice from the client's site in under a minute
          </span>
        </span>
        <ChevronDown size={14} style={{ color: '#666' }} />
      </button>
    );
  }

  // ── Expanded state ──
  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={14} style={{ color: '#a78bfa' }} />
          <strong style={{ color: '#cde4d6', fontSize: 13 }}>Auto-fill Strategy Spine</strong>
          <span style={{ fontSize: 11, color: '#666' }}>· {completeness}% complete</span>
        </div>
        <button onClick={() => setOpen(false)} style={iconBtnStyle} title="Collapse">
          <ChevronRight size={14} />
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5, marginBottom: 10 }}>
        Fetches the URL via the same audit endpoint Business Context uses, then runs Claude to extract positioning, audience, editorial POV, voice/tone, competitive posture, and guardrails. Strategist reviews the draft below before applying.
      </div>

      {/* URL form */}
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

      {error && (
        <div style={errorBoxStyle}>{error}</div>
      )}

      {/* Draft preview */}
      {draft && (
        <div style={draftBoxStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 12, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Extracted draft · review before applying
            </strong>
            <button onClick={handleDiscardDraft} style={ghostBtnStyle}>
              <XIcon size={12} /> Discard
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {SPINE_FIELDS.map(f => {
              const v = draft[f.key];
              const has = v?.trim?.();
              const existing = spine?.[f.key]?.trim?.();
              return (
                <div key={f.key} style={fieldRowStyle(has)}>
                  <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>
                    {f.label}
                    {existing && (
                      <span style={{ marginLeft: 8, color: '#fbbf24' }}>· current value will be {overwriteMode ? 'OVERWRITTEN' : 'KEPT'}</span>
                    )}
                    {!has && (
                      <span style={{ marginLeft: 8, color: '#666' }}>· extraction empty</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: has ? '#cde4d6' : '#444', lineHeight: 1.45, fontStyle: has ? 'normal' : 'italic' }}>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cde4d6', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={overwriteMode}
                onChange={e => setOverwriteMode(e.target.checked)}
                disabled={applying}
              />
              Overwrite existing values
              <span style={{ fontSize: 11, color: '#666' }}>
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
            <Check size={14} style={{ color: '#34d399' }} />
            <strong style={{ color: '#34d399', fontSize: 12 }}>Applied to Spine</strong>
          </div>
          <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.5 }}>
            <strong style={{ color: '#cde4d6' }}>{applyResult.written.length}</strong> field{applyResult.written.length === 1 ? '' : 's'} written:
            {' '}{applyResult.written.join(', ') || '(none)'}
            {applyResult.skipped.length > 0 && (
              <>
                <br />
                <strong style={{ color: '#888' }}>{applyResult.skipped.length}</strong> skipped:
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
// Styles
// ──────────────────────────────────────────────────

const collapsedBtnStyle = (accent) => ({
  display: 'flex', alignItems: 'center', gap: 10,
  width: '100%',
  background: 'rgba(167, 139, 250, 0.04)',
  border: `1px dashed ${accent}66`,
  borderRadius: 8, padding: '10px 14px',
  fontSize: 12, color: '#cde4d6', cursor: 'pointer',
  marginBottom: 16,
});

const panelStyle = {
  background: 'rgba(167, 139, 250, 0.04)',
  border: '1px solid rgba(167, 139, 250, 0.30)',
  borderLeft: '2px solid #a78bfa',
  borderRadius: 8, padding: 16,
  marginBottom: 16,
};
const panelHeaderStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
};
const inputStyle = {
  flex: 1,
  background: '#0e0e11', color: '#cde4d6',
  border: '1px solid #2a2a30', borderRadius: 5,
  padding: '7px 10px', fontSize: 12,
};
const primaryBtnStyle = {
  background: '#a78bfa', color: '#0a0a0e',
  border: 'none', borderRadius: 5,
  padding: '7px 14px', fontSize: 12, fontWeight: 700,
  cursor: 'pointer', letterSpacing: 0.3,
  display: 'inline-flex', alignItems: 'center', gap: 6,
};
const ghostBtnStyle = {
  background: 'transparent', color: '#888',
  border: '1px solid #2a2a30', borderRadius: 5,
  padding: '4px 10px', fontSize: 11, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
const iconBtnStyle = {
  background: 'transparent', color: '#666',
  border: 'none', cursor: 'pointer', padding: 4,
};
const errorBoxStyle = {
  background: 'rgba(239,107,107,0.08)',
  border: '1px solid rgba(239,107,107,0.30)',
  color: '#ef6b6b',
  borderRadius: 5, padding: '8px 12px',
  fontSize: 12, marginBottom: 10,
};
const draftBoxStyle = {
  background: '#0e0e11',
  border: '1px solid rgba(251,191,36,0.30)',
  borderRadius: 6, padding: 12,
};
const fieldRowStyle = (has) => ({
  background: '#1a1a1f',
  border: `1px solid ${has ? '#2a2a30' : '#222'}`,
  borderRadius: 4, padding: 10,
});
const notesBoxStyle = {
  background: '#1a1a1f',
  border: '1px dashed #2a2a30',
  borderRadius: 4, padding: 8,
  fontSize: 11, color: '#888', lineHeight: 1.4,
};
const applyBarStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  borderTop: '1px solid #2a2a30',
  paddingTop: 10, marginTop: 4,
  gap: 12, flexWrap: 'wrap',
};
const applyBtnStyle = (applying) => ({
  background: applying ? '#1a1a1f' : '#34d399',
  color: applying ? '#666' : '#0a0a0e',
  border: applying ? '1px solid #2a2a30' : 'none',
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
