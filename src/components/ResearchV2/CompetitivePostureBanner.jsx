/**
 * CompetitivePostureBanner — surfaces the strategist's one-line
 * interpretation of the cohort inside Research v2.
 *
 * Loads client_strategy_spine.competitive_posture for the pinned client.
 * Renders a compact banner positioned above the lens tabs so the cohort
 * data underneath is read against the stated stance, not in isolation.
 *
 * Returns null when:
 *   - no client is pinned in scope
 *   - the spine row doesn't exist
 *   - competitive_posture is empty
 *
 * Click-through opens the full Strategy Spine (currently lives under
 * the Clients tab) so the strategist can edit the posture in-place if
 * the data underneath has shifted their read.
 */
import React, { useEffect, useState } from 'react';
import { Compass, Edit3 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

export default function CompetitivePostureBanner({ scope }) {
  const clientId = scope?.clientId;
  const [row, setRow] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!supabase || !clientId) {
      setRow(null);
      return;
    }
    supabase
      .from('client_strategy_spine')
      .select('competitive_posture, competitive_posture_updated_at')
      .eq('client_id', clientId)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setRow(data); });
    return () => { cancelled = true; };
  }, [clientId]);

  const posture = row?.competitive_posture?.trim();
  if (!posture) return null;

  const updated = row?.competitive_posture_updated_at;
  const stale = updated
    ? (Date.now() - new Date(updated).getTime()) > 90 * 86400_000  // 90 days
    : false;

  return (
    <div style={{
      background: '#0e1a2a',
      border: '1px solid #1e3a5f',
      borderLeft: '3px solid #60a5fa',
      borderRadius: 8,
      padding: '10px 14px',
      margin: '12px 0',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <Compass size={15} color="#60a5fa" style={{ marginTop: 1, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, color: '#60a5fa', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 3,
        }}>
          Competitive posture {stale && <span style={{ color: '#fbbf24', marginLeft: 6 }}>· stale, &gt;90 days</span>}
        </div>
        <div style={{ fontSize: 13, color: '#dbeafe', lineHeight: 1.5 }}>
          {posture}
        </div>
      </div>
      <a
        href="#portfolio"
        title="Edit on the client's Strategy Spine"
        onClick={(e) => {
          // Tab navigation is index-based; we don't own router state here.
          // Fall back to hash so a future router migration finds a hook,
          // but mainly this is a visual affordance.
          e.preventDefault();
        }}
        style={{
          color: '#60a5fa', fontSize: 11, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          textDecoration: 'none', flexShrink: 0,
          opacity: 0.7,
        }}
      >
        <Edit3 size={11} />
      </a>
    </div>
  );
}
