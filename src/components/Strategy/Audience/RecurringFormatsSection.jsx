/**
 * RecurringFormatsSection — recurring creative-execution patterns
 * generated from the audience persona.
 *
 * Lives in AudienceWorkspace above ConceptSeedsSection. Recurring
 * formats are PRODUCTION PATTERNS the audience comes to recognize
 * (podcast format, talking-head explainer, weekly expert interview,
 * react/response, tutorial, etc.) — what the client can reuse as the
 * creative anchor for many videos.
 *
 * Each format card surfaces:
 *   - Name + creative execution + cadence + pillar anchor
 *   - Persona rationale (why this fits this audience)
 *   - Counter-argument (when this format would be wrong)
 *   - Production complexity + notes
 *
 * The counter_argument is rendered prominently. The default
 * lazy-strategist instinct is to pick formats that sound good;
 * surfacing the trade-off forces a deliberate choice.
 */

import React, { useEffect, useState } from 'react';
import {
  Sparkles, Loader, Trash2, AlertTriangle, ChevronDown, ChevronRight,
  Clock, Layers, Mic, Video, MessageSquare, FileText, Users, Tv2,
} from 'lucide-react';
import {
  generateRecurringFormats, listRecurringFormats, archiveRecurringFormat, updateRecurringFormat,
} from '../../../services/recurringFormatsService.js';

const EXECUTION_LABELS = {
  podcast:         'Podcast',
  talking_head:    'Talking head',
  interview:       'Interview',
  expert_breakdown:'Expert breakdown',
  react_response:  'React / response',
  tutorial:        'Tutorial',
  case_study:      'Case study',
  live_briefing:   'Live briefing',
  roundtable:      'Roundtable',
  document_review: 'Document review',
  other:           'Other',
};
const EXECUTION_ICONS = {
  podcast:         Mic,
  talking_head:    Video,
  interview:       MessageSquare,
  expert_breakdown:Layers,
  react_response:  MessageSquare,
  tutorial:        FileText,
  case_study:      FileText,
  live_briefing:   Tv2,
  roundtable:      Users,
  document_review: FileText,
  other:           Sparkles,
};

const CADENCE_LABELS = {
  weekly:    'Weekly',
  biweekly:  'Biweekly',
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  ad_hoc:    'Ad-hoc',
};

const COMPLEXITY_COLORS = {
  low:    '#3fa66a',
  medium: '#E8A82B',
  high:   '#ef6b6b',
};

export default function RecurringFormatsSection({ clientId, hasPersona }) {
  const [formats, setFormats]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]           = useState(null);
  const [targetCount, setTargetCount] = useState(3);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!clientId) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await listRecurringFormats(clientId);
        if (!cancelled) setFormats(list || []);
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
      const r = await generateRecurringFormats({ clientId, targetCount });
      if (!r.ok) { setError(r.error || 'Generation failed'); return; }
      const list = await listRecurringFormats(clientId);
      setFormats(list || []);
    } catch (err) {
      setError(err?.message || 'unknown error');
    } finally {
      setGenerating(false);
    }
  };

  const handleArchive = async (formatId) => {
    if (!window.confirm('Archive this format? It won\'t be deleted; you can still see the audit trail.')) return;
    await archiveRecurringFormat(formatId);
    setFormats(prev => prev.filter(f => f.id !== formatId));
  };

  const handlePromote = async (formatId, status) => {
    await updateRecurringFormat(formatId, { status });
    setFormats(prev => prev.map(f => f.id === formatId ? { ...f, status } : f));
  };

  if (!hasPersona) {
    return (
      <div style={lockedShellStyle}>
        <Sparkles size={14} style={{ color: '#666' }} />
        <span style={{ fontSize: 12, color: '#888' }}>
          Synthesize the persona first — recurring formats derive from audience consumption patterns.
        </span>
      </div>
    );
  }

  return (
    <div style={sectionShellStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <div style={kickerStyle}>Recurring formats</div>
          <div style={subtitleStyle}>
            Production patterns the audience comes to recognize and expect — podcast format,
            talking-head explainer, expert interview, react/response, tutorial. Each entry stands
            alone for discoverability but shares creative DNA. Pillars × Formats × Persona → individual
            concept seeds.
          </div>
        </div>
        <div style={generateBarStyle}>
          <select
            value={targetCount}
            onChange={e => setTargetCount(Number(e.target.value))}
            disabled={generating}
            style={selectStyle}
          >
            <option value={2}>2 formats</option>
            <option value={3}>3 formats</option>
            <option value={4}>4 formats</option>
          </select>
          <button onClick={handleGenerate} disabled={generating} style={generateBtnStyle(generating)}>
            {generating
              ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
              : <><Sparkles size={13} /> Generate formats</>
            }
          </button>
        </div>
      </div>

      {error && (
        <Note tone="error">
          <div style={{
            whiteSpace: 'pre-wrap',
            fontFamily: error.length > 200 ? 'ui-monospace, Menlo, monospace' : 'inherit',
            fontSize: error.length > 200 ? 11 : 13,
          }}>
            {error}
          </div>
        </Note>
      )}
      {loading && <Note tone="info">Loading formats…</Note>}

      {!loading && formats.length === 0 && !error && (
        <div style={emptyStateStyle}>
          <Layers size={26} style={{ color: '#0A919B', marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: '#cde4d6', fontWeight: 600, marginBottom: 4 }}>
            No recurring formats yet
          </div>
          <div style={{ fontSize: 12, color: '#888', maxWidth: 480, lineHeight: 1.5 }}>
            Generate 2-4 recurring creative-execution opportunities anchored to the audience persona.
            Each comes with an honest counter-argument so you see when a format would be the wrong choice.
          </div>
        </div>
      )}

      {!loading && formats.length > 0 && (
        <div style={formatsListStyle}>
          {formats.map(f => (
            <FormatCard
              key={f.id}
              format={f}
              expanded={expandedId === f.id}
              onToggle={() => setExpandedId(prev => prev === f.id ? null : f.id)}
              onPromote={(status) => handlePromote(f.id, status)}
              onArchive={() => handleArchive(f.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Format card
// ──────────────────────────────────────────────────

function FormatCard({ format, expanded, onToggle, onPromote, onArchive }) {
  const ExecIcon  = EXECUTION_ICONS[format.creative_execution] || Sparkles;
  const execLabel = format.creative_execution === 'other'
    ? (format.creative_execution_label || 'Other')
    : EXECUTION_LABELS[format.creative_execution];
  const complexityColor = COMPLEXITY_COLORS[format.production_complexity] || '#888';

  return (
    <div style={cardStyle(format.status)}>
      <div style={cardHeaderStyle} onClick={onToggle}>
        <ExecIcon size={18} style={{ color: '#0A919B', flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={cardTitleStyle}>{format.name}</div>
          <div style={cardMetaRowStyle}>
            <span style={execChipStyle}>{execLabel}</span>
            <span style={cadenceChipStyle}>
              <Clock size={9} /> {CADENCE_LABELS[format.cadence] || format.cadence}
            </span>
            {format.estimated_episode_length && (
              <span style={lengthChipStyle}>~{format.estimated_episode_length}</span>
            )}
            <span style={complexityChipStyle(complexityColor)}>
              {(format.production_complexity || 'medium').toUpperCase()} complexity
            </span>
            {format.pillar_label && (
              <span style={pillarChipStyle}>Pillar · {format.pillar_label}</span>
            )}
            {format.status === 'active' && <span style={statusChipStyle('#3fa66a')}>Active</span>}
            {format.status === 'piloting' && <span style={statusChipStyle('#E8A82B')}>Piloting</span>}
          </div>
        </div>
        {expanded ? <ChevronDown size={14} style={{ color: '#666', flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: '#666', flexShrink: 0 }} />}
      </div>

      {expanded && (
        <div style={cardBodyStyle}>
          <div style={blockStyle}>
            <div style={blockLabelStyle}>Why this fits</div>
            <div style={blockBodyStyle}>{format.persona_rationale}</div>
          </div>

          {format.counter_argument && (
            <div style={counterStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <AlertTriangle size={12} style={{ color: '#E8A82B' }} />
                <strong style={{ fontSize: 11, color: '#E8A82B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Counter-argument · read before committing
                </strong>
              </div>
              <div style={{ fontSize: 12, color: '#cde4d6', lineHeight: 1.5 }}>
                {format.counter_argument}
              </div>
            </div>
          )}

          {format.production_notes && (
            <div style={blockStyle}>
              <div style={blockLabelStyle}>Production notes</div>
              <div style={blockBodyStyle}>{format.production_notes}</div>
            </div>
          )}

          <div style={actionsRowStyle}>
            {format.status === 'draft' && (
              <>
                <button onClick={() => onPromote('piloting')} style={pilotBtnStyle}>
                  Pilot this
                </button>
                <button onClick={() => onPromote('active')} style={activateBtnStyle}>
                  Activate
                </button>
              </>
            )}
            {format.status === 'piloting' && (
              <button onClick={() => onPromote('active')} style={activateBtnStyle}>
                Activate
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
const subtitleStyle = { fontSize: 12, color: '#888', maxWidth: 640, lineHeight: 1.5 };

const generateBarStyle = { display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 };
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
  padding: 32, background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 6, marginTop: 10,
};

const formatsListStyle = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 };
const cardStyle = (status) => ({
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderLeft: `2px solid ${status === 'active' ? '#3fa66a' : status === 'piloting' ? '#E8A82B' : '#0A919B'}`,
  borderRadius: 6,
});
const cardHeaderStyle = {
  padding: 14,
  display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
};
const cardTitleStyle = {
  fontSize: 14, fontWeight: 700, color: '#e8e2d0', lineHeight: 1.3, marginBottom: 6,
};
const cardMetaRowStyle = {
  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
};
const execChipStyle = {
  background: 'rgba(10,145,155,0.12)',
  color: '#0A919B', border: '1px solid rgba(10,145,155,0.35)',
  borderRadius: 3, padding: '1px 7px',
  fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.4,
};
const cadenceChipStyle = {
  background: 'rgba(167,139,250,0.10)',
  color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)',
  borderRadius: 3, padding: '1px 7px',
  fontSize: 10, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', gap: 3,
};
const lengthChipStyle = {
  fontSize: 10, color: '#888', background: '#1a1a1f',
  border: '1px solid #2a2a30',
  borderRadius: 3, padding: '1px 7px',
};
const complexityChipStyle = (color) => ({
  background: `${color}22`, color, border: `1px solid ${color}55`,
  borderRadius: 3, padding: '1px 7px',
  fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
});
const pillarChipStyle = {
  background: 'rgba(255,255,255,0.04)', color: '#cde4d6',
  border: '1px solid #2a2a30',
  borderRadius: 3, padding: '1px 7px', fontSize: 10, fontWeight: 600,
};
const statusChipStyle = (color) => ({
  background: `${color}22`, color, border: `1px solid ${color}55`,
  borderRadius: 3, padding: '1px 7px',
  fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
  textTransform: 'uppercase',
});

const cardBodyStyle = {
  padding: '0 14px 14px',
  borderTop: '1px dashed #2a2a30',
  display: 'flex', flexDirection: 'column', gap: 10,
};
const blockStyle = { marginTop: 10 };
const blockLabelStyle = {
  fontSize: 10, color: '#666',
  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600,
  marginBottom: 4,
};
const blockBodyStyle = { fontSize: 13, color: '#cde4d6', lineHeight: 1.55 };

const counterStyle = {
  background: 'rgba(232,168,43,0.05)',
  border: '1px solid rgba(232,168,43,0.25)',
  borderRadius: 5, padding: 10,
  marginTop: 10,
};

const actionsRowStyle = {
  display: 'flex', gap: 6, justifyContent: 'flex-end',
  marginTop: 8, paddingTop: 8, borderTop: '1px dashed #2a2a30',
};
const pilotBtnStyle = {
  background: 'rgba(232,168,43,0.12)', color: '#E8A82B',
  border: '1px solid rgba(232,168,43,0.40)', borderRadius: 4,
  padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
};
const activateBtnStyle = {
  background: '#3fa66a', color: '#0a0a0e',
  border: 'none', borderRadius: 4,
  padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
};
const archiveBtnStyle = {
  background: 'transparent', color: '#888',
  border: '1px solid #2a2a30', borderRadius: 4,
  padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
