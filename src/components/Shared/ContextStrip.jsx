/**
 * ContextStrip — small persistent breadcrumb below TopNav.
 *
 * Solves the "I clicked a tab, what am I looking at?" gap surfaced in
 * the 2026-06-08 UX audit. TopNav shows the section dropdown; client
 * picker shows the active client; but on tab change there's no single
 * place that says "Section / Tab · Active Client" all at once.
 *
 * Renders:
 *   [SectionIcon] Section / Tab  ·  [thumb] Active Client [pre-launch]
 *
 * Click the client name to swap clients (opens the existing picker).
 * Click the section to jump to the section's recommended tab. The
 * strip stays put across every workspace, so context is never more
 * than a glance away.
 */

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ALL_SECTIONS, sectionForTab } from '../../lib/navigation.js';

export default function ContextStrip({ tab, activeClient, onPickClient }) {
  const sectionId = sectionForTab(tab);
  const section = ALL_SECTIONS.find(s => s.id === sectionId);
  const tabMeta = section?.tabs.find(t => t.id === tab);

  // Don't render on public routes / auth screens where there's no real context.
  if (!section || !tabMeta) return null;

  const SectionIcon = section.icon;

  return (
    <div style={stripStyle}>
      <div style={leftStyle}>
        <SectionIcon size={13} style={{ color: '#666' }} />
        <span style={sectionLabelStyle}>{section.label}</span>
        <ChevronRight size={11} style={{ color: '#444' }} />
        <span style={tabLabelStyle}>
          {tabMeta.group && (
            <>
              <span style={{ color: '#666' }}>{tabMeta.group}</span>
              <span style={{ color: '#444', margin: '0 6px' }}>·</span>
            </>
          )}
          {tabMeta.label}
        </span>
      </div>

      {activeClient && (
        <button onClick={onPickClient} style={rightStyle} title="Switch client">
          <span style={{ color: '#666', fontSize: 10 }}>Client</span>
          <span style={separator}>·</span>
          {activeClient.is_prelaunch && (
            <span style={prelaunchBadgeStyle}>Pre-launch</span>
          )}
          <span style={clientNameStyle}>{activeClient.name}</span>
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const stripStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12,
  padding: '6px 24px',
  background: '#0a0a0e',
  borderBottom: '1px solid #1f1f24',
  fontSize: 11,
  flexWrap: 'wrap',
};
const leftStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
  minWidth: 0, overflow: 'hidden',
};
const rightStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: 'transparent', border: 'none', cursor: 'pointer',
  padding: '2px 6px', borderRadius: 4,
  fontFamily: 'inherit', fontSize: 11,
};
const sectionLabelStyle = {
  color: '#888', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10,
};
const tabLabelStyle = {
  color: '#cde4d6', fontWeight: 600,
  fontSize: 11,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const separator = { color: '#444' };
const clientNameStyle = {
  color: '#cde4d6', fontWeight: 600, fontSize: 11,
  maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const prelaunchBadgeStyle = {
  background: 'rgba(167,139,250,0.15)',
  color: '#a78bfa',
  border: '1px solid rgba(167,139,250,0.40)',
  borderRadius: 3, padding: '0 6px',
  fontSize: 9, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.5,
  whiteSpace: 'nowrap',
};
