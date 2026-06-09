/**
 * AudienceWorkspace — Strategy → Audience tab.
 *
 * The audience-understanding layer. Synthesizes a structured persona
 * from existing signals (search queries, Spine, pillars, business
 * context) into a single editable object that lives on the Spine and
 * flows silently into every downstream LLM call.
 *
 * v1 sections (this ship):
 *   1. Persona view — structured persona, editable inline
 *   2. Source evidence — per-claim evidence pointers
 *
 * v2+ sections (future ships, same workspace):
 *   3. Gap map — audience-side white-space
 *   4. Concept seeds — generated from query gaps
 *   5. Drift — quarter-over-quarter comparison
 *   6. Export — client-facing PDF deliverable
 */

import React, { useEffect, useState } from 'react';
import {
  Users, Sparkles, Loader, Edit2, Save, X as XIcon, ChevronDown, ChevronRight, Info,
} from 'lucide-react';
import {
  synthesizeAudiencePersona,
  loadAudiencePersona,
  updateAudiencePersonaInline,
} from '../../../services/audiencePersonaService.js';
import { supabase } from '../../../services/supabaseClient.js';
import DataFreshnessBadge from '../shared/DataFreshnessBadge.jsx';
import PrelaunchBadge from '../shared/PrelaunchBadge.jsx';
import NextStepCard from '../shared/NextStepCard.jsx';

const FIELD_META = [
  { key: 'pain_points',         label: 'Pain points',         description: 'Specific anxieties, decisions, or frustrations the audience is wrestling with.' },
  { key: 'motivations',         label: 'Motivations',         description: 'What they are actively seeking from this kind of content.' },
  { key: 'questions_asked',     label: 'Questions asked',     description: 'Recurring questions in their own words — primarily from search queries.' },
  { key: 'voice_patterns',      label: 'Voice patterns',      description: 'How they talk about your space — vocabulary, register, formality.' },
  { key: 'trust_signals',       label: 'Trust signals',       description: 'What builds credibility for this audience — credentials, evidence, tone.' },
  { key: 'adjacent_interests',  label: 'Adjacent interests',  description: 'What else they engage with — related topics, decision contexts.' },
];

export default function AudienceWorkspace({ activeClient, onNavigate }) {
  const clientId = activeClient?.id;
  const [persona, setPersona] = useState(null);
  const [meta, setMeta] = useState({ synthesizedAt: null, promptVersion: null });
  const [loading, setLoading] = useState(true);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthError, setSynthError] = useState(null);
  const [signalCounts, setSignalCounts] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [expandedEvidence, setExpandedEvidence] = useState({});

  useEffect(() => {
    if (!clientId) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('client_strategy_spine')
          .select('audience_persona, audience_persona_synthesized_at, audience_persona_prompt_version')
          .eq('client_id', clientId)
          .maybeSingle();
        if (cancelled) return;
        setPersona(data?.audience_persona || null);
        setMeta({
          synthesizedAt: data?.audience_persona_synthesized_at || null,
          promptVersion: data?.audience_persona_prompt_version || null,
        });
      } catch (err) {
        console.warn('[Audience] load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (!clientId) {
    return (
      <div style={emptyShellStyle}>
        <div style={emptyHeaderStyle}>Audience</div>
        <div style={emptyBodyStyle}>
          Pick a client from <strong style={{ color: '#cde4d6' }}>Operate → Clients</strong> first.
        </div>
      </div>
    );
  }

  const handleSynthesize = async () => {
    setSynthesizing(true);
    setSynthError(null);
    try {
      const r = await synthesizeAudiencePersona({ clientId, clientName: activeClient.name });
      setSignalCounts(r.signalCounts || null);
      if (!r.ok) {
        setSynthError(r.error || 'Synthesis failed');
        return;
      }
      setPersona(r.persona);
      setMeta({ synthesizedAt: new Date().toISOString(), promptVersion: r.promptVersion });
    } catch (err) {
      setSynthError(err?.message || 'unknown error');
    } finally {
      setSynthesizing(false);
    }
  };

  const handleStartEdit = (key) => {
    if (!persona) return;
    const arr = persona[key] || [];
    setEditingField(key);
    setEditDraft(arr.join('\n'));
  };

  const handleSaveEdit = async () => {
    if (!editingField) return;
    const items = editDraft.split('\n').map(s => s.trim()).filter(Boolean);
    const next = { ...persona, [editingField]: items };
    setPersona(next);
    setEditingField(null);
    setEditDraft('');
    await updateAudiencePersonaInline(clientId, next);
  };

  return (
    <div style={shellStyle}>
      <div style={headerStyle}>
        <div style={kickerStyle}>Strategy · Diagnose · Audience</div>
        <h1 style={titleStyle}>
          {activeClient.name}
          <span style={{ marginLeft: 12, display: 'inline-block', verticalAlign: 'middle' }}>
            <PrelaunchBadge client={activeClient} />
          </span>
        </h1>
        <div style={subtitleStyle}>
          Structured audience persona synthesized from search queries, Spine declarations,
          pillars, and business context. Lives on the Spine; consumed silently by the brief
          generator, alternative titles, strategic-read, and executive memo.
        </div>
        <div style={{ marginTop: 10 }}>
          <DataFreshnessBadge clientId={clientId} />
        </div>
      </div>

      <ActionBar
        hasPersona={!!persona}
        synthesizing={synthesizing}
        synthesizedAt={meta.synthesizedAt}
        promptVersion={meta.promptVersion}
        onSynthesize={handleSynthesize}
        signalCounts={signalCounts}
      />

      {synthError && <Note tone="error">{synthError}</Note>}

      {loading && <Note tone="info">Loading persona…</Note>}

      {!loading && !persona && !synthError && (
        <EmptyPersonaState onSynthesize={handleSynthesize} synthesizing={synthesizing} />
      )}

      {!loading && persona && (
        <>
          <SourceProvenance persona={persona} signalCounts={signalCounts} />

          <div style={fieldsListStyle}>
            {FIELD_META.map(meta => (
              <PersonaField
                key={meta.key}
                meta={meta}
                items={persona[meta.key] || []}
                evidence={persona.evidence?.[meta.key] || null}
                expanded={expandedEvidence[meta.key]}
                onToggleEvidence={() => setExpandedEvidence(prev => ({ ...prev, [meta.key]: !prev[meta.key] }))}
                editing={editingField === meta.key}
                editDraft={editDraft}
                onStartEdit={() => handleStartEdit(meta.key)}
                onCancelEdit={() => { setEditingField(null); setEditDraft(''); }}
                onChangeDraft={setEditDraft}
                onSaveEdit={handleSaveEdit}
              />
            ))}
          </div>

          <NextStepCard
            setTab={onNavigate}
            nextTab="weekly-brief"
            label="Regenerate the weekly brief"
            description="The brief generator now inherits the persona automatically. Regenerate to get audience-grounded recommendations citing specific pain points and questions."
          />
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Action bar
// ──────────────────────────────────────────────────

function ActionBar({ hasPersona, synthesizing, synthesizedAt, promptVersion, onSynthesize, signalCounts }) {
  const ageDays = synthesizedAt
    ? Math.round((Date.now() - new Date(synthesizedAt).getTime()) / 86_400_000)
    : null;

  return (
    <div style={actionBarStyle}>
      <div style={{ flex: 1 }}>
        <div style={kickerSmallStyle}>{hasPersona ? 'Current persona' : 'No persona yet'}</div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
          {hasPersona ? (
            <>
              Synthesized {synthesizedAt ? new Date(synthesizedAt).toLocaleString() : 'never'}
              {ageDays != null && ageDays >= 0 && ` · ${ageDays === 0 ? 'today' : `${ageDays}d ago`}`}
              {promptVersion && ` · prompt ${promptVersion}`}
            </>
          ) : (
            'Synthesize from existing signals (Spine + business context + pillars + search queries).'
          )}
        </div>
      </div>
      <button onClick={onSynthesize} disabled={synthesizing} style={primaryBtnStyle(synthesizing)}>
        {synthesizing
          ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Synthesizing…</>
          : <><Sparkles size={13} /> {hasPersona ? 'Re-synthesize' : 'Synthesize persona'}</>}
      </button>
    </div>
  );
}

function SourceProvenance({ persona, signalCounts }) {
  if (!persona) return null;
  const sources = persona.synthesis_sources || [];
  return (
    <div style={provenanceStyle}>
      <Info size={12} style={{ color: '#0A919B' }} />
      <span style={{ fontSize: 11, color: '#888' }}>
        Synthesized from:{' '}
        {sources.length
          ? sources.map(s => <span key={s} style={sourceChipStyle}>{s.replace(/_/g, ' ')}</span>)
          : <em>(no sources recorded)</em>}
        {signalCounts && (
          <>
            {' · '}
            {signalCounts.search_query_count > 0 && `${signalCounts.search_query_count} search queries`}
            {signalCounts.pillar_count > 0 && ` · ${signalCounts.pillar_count} pillars`}
            {signalCounts.has_business_context && ` · business context`}
          </>
        )}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Persona field row
// ──────────────────────────────────────────────────

function PersonaField({ meta, items, evidence, expanded, onToggleEvidence, editing, editDraft, onStartEdit, onCancelEdit, onChangeDraft, onSaveEdit }) {
  return (
    <div style={fieldCardStyle}>
      <div style={fieldHeaderStyle}>
        <div>
          <div style={fieldLabelStyle}>{meta.label}</div>
          <div style={fieldDescStyle}>{meta.description}</div>
        </div>
        {!editing && (
          <button onClick={onStartEdit} style={editBtnStyle} title="Edit this field">
            <Edit2 size={11} />
          </button>
        )}
      </div>

      {editing ? (
        <div>
          <textarea
            value={editDraft}
            onChange={e => onChangeDraft(e.target.value)}
            rows={Math.max(4, editDraft.split('\n').length)}
            style={editTextareaStyle}
            placeholder="One item per line"
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
            <button onClick={onCancelEdit} style={ghostBtnStyle}>
              <XIcon size={11} /> Cancel
            </button>
            <button onClick={onSaveEdit} style={saveBtnStyle}>
              <Save size={11} /> Save
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: '#666', fontStyle: 'italic', padding: '6px 0' }}>
          (empty)
        </div>
      ) : (
        <ul style={fieldListStyle}>
          {items.map((item, i) => (
            <li key={i} style={fieldListItemStyle}>{item}</li>
          ))}
        </ul>
      )}

      {evidence && evidence.length > 0 && !editing && (
        <div style={{ marginTop: 8 }}>
          <button onClick={onToggleEvidence} style={evidenceToggleStyle}>
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            Source evidence · {evidence.length} pointer{evidence.length === 1 ? '' : 's'}
          </button>
          {expanded && (
            <div style={evidenceListStyle}>
              {evidence.map((e, i) => (
                <div key={i} style={evidenceRowStyle}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#cde4d6' }}>{e.claim}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    <strong style={{ color: '#0A919B', textTransform: 'uppercase', fontSize: 9, letterSpacing: 0.5 }}>
                      {e.source}
                    </strong>{' · '}
                    <em>{e.value}</em>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Empty state
// ──────────────────────────────────────────────────

function EmptyPersonaState({ onSynthesize, synthesizing }) {
  return (
    <div style={emptyPersonaStyle}>
      <Users size={32} style={{ color: '#0A919B', marginBottom: 12 }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: '#cde4d6', marginBottom: 6 }}>
        No audience persona yet
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 16, maxWidth: 520, lineHeight: 1.5 }}>
        Once synthesized, the persona lives on the Spine and is inherited by every LLM-driven
        artifact — brief generator, alternative titles, strategic-read, executive memo. Sharper
        outputs, no new clicks.
      </div>
      <button onClick={onSynthesize} disabled={synthesizing} style={primaryBtnStyle(synthesizing)}>
        <Sparkles size={13} /> Synthesize from existing signals
      </button>
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
      fontSize: 13, margin: '14px 0',
    }}>{children}</div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const shellStyle = { padding: '20px 24px 60px', maxWidth: 1280, margin: '0 auto' };
const headerStyle = { marginBottom: 18 };
const kickerStyle = {
  fontSize: 11, color: '#0A919B',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 4,
};
const kickerSmallStyle = {
  fontSize: 10, color: '#888',
  textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
};
const titleStyle = { fontSize: 24, fontWeight: 700, color: '#e8e2d0', margin: 0 };
const subtitleStyle = { fontSize: 13, color: '#888', marginTop: 6, lineHeight: 1.5, maxWidth: 800 };

const emptyShellStyle = { padding: '60px 24px', maxWidth: 720, margin: '0 auto', textAlign: 'center' };
const emptyHeaderStyle = {
  fontSize: 14, color: '#0A919B',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 14,
};
const emptyBodyStyle = { fontSize: 14, color: '#888', lineHeight: 1.6 };

const actionBarStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderLeft: '2px solid #0A919B',
  borderRadius: 6, padding: 14,
  marginTop: 14,
};
const primaryBtnStyle = (busy) => ({
  background: busy ? '#1a1a1f' : '#0A919B',
  color: busy ? '#666' : '#0a0a0e',
  border: busy ? '1px solid #2a2a30' : 'none',
  borderRadius: 5,
  padding: '8px 16px',
  fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
  cursor: busy ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  whiteSpace: 'nowrap', flexShrink: 0,
});

const provenanceStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  background: 'rgba(10,145,155,0.04)',
  border: '1px solid rgba(10,145,155,0.20)',
  borderRadius: 4, padding: '4px 10px',
  marginTop: 14,
};
const sourceChipStyle = {
  display: 'inline-block',
  background: 'rgba(10,145,155,0.10)',
  color: '#0A919B',
  borderRadius: 3, padding: '0 6px',
  fontSize: 10, fontWeight: 700,
  margin: '0 2px',
  textTransform: 'uppercase', letterSpacing: 0.3,
};

const emptyPersonaStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  padding: 40, marginTop: 20,
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 8,
};

const fieldsListStyle = { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 };
const fieldCardStyle = {
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 6, padding: 14,
};
const fieldHeaderStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
  marginBottom: 8,
};
const fieldLabelStyle = {
  fontSize: 11, color: '#0A919B', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 1,
};
const fieldDescStyle = { fontSize: 11, color: '#666', marginTop: 2, lineHeight: 1.45 };
const editBtnStyle = {
  background: 'transparent', color: '#666',
  border: '1px solid #2a2a30', borderRadius: 4,
  padding: 4, cursor: 'pointer',
};
const fieldListStyle = { margin: 0, paddingLeft: 22, listStyle: 'disc' };
const fieldListItemStyle = { fontSize: 13, color: '#e8e2d0', lineHeight: 1.55, marginBottom: 4 };
const editTextareaStyle = {
  width: '100%',
  background: '#1a1a1f', color: '#e8e2d0',
  border: '1px solid #2a2a30', borderRadius: 5,
  padding: '8px 10px', fontSize: 13,
  fontFamily: 'inherit', resize: 'vertical',
};
const ghostBtnStyle = {
  background: 'transparent', color: '#888',
  border: '1px solid #2a2a30', borderRadius: 4,
  padding: '4px 10px', fontSize: 11, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
const saveBtnStyle = {
  background: '#0A919B', color: '#0a0a0e',
  border: 'none', borderRadius: 4,
  padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};

const evidenceToggleStyle = {
  background: 'transparent', color: '#666',
  border: 'none', cursor: 'pointer',
  fontSize: 10, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: 0.5,
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: 0,
};
const evidenceListStyle = {
  marginTop: 8,
  display: 'flex', flexDirection: 'column', gap: 8,
  paddingLeft: 14,
};
const evidenceRowStyle = {
  padding: '6px 10px',
  background: '#1a1a1f',
  border: '1px solid #2a2a30',
  borderRadius: 4,
};
