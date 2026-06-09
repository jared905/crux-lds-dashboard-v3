/**
 * AudienceQuickReference — small read-only persona summary on the
 * Strategy Spine page.
 *
 * The persona lives at Strategy → Audience and is consumed silently by
 * every LLM artifact. But the strategist editing the Spine should
 * still see at a glance that the persona exists (and what it says).
 * This card sits next to BusinessContext + SpineAutoFill and provides:
 *   - "Persona synthesized" / "No persona yet" status
 *   - Top items from each persona field (truncated)
 *   - A button to jump to the full Audience workspace
 *
 * Read-only here; edits happen in the Audience workspace.
 */

import React, { useEffect, useState } from 'react';
import { Users, ArrowRight, Sparkles } from 'lucide-react';
import { supabase } from '../../services/supabaseClient.js';

const FIELDS = [
  { key: 'pain_points',     label: 'Pain points', cap: 3 },
  { key: 'questions_asked', label: 'Questions asked', cap: 3 },
  { key: 'voice_patterns',  label: 'Voice patterns', cap: 2 },
];

export default function AudienceQuickReference({ clientId, onNavigateToAudience }) {
  const [persona, setPersona] = useState(null);
  const [synthesizedAt, setSynthesizedAt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('client_strategy_spine')
          .select('audience_persona, audience_persona_synthesized_at')
          .eq('client_id', clientId)
          .maybeSingle();
        if (cancelled) return;
        setPersona(data?.audience_persona || null);
        setSynthesizedAt(data?.audience_persona_synthesized_at || null);
      } catch (err) {
        // non-fatal
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading) return null;

  const accent = persona ? '#0A919B' : '#a78bfa';

  return (
    <div style={panelStyle(accent)}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={16} style={{ color: accent }} />
          <div>
            <div style={kickerStyle(accent)}>Audience persona</div>
            <div style={subtitleStyle}>
              {persona
                ? <>Synthesized {synthesizedAt ? new Date(synthesizedAt).toLocaleDateString() : 'never'}. Consumed silently by brief + alt titles + memos.</>
                : <>No persona yet. Synthesize from existing signals (search queries + Spine + pillars + business context).</>
              }
            </div>
          </div>
        </div>
        <button onClick={onNavigateToAudience} style={ctaBtnStyle(accent)}>
          {persona
            ? <>View<ArrowRight size={11} /></>
            : <><Sparkles size={11} /> Synthesize</>
          }
        </button>
      </div>

      {persona && (
        <div style={fieldsStyle}>
          {FIELDS.map(f => {
            const items = (persona[f.key] || []).slice(0, f.cap);
            if (items.length === 0) return null;
            return (
              <div key={f.key} style={fieldRowStyle}>
                <div style={fieldLabelStyle}>{f.label}</div>
                <div style={fieldItemsStyle}>
                  {items.join(' · ')}
                  {(persona[f.key]?.length || 0) > f.cap && (
                    <span style={{ color: '#666', marginLeft: 6 }}>
                      +{persona[f.key].length - f.cap} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const panelStyle = (accent) => ({
  background: 'rgba(10,145,155,0.04)',
  border: '1px solid rgba(10,145,155,0.20)',
  borderLeft: `2px solid ${accent}`,
  borderRadius: 8, padding: 14,
  marginBottom: 16,
});
const headerStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
};
const kickerStyle = (accent) => ({
  fontSize: 10, color: accent,
  textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700,
});
const subtitleStyle = {
  fontSize: 12, color: '#888', marginTop: 2, lineHeight: 1.45,
};
const ctaBtnStyle = (accent) => ({
  background: accent, color: '#0a0a0e',
  border: 'none', borderRadius: 4,
  padding: '5px 12px', fontSize: 11, fontWeight: 700,
  cursor: 'pointer', letterSpacing: 0.3,
  display: 'inline-flex', alignItems: 'center', gap: 4,
});

const fieldsStyle = {
  marginTop: 12, paddingTop: 12,
  borderTop: '1px dashed rgba(10,145,155,0.30)',
  display: 'flex', flexDirection: 'column', gap: 6,
};
const fieldRowStyle = { display: 'flex', gap: 10, alignItems: 'flex-start' };
const fieldLabelStyle = {
  fontSize: 10, color: '#888',
  textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600,
  flexShrink: 0, width: 110,
};
const fieldItemsStyle = {
  fontSize: 12, color: '#cde4d6', lineHeight: 1.4, flex: 1,
};
