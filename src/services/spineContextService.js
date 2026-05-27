/**
 * Spine context — the formatted prompt block prepended to every AI
 * generation that targets a specific client.
 *
 * Purpose: a guardrail that is not in the prompt is decoration. By
 * pulling the strategists positioning + audience + stance + active plays
 * + guardrails into the system prompt on every Claude call, the strategic
 * narrative becomes load-bearing across every artifact (audit pack,
 * intelligence brief, ideation, briefs, etc.) instead of being a doc
 * the strategist re-reads in isolation.
 *
 * Usage:
 *   const spineBlock = await buildSpineContext(clientId);
 *   const systemPrompt = spineBlock + originalSystemPrompt;
 *   await claudeAPI.call(prompt, systemPrompt, 'audit-briefing');
 *
 * Empty string is returned when no spine exists or no fields are
 * authored yet — safe to concatenate unconditionally.
 */
import { supabase } from './supabaseClient';

const PLAY_STATUS_LABELS = {
  in_flight: 'in flight',
  concluded_won: 'concluded — won',
  concluded_lost: 'concluded — lost',
  paused: 'paused',
};

/**
 * Load a spine and format it as a Claude-readable strategic context
 * block. Returns '' when there's nothing material to inject so callers
 * can prepend unconditionally.
 */
export async function buildSpineContext(clientId, { clientName } = {}) {
  if (!supabase || !clientId) return '';
  const [spineRes, businessRes] = await Promise.all([
    supabase
      .from('client_strategy_spine')
      .select('positioning_oneliner, positioning_hypothesis, audience_read, quarterly_stance, quarterly_stance_label, active_plays, guardrails, competitive_posture, editorial_pov, voice_tone, host_archetype')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase
      .from('client_business_context')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  const spine = spineRes.data;
  const businessContext = businessRes.data;
  if (!spine && !businessContext) return '';

  // Business context leads when present — what the company DOES bounds
  // every downstream recommendation. Without this, the AI happily
  // proposes content categories the client doesn't operate in.
  const parts = [];
  if (businessContext) {
    const businessBlock = formatBusinessForPrompt(businessContext);
    if (businessBlock) parts.push(businessBlock);
  }
  if (spine) {
    const spineBlock = formatSpineForPrompt(spine, { clientName });
    if (spineBlock) parts.push(spineBlock);
  }
  return parts.join('\n\n');
}

// Internal — same shape as the formatter exported from
// clientBusinessContextService.js, but duplicated here to keep this
// module dependency-free of the business-context service (avoids a
// circular import: businessContext → spine → businessContext).
function formatBusinessForPrompt(row) {
  if (!row) return '';
  const parts = [];
  if (row.one_line_summary?.trim()) parts.push(`BUSINESS SUMMARY:\n${row.one_line_summary.trim()}`);
  if (row.products_offered?.trim()) parts.push(`PRODUCTS / SERVICES OFFERED:\n${row.products_offered.trim()}`);
  if (row.products_not_offered?.trim()) {
    parts.push(`PRODUCTS / SERVICES NOT OFFERED (do not recommend content in these categories):\n${row.products_not_offered.trim()}`);
  }
  if (row.target_market?.trim()) parts.push(`TARGET MARKET:\n${row.target_market.trim()}`);
  return parts.length ? `=== CLIENT BUSINESS CONTEXT ===\n${parts.join('\n\n')}\n=== END CLIENT BUSINESS CONTEXT ===` : '';
}

/**
 * Format a spine row as a prompt block. Public so callers that already
 * hold a spine row don't have to refetch.
 */
export function formatSpineForPrompt(spine, { clientName } = {}) {
  if (!spine) return '';

  const sections = [];

  // One-liner leads — it's the headline the rest of the spine elaborates.
  if (spine.positioning_oneliner?.trim()) {
    sections.push(`CHANNEL ARTICULATION (one-liner — the headline):\n${spine.positioning_oneliner.trim()}`);
  }
  if (spine.positioning_hypothesis?.trim()) {
    sections.push(`POSITIONING HYPOTHESIS:\n${spine.positioning_hypothesis.trim()}`);
  }
  if (spine.competitive_posture?.trim()) {
    sections.push(`COMPETITIVE POSTURE (vs cohort):\n${spine.competitive_posture.trim()}`);
  }
  if (spine.editorial_pov?.trim()) {
    sections.push(`EDITORIAL POV + MISSION:\n${spine.editorial_pov.trim()}`);
  }
  if (spine.audience_read?.trim()) {
    sections.push(`AUDIENCE READ (strategists interpretation):\n${spine.audience_read.trim()}`);
  }
  if (spine.voice_tone?.trim()) {
    sections.push(`VOICE + TONE (affirmative — what the channel sounds like):\n${spine.voice_tone.trim()}`);
  }
  if (spine.host_archetype?.trim()) {
    sections.push(`HOST ARCHETYPE:\n${spine.host_archetype.trim()}`);
  }
  if (spine.quarterly_stance?.trim()) {
    const label = spine.quarterly_stance_label?.trim();
    sections.push(`CURRENT STRATEGIC STANCE${label ? ` · ${label}` : ''}:\n${spine.quarterly_stance.trim()}`);
  }

  const plays = Array.isArray(spine.active_plays) ? spine.active_plays : [];
  const inFlight = plays.filter(p => p.status === 'in_flight');
  const concluded = plays.filter(p => p.status === 'concluded_won' || p.status === 'concluded_lost');
  if (inFlight.length || concluded.length) {
    const lines = [];
    if (inFlight.length) {
      lines.push('In flight:');
      for (const p of inFlight) {
        lines.push(`  - ${p.name}${p.hypothesis ? ` — ${p.hypothesis}` : ''}`);
      }
    }
    if (concluded.length) {
      lines.push('Concluded (do not re-recommend without new evidence):');
      for (const p of concluded) {
        lines.push(`  - ${p.name} (${PLAY_STATUS_LABELS[p.status]})${p.hypothesis ? ` — ${p.hypothesis}` : ''}`);
      }
    }
    sections.push(`ACTIVE PLAYS:\n${lines.join('\n')}`);
  }

  if (spine.guardrails?.trim()) {
    sections.push(`GUARDRAILS — DO NOT RECOMMEND / DO NOT GENERATE:\n${spine.guardrails.trim()}`);
  }

  if (!sections.length) return '';

  const header = clientName
    ? `STRATEGIC CONTEXT FOR ${clientName} — read before generating; align all output to this stance and respect the guardrails as hard constraints.`
    : `STRATEGIC CONTEXT — read before generating; align all output to this stance and respect the guardrails as hard constraints.`;

  return `${header}\n\n${sections.join('\n\n')}\n\n---\n\n`;
}

export default { buildSpineContext, formatSpineForPrompt };
