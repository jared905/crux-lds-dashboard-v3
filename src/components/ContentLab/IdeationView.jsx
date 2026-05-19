/**
 * IdeationView — top-level wrapper for the Ideation tab.
 *
 * Hosts two complementary ideation modes:
 *   - Series (default): SeriesIdeator — series-level concepts, two-stage
 *     workflow (browse → explore → greenlight). The strategic unit.
 *   - Standalone: VideoIdeaGenerator — original standalone-video ideation,
 *     kept for gap-filler / opportunistic ideas where a series is overkill.
 *
 * Series is the primary mode because modern YouTube growth is series-driven.
 * Standalone stays one click away for the cases that genuinely don't need
 * a series wrapper.
 */
import React, { useState } from 'react';
import { Layers, Film } from 'lucide-react';
import SeriesIdeator from './SeriesIdeator.jsx';
import VideoIdeaGenerator from './VideoIdeaGenerator.jsx';

const MODES = [
  { id: 'series', label: 'Series', icon: Layers, blurb: 'Series concepts with episode lines — strategic unit. Greenlit series become active plays.' },
  { id: 'standalone', label: 'Standalone videos', icon: Film, blurb: 'One-off video ideas — useful for gap-fillers and opportunistic topics.' },
];

export default function IdeationView({ data, activeClient }) {
  const [mode, setMode] = useState('series');
  const current = MODES.find(m => m.id === mode);
  return (
    <div style={{ padding: '4px 0' }}>
      <ModeTabs mode={mode} onChange={setMode} />
      {current?.blurb && (
        <div style={{ fontSize: 12, color: '#888', margin: '8px 4px 14px', lineHeight: 1.5 }}>
          {current.blurb}
        </div>
      )}
      {mode === 'series' && <SeriesIdeator activeClient={activeClient} />}
      {mode === 'standalone' && <VideoIdeaGenerator data={data} activeClient={activeClient} />}
    </div>
  );
}

function ModeTabs({ mode, onChange }) {
  return (
    <div style={{
      display: 'inline-flex', gap: 4,
      background: '#131316', border: '1px solid #1f1f24',
      borderRadius: 8, padding: 4,
    }}>
      {MODES.map(m => {
        const Icon = m.icon;
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 5,
              background: active ? '#1e3a5f' : 'transparent',
              color: active ? '#dbeafe' : '#a1a1aa',
              border: active ? '1px solid #2a4f7f' : '1px solid transparent',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            <Icon size={13} /> {m.label}
          </button>
        );
      })}
    </div>
  );
}
