/**
 * PreflightWorkspace — top-level home for the Pre-flight scorecard.
 *
 * Extracted from inside the Strategy Spine on 2026-06-03, when the
 * prediction machine outgrew being a section of the per-client spine
 * (Phase 2.5 added two new data sources; Phase 2.6 queues three more
 * dimensions). Sits in the top-level Strategy nav alongside
 * Opportunities, Feedback, and Calendar.
 *
 * Responsibilities:
 *   - Accept the user's currently-selected client (`activeClient`)
 *     from App-level state.
 *   - Empty-state when no client is selected: brief instruction +
 *     pointer to Clients (Portfolio).
 *   - Load that client's pillars so PreflightPanel can offer the
 *     pillar dropdown in the form.
 *   - Render PreflightPanel as the primary content.
 *
 * Everything else (cohort load, surface intelligence, scoring, LLM
 * read, history) stays inside PreflightPanel — that component has
 * the panel-level state machine. This workspace just supplies the
 * inputs and the page chrome.
 */

import React, { useEffect, useState } from 'react';
import PreflightPanel from './preflight/PreflightPanel.jsx';
import { listPillars } from '../../services/clientPillarsService.js';
import DataFreshnessBadge from './shared/DataFreshnessBadge.jsx';
import PrelaunchBadge from './shared/PrelaunchBadge.jsx';

export default function PreflightWorkspace({ activeClient }) {
  const [pillars, setPillars] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeClient?.id) {
        setPillars([]);
        return;
      }
      try {
        const list = await listPillars(activeClient.id);
        if (!cancelled) setPillars(list || []);
      } catch (err) {
        console.warn('[PreflightWorkspace] pillars load failed:', err);
        if (!cancelled) setPillars([]);
      }
    })();
    return () => { cancelled = true; };
  }, [activeClient?.id]);

  if (!activeClient?.id) {
    return (
      <div style={emptyShellStyle}>
        <div style={emptyHeaderStyle}>Pre-flight scorecard</div>
        <div style={emptyBodyStyle}>
          Pick a client from <strong style={{ color: '#cde4d6' }}>Operate → Clients</strong> first.
          The Pre-flight scorer reads the client's cohort audit data and surface intelligence, so it
          needs a specific channel context to score against.
        </div>
      </div>
    );
  }

  return (
    <div style={workspaceShellStyle}>
      <div style={workspaceHeaderStyle}>
        <div>
          <div style={kickerStyle}>Strategy · Pre-flight</div>
          <h1 style={titleStyle}>
            {activeClient.name}
            <span style={{ marginLeft: 12, display: 'inline-block', verticalAlign: 'middle' }}>
              <PrelaunchBadge client={activeClient} />
            </span>
          </h1>
          <div style={subtitleStyle}>
            Score concepts against the cohort + the channel's surface intelligence before greenlight.
            History persists per client; pick a target surface in the panel header.
          </div>
          <div style={{ marginTop: 10 }}>
            <DataFreshnessBadge clientId={activeClient.id} />
          </div>
        </div>
      </div>

      <PreflightPanel
        clientId={activeClient.id}
        clientName={activeClient.name}
        pillars={pillars}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Styles — match the dark editorial register the rest of the app uses
// ─────────────────────────────────────────────────────

const workspaceShellStyle = {
  padding: '20px 24px 40px',
  maxWidth: 1280,
  margin: '0 auto',
};
const workspaceHeaderStyle = {
  marginBottom: 18,
};
const kickerStyle = {
  fontSize: 11,
  color: '#0A919B',
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  fontWeight: 700,
  marginBottom: 4,
};
const titleStyle = {
  fontSize: 24,
  fontWeight: 700,
  color: '#e8e2d0',
  margin: 0,
};
const subtitleStyle = {
  fontSize: 13,
  color: '#888',
  marginTop: 6,
  lineHeight: 1.5,
  maxWidth: 720,
};

const emptyShellStyle = {
  padding: '60px 24px',
  maxWidth: 720,
  margin: '0 auto',
  textAlign: 'center',
};
const emptyHeaderStyle = {
  fontSize: 14,
  color: '#0A919B',
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  fontWeight: 700,
  marginBottom: 14,
};
const emptyBodyStyle = {
  fontSize: 14,
  color: '#888',
  lineHeight: 1.6,
};
