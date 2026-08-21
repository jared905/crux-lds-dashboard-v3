/**
 * ContextStrip — persistent strip below TopNav: section, its pages,
 * and the active client, all in one glance.
 *
 * Grew out of the 2026-06-08 "you are here" breadcrumb. The 2026-08
 * round of notes asked for more: once inside a section (say Research),
 * moving between its pages required reopening the top-bar dropdown.
 * The strip now renders every page of the current section as a pill,
 * so sibling pages are one click away. Grouped sections (Operate,
 * Strategy) keep their group labels as quiet dividers.
 *
 * Mobile: wrapping pills + group labels turned into a three-line
 * jumble, so the strip collapses to a single horizontally swipeable
 * pill row (group labels dropped, active pill scrolled into view)
 * with the client line stacked beneath.
 */

import {useEffect, useRef} from 'react';
import { ALL_SECTIONS, sectionForTab } from '../../lib/navigation.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { ChevronRight } from 'lucide-react';

export default function ContextStrip({ tab, activeClient, onPickClient, setTab, canAccessTab }) {
  const { isMobile } = useMediaQuery();
  const scrollerRef = useRef(null);

  const sectionId = sectionForTab(tab);
  const section = ALL_SECTIONS.find(s => s.id === sectionId);
  const tabMeta = section?.tabs.find(t => t.id === tab);

  // Keep the active pill visible when the row scrolls horizontally.
  useEffect(() => {
    if (!isMobile || !scrollerRef.current) return;
    const active = scrollerRef.current.querySelector('[aria-current="page"]');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [isMobile, tab]);

  // Don't render on public routes / auth screens where there's no real context.
  if (!section || !tabMeta) return null;

  const SectionIcon = section.icon;
  const visibleTabs = section.tabs.filter(t => !canAccessTab || canAccessTab(t.id));

  // Interleave group labels where the group changes (Strategy: Diagnose/Decide/Track).
  // On mobile the labels cost more space than they clarify — pills only.
  const items = [];
  let lastGroup = null;
  for (const t of visibleTabs) {
    if (!isMobile && t.group && t.group !== lastGroup) {
      items.push({ kind: 'group', label: t.group, key: `g-${t.group}` });
    }
    lastGroup = t.group || lastGroup;
    items.push({ kind: 'tab', tab: t, key: t.id });
  }

  const pills = (
    <nav
      ref={scrollerRef}
      aria-label={`${section.label} pages`}
      className={isMobile ? 'subnav-scroll' : undefined}
      style={isMobile ? pillsRowMobileStyle : pillsRowStyle}
    >
      {items.map(item =>
        item.kind === 'group' ? (
          <span key={item.key} style={groupLabelStyle}>{item.label}</span>
        ) : (
          <button
            key={item.key}
            className="subnav-pill"
            aria-current={item.tab.id === tab ? 'page' : undefined}
            onClick={() => setTab && setTab(item.tab.id)}
            style={isMobile ? { flexShrink: 0 } : undefined}
          >
            {item.tab.label}
          </button>
        )
      )}
    </nav>
  );

  const clientButton = activeClient && (
    <button onClick={onPickClient} style={rightStyle} title="Switch client">
      <span style={{ color: 'var(--faint)', fontSize: 10 }}>Client</span>
      <span style={separator}>·</span>
      {activeClient.is_prelaunch && (
        <span style={prelaunchBadgeStyle}>Pre-launch</span>
      )}
      <span style={clientNameStyle}>{activeClient.name}</span>
    </button>
  );

  if (isMobile) {
    return (
      <div style={stripMobileStyle}>
        <div style={mobileRowStyle}>
          <SectionIcon size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />
          <span style={sectionLabelStyle}>{section.label}</span>
          <ChevronRight size={11} style={{ color: 'var(--outline-variant)', flexShrink: 0 }} />
          {pills}
        </div>
        {clientButton && <div style={mobileClientRowStyle}>{clientButton}</div>}
      </div>
    );
  }

  return (
    <div style={stripStyle}>
      <div style={leftStyle}>
        <SectionIcon size={13} style={{ color: 'var(--faint)', flexShrink: 0 }} />
        <span style={sectionLabelStyle}>{section.label}</span>
        <ChevronRight size={11} style={{ color: 'var(--outline-variant)', flexShrink: 0 }} />
        {pills}
      </div>
      {clientButton}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────

const stripStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12,
  padding: '4px 24px',
  background: 'var(--bg)',
  borderBottom: '1px solid var(--border)',
  fontSize: 11,
  flexWrap: 'wrap',
};
const stripMobileStyle = {
  display: 'flex', flexDirection: 'column', gap: 2,
  padding: '6px 12px 4px',
  background: 'var(--bg)',
  borderBottom: '1px solid var(--border)',
  fontSize: 11,
};
const mobileRowStyle = {
  display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
};
const mobileClientRowStyle = {
  display: 'flex', alignItems: 'center', minWidth: 0,
};
const leftStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
  minWidth: 0, flexWrap: 'wrap',
};
const pillsRowStyle = {
  display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
};
const pillsRowMobileStyle = {
  display: 'flex', alignItems: 'center', gap: 4,
  flexWrap: 'nowrap', overflowX: 'auto', minWidth: 0, flex: 1,
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'none',
  padding: '2px 0',
};
const rightStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: 'transparent', border: 'none', cursor: 'pointer',
  padding: '2px 6px', borderRadius: 4,
  fontFamily: 'inherit', fontSize: 11,
  minWidth: 0,
};
const sectionLabelStyle = {
  color: 'var(--outline)', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10,
  flexShrink: 0,
};
const groupLabelStyle = {
  color: 'var(--faint)', fontSize: 9, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.8,
  margin: '0 4px 0 10px',
};
const separator = { color: 'var(--outline-variant)' };
const clientNameStyle = {
  color: 'var(--text)', fontWeight: 600, fontSize: 11,
  maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const prelaunchBadgeStyle = {
  background: 'var(--tert-bg)',
  color: 'var(--tert)',
  border: '1px solid var(--tert-border)',
  borderRadius: 3, padding: '0 6px',
  fontSize: 9, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.5,
  whiteSpace: 'nowrap',
};
