/**
 * ConceptSeedsSection — concept ideas generated from the audience persona.
 *
 * Lives inside AudienceWorkspace below the persona view. The persona
 * says WHAT the audience cares about; this section turns that into
 * specific videos the strategist can score.
 *
 * Series-format challenge built into the UI: series candidates render
 * with the trade-off visible inline (why this could series AND why
 * standalone might be better). System defaults to standalone — series
 * is opt-in with skepticism.
 */

import React, { useEffect, useState } from 'react';
import {
  Sparkles, Loader, Trash2, Film, AlertTriangle, ChevronDown, ChevronRight,
  Crosshair,
} from 'lucide-react';
import {
  generateConceptSeeds, listConceptSeeds, archiveConceptSeed, updateConceptSeed,
} from '../../../services/conceptSeedsService.js';

const FORMAT_LABELS = {
  shorts:    'Shorts',
  long_form: 'Long-form',
  either:    'Either',
};
const FORMAT_COLORS = {
  shorts:    '#E8A82B',
  long_form: '#0A919B',
  either:    '#888',
};

export default function ConceptSeedsSection({ clientId, hasPersona, onNavigate }) {
  const [seeds, setSeeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [targetCount, setTargetCount] = useState(8);
  const [expandedSeed, setExpandedSeed] = useState(null);

  useEffect(() => {
    if (!clientId) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await listConceptSeeds(clientId, { limit: 50 });
        if (!cancelled) setSeeds(list || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await generateConceptSeeds({ clientId, targetCount });
      if (!r.ok) { setError(r.error || 'Generation failed'); return; }
      // Reload full list to include the new batch + any existing seeds
      const list = await listConceptSeeds(clientId, { limit: 50 });
      setSeeds(list || []);
    } catch (err) {
      setError(err?.message || 'unknown error');
    } finally {
      setGenerating(false);
    }
  };

  const handleArchive = async (seedId) => {
    if (!window.confirm('Archive this seed? You can find it later via Pre-flight history.')) return;
    await archiveConceptSeed(seedId);
    setSeeds(prev => prev.filter(s => s.id !== seedId));
  };

  const handleMarkScored = async (seedId, scorecardId) => {
    await updateConceptSeed(seedId, { status: 'scored', scorecard_id: scorecardId });
    setSeeds(prev => prev.map(s => s.id === seedId ? { ...s, status: 'scored', scorecard_id: scorecardId } : s));
  };

  const handleScoreInPreflight = (seed) => {
    // Stash the seed in sessionStorage and navigate to Pre-flight.
    // PreflightPanel already reads the preflight_prefill_v1 key on mount
    // (the existing Competitor Scan → Pre-flight handoff pattern).
    try {
      sessionStorage.setItem('preflight_prefill_v1', JSON.stringify({
        title:          seed.title,
        format:         seed.format_hint === 'either' ? 'long_form' : seed.format_hint,
        length_seconds: seed.estimated_length_minutes ? seed.estimated_length_minutes * 60 : null,
        notes:          `Generated from audience persona seed. Addresses: ${seed.addresses_persona_claim || 'audience signal'}.\nHook: ${seed.hook || '(none)'}`,
      }));
    } catch (err) { /* silent */ }
    handleMarkScored(seed.id, null);
    if (typeof onNavigate === 'function') onNavigate('pre-flight');
  };

  if (!hasPersona) {
    return (
      <div style={lockedShellStyle}>
        <Sparkles size={14} style={{ color: '#666' }} />
        <span style={{ fontSize: 12, color: '#888' }}>
          Synthesize the persona first — concept seeds derive from it.
        </span>
      </div>
    );
  }

  return (
    <div style={sectionShellStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <div style={kickerStyle}>Concept seeds</div>
          <div style={subtitleStyle}>
            Concrete video concepts generated from the persona's questions, pain points, and motivations.
            Each seed pulls directly from one persona claim. Score promising seeds in Pre-flight; the rest
            stay archived as audit trail.
          </div>
        </div>
        <div style={generateBarStyle}>
          <select
            value={targetCount}
            onChange={e => setTargetCount(Number(e.target.value))}
            disabled={generating}
            style={selectStyle}
          >
            <option value={4}>4 seeds</option>
            <option value={6}>6 seeds</option>
            <option value={8}>8 seeds</option>
            <option value={10}>10 seeds</option>
            <option value={12}>12 seeds</option>
          </select>
          <button onClick={handleGenerate} disabled={generating} style={generateBtnStyle(generating)}>
            {generating
              ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
              : <><Sparkles size={13} /> Generate seeds</>
            }
          </button>
        </div>
      </div>

      {error && <Note tone="error">{error}</Note>}
      {loading && <Note tone="info">Loading seeds…</Note>}

      {!loading && seeds.length === 0 && !error && (
        <div style={emptyStateStyle}>
          <Sparkles size={26} style={{ color: '#0A919B', marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: '#cde4d6', fontWeight: 600, marginBottom: 4 }}>
            No seeds yet
          </div>
          <div style={{ fontSize: 12, color: '#888', maxWidth: 480, lineHeight: 1.5 }}>
            Generate a batch of concept ideas from the persona. Each one pulls verbatim from a persona
            claim — questions in the audience's own words become title candidates.
          </div>
        </div>
      )}

      {!loading && seeds.length > 0 && (
        <div style={seedsListStyle}>
          {seeds.map(seed => (
            <SeedCard
              key={seed.id}
              seed={seed}
              expanded={expandedSeed === seed.id}
              onToggle={() => setExpandedSeed(prev => prev === seed.id ? null : seed.id)}
              onScore={() => handleScoreInPreflight(seed)}
              onArchive={() => handleArchive(seed.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Seed card
// ──────────────────────────────────────────────────

function SeedCard({ seed, expanded, onToggle, onScore, onArchive }) {
  const formatColor = FORMAT_COLORS[seed.format_hint] || '#888';
  return (
    <div style={seedCardStyle(seed.status)}>
      <div style={seedHeaderStyle} onClick={onToggle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={formatChipStyle(formatColor)}>{FORMAT_LABELS[seed.format_hint] || 'Either'}</span>
            {seed.status === 'scored' && <span style={statusChipStyle('#3fa66a')}>Scored</span>}
            {seed.status === 'filmed' && <span style={statusChipStyle('#0A919B')}>Filmed</span>}
            {seed.is_series_candidate && (
              <span style={seriesCandidateChipStyle} title="Series candidate — but read the rationale; standalone may still be better">
                <AlertTriangle size={9} /> Series candidate
              </span>
            )}
          </div>
          <div style={seedTitleStyle}>{seed.title}</div>
          {seed.addresses_persona_claim && (
            <div style={addressesStyle}>
              <strong style={{ color: '#0A919B', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Addresses
              </strong>{' '}
              {seed.addresses_persona_claim}
            </div>
          )}
        </div>
        {expanded ? <ChevronDown size={14} style={{ color: '#666', flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: '#666', flexShrink: 0 }} />}
      </div>

      {expanded && (
        <div style={seedBodyStyle}>
          {seed.hook && (
            <div style={blockStyle}>
              <div style={blockLabelStyle}>Hook</div>
              <div style={blockBodyStyle}>{seed.hook}</div>
            </div>
          )}
          {seed.outline && (
            <div style={blockStyle}>
              <div style={blockLabelStyle}>Outline</div>
              <div style={blockBodyStyle}>{seed.outline}</div>
            </div>
          )}
          {seed.is_series_candidate && seed.series_rationale && (
            <div style={seriesRationaleStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <AlertTriangle size={12} style={{ color: '#E8A82B' }} />
                <strong style={{ fontSize: 11, color: '#E8A82B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Series candidate — read the trade-off
                </strong>
              </div>
              <div style={{ fontSize: 12, color: '#cde4d6', lineHeight: 1.5 }}>
                {seed.series_rationale}
              </div>
              <div style={seriesPushbackStyle}>
                <strong>Default position:</strong> standalone discoverability-optimized concepts protect new channels and respect point-of-need consumption. Only choose series if the persona evidence + cohort signal genuinely warrants it.
              </div>
            </div>
          )}

          <div style={actionsRowStyle}>
            {seed.status === 'draft' && (
              <button onClick={onScore} style={scoreBtnStyle}>
                <Crosshair size={11} /> Score in Pre-flight
              </button>
            )}
            <button onClick={onArchive} style={archiveBtnStyle}>
              <Trash2 size={11} /> Archive
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

function Note({ tone, children }) {
  const palette = {
    info:  { bg: 'rgba(10,145,155,0.08)',  border: 'rgba(10,145,155,0.25)',  fg: '#0A919B' },
    warn:  { bg: 'rgba(232,168,43,0.08)',  border: 'rgba(232,168,43,0.30)',  fg: '#E8A82B' },
    error: { bg: 'rgba(239,107,107,0.08)', border: 'rgba(239,107,107,0.30)', fg: '#ef6b6b' },
  }[tone] || { bg: '#1a1a1f', border: '#333', fg: '#aaa' };
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 6,
      background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg,
      fontSize: 13, margin: '10px 0',
    }}>{children}</div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const sectionShellStyle = { marginTop: 24 };
const sectionHeaderStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
  marginBottom: 12, flexWrap: 'wrap',
};
const kickerStyle = {
  fontSize: 12, color: '#0A919B', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
};
const subtitleStyle = { fontSize: 12, color: '#888', maxWidth: 600, lineHeight: 1.5 };

const generateBarStyle = {
  display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
};
const selectStyle = {
  background: '#1a1a1f', color: '#cde4d6',
  border: '1px solid #2a2a30', borderRadius: 5,
  padding: '7px 10px', fontSize: 12, cursor: 'pointer',
};
const generateBtnStyle = (busy) => ({
  background: busy ? '#1a1a1f' : '#0A919B',
  color: busy ? '#666' : '#0a0a0e',
  border: busy ? '1px solid #2a2a30' : 'none',
  borderRadius: 5,
  padding: '8px 16px',
  fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
  cursor: busy ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
});

const lockedShellStyle = {
  marginTop: 18,
  background: '#0e0e11', border: '1px dashed #2a2a30',
  borderRadius: 6, padding: 14,
  display: 'inline-flex', alignItems: 'center', gap: 8,
};

const emptyStateStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  padding: 32,
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 6,
  marginTop: 10,
};

const seedsListStyle = { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 };
const seedCardStyle = (status) => ({
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderLeft: `2px solid ${status === 'scored' ? '#3fa66a' : status === 'filmed' ? '#0A919B' : '#2a2a30'}`,
  borderRadius: 6,
});
const seedHeaderStyle = {
  padding: 12,
  display: 'flex', alignItems: 'flex-start', gap: 10,
  cursor: 'pointer',
};
const seedTitleStyle = {
  fontSize: 13, fontWeight: 600, color: '#e8e2d0',
  lineHeight: 1.4,
};
const addressesStyle = {
  fontSize: 11, color: '#888', marginTop: 4, lineHeight: 1.4,
};
const formatChipStyle = (color) => ({
  background: `${color}22`, color, border: `1px solid ${color}55`,
  borderRadius: 3, padding: '1px 7px',
  fontSize: 9, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.4,
});
const statusChipStyle = (color) => ({
  background: `${color}22`, color, border: `1px solid ${color}55`,
  borderRadius: 3, padding: '1px 7px',
  fontSize: 9, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.4,
});
const seriesCandidateChipStyle = {
  background: 'rgba(232,168,43,0.10)',
  color: '#E8A82B',
  border: '1px solid rgba(232,168,43,0.35)',
  borderRadius: 3, padding: '1px 7px',
  fontSize: 9, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.4,
  display: 'inline-flex', alignItems: 'center', gap: 3,
};

const seedBodyStyle = {
  padding: '0 12px 12px',
  borderTop: '1px dashed #2a2a30',
  display: 'flex', flexDirection: 'column', gap: 10,
};
const blockStyle = { marginTop: 10 };
const blockLabelStyle = {
  fontSize: 10, color: '#666',
  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600,
  marginBottom: 4,
};
const blockBodyStyle = {
  fontSize: 13, color: '#cde4d6', lineHeight: 1.55,
};

const seriesRationaleStyle = {
  background: 'rgba(232,168,43,0.05)',
  border: '1px solid rgba(232,168,43,0.25)',
  borderRadius: 5, padding: 10,
  marginTop: 8,
};
const seriesPushbackStyle = {
  marginTop: 8, paddingTop: 8,
  borderTop: '1px dashed rgba(232,168,43,0.25)',
  fontSize: 11, color: '#888', lineHeight: 1.5,
};

const actionsRowStyle = {
  display: 'flex', gap: 6, justifyContent: 'flex-end',
  marginTop: 8, paddingTop: 8, borderTop: '1px dashed #2a2a30',
};
const scoreBtnStyle = {
  background: '#0A919B', color: '#0a0a0e',
  border: 'none', borderRadius: 4,
  padding: '5px 12px', fontSize: 11, fontWeight: 700,
  cursor: 'pointer', letterSpacing: 0.3,
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
const archiveBtnStyle = {
  background: 'transparent', color: '#888',
  border: '1px solid #2a2a30', borderRadius: 4,
  padding: '5px 12px', fontSize: 11, fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
