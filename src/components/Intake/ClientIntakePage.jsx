/**
 * ClientIntakePage — public tokenized intake form.
 *
 * Lives at /intake/<token>. No auth required — the token IS the auth.
 * Renders only the client-facing subset of questions (7 of 16); the
 * other 9 are strategist-led and never appear here.
 *
 * Per the Installation Instrument v1.4 doc:
 *   - This is the first surface of Crux IP a client touches; first
 *     impression sets the institutional-rigor frame
 *   - Clients answer the factual questions async so the discovery
 *     call can focus on the 9 high-judgment questions
 *   - Strategist receives the answers as "candidate"; they're not
 *     promoted to "confirmed" until verified in conversation
 *
 * UX:
 *   - One-page form, save-as-you-go (no auto-submit; client clicks Submit)
 *   - Existing answers (from prior session) are pre-filled
 *   - Per-question hint shown below the question
 *   - Polite framing — this is client-facing, not internal IP language
 */

import React, { useEffect, useState } from 'react';
import { Loader, CheckCircle, AlertCircle, ClipboardCheck } from 'lucide-react';

export default function ClientIntakePage() {
  const [token, setToken] = useState(null);
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [draft, setDraft] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  useEffect(() => {
    // Token from URL: /intake/<token>
    const match = window.location.pathname.match(/^\/intake\/([^/]+)/);
    const t = match ? match[1] : null;
    setToken(t);
    if (!t) {
      setState({ loading: false, error: 'No token in URL', data: null });
      return;
    }
    (async () => {
      try {
        const r = await fetch(`/api/intake-token?action=lookup&token=${encodeURIComponent(t)}`);
        const json = await r.json();
        if (!r.ok || !json.ok) {
          setState({ loading: false, error: json.error || `HTTP ${r.status}`, data: null });
          return;
        }
        // Seed draft from any existing answers
        const seed = {};
        for (const [k, v] of Object.entries(json.existingAnswers || {})) {
          seed[k] = v.answer_text || '';
        }
        setDraft(seed);
        setState({ loading: false, error: null, data: json });
      } catch (err) {
        setState({ loading: false, error: err?.message || 'Network error', data: null });
      }
    })();
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const r = await fetch('/api/intake-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', token, answers: draft }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setSubmitResult({ ok: false, error: json.error || `HTTP ${r.status}` });
      } else {
        setSubmitResult({ ok: true, saved: json.saved });
      }
    } catch (err) {
      setSubmitResult({ ok: false, error: err?.message || 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (state.loading) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <Loader size={20} style={{ animation: 'spin 1s linear infinite', color: '#0A919B' }} />
          <div style={{ marginTop: 12, color: '#888' }}>Loading…</div>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <AlertCircle size={24} style={{ color: '#ef6b6b' }} />
          <h1 style={errorTitleStyle}>This link can't be opened</h1>
          <div style={errorBodyStyle}>{state.error}</div>
          <div style={{ marginTop: 16, fontSize: 12, color: '#666' }}>
            If you believe this is wrong, reply to the email that sent you the link and we'll send a fresh one.
          </div>
        </div>
      </div>
    );
  }

  // Submitted state
  if (submitResult?.ok) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <CheckCircle size={32} style={{ color: '#3fa66a' }} />
          <h1 style={successTitleStyle}>Thanks — we've got it</h1>
          <div style={successBodyStyle}>
            Your answers are now in our strategist's prep stack. They'll confirm a few of these with you
            during the discovery conversation; in the meantime, no further action needed on your end.
          </div>
          <div style={{ marginTop: 18, fontSize: 12, color: '#888' }}>
            Saved {submitResult.saved} {submitResult.saved === 1 ? 'answer' : 'answers'}. You can close this tab.
          </div>
        </div>
      </div>
    );
  }

  const data = state.data;
  const clientName = data?.client?.name || 'your channel';
  const questions = CLIENT_FACING_QUESTIONS_LOCAL.filter(q => data.clientFacingKeys.includes(q.key));

  return (
    <div style={pageStyle}>
      <div style={formCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <ClipboardCheck size={18} style={{ color: '#0A919B' }} />
          <div style={kickerStyle}>Crux Installation · Pre-work</div>
        </div>
        <h1 style={titleStyle}>{clientName}</h1>
        <p style={subtitleStyle}>
          Welcome. Before our discovery conversation, we'd like you to fill in the factual side of
          the install — budget, constraints, what already exists. This routes the boring questions
          away from the call so the 30 minutes we share focuses on the calls only you can make.
          Save and close any time; we'll see what you've answered.
        </p>
        {data.intendedRecipient && (
          <p style={{ fontSize: 12, color: '#888', marginTop: -6, marginBottom: 14 }}>
            We sent this link to {data.intendedRecipient}. If you're someone else on the team, that's
            fine — just answer for the brand.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
          {questions.map(q => (
            <div key={q.key} style={questionStyle}>
              <label style={questionLabelStyle}>
                <span style={questionNumStyle}>{q.number}.</span> {q.text}
              </label>
              {q.answerHint && (
                <div style={hintStyle}>{q.answerHint}</div>
              )}
              <textarea
                value={draft[q.key] || ''}
                onChange={e => setDraft(prev => ({ ...prev, [q.key]: e.target.value }))}
                rows={Math.max(3, (draft[q.key] || '').split('\n').length + 1)}
                style={textareaStyle}
                placeholder="Type your answer…"
              />
            </div>
          ))}
        </div>

        {submitResult?.ok === false && (
          <div style={submitErrorStyle}>
            Couldn't save — {submitResult.error}. Try again, or reply to the email if it persists.
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, color: '#666' }}>
            Link expires {new Date(data.expiresAt).toLocaleDateString()} · You can return and edit until then.
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || Object.values(draft).every(v => !v?.trim())}
            style={submitBtnStyle(submitting)}
          >
            {submitting
              ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
              : 'Submit'}
          </button>
        </div>
      </div>
      <div style={footerStyle}>
        Crux Media · Measured by Full View Analytics
      </div>
    </div>
  );
}

// Mirror of the client-facing question subset. We can't import the full
// installIntakeQuestions registry on the public page without leaking
// strategist-only metadata (`guidance` fields, splitting rationale).
// This subset includes only the client-safe text + hint.
const CLIENT_FACING_QUESTIONS_LOCAL = [
  { key: 'q3_hard_date',            number: 3,  text: 'Is there a hard date this must work by (a launch, season, fiscal event), or is this a steady build?',         answerHint: "Hard date (with the date), steady build, or both" },
  { key: 'q4_monthly_budget',       number: 4,  text: 'What is the monthly content budget (production + any media spend), and how firm is that number quarter to quarter?', answerHint: '$ per month + firmness (locked, flexible ±X%, etc.)' },
  { key: 'q10_legal_compliance',    number: 10, text: 'Any legal or compliance constraints we should design around — claims substantiation, music licensing, talent releases, regulated-industry rules?', answerHint: 'List each constraint with source (regulation / policy / contract)' },
  { key: 'q11_on_camera',           number: 11, text: 'Who can be on camera, how often realistically?',                                                                                                  answerHint: 'Each person: name, role, available cadence' },
  { key: 'q12_existing_ip',         number: 12, text: 'What existing content, footage, archives, or IP do you have rights to adapt or curate?',                                                          answerHint: 'Inventory: type, volume, rights status' },
  { key: 'q13_in_house_capability', number: 13, text: "What production capability exists in-house, and what should Crux assume it's carrying?",                                                          answerHint: "What's in-house: editing, motion graphics, audio, etc. What Crux owns" },
  { key: 'q14_past_attempts',       number: 14, text: 'What has been tried on YouTube (or video generally) before — what worked, what failed, and what does your team believe about why?',               answerHint: 'Past attempts: what / outcome / your explanation' },
  { key: 'q15_audience_assets',     number: 15, text: 'What audience assets exist outside YouTube — email list, social followings, communities, partnerships — that we can borrow momentum from?',       answerHint: 'Each asset: type, size, engagement level' },
];

// ──────────────────────────────────────────────────
// Styles — slightly elevated vs the dashboard since this is client-facing
// ──────────────────────────────────────────────────

const pageStyle = {
  minHeight: '100vh',
  background: '#0a0a0e',
  color: '#cde4d6',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  padding: '40px 20px',
};
const cardStyle = {
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 8,
  padding: 32,
  maxWidth: 520, width: '100%',
  textAlign: 'center',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
};
const formCardStyle = {
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderRadius: 8,
  padding: 32,
  maxWidth: 720, width: '100%',
};
const kickerStyle = {
  fontSize: 11, color: '#0A919B', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 1.2,
};
const titleStyle = { fontSize: 26, fontWeight: 700, color: '#e8e2d0', margin: '8px 0 12px' };
const subtitleStyle = { fontSize: 14, color: '#aaa', lineHeight: 1.55, marginBottom: 14 };

const questionStyle = {
  paddingBottom: 14, borderBottom: '1px dashed #2a2a30',
};
const questionLabelStyle = {
  display: 'block', fontSize: 14, color: '#e8e2d0', fontWeight: 600,
  lineHeight: 1.45, marginBottom: 4,
};
const questionNumStyle = { color: '#0A919B', marginRight: 6 };
const hintStyle = {
  fontSize: 11, color: '#888', marginBottom: 6,
};
const textareaStyle = {
  width: '100%',
  background: '#1a1a1f', color: '#e8e2d0',
  border: '1px solid #2a2a30', borderRadius: 5,
  padding: '10px 12px', fontSize: 13, fontFamily: 'inherit',
  resize: 'vertical', boxSizing: 'border-box',
};
const submitBtnStyle = (submitting) => ({
  background: submitting ? '#1a1a1f' : '#0A919B',
  color: submitting ? '#666' : '#0a0a0e',
  border: submitting ? '1px solid #2a2a30' : 'none',
  borderRadius: 5,
  padding: '10px 22px',
  fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
  cursor: submitting ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
});
const submitErrorStyle = {
  marginTop: 14, padding: 10,
  background: 'rgba(239,107,107,0.08)',
  border: '1px solid rgba(239,107,107,0.30)',
  borderRadius: 5,
  fontSize: 12, color: '#ef6b6b',
};
const errorTitleStyle = { fontSize: 18, fontWeight: 700, color: '#e8e2d0', margin: '12px 0 6px' };
const errorBodyStyle = { fontSize: 13, color: '#aaa' };
const successTitleStyle = { fontSize: 22, fontWeight: 700, color: '#e8e2d0', margin: '14px 0 8px' };
const successBodyStyle = { fontSize: 14, color: '#aaa', lineHeight: 1.55 };

const footerStyle = {
  marginTop: 24, fontSize: 11, color: '#555',
  textAlign: 'center',
};
