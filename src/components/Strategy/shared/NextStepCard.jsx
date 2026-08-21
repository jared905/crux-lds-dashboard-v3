import { ArrowRight } from 'lucide-react';
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
  border: `1px ${disabled ? 'dashed' : 'solid'} ${disabled ? 'var(--outline-variant)' : 'rgba(10,145,155,0.30)'}`,
  borderLeft: '2px solid var(--border)',
  borderRadius: 6,
  padding: 16,
  marginTop: 24,
});
const kickerStyle = {
  fontSize: 10, color: 'var(--accent-text)', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
};
const labelStyle = {
  fontSize: 14, color: 'var(--ink)', fontWeight: 600, marginBottom: 2,
};
const descStyle = {
  fontSize: 12, color: 'var(--outline)', lineHeight: 1.5, marginTop: 2,
};
const disabledNoteStyle = {
  fontSize: 11, color: 'var(--warn)', marginTop: 4, fontStyle: 'italic',
};
const btnStyle = (disabled) => ({
  background: disabled ? 'var(--input-bg)' : 'var(--accent-text)',
  color: disabled ? 'var(--faint)' : 'var(--bg)',
  border: disabled ? '1px solid var(--border)' : 'none',
  borderRadius: 5,
  padding: '8px 14px',
  fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  whiteSpace: 'nowrap', flexShrink: 0,
});
