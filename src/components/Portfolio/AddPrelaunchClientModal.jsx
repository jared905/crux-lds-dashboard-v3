/**
 * AddPrelaunchClientModal — onboard a client before they have a
 * YouTube channel.
 *
 * Triggered from PortfolioView (header button + empty-state CTA).
 * Form fields:
 *   - Name (required)
 *   - Market description (optional, seeds business_context so the
 *     brief generator immediately has voice context)
 *   - Intended launch date (optional)
 *   - Future channel URL (optional)
 *
 * On success: closes + calls onCreated(newClient) so the parent can
 * refresh the portfolio list and switch the active client to the
 * just-created one.
 */

import React, { useState } from 'react';
import { X as XIcon, Sparkles, Calendar, ArrowRight, Users, Target, ScrollText, CheckCircle } from 'lucide-react';
import { createPrelaunchClient } from '../../services/prelaunchClientService.js';

export default function AddPrelaunchClientModal({ open, onClose, onCreated, onNavigate }) {
  const [name, setName]                       = useState('');
  const [marketDescription, setMarketDesc]    = useState('');
  const [intendedLaunchDate, setLaunchDate]   = useState('');
  const [customUrl, setCustomUrl]             = useState('');
  const [submitting, setSubmitting]           = useState(false);
  const [error, setError]                     = useState(null);
  // P1 #6 (2026-06-08): after creation, show "next steps" panel
  // instead of dumping the strategist back at empty Portfolio.
  const [createdClient, setCreatedClient]     = useState(null);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const intendedLaunchAt = intendedLaunchDate
        ? new Date(intendedLaunchDate + 'T12:00:00').toISOString()
        : null;
      const r = await createPrelaunchClient({
        name:                name.trim(),
        marketDescription:   marketDescription.trim() || null,
        intendedLaunchAt,
        customUrl:           customUrl.trim() || null,
      });
      if (!r.ok) {
        setError(r.error || 'Failed to create pre-launch client');
        setSubmitting(false);
        return;
      }
      // Refresh parent's client list immediately so the new client
      // appears in the picker — but stay on the success view so the
      // strategist sees "what's next" before closing.
      onCreated?.(r.client);
      setCreatedClient(r.client);
    } catch (err) {
      setError(err?.message || 'unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNavigate = (targetTab) => {
    // Reset form state for next use, then close + navigate.
    setName(''); setMarketDesc(''); setLaunchDate(''); setCustomUrl('');
    setCreatedClient(null);
    if (targetTab && typeof onNavigate === 'function') onNavigate(targetTab);
    onClose?.();
  };

  const handleCloseFromSuccess = () => {
    setName(''); setMarketDesc(''); setLaunchDate(''); setCustomUrl('');
    setCreatedClient(null);
    onClose?.();
  };

  // Success view — render "what's next" panel instead of the form.
  if (createdClient) {
    return (
      <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) handleCloseFromSuccess(); }}>
        <div style={modalStyle}>
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircle size={18} style={{ color: '#3fa66a' }} />
              <div>
                <div style={{ ...kickerStyle, color: '#3fa66a' }}>Created</div>
                <h2 style={titleStyle}>{createdClient.name} is ready</h2>
              </div>
            </div>
            <button onClick={handleCloseFromSuccess} style={closeBtnStyle}><XIcon size={16} /></button>
          </div>

          <div style={bodyStyle}>
            <p style={subtitleStyle}>
              The client is in your portfolio. Pick the next step — strategist work falls into a
              natural sequence; the canonical order is below.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              <NextStepRow
                index={1}
                icon={Users}
                label="Add competitors"
                description="Go to Research → Competitors and add the channels that will form this client's cohort. Without competitors, the cohort-derived signals are empty."
                onClick={() => handleNavigate('research-v2')}
              />
              <NextStepRow
                index={2}
                icon={Target}
                label="Tag cohort roles"
                description="Mark each competitor as peer (predictive), aspirational (directional only), or reference (case-study). Wrong tags poison every downstream prediction."
                onClick={() => handleNavigate('cohort-roles')}
              />
              <NextStepRow
                index={3}
                icon={ScrollText}
                label="Generate the first brief"
                description="Strategist-facing recommendation memo built from cohort + Spine. Pre-flight / Repositioning / Calibration require client video data and are N/A until launch."
                onClick={() => handleNavigate('weekly-brief')}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #2a2a30', paddingTop: 14 }}>
              <button onClick={handleCloseFromSuccess} style={ghostBtnStyle}>
                Skip — I'll figure it out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={18} style={{ color: '#a78bfa' }} />
            <div>
              <div style={kickerStyle}>Pre-launch client</div>
              <h2 style={titleStyle}>Add a client before they have a YouTube channel</h2>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}><XIcon size={16} /></button>
        </div>

        <div style={bodyStyle}>
          <p style={subtitleStyle}>
            Creates a placeholder client so you can build the Strategy Spine, tag a competitor
            cohort, and run Competitor Scans against their intended market — all before they
            start publishing. Pre-flight, Repositioning, and Calibration require client video
            data, so they'll be N/A until the channel launches.
          </p>

          <form onSubmit={handleSubmit}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Client name <span style={requiredStyle}>*</span></span>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Acme Brand"
                autoFocus
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              <span style={labelTextStyle}>Intended market</span>
              <span style={hintStyle}>
                Seeds the business context so the brief generator has voice + market signal from day one.
              </span>
              <textarea
                value={marketDescription}
                onChange={e => setMarketDesc(e.target.value)}
                placeholder={`e.g., "Fee-only financial advisors serving pre-retirees (50-65) with $500K-$2M in investable assets. Voice is precise but warm; trust-sensitive register."`}
                rows={4}
                style={textareaStyle}
              />
            </label>

            <div style={twoColStyle}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Intended launch date</span>
                <input
                  type="date"
                  value={intendedLaunchDate}
                  onChange={e => setLaunchDate(e.target.value)}
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                <span style={labelTextStyle}>Future channel handle</span>
                <input
                  type="text"
                  value={customUrl}
                  onChange={e => setCustomUrl(e.target.value)}
                  placeholder="@acmebrand"
                  style={inputStyle}
                />
              </label>
            </div>

            {error && (
              <div style={errorBoxStyle}>{error}</div>
            )}

            <div style={footerStyle}>
              <button type="button" onClick={onClose} style={ghostBtnStyle} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" style={primaryBtnStyle(submitting)} disabled={submitting}>
                {submitting ? 'Creating…' : <><Sparkles size={13} /> Create pre-launch client</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// NextStepRow — used in the post-creation success view
// ──────────────────────────────────────────────────

function NextStepRow({ index, icon: Icon, label, description, onClick }) {
  return (
    <button onClick={onClick} style={nextStepRowStyle}>
      <div style={nextStepIndexStyle}>{index}</div>
      <Icon size={16} style={{ color: '#0A919B', flexShrink: 0 }} />
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e2d0', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: '#888', lineHeight: 1.45 }}>
          {description}
        </div>
      </div>
      <ArrowRight size={14} style={{ color: '#0A919B', flexShrink: 0 }} />
    </button>
  );
}

const nextStepRowStyle = {
  display: 'flex', alignItems: 'flex-start', gap: 10,
  background: 'rgba(10,145,155,0.04)',
  border: '1px solid rgba(10,145,155,0.20)',
  borderLeft: '2px solid rgba(10,145,155,0.50)',
  borderRadius: 5, padding: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const nextStepIndexStyle = {
  width: 22, height: 22, borderRadius: '50%',
  background: '#0A919B', color: '#0a0a0e',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 11, fontWeight: 700, flexShrink: 0,
};

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const overlayStyle = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: 24,
};
const modalStyle = {
  background: '#0e0e11',
  border: '1px solid #2a2a30',
  borderLeft: '2px solid #a78bfa',
  borderRadius: 8,
  width: '100%', maxWidth: 560,
  maxHeight: '90vh', overflowY: 'auto',
};
const headerStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  padding: '18px 22px 12px',
  borderBottom: '1px solid #2a2a30',
};
const kickerStyle = {
  fontSize: 10, color: '#a78bfa',
  textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700,
};
const titleStyle = {
  fontSize: 16, fontWeight: 700, color: '#e8e2d0', margin: '2px 0 0', lineHeight: 1.3,
};
const closeBtnStyle = {
  background: 'transparent', color: '#888',
  border: 'none', cursor: 'pointer', padding: 4,
};
const bodyStyle = { padding: '14px 22px 18px' };
const subtitleStyle = {
  fontSize: 12, color: '#888', lineHeight: 1.55, marginTop: 0, marginBottom: 16,
};
const labelStyle = {
  display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14,
};
const labelTextStyle = {
  fontSize: 11, color: '#cde4d6',
  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600,
};
const requiredStyle = { color: '#ef6b6b' };
const hintStyle = { fontSize: 11, color: '#666', fontWeight: 400, marginTop: -2 };
const inputStyle = {
  background: '#1a1a1f', color: '#e8e2d0',
  border: '1px solid #2a2a30', borderRadius: 5,
  padding: '8px 12px', fontSize: 13,
  fontFamily: 'inherit',
};
const textareaStyle = {
  ...inputStyle,
  resize: 'vertical', minHeight: 80,
};
const twoColStyle = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
};
const errorBoxStyle = {
  background: 'rgba(239,107,107,0.08)',
  border: '1px solid rgba(239,107,107,0.30)',
  color: '#ef6b6b',
  borderRadius: 5, padding: '8px 12px',
  fontSize: 12, marginBottom: 12,
};
const footerStyle = {
  display: 'flex', justifyContent: 'flex-end', gap: 8,
  marginTop: 16, paddingTop: 14, borderTop: '1px solid #2a2a30',
};
const ghostBtnStyle = {
  background: 'transparent', color: '#888',
  border: '1px solid #2a2a30', borderRadius: 5,
  padding: '8px 14px', fontSize: 12, cursor: 'pointer',
};
const primaryBtnStyle = (submitting) => ({
  background: submitting ? '#1a1a1f' : '#a78bfa',
  color: submitting ? '#666' : '#0a0a0e',
  border: submitting ? '1px solid #2a2a30' : 'none',
  borderRadius: 5,
  padding: '8px 16px',
  fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
  cursor: submitting ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
});
