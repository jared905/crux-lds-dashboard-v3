/**
 * Weekly brief generator — converts analytical state into a strategist-
 * facing 4-5 bullet brief.
 *
 * The gap this closes: every other surface in Crux produces diagnostic
 * data (calibration %, audit findings, cohort composition). A strategist
 * still has to translate that into client-facing recommendations. The
 * brief is that translation, generated automatically.
 *
 * Output format: markdown, 4-5 numbered bullets. Action-led, evidence-
 * cited, calibration-honest, brand-register-aware. Designed to be the
 * artifact the strategist sends/reads to the client — not the analytics.
 *
 * Architecture:
 *   - Pure orchestrator. No persistence here (see weeklyBriefsService).
 *   - Pulls the latest non-archived audit + calibration + Spine + business
 *     context + cohort composition. Strategist can also pass explicit
 *     audit/calibration IDs to pin to a specific source set.
 *   - Versioned prompt (BRIEF_PROMPT_VERSION). Bumping invalidates
 *     cached briefs.
 *   - Brand-register-aware via Strategy Spine — same convention as
 *     strategicReadService + executiveMemoService.
 */

import { supabase } from './supabaseClient';
import claudeAPI from './claudeAPI';
import { getCohortComposition } from './cohortRolesService';

export const BRIEF_PROMPT_VERSION = 'v1-weekly-brief';
const DEFAULT_MODEL = 'claude-sonnet-4-5';

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

/**
 * Generate a weekly strategist brief for a client.
 *
 * @param {Object} args
 * @param {string} args.clientId
 * @param {string} [args.clientName]              — for header context
 * @param {string} [args.auditId]                 — pin to specific audit; defaults to latest
 * @param {string} [args.calibrationRunId]        — pin to specific calibration; defaults to latest
 * @returns {Promise<{ text, promptVersion, sourceAuditId, sourceCalibrationRunId, model, error? }>}
 */
export async function generateWeeklyBrief({
  clientId,
  clientName = null,
  auditId = null,
  calibrationRunId = null,
}) {
  if (!clientId) return { error: 'clientId required' };

  // 1) Load all source data in parallel.
  const [spine, businessContext, audit, calibration, cohortComp, clientChannel] = await Promise.all([
    loadSpine(clientId),
    loadActiveBusinessContext(clientId),
    auditId ? loadAuditById(auditId) : loadLatestAudit(clientId),
    calibrationRunId ? loadCalibrationById(calibrationRunId) : loadLatestCalibration(clientId),
    getCohortComposition(clientId).catch(() => null),
    loadClientChannel(clientId),
  ]);

  if (!audit) {
    return { error: 'No repositioning audit found for this client. Run an audit at Strategy → Repositioning first.' };
  }
  if (!calibration) {
    return { error: 'No calibration run found. Run calibration at Strategy → Calibration first (needs the audit you just ran as the source).' };
  }

  // 2) Build the user prompt.
  const userPrompt = buildUserPrompt({
    clientName:    clientName || clientChannel?.name || 'this client',
    clientChannel,
    spine,
    businessContext,
    audit,
    calibration,
    cohortComp,
  });

  // 3) Call Claude.
  try {
    const result = await claudeAPI.call(
      userPrompt,
      SYSTEM_PROMPT,
      'weekly_strategist_brief',
      2200,                       // ~4-5 bullets fits comfortably
    );
    const text = (result?.text || '').trim();
    if (!text) {
      return { error: 'LLM returned empty brief', promptVersion: BRIEF_PROMPT_VERSION };
    }
    return {
      text,
      promptVersion:          BRIEF_PROMPT_VERSION,
      sourceAuditId:          audit.id,
      sourceCalibrationRunId: calibration.id,
      model:                  DEFAULT_MODEL,
    };
  } catch (err) {
    console.warn('[weeklyBrief] generation failed:', err);
    return { error: err?.message || 'unknown error', promptVersion: BRIEF_PROMPT_VERSION };
  }
}

// ──────────────────────────────────────────────────
// Source data loaders
// ──────────────────────────────────────────────────

async function loadSpine(clientId) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('client_strategy_spine')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  return data || null;
}

async function loadActiveBusinessContext(clientId) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('client_business_context')
    .select('products_offered, products_not_offered, target_market, one_line_summary')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();
  return data || null;
}

async function loadLatestAudit(clientId) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('client_repositioning_audits')
    .select('id, created_at, mode, videos_scored, format_filter, composite_distribution, dimension_breakdowns, systemic_gaps, systemic_strengths')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function loadAuditById(id) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('client_repositioning_audits')
    .select('id, created_at, mode, videos_scored, format_filter, composite_distribution, dimension_breakdowns, systemic_gaps, systemic_strengths')
    .eq('id', id)
    .maybeSingle();
  return data || null;
}

async function loadLatestCalibration(clientId) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('client_calibration_runs')
    .select('id, created_at, baseline_strategy, videos_calibrated, composite_accuracy, composite_adjacent_accuracy, composite_metrics, per_dimension_metrics, per_format_metrics, format_split_enabled, mismatched_videos')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function loadCalibrationById(id) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('client_calibration_runs')
    .select('id, created_at, baseline_strategy, videos_calibrated, composite_accuracy, composite_adjacent_accuracy, composite_metrics, per_dimension_metrics, per_format_metrics, format_split_enabled, mismatched_videos')
    .eq('id', id)
    .maybeSingle();
  return data || null;
}

async function loadClientChannel(clientId) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('channels')
    .select('id, name, subscriber_count, total_view_count')
    .eq('id', clientId)
    .maybeSingle();
  return data || null;
}

// ──────────────────────────────────────────────────
// Prompt construction
// ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior YouTube strategist drafting a weekly brief for a specific client. The brief is the artifact the strategist will read with the client (or send them) — concrete, actionable, defensible.

OUTPUT FORMAT: GitHub-flavored markdown. 4-5 numbered bullets. No preamble, no closing remarks, no headers — just the numbered list.

EACH BULLET MUST:
1. Lead with an action — verb-first, imperative ("Keep filming on retirement-planning topics" not "It would be beneficial to continue...")
2. Follow with the reasoning, citing specific evidence from the data provided (calibration accuracy numbers, audit findings, cohort composition, specific videos by name when relevant)
3. Honestly acknowledge calibration confidence — if a dimension or format has low calibration accuracy, frame its read as a hypothesis worth testing, not a verdict
4. Stay within the brand register declared in the Strategy Spine

THE 4-5 BULLETS SHOULD COLLECTIVELY:
- Name what's working (so the client doesn't second-guess strengths)
- Name the highest-leverage thing to change THIS WEEK (specific, testable)
- Name what to ignore / not act on (calibration-driven; protects against bad advice when the scorer is unreliable)
- Reference specific videos or specific cohort findings when they sharpen the point

TONE + LANGUAGE RULES:
- NO hype words: leverage, unlock, robust, innovative, compelling, drives, taps into, resonates with, powerful, game-changer, cutting-edge
- NO view-count promises ("expect 50K views")
- NO generic advice ("post consistently" or "engage your audience" — every strategist's worst sin)
- When calibration is low for a dimension/format, SAY SO explicitly. E.g.: "Calibration shows the scorer is 21% accurate on Shorts — treat per-tier Shorts predictions as noise; trust producer judgment."
- Brand-register check: if the channel's voice + editorial POV indicate trust-sensitive (finance, legal, medical, professional services), keep recommendations defensible and avoid hype-flavored production suggestions even when cohort data supports them.

WHAT NOT TO INCLUDE:
- "Here's your weekly brief for..." preamble
- Recap of what the data is — the strategist already knows; jump straight to recommendations
- More than 5 bullets (4 is fine, fewer is fine — quality over quantity)
- Sub-bullets — each numbered item is one tight paragraph

This brief is what makes the strategist's job legible to the client. Write it like the senior person in the room writing it.`;

function buildUserPrompt({ clientName, clientChannel, spine, businessContext, audit, calibration, cohortComp }) {
  const lines = [];

  // ── Client header ──
  lines.push(`CLIENT: ${clientName}`);
  if (clientChannel?.subscriber_count) {
    lines.push(`Channel scale: ${formatN(clientChannel.subscriber_count)} subscribers · ${formatN(clientChannel.total_view_count)} total views`);
  }
  lines.push('');

  // ── Brand register / Spine ──
  if (spine) {
    const spineFields = [];
    if (spine.positioning_oneliner?.trim())     spineFields.push(`Positioning: ${spine.positioning_oneliner.trim()}`);
    if (spine.audience_read?.trim())            spineFields.push(`Audience: ${spine.audience_read.trim()}`);
    if (spine.editorial_pov?.trim())            spineFields.push(`Editorial POV: ${spine.editorial_pov.trim()}`);
    if (spine.voice_tone?.trim())               spineFields.push(`Voice + tone: ${spine.voice_tone.trim()}`);
    if (spine.competitive_posture?.trim())      spineFields.push(`Competitive posture: ${spine.competitive_posture.trim()}`);
    if (spine.guardrails?.trim())               spineFields.push(`Guardrails (what NOT to do): ${spine.guardrails.trim()}`);
    if (spine.quarterly_stance?.trim())         spineFields.push(`Current quarterly stance: ${spine.quarterly_stance.trim()}`);
    if (spineFields.length) {
      lines.push('STRATEGY SPINE (use as register + alignment anchor):');
      spineFields.forEach(s => lines.push(`- ${s}`));
      lines.push('');
    }
  }

  // ── Business context ──
  if (businessContext) {
    lines.push('BUSINESS CONTEXT:');
    if (businessContext.one_line_summary?.trim())     lines.push(`- ${businessContext.one_line_summary.trim()}`);
    if (businessContext.products_offered?.trim())     lines.push(`- Sells: ${businessContext.products_offered.trim()}`);
    if (businessContext.products_not_offered?.trim()) lines.push(`- Does NOT sell: ${businessContext.products_not_offered.trim()}`);
    if (businessContext.target_market?.trim())        lines.push(`- Target market: ${businessContext.target_market.trim()}`);
    lines.push('');
  }

  // ── Cohort composition ──
  if (cohortComp) {
    lines.push('COHORT COMPOSITION (predictive = peer):');
    lines.push(`- Peer: ${cohortComp.peer} channels${cohortComp.peer_avg_subscribers ? ` (avg ${formatN(cohortComp.peer_avg_subscribers)} subs)` : ''}`);
    lines.push(`- Aspirational: ${cohortComp.aspirational} channels${cohortComp.aspirational_avg_subscribers ? ` (avg ${formatN(cohortComp.aspirational_avg_subscribers)} subs)` : ''}`);
    lines.push(`- Reference: ${cohortComp.reference} channels`);
    lines.push('');
  }

  // ── Repositioning audit findings ──
  lines.push(`LATEST REPOSITIONING AUDIT (${new Date(audit.created_at).toLocaleDateString()}):`);
  lines.push(`- ${audit.videos_scored} videos scored${audit.format_filter ? ` · format filter: ${audit.format_filter}` : ' · all formats'}`);
  if (audit.composite_distribution) {
    const d = audit.composite_distribution;
    lines.push(`- Composite tiers: ${d.very_likely_outperform || 0} very_likely / ${d.likely_solid || 0} likely_solid / ${d.risky || 0} risky / ${d.predicted_under || 0} predicted_under`);
  }
  if (audit.systemic_strengths?.length) {
    lines.push('- Systemic strengths (dimensions where >50% of client catalog scores likely_solid+):');
    audit.systemic_strengths.forEach(s => lines.push(`    · ${s.dimension}: ${Math.round((s.share_over || 0) * 100)}% over`));
  }
  if (audit.systemic_gaps?.length) {
    lines.push('- Systemic gaps (dimensions where >60% of client catalog scores risky+predicted_under):');
    audit.systemic_gaps.forEach(g => lines.push(`    · ${g.dimension}: ${Math.round((g.share_under || 0) * 100)}% under`));
  }
  if (audit.dimension_breakdowns) {
    lines.push('- Per-dimension distribution (very_likely / likely_solid / risky / predicted_under / N/A):');
    for (const [dim, dist] of Object.entries(audit.dimension_breakdowns)) {
      lines.push(`    · ${dim}: ${dist.very_likely_outperform || 0} / ${dist.likely_solid || 0} / ${dist.risky || 0} / ${dist.predicted_under || 0} / ${dist.null_count || 0}`);
    }
  }
  lines.push('');

  // ── Calibration findings ──
  lines.push(`LATEST CALIBRATION (${new Date(calibration.created_at).toLocaleDateString()}, baseline: ${calibration.baseline_strategy}):`);
  if (calibration.composite_accuracy != null) {
    lines.push(`- Pooled composite: ${Math.round(calibration.composite_accuracy * 100)}% exact / ${Math.round((calibration.composite_adjacent_accuracy || 0) * 100)}% within ±1 tier (n=${calibration.videos_calibrated})`);
  }

  // Format-split metrics — the load-bearing diagnostic when present
  if (calibration.format_split_enabled && calibration.per_format_metrics) {
    const pf = calibration.per_format_metrics;
    for (const fmt of ['shorts', 'long_form']) {
      const block = pf[fmt];
      if (!block || block.insufficientData) continue;
      const exact = block.compositeAccuracy != null ? Math.round(block.compositeAccuracy * 100) : null;
      const adj   = block.compositeAdjacentAccuracy != null ? Math.round(block.compositeAdjacentAccuracy * 100) : null;
      lines.push(`- ${fmt === 'shorts' ? 'Shorts' : 'Long-form'} only: ${exact}% exact / ${adj}% within ±1 tier (n=${block.n})`);
    }
  }

  // Trust ranking (which dimensions calibrate well)
  if (calibration.per_dimension_metrics) {
    const dims = Object.entries(calibration.per_dimension_metrics)
      .filter(([, m]) => m && m.n > 0)
      .map(([k, m]) => ({ k, accuracy: m.accuracy || 0, adj: m.adjacent_accuracy || 0, n: m.n }))
      .sort((a, b) => b.accuracy - a.accuracy);
    if (dims.length) {
      lines.push('- Trust ranking (most-to-least reliable dimension, exact % / ±1% / n):');
      dims.forEach(d => lines.push(`    · ${d.k}: ${Math.round(d.accuracy * 100)}% / ${Math.round(d.adj * 100)}% (n=${d.n})`));
    }
  }

  // Top mismatches — qualitative input for "what's actually working that scorer is wrong about"
  if (calibration.mismatched_videos?.length) {
    const topMismatches = calibration.mismatched_videos.slice(0, 5);
    lines.push('- Top high-traffic mismatches (predicted ≠ actual):');
    topMismatches.forEach(v => {
      lines.push(`    · "${v.title}" (${formatN(v.view_count)} views, ${v.format}) — predicted ${v.predicted_composite_tier}, actual ${v.actual_tier}`);
    });
  }

  lines.push('');
  lines.push('Draft the weekly strategist brief. 4-5 numbered bullets in markdown. Action-led, evidence-cited, calibration-honest, brand-register-aware. No preamble, no closing, no headers.');
  return lines.join('\n');
}

function formatN(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default { generateWeeklyBrief, BRIEF_PROMPT_VERSION };
