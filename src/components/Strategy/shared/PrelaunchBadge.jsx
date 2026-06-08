/**
 * PrelaunchBadge — tiny chip that surfaces "this client doesn't have a
 * YouTube channel yet" on every Strategy workspace header.
 *
 * Renders only when the client is flagged is_prelaunch=true. Includes
 * the intended launch date if set. Strategist sees at a glance which
 * surfaces will be empty/N-A:
 *   - Pre-flight, Repositioning, Calibration: empty until launch (need client video data)
 *   - Brief, Cohort Roles, Competitor Scan, Strategy Spine: work immediately
 */

import React from 'react';
import { Sparkles } from 'lucide-react';

export default function PrelaunchBadge({ client }) {
  if (!client?.is_prelaunch) return null;

  const launchAt = client.prelaunch_intended_launch_at;
  let launchLabel = null;
  if (launchAt) {
    try {
      const d = new Date(launchAt);
      const today = new Date();
      const daysOut = Math.round((d.getTime() - today.getTime()) / 86_400_000);
      if (daysOut > 0)       launchLabel = `${daysOut} day${daysOut === 1 ? '' : 's'} to launch`;
      else if (daysOut === 0) launchLabel = 'launches today';
      else                    launchLabel = `${-daysOut} day${daysOut === -1 ? '' : 's'} past intended launch`;
    } catch { /* ignore */ }
  }

  return (
    <span style={badgeStyle} title="This client doesn't have a YouTube channel yet. Pre-flight / Repositioning / Calibration require client video data; they'll be N/A until launch. Brief, Cohort, and Competitor Scan all work today.">
      <Sparkles size={11} />
      <span>Pre-launch</span>
      {launchLabel && <span style={dateStyle}>· {launchLabel}</span>}
    </span>
  );
}

const badgeStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'rgba(167,139,250,0.12)',
  color: '#a78bfa',
  border: '1px solid rgba(167,139,250,0.35)',
  borderRadius: 4, padding: '3px 10px',
  fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.5,
  whiteSpace: 'nowrap',
};
const dateStyle = {
  color: '#aaa', fontWeight: 500, textTransform: 'none', letterSpacing: 0,
};
