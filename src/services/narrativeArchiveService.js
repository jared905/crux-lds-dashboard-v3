/**
 * Narrative Archive Service
 *
 * Persists quarterly narratives so future reports can reference prior
 * recommendations, wins, and challenges — enabling cross-period continuity
 * and retainer-justifying "here's what we predicted vs what happened" framing.
 */

import { supabase } from './supabaseClient';

/**
 * Save a generated narrative to the archive. Upserts on (channel_id, year, quarter)
 * so re-running a quarter's report overwrites the prior entry instead of duplicating.
 */
export async function saveNarrative({
  channelId,
  quarterYear,
  quarterNumber,
  narrative,
  metricsSnapshot,
}) {
  if (!supabase || !channelId || !narrative) return null;

  try {
    const payload = {
      channel_id: channelId,
      quarter_year: quarterYear,
      quarter_number: quarterNumber,
      executive_summary: narrative.executive_summary || null,
      recommendations: narrative.q2_recommendations || narrative.recommendations || null,
      wins: narrative.wins || null,
      challenges: narrative.challenges || null,
      trend_narrative: narrative.trend_narrative || null,
      raw_narrative: narrative,
      metrics_snapshot: metricsSnapshot || null,
      generated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('narrative_archive')
      .upsert(payload, { onConflict: 'channel_id,quarter_year,quarter_number' })
      .select('id')
      .single();

    if (error) {
      console.warn('[NarrativeArchive] Save failed:', error.message);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.warn('[NarrativeArchive] Save exception:', err);
    return null;
  }
}

/**
 * Fetch the last N archived narratives for a channel, strictly before the
 * given quarter. Returns newest-first.
 */
export async function fetchPriorNarratives(channelId, currentYear, currentQuarter, limit = 2) {
  if (!supabase || !channelId) return [];
  try {
    // Build a comparable ordering key: year*10 + quarter
    const currentKey = currentYear * 10 + currentQuarter;

    const { data, error } = await supabase
      .from('narrative_archive')
      .select('quarter_year, quarter_number, executive_summary, recommendations, trend_narrative, generated_at')
      .eq('channel_id', channelId)
      .order('quarter_year', { ascending: false })
      .order('quarter_number', { ascending: false })
      .limit(limit + 4); // fetch a buffer so we can filter out current/future

    if (error) {
      console.warn('[NarrativeArchive] Fetch failed:', error.message);
      return [];
    }

    return (data || [])
      .filter(row => (row.quarter_year * 10 + row.quarter_number) < currentKey)
      .slice(0, limit);
  } catch (err) {
    console.warn('[NarrativeArchive] Fetch exception:', err);
    return [];
  }
}

/**
 * Format prior narratives as a read-only history block for prompt injection.
 * Keeps each entry compact so we don't blow the context window.
 */
export function formatPriorNarrativesBlock(priorNarratives) {
  if (!priorNarratives?.length) {
    return '(No prior narratives archived — this is the first report for this channel.)';
  }

  const lines = [];
  for (const n of priorNarratives) {
    const label = `Q${n.quarter_number} ${n.quarter_year}`;
    lines.push(`--- ${label} ---`);
    if (n.executive_summary) {
      lines.push(`Executive summary: ${n.executive_summary}`);
    }
    if (n.trend_narrative) {
      lines.push(`Trend framing: ${n.trend_narrative}`);
    }
    if (Array.isArray(n.recommendations) && n.recommendations.length > 0) {
      lines.push('Prior recommendations:');
      n.recommendations.forEach((rec, i) => {
        const text = typeof rec === 'string' ? rec :
          (rec.title || rec.leading_claim || rec.recommendation || JSON.stringify(rec)).slice(0, 200);
        lines.push(`  ${i + 1}. ${text}`);
      });
    }
    lines.push('');
  }
  return lines.join('\n');
}

export default {
  saveNarrative,
  fetchPriorNarratives,
  formatPriorNarrativesBlock,
};
