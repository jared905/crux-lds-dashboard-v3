/**
 * Research v2 — entrypoint and lens router.
 *
 * One page, sticky scope picker, four lenses (Landscape / Patterns /
 * White Space / Movement). See mockups/research/ for the spec.
 */
import React, { useState } from 'react';
import { Globe, BarChart3, Square, Inbox } from 'lucide-react';
import ScopeBar from './ScopeBar.jsx';
import LandscapeLens from './LandscapeLens.jsx';

const LENS_TABS = [
  { id: 'landscape', label: 'Landscape', icon: BarChart3, status: 'live' },
  { id: 'patterns', label: 'Patterns', icon: Globe, status: 'coming' },
  { id: 'whitespace', label: 'White Space', icon: Square, status: 'coming' },
  { id: 'movement', label: 'Movement', icon: Inbox, status: 'coming' },
];

export default function ResearchV2() {
  const [activeLens, setActiveLens] = useState('landscape');
  const [scope, setScope] = useState({
    categoryIds: [],
    tags: [],
    tiers: ['priority', 'tracked'],
    search: '',
    windowDays: 30,
  });
  const [alertCount, setAlertCount] = useState(0);

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1500px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>
          Research <span style={{ fontSize: '13px', fontWeight: 500, color: '#707070', marginLeft: '10px' }}>
            Competitor intelligence hub
          </span>
        </h1>
      </div>

      <ScopeBar scope={scope} onChange={setScope} />

      {/* Lens tabs */}
      <div style={{
        display: 'flex',
        gap: 2,
        margin: '16px 0 20px',
        borderBottom: '1px solid #1f1f24',
      }}>
        {LENS_TABS.map(t => {
          const isActive = activeLens === t.id;
          const isLive = t.status === 'live';
          return (
            <button
              key={t.id}
              onClick={() => isLive && setActiveLens(t.id)}
              disabled={!isLive}
              style={{
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 600,
                color: isActive ? '#fff' : (isLive ? '#888' : '#444'),
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${isActive ? '#3b82f6' : 'transparent'}`,
                marginBottom: '-1px',
                cursor: isLive ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontFamily: 'inherit',
              }}
            >
              <t.icon size={14} />
              {t.label}
              {!isLive && (
                <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '3px', background: '#1c1c20', color: '#666', letterSpacing: '0.5px' }}>SOON</span>
              )}
              {t.id === 'movement' && alertCount > 0 && (
                <span style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '99px',
                  background: 'rgba(239,68,68,0.18)',
                  color: '#f87171',
                  fontWeight: 700,
                  minWidth: '18px',
                  textAlign: 'center',
                }}>
                  {alertCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active lens content */}
      {activeLens === 'landscape' && <LandscapeLens scope={scope} />}
    </div>
  );
}
