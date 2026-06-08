/**
 * NextStepCard — small "what to do next" pointer at the bottom of each
 * Strategy workspace.
 *
 * Strategy work has natural sequences (Repositioning → Calibration →
 * Brief; Cohort tagging → Repositioning re-run; Pre-flight → Brief).
 * Without explicit next-step pointers, each workspace is an island and
 * the strategist has to remember the canonical order. New strategists
 * miss steps entirely.
 *
 * This card lives at the bottom of each workspace and says "here's the
 * natural next move." Click → setTab to the next surface. The strategist
 * can ignore it, but it's a quiet nudge toward the canonical flow.
 *
 * Usage:
 *   <NextStepCard
 *     setTab={setTab}
 *     nextTab="calibration"
 *     label="Calibrate this audit"
 *     description="Run calibration against the audit you just generated to see which dimensions are actually predictive for this channel."
 *   />
 */

import React from 'react';
import { ArrowRight } from 'lucide-react';

export default function NextStepCard({
  setTab,
  nextTab,
  label,
  description,
  disabled = false,
  disabledReason = null,
}) {
  if (!nextTab) return null;
  const handleClick = () => {
    if (disabled) return;
    if (typeof setTab === 'function') setTab(nextTab);
  };

  return (
    <div style={cardStyle(disabled)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={kickerStyle}>Next step</div>
        <div style={labelStyle}>{label}</div>
        {description && <div style={descStyle}>{description}</div>}
        {disabled && disabledReason && (
          <div style={disabledNoteStyle}>{disabledReason}</div>
        )}
      </div>
      <button
        onClick={handleClick}
        disabled={disabled}
        style={btnStyle(disabled)}
        title={disabled ? disabledReason || 'Not available' : label}
      >
        <span>Open</span>
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

const cardStyle = (disabled) => ({
  display: 'flex', alignItems: 'center', gap: 16,
  background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(10,145,155,0.06)',
  border: `1px ${disabled ? 'dashed' : 'solid'} ${disabled ? '#2a2a30' : 'rgba(10,145,155,0.30)'}`,
  borderLeft: `2px solid ${disabled ? '#444' : '#0A919B'}`,
  borderRadius: 6,
  padding: 16,
  marginTop: 24,
});
const kickerStyle = {
  fontSize: 10, color: '#0A919B', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
};
const labelStyle = {
  fontSize: 14, color: '#e8e2d0', fontWeight: 600, marginBottom: 2,
};
const descStyle = {
  fontSize: 12, color: '#888', lineHeight: 1.5, marginTop: 2,
};
const disabledNoteStyle = {
  fontSize: 11, color: '#E8A82B', marginTop: 4, fontStyle: 'italic',
};
const btnStyle = (disabled) => ({
  background: disabled ? '#1a1a1f' : '#0A919B',
  color: disabled ? '#666' : '#0a0a0e',
  border: disabled ? '1px solid #2a2a30' : 'none',
  borderRadius: 5,
  padding: '8px 14px',
  fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  whiteSpace: 'nowrap', flexShrink: 0,
});
