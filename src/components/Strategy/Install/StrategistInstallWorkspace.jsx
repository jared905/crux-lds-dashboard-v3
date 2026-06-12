/**
 * StrategistInstallWorkspace — Strategy → Install
 *
 * The strategist-facing surface for the Crux Installation Instrument
 * (Part 1: 16 intake questions). All 16 questions render here. When
 * a client has submitted async pre-work via a tokenized URL, those
 * answers appear pre-populated with a "client-submitted · confirm"
 * affordance — per the instrument doc, no answer enters strategic
 * use until a strategist confirms it in conversation.
 *
 * Layout:
 *   - Header: client name, intake version, completion progress
 *   - Section A-E groups, collapsible, each shows answered count
 *   - Per-question card: question text + strategist guidance +
 *     answer field + source badge + confirm button when needed
 *   - Pre-population panel: suggest answers from existing Spine /
 *     business_context (strategist accepts as drafts)
 *   - Token issuance: Ship 2 — not in this commit
 *
 * Honesty rule encoded in UI:
 *   - 'strategist' source: the strategist captured it directly (green)
 *   - 'client' source: client submitted via pre-work, awaiting confirm (amber until confirmed, green after)
 *   - 'pre_populated' source: auto-drafted from Spine, awaiting confirm (purple until confirmed)
 *   - confirmed_by_strategist_at: stamps it as real
 */

import React, { useEffect, useState } from 'react';
import {
  CheckCircle, Circle, Loader, Sparkles, Save, ChevronDown, ChevronRight,
  ClipboardCheck, AlertTriangle, MessageSquare, UserCheck, Wand2,
} from 'lucide-react';
import {
  INTAKE_QUESTIONS, INTAKE_SECTIONS, INSTALL_INTAKE_VERSION, questionsBySection,
} from '../../../lib/installIntakeQuestions.js';
import {
  loadIntakeAnswers, upsertStrategistAnswer, confirmStrategistAnswer,
  suggestPrePopulatedAnswers, savePrePopulatedDraft, getIntakeCompletion,
} from '../../../services/installIntakeService.js';
import PrelaunchBadge from '../shared/PrelaunchBadge.jsx';

export default function StrategistInstallWorkspace({ activeClient, onNavigate }) {
  const clientId = activeClient?.id;
  const [answers, setAnswers] = useState({});
  const [completion, setCompletion] = useState(null);
  const [suggestions, setSuggestions] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [expandedSection, setExpandedSection] = useState({ A: true, B: true, C: true, D: true, E: true });

  useEffect(() => {
    if (!clientId) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [a, c, s] = await Promise.all([
        loadIntakeAnswers(clientId),
        getIntakeCompletion(clientId),
        suggestPrePopulatedAnswers(clientId),
      ]);
      if (cancelled) return;
      setAnswers(a);
      setCompletion(c);
      setSuggestions(s);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const refreshCompletion = async () => {
    const c = await getIntakeCompletion(clientId);
    setCompletion(c);
  };

  if (!clientId) {
    return (
      <div style={emptyShellStyle}>
        <div style={emptyHeaderStyle}>Install</div>
        <div style={emptyBodyStyle}>
          Pick a client from <strong style={{ color: '#cde4d6' }}>Operate → Clients</strong> first.
        </div>
      </div>
    );
  }

  const handleSave = async (key, answerText, notes) => {
    setSavingKey(key);
    try {
      const r = await upsertStrategistAnswer({
        clientId, questionKey: key, answerText, notes,
      });
      if (r.ok) {
        const fresh = await loadIntakeAnswers(clientId);
        setAnswers(fresh);
        await refreshCompletion();
      }
    } finally {
      setSavingKey(null);
    }
  };

  const handleConfirm = async (key) => {
    setSavingKey(key);
    try {
      const r = await confirmStrategistAnswer({ clientId, questionKey: key });
      if (r.ok) {
        const fresh = await loadIntakeAnswers(clientId);
        setAnswers(fresh);
        await refreshCompletion();
      }
    } finally {
      setSavingKey(null);
    }
  };

  const handleAcceptSuggestion = async (key, draftText) => {
    setSavingKey(key);
    try {
      const r = await savePrePopulatedDraft({ clientId, questionKey: key, draftText });
      if (r.ok) {
        const fresh = await loadIntakeAnswers(clientId);
        setAnswers(fresh);
        // Remove from suggestions panel
        setSuggestions(prev => { const n = { ...prev }; delete n[key]; return n; });
      }
    } finally {
      setSavingKey(null);
    }
  };

  const grouped = questionsBySection();

  return (
    <div style={shellStyle}>
      <div style={headerStyle}>
        <div style={kickerStyle}>Strategy · Install</div>
        <h1 style={titleStyle}>
          {activeClient.name}
          <span style={{ marginLeft: 12, display: 'inline-block', verticalAlign: 'middle' }}>
            <PrelaunchBadge client={activeClient} />
          </span>
        </h1>
        <div style={subtitleStyle}>
          Crux Installation Instrument {INSTALL_INTAKE_VERSION} · Part 1 (Intake).
          16 questions across 5 sections. Each answer must be confirmed by a strategist before
          it enters strategic use — client-submitted async answers count as <em>candidate</em>,
          not <em>confirmed</em>, until you stamp them.
        </div>
      </div>

      {/* Completion summary */}
      {completion && (
        <CompletionStrip completion={completion} />
      )}

      {/* Pre-populated suggestions panel */}
      {Object.keys(suggestions).length > 0 && (
        <SuggestionsPanel
          suggestions={suggestions}
          onAccept={handleAcceptSuggestion}
          onDismiss={(k) => setSuggestions(prev => { const n = { ...prev }; delete n[k]; return n; })}
          savingKey={savingKey}
        />
      )}

      {loading && <Note tone="info">Loading intake…</Note>}

      {!loading && Object.entries(grouped).map(([section, qs]) => {
        const sectionCompletion = completion?.by_section?.[section];
        const expanded = expandedSection[section];
        return (
          <div key={section} style={sectionShellStyle}>
            <button
              onClick={() => setExpandedSection(prev => ({ ...prev, [section]: !prev[section] }))}
              style={sectionHeaderStyle}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span style={sectionKickerStyle}>{section}.</span>
              <span style={sectionLabelStyle}>{INTAKE_SECTIONS[section]}</span>
              {sectionCompletion && (
                <span style={sectionStatusStyle}>
                  {sectionCompletion.confirmed}/{sectionCompletion.total} confirmed
                </span>
              )}
            </button>
            {expanded && (
              <div style={questionListStyle}>
                {qs.map(q => (
                  <QuestionCard
                    key={q.key}
                    question={q}
                    answer={answers[q.key] || null}
                    saving={savingKey === q.key}
                    onSave={(text, notes) => handleSave(q.key, text, notes)}
                    onConfirm={() => handleConfirm(q.key)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Completion strip
// ──────────────────────────────────────────────────

function CompletionStrip({ completion }) {
  const pct = completion.completion_pct;
  return (
    <div style={completionStripStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: '#888' }}>
          <strong style={{ color: pct >= 80 ? '#3fa66a' : pct >= 40 ? '#E8A82B' : '#ef6b6b', fontSize: 14 }}>
            {pct}%
          </strong>{' '}install complete · {completion.confirmed}/{completion.total} confirmed
        </div>
        <div style={progressBarStyle}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#3fa66a' : pct >= 40 ? '#E8A82B' : '#ef6b6b', transition: 'width 0.3s' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap', fontSize: 11, color: '#888' }}>
        {Object.entries(completion.by_section).map(([sect, st]) => (
          <span key={sect}>
            <strong style={{ color: '#cde4d6' }}>{sect}:</strong> {st.confirmed}/{st.total}
          </span>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Pre-populated suggestions
// ──────────────────────────────────────────────────

function SuggestionsPanel({ suggestions, onAccept, onDismiss, savingKey }) {
  return (
    <div style={suggestionsPanelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Wand2 size={14} style={{ color: '#a78bfa' }} />
        <strong style={{ fontSize: 12, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Crux drafted {Object.keys(suggestions).length} answer{Object.keys(suggestions).length === 1 ? '' : 's'} from your existing Spine
        </strong>
      </div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 10, lineHeight: 1.5 }}>
        Accept to add as a draft — strategist must still confirm with the client to commit. The draft sits
        in the question card below as <em>pre_populated</em>, awaiting confirmation.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(suggestions).map(([key, text]) => {
          const question = INTAKE_QUESTIONS.find(q => q.key === key);
          return (
            <div key={key} style={suggestionRowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, marginBottom: 4 }}>
                  Q{question?.number}: {question?.text}
                </div>
                <div style={{ fontSize: 12, color: '#cde4d6', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {text}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button onClick={() => onAccept(key, text)} disabled={savingKey === key} style={acceptBtnStyle}>
                  {savingKey === key ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={11} />} Accept draft
                </button>
                <button onClick={() => onDismiss(key)} style={dismissBtnStyle}>Dismiss</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Question card
// ──────────────────────────────────────────────────

function QuestionCard({ question, answer, saving, onSave, onConfirm }) {
  const [draft, setDraft] = useState(answer?.answer_text || '');
  const [notes, setNotes] = useState(answer?.strategist_notes || '');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // Sync local draft when the upstream answer changes (e.g., after save)
    setDraft(answer?.answer_text || '');
    setNotes(answer?.strategist_notes || '');
  }, [answer?.answer_text, answer?.strategist_notes]);

  const source = answer?.source || null;
  const isConfirmed = !!answer?.confirmed_by_strategist_at;
  const isAnswered  = !!answer?.answer_text?.trim();
  const draftChanged = draft !== (answer?.answer_text || '') || notes !== (answer?.strategist_notes || '');

  return (
    <div style={questionCardStyle(isConfirmed)}>
      <div style={questionHeaderStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={questionNumberStyle}>Q{question.number}{question.clientFacing && <span style={clientTagStyle}>· client pre-work</span>}</div>
          <div style={questionTextStyle}>{question.text}</div>
          {question.guidance && (
            <div style={guidanceStyle}>
              <MessageSquare size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {question.guidance}
            </div>
          )}
        </div>
        <StatusBadge isAnswered={isAnswered} isConfirmed={isConfirmed} source={source} />
      </div>

      {/* Answer field */}
      {editing || !isAnswered ? (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={question.answerHint}
            rows={Math.max(3, draft.split('\n').length + 1)}
            style={textareaStyle}
          />
          {question.key === 'q1_outcome_12mo' || question.key === 'q2_judge_and_metric' || question.key === 'q16_fire_trigger' ? (
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Strategist coaching notes (e.g., Q1 first-sentence verbatim, body-language signal, etc.)"
              rows={2}
              style={{ ...textareaStyle, marginTop: 6, fontSize: 11, fontStyle: 'italic' }}
            />
          ) : null}
          <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
            {isAnswered && (
              <button onClick={() => { setEditing(false); setDraft(answer.answer_text); }} style={cancelBtnStyle}>
                Cancel
              </button>
            )}
            <button onClick={() => { onSave(draft, notes); setEditing(false); }} disabled={saving || !draft.trim() || !draftChanged} style={saveBtnStyle(saving)}>
              {saving ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Save size={11} /> Save{isAnswered ? ' (re-confirms)' : ''}</>}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={answerDisplayStyle}>{answer.answer_text}</div>
          {answer.strategist_notes && (
            <div style={notesDisplayStyle}>
              <strong style={{ color: '#888' }}>Notes:</strong> {answer.strategist_notes}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
            {!isConfirmed && source === 'client' && (
              <button onClick={onConfirm} disabled={saving} style={confirmBtnStyle(saving)}>
                {saving ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Confirming…</> : <><UserCheck size={11} /> Confirm with client</>}
              </button>
            )}
            {!isConfirmed && source === 'pre_populated' && (
              <button onClick={onConfirm} disabled={saving} style={confirmBtnStyle(saving)}>
                {saving ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Confirming…</> : <><UserCheck size={11} /> Confirmed with client</>}
              </button>
            )}
            <button onClick={() => setEditing(true)} style={editBtnStyle}>
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ isAnswered, isConfirmed, source }) {
  if (!isAnswered) {
    return <span style={badgeStyle('#666', '#1a1a1f')}><Circle size={9} /> Unanswered</span>;
  }
  if (isConfirmed) {
    return <span style={badgeStyle('#3fa66a', 'rgba(63,166,106,0.10)')}><CheckCircle size={9} /> Confirmed</span>;
  }
  if (source === 'client') {
    return <span style={badgeStyle('#E8A82B', 'rgba(232,168,43,0.10)')}><AlertTriangle size={9} /> Client-submitted · awaiting confirm</span>;
  }
  if (source === 'pre_populated') {
    return <span style={badgeStyle('#a78bfa', 'rgba(167,139,250,0.10)')}><Wand2 size={9} /> Drafted from Spine · awaiting confirm</span>;
  }
  return <span style={badgeStyle('#888', '#1a1a1f')}><ClipboardCheck size={9} /> Saved</span>;
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

const shellStyle = { padding: '20px 24px 60px', maxWidth: 1100, margin: '0 auto' };
const headerStyle = { marginBottom: 18 };
const kickerStyle = {
  fontSize: 11, color: '#0A919B',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 4,
};
const titleStyle = { fontSize: 24, fontWeight: 700, color: '#e8e2d0', margin: 0 };
const subtitleStyle = { fontSize: 13, color: '#888', marginTop: 6, lineHeight: 1.5, maxWidth: 800 };

const emptyShellStyle = { padding: '60px 24px', maxWidth: 720, margin: '0 auto', textAlign: 'center' };
const emptyHeaderStyle = {
  fontSize: 14, color: '#0A919B',
  textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 14,
};
const emptyBodyStyle = { fontSize: 14, color: '#888', lineHeight: 1.6 };

const completionStripStyle = {
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderLeft: '2px solid #0A919B',
  borderRadius: 6, padding: 14,
  marginBottom: 16,
};
const progressBarStyle = {
  flex: 1, minWidth: 200, height: 6,
  background: '#1a1a1f', borderRadius: 3, overflow: 'hidden',
};

const suggestionsPanelStyle = {
  background: 'rgba(167,139,250,0.04)',
  border: '1px solid rgba(167,139,250,0.30)',
  borderLeft: '2px solid #a78bfa',
  borderRadius: 6, padding: 14,
  marginBottom: 16,
};
const suggestionRowStyle = {
  display: 'flex', gap: 10, alignItems: 'flex-start',
  padding: 10, background: '#0e0e11',
  border: '1px solid #2a2a30', borderRadius: 5,
};
const acceptBtnStyle = {
  background: '#a78bfa', color: '#0a0a0e',
  border: 'none', borderRadius: 4,
  padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
const dismissBtnStyle = {
  background: 'transparent', color: '#888',
  border: '1px solid #2a2a30', borderRadius: 4,
  padding: '5px 10px', fontSize: 11, cursor: 'pointer',
};

const sectionShellStyle = {
  marginBottom: 14,
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 6,
};
const sectionHeaderStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', padding: 12,
  background: 'transparent', border: 'none',
  cursor: 'pointer',
};
const sectionKickerStyle = {
  fontSize: 14, color: '#0A919B', fontWeight: 700,
};
const sectionLabelStyle = {
  fontSize: 13, color: '#cde4d6', fontWeight: 600, flex: 1, textAlign: 'left',
};
const sectionStatusStyle = {
  fontSize: 11, color: '#888',
};

const questionListStyle = {
  display: 'flex', flexDirection: 'column', gap: 8,
  padding: '0 12px 12px',
};
const questionCardStyle = (confirmed) => ({
  background: '#0a0a0e',
  border: '1px solid #2a2a30',
  borderLeft: `2px solid ${confirmed ? '#3fa66a' : '#2a2a30'}`,
  borderRadius: 5, padding: 12,
});
const questionHeaderStyle = {
  display: 'flex', gap: 10, alignItems: 'flex-start',
};
const questionNumberStyle = {
  fontSize: 10, color: '#666',
  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700,
  marginBottom: 4,
};
const clientTagStyle = {
  marginLeft: 6, color: '#0A919B',
  textTransform: 'none', letterSpacing: 0,
};
const questionTextStyle = {
  fontSize: 13, color: '#e8e2d0', fontWeight: 600,
  lineHeight: 1.45, marginBottom: 6,
};
const guidanceStyle = {
  fontSize: 11, color: '#888', lineHeight: 1.5, fontStyle: 'italic',
  background: 'rgba(255,255,255,0.02)',
  border: '1px dashed #2a2a30',
  borderRadius: 4, padding: '6px 8px',
};

const badgeStyle = (color, bg) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: bg, color,
  border: `1px solid ${color}44`,
  borderRadius: 3, padding: '2px 7px',
  fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
});

const textareaStyle = {
  width: '100%',
  background: '#1a1a1f', color: '#e8e2d0',
  border: '1px solid #2a2a30', borderRadius: 5,
  padding: '8px 10px', fontSize: 13,
  fontFamily: 'inherit', resize: 'vertical',
};
const cancelBtnStyle = {
  background: 'transparent', color: '#888',
  border: '1px solid #2a2a30', borderRadius: 4,
  padding: '5px 10px', fontSize: 11, cursor: 'pointer',
};
const saveBtnStyle = (saving) => ({
  background: saving ? '#1a1a1f' : '#0A919B',
  color: saving ? '#666' : '#0a0a0e',
  border: saving ? '1px solid #2a2a30' : 'none',
  borderRadius: 4,
  padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
});
const confirmBtnStyle = (saving) => ({
  background: saving ? '#1a1a1f' : '#3fa66a',
  color: saving ? '#666' : '#0a0a0e',
  border: saving ? '1px solid #2a2a30' : 'none',
  borderRadius: 4,
  padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
});
const editBtnStyle = {
  background: 'transparent', color: '#888',
  border: '1px solid #2a2a30', borderRadius: 4,
  padding: '5px 12px', fontSize: 11, cursor: 'pointer',
};
const answerDisplayStyle = {
  fontSize: 13, color: '#cde4d6', lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
};
const notesDisplayStyle = {
  marginTop: 6, padding: '6px 8px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px dashed #2a2a30',
  borderRadius: 4,
  fontSize: 11, color: '#aaa', fontStyle: 'italic',
};
