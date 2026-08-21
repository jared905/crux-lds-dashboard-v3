/**
 * diagnosticSynthesisService — the strategic-state synthesis layer.
 *
 * Built 2026-06-19 as the Phase 2 build of the Diagnostic Synthesis
 * surface. Reads every upstream signal Crux has on a client (Spine,
 * persona, cohort distributions, audit, calibration, recent uploads,
 * platform mechanics) and asks Claude to synthesize:
 *
 *   - strategic_state: one sentence — "what's true about this client right now"
 *   - leverage_points: top 3 highest-leverage moves with provenance + mechanic citations
 *   - risks: top 3 risks with what would catch them early
 *   - unblockers: missing inputs that prevent the next strategist decision
 *   - changes_since_last: diff narrative (added in Ship 3 once history exists)
 *
 * Discipline encoded in the prompt (same family as weeklyBriefService v7):
 *   - Every claim is either data-backed (cited to specific input) or
 *     labeled Hypothesis (with validation method)
 *   - Mechanics cited by number when invoked
 *   - Persona-grounded — leverage points reference specific persona claims
 *   - Cardinality: exactly 3 leverage, exactly 3 risks (cut/synthesize
 *     before adding a fourth)
 *
 * Ship 1: single-call generation, structured JSON, persisted snapshot.
 * Ship 3 (this revision, 2026-06-19): draft → critique → revise loop
 *   mirroring weeklyBriefService v6/v7, plus diff vs. prior synthesis
 *   (changes_since_last narrative). Draft, critique text, and revision
 *   flag persisted on the row so the strategist can audit the loop.
 */

import { supabase } from './supabaseClient';
import claudeAPI from './claudeAPI';
import {
  renderForSystemPrompt as renderPlatformMechanics,
  renderForCritiquePrompt as renderMechanicsForCritique,
} from '../lib/platformMechanics.js';
import { getCohortComposition } from './cohortRolesService';

export const DIAGNOSTIC_SYNTHESIS_PROMPT_VERSION = 'v2-diagnostic-synthesis-critique';
const DEFAULT_MODEL = 'claude-sonnet-4-5';

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

export async function generateDiagnosticSynthesis({ clientId, generatedBy = null }) {
  if (!clientId) return { ok: false, error: 'clientId required' };

  // 1) Load every upstream signal in parallel
  const [
    client,
    spine,
    businessContext,
    audit,
    calibration,
    cohortComp,
    cohortDist,
    recentUploads,
    pillars,
    formats,
    seeds,
  ] = await Promise.all([
    loadClient(clientId),
    loadSpine(clientId),
    loadActiveBusinessContext(clientId),
    loadLatestAudit(clientId),
    loadLatestCalibration(clientId),
    getCohortComposition(clientId).catch(() => null),
    loadCohortDistributions(clientId).catch(() => null),
    loadRecentUploads(clientId),
    loadActivePillars(clientId),
    loadActiveFormats(clientId),
    loadRecentConceptSeeds(clientId),
  ]);

  if (!client) return { ok: false, error: 'Client not found' };

  const isPrelaunch = !!client.is_prelaunch;

  // Prior synthesis for diff. Load BEFORE generation so the writer
  // can read the prior state in the user prompt and populate the
  // changes_since_last narrative directly. Without this the diff
  // becomes a post-hoc comparison the LLM is bad at.
  const priorSynthesis = await getLatestSynthesis(clientId);

  // 2) Build prompts. Both writer and critic receive the same context;
  //    only the system prompt and task framing differ.
  const userPrompt = buildUserPrompt({
    client, spine, businessContext, audit, calibration,
    cohortComp, cohortDist, recentUploads, pillars, formats, seeds,
    isPrelaunch, priorSynthesis,
  });

  // 3) Draft → critique → revise. Three Claude calls:
  //    a. DRAFT — writer produces structured JSON synthesis
  //    b. CRITIQUE — adversarial reviewer reads the same context plus
  //       the draft and flags evidence violations, cardinality misses,
  //       missing mechanic citations, folklore-as-fact, generic
  //       state language. Same rubric family as weeklyBriefService v6.
  //    c. REVISE — writer integrates the critique and emits revised JSON.
  //       Skipped if the critique returns NO MATERIAL ISSUES.
  let draftJson, draftRaw, critiqueText, finalJson, revisionApplied;
  try {
    const draftRes = await claudeAPI.call(
      userPrompt, SYSTEM_PROMPT, 'diagnostic_synthesis_draft', 3200,
    );
    draftRaw = (draftRes?.text || '').trim();
    if (!draftRaw) return { ok: false, error: 'LLM returned empty draft' };
    draftJson = parseSynthesisResponse(draftRaw);
    if (!draftJson) {
      return { ok: false, error: 'Could not parse draft JSON', rawResponse: draftRaw.slice(0, 600) };
    }

    const critiquePrompt = buildCritiquePrompt({ draftRaw, userPrompt });
    const critiqueRes = await claudeAPI.call(
      critiquePrompt, CRITIQUE_SYSTEM_PROMPT, 'diagnostic_synthesis_critique', 1600,
    );
    critiqueText = (critiqueRes?.text || '').trim();

    const skipRevision = !critiqueText || /\bNO MATERIAL ISSUES\b/i.test(critiqueText);
    if (skipRevision) {
      finalJson = draftJson;
      revisionApplied = false;
    } else {
      const revisePrompt = buildRevisePrompt({ draftRaw, critiqueText, userPrompt });
      const reviseRes = await claudeAPI.call(
        revisePrompt, SYSTEM_PROMPT, 'diagnostic_synthesis_revise', 3200,
      );
      const revisedRaw = (reviseRes?.text || '').trim();
      const revisedJson = revisedRaw ? parseSynthesisResponse(revisedRaw) : null;
      if (revisedJson) {
        finalJson = revisedJson;
        revisionApplied = true;
      } else {
        // Revision failed to parse — fall back to draft rather than blocking.
        finalJson = draftJson;
        revisionApplied = false;
      }
    }
  } catch (err) {
    console.warn('[diagnosticSynthesis] generation failed:', err);
    return { ok: false, error: err?.message || 'unknown error' };
  }

  // 4) Persist
  const inputsSnapshot = {
    has_spine:           !!spine,
    has_persona:         !!spine?.audience_persona,
    has_business_ctx:    !!businessContext,
    has_audit:           !!audit,
    has_calibration:     !!calibration,
    has_prior_synthesis: !!priorSynthesis,
    prior_synthesis_id:  priorSynthesis?.id || null,
    prior_synthesis_at:  priorSynthesis?.generated_at || null,
    cohort_comp:         cohortComp || null,
    cohort_dist_summary: cohortDist ? {
      channel_count:   cohortDist.channelCount,
      videos_analyzed: cohortDist.videosAnalyzed,
      window_days:     cohortDist.windowDays,
    } : null,
    recent_uploads_count: recentUploads?.length || 0,
    pillars_count:        pillars?.length || 0,
    formats_count:        formats?.length || 0,
    seeds_count:          seeds?.length || 0,
  };

  const { data: saved, error: insertErr } = await supabase
    .from('client_diagnostic_synthesis')
    .insert({
      client_id:                  clientId,
      generated_by:               generatedBy,
      prompt_version:             DIAGNOSTIC_SYNTHESIS_PROMPT_VERSION,
      model:                      DEFAULT_MODEL,
      inputs_snapshot:            inputsSnapshot,
      strategic_state:            finalJson.strategic_state || null,
      leverage_points:            finalJson.leverage_points || [],
      risks:                      finalJson.risks || [],
      unblockers:                 finalJson.unblockers || [],
      changes_since_last:         finalJson.changes_since_last || null,
      notes:                      finalJson.notes || null,
      is_prelaunch_at_generation: isPrelaunch,
      draft_strategic_state:      draftJson?.strategic_state || null,
      critique_text:              critiqueText || null,
      revision_applied:           revisionApplied,
    })
    .select('*')
    .single();

  if (insertErr) {
    console.warn('[diagnosticSynthesis] persist failed:', insertErr);
    return { ok: false, error: insertErr.message, synthesis: finalJson };
  }
  return { ok: true, synthesis: saved };
}

export async function getLatestSynthesis(clientId) {
  if (!supabase || !clientId) return null;
  const { data } = await supabase
    .from('client_diagnostic_synthesis')
    .select('*')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

export async function listSyntheses(clientId, { limit = 20 } = {}) {
  if (!supabase || !clientId) return [];
  const { data } = await supabase
    .from('client_diagnostic_synthesis')
    .select('id, generated_at, generated_by, prompt_version, strategic_state, is_prelaunch_at_generation')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('generated_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function loadSynthesisById(id) {
  if (!supabase || !id) return null;
  const { data } = await supabase
    .from('client_diagnostic_synthesis')
    .select('*').eq('id', id).maybeSingle();
  return data || null;
}

export async function archiveSynthesis(id, reason = null) {
  if (!supabase || !id) return { ok: false };
  const { error } = await supabase
    .from('client_diagnostic_synthesis')
    .update({ archived_at: new Date().toISOString(), archived_reason: reason })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ──────────────────────────────────────────────────
// Loaders
// ──────────────────────────────────────────────────

async function loadClient(clientId) {
  const { data } = await supabase
    .from('channels')
    .select('id, name, is_prelaunch, prelaunch_intended_launch_at, subscriber_count, lifecycle_stage')
    .eq('id', clientId).maybeSingle();
  return data || null;
}

async function loadSpine(clientId) {
  const { data } = await supabase
    .from('client_strategy_spine')
    .select('*').eq('client_id', clientId).maybeSingle();
  return data || null;
}

async function loadActiveBusinessContext(clientId) {
  const { data } = await supabase
    .from('client_business_context')
    .select('*').eq('client_id', clientId).eq('status', 'active').maybeSingle();
  return data || null;
}

async function loadLatestAudit(clientId) {
  const { data } = await supabase
    .from('client_repositioning_audits')
    .select('id, created_at, videos_scored, composite_distribution, systemic_strengths, systemic_gaps, dimension_breakdowns')
    .eq('client_id', clientId).is('archived_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

async function loadLatestCalibration(clientId) {
  const { data } = await supabase
    .from('client_calibration_runs')
    .select('id, created_at, composite_accuracy, composite_adjacent_accuracy, videos_calibrated, baseline_strategy, per_dimension_metrics, format_split_enabled, per_format_metrics')
    .eq('client_id', clientId).is('archived_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

async function loadRecentUploads(clientId) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await supabase
    .from('videos')
    .select('title, published_at, view_count, is_short')
    .eq('channel_id', clientId)
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(10);
  return data || [];
}

async function loadActivePillars(clientId) {
  const { data } = await supabase
    .from('client_pillars')
    .select('title, creative_description, format_type, sort_order')
    .eq('client_id', clientId).eq('status', 'active')
    .order('sort_order');
  return data || [];
}

async function loadActiveFormats(clientId) {
  const { data } = await supabase
    .from('client_recurring_formats')
    .select('name, creative_execution, cadence, pillar_label, status')
    .eq('client_id', clientId)
    .in('status', ['piloting', 'active'])
    .is('archived_at', null);
  return data || [];
}

async function loadRecentConceptSeeds(clientId) {
  const { data } = await supabase
    .from('client_concept_seeds')
    .select('title, status, addresses_persona_claim, format_hint, created_at')
    .eq('client_id', clientId).is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(8);
  return data || [];
}

/**
 * Same cohort distribution loader pattern as weeklyBriefService.
 * Reads peer-tagged cohort over 90d; returns format mix, length
 * histogram, upload cadence, title tokens, top videos.
 */
async function loadCohortDistributions(clientId) {
  const { data: links } = await supabase
    .from('client_channels').select('channel_id, cohort_role')
    .eq('client_id', clientId).eq('cohort_role', 'peer');
  const peerIds = (links || []).map(l => l.channel_id);
  if (peerIds.length === 0) return null;

  const sinceIso = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [{ data: channels }, { data: videos }] = await Promise.all([
    supabase.from('channels').select('id, name, subscriber_count').in('id', peerIds),
    supabase.from('videos')
      .select('channel_id, title, view_count, duration_seconds, is_short, published_at')
      .in('channel_id', peerIds).gte('published_at', sinceIso)
      .order('view_count', { ascending: false }).limit(300),
  ]);

  const channelById = new Map((channels || []).map(c => [c.id, c]));
  const vids = videos || [];
  const subCounts = (channels || []).map(c => c.subscriber_count || 0).sort((a, b) => a - b);
  const subDistribution = subCounts.length ? {
    p25: subCounts[Math.floor(subCounts.length * 0.25)] || 0,
    p50: subCounts[Math.floor(subCounts.length * 0.50)] || 0,
    p75: subCounts[Math.floor(subCounts.length * 0.75)] || 0,
  } : null;

  const shortsCount = vids.filter(v => v.is_short).length;
  const longCount   = vids.length - shortsCount;
  const formatMix = vids.length ? {
    shorts_pct: Math.round((shortsCount / vids.length) * 100),
    long_pct:   Math.round((longCount / vids.length) * 100),
  } : null;

  const longVids = vids.filter(v => !v.is_short && v.duration_seconds > 0);
  const buckets = { '0-5m': 0, '5-10m': 0, '10-20m': 0, '20-40m': 0, '40m+': 0 };
  for (const v of longVids) {
    const m = v.duration_seconds / 60;
    if      (m < 5)  buckets['0-5m']++;
    else if (m < 10) buckets['5-10m']++;
    else if (m < 20) buckets['10-20m']++;
    else if (m < 40) buckets['20-40m']++;
    else             buckets['40m+']++;
  }

  const topVideos = vids.slice(0, 6).map(v => ({
    title: v.title,
    channelName: channelById.get(v.channel_id)?.name || '?',
    views: v.view_count || 0,
    durationMin: v.duration_seconds ? Math.round(v.duration_seconds / 60) : null,
    format: v.is_short ? 'short' : 'long',
  }));

  return {
    channelCount:    peerIds.length,
    videosAnalyzed:  vids.length,
    windowDays:      90,
    subDistribution,
    formatMix,
    lengthHistogram: longVids.length ? buckets : null,
    topVideos,
  };
}

// ──────────────────────────────────────────────────
// System prompt
// ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior YouTube strategist producing a one-screen strategic-state diagnosis of a single client. This is NOT a weekly brief (that's a separate artifact that recommends next moves). This is STATE-SHAPED — "what is TRUE about this engagement right now."

The strategist will read your output as the per-client landing page when they open the dashboard. Every claim must be defensible. Every leverage point must be actionable. The synthesis must integrate across every input provided — Strategy Spine, audience persona, cohort distributions, repositioning audit, calibration, recent uploads, active pillars, active recurring formats, and concept seeds.

OUTPUT FORMAT: Return ONLY valid JSON. No prose outside the JSON. No markdown fences. Schema:

{
  "strategic_state": "One sentence describing what's true about this client right now. Specific, not generic. Example shape: 'Pearl 27 is pre-launch with a richly synthesized persona, a peer cohort over-indexed on tool-tutorial register, and zero own-channel signal — the install is positioning-strong and execution-untested.'",
  "leverage_points": [
    {
      "title": "Short imperative title — what to do",
      "rationale": "2-3 sentences. Cite specific inputs (persona pain points by name, cohort distribution numbers, audit dimension findings, calibration accuracy, specific peer videos, mechanic numbers). Anything inferred without a specific input citation must be labeled as Hypothesis with validation method.",
      "provenance": "Which workspaces fed this — comma-separated short tags. Examples: 'persona, cohort_distributions, mechanic_2' or 'audit_systemic_gaps, calibration, mechanic_5'",
      "confidence": "extracted | hypothesized | confirmed",
      "mechanics_cited": [array of mechanic numbers from 1-12; empty array if none invoked],
      "drilldown_tab": "Which strategy workspace would the strategist open to act on this. One of: audience, weekly-brief, pre-flight, repositioning, cohort-roles, calibration, competitor-scan, install, opportunities"
    },
    {...},
    {...}
  ],
  "risks": [
    {
      "title": "Short title of the risk",
      "rationale": "2-3 sentences. What could go wrong. Cite specific inputs. Label hypotheses.",
      "early_warning_signal": "What would catch this risk early — specific observable. Example: 'If three consecutive published videos miss the role efficiency bar by >20%, the cohort assumption is wrong.'",
      "confidence": "extracted | hypothesized | confirmed",
      "mechanics_cited": [array of mechanic numbers],
      "drilldown_tab": "Which workspace surfaces the early warning"
    },
    {...},
    {...}
  ],
  "unblockers": [
    {
      "missing_input": "What input is missing that would let the strategist make the next decision",
      "where_to_provide": "Which tab provides it — same enum as drilldown_tab",
      "why_it_matters": "One sentence on what unblocks if provided"
    }
  ],
  "changes_since_last": "2-4 sentence narrative comparing this synthesis to the prior one. Required IF a prior synthesis is provided in the user prompt; null otherwise. Be specific — name which leverage/risk shifted, which inputs strengthened or weakened. Vague language like 'things evolved' is a violation.",
  "notes": "Optional. Caveats, freshness concerns, scope limits. One paragraph max."
}

DISCIPLINE RULES:

1. CARDINALITY IS A FEATURE. Exactly 3 leverage points. Exactly 3 risks. If you have a fourth, merge or cut. Unblockers are variable (0-5).

2. EVIDENCE DISCIPLINE. Every claim is either data-backed (cite the specific input — persona claim by phrase, cohort distribution number, audit finding, calibration accuracy) OR labeled as Hypothesis. The format: "Hypothesis (validate with: <concrete source>): <claim>". A claim that can't name a concrete validation source must be cut.

3. MECHANIC CITATIONS. When a leverage point or risk invokes one of the platform mechanics, populate mechanics_cited with the number. Example: a "build a recurring format to compound returning-viewer signal" leverage cites Mechanic 2. A "this concept overpromises relative to delivery" risk cites Mechanic 1.

4. PROVENANCE IS REQUIRED. Each leverage point and risk must name which inputs fed it. Use short tags (persona, cohort_distributions, audit_systemic_gaps, calibration, mechanic_N, business_context, recent_uploads, pillars, formats, seeds). If a claim doesn't trace to a specific input, it's speculation.

5. STATE-SHAPED, NOT OUTPUT-SHAPED. Leverage points describe what to PRIORITIZE — not what to publish. "Strengthen the cohort signal by tagging 5 more peer channels" is state-shaped. "Make a video titled X about Y" is output-shaped — that belongs in the weekly brief, not here.

6. PRE-LAUNCH AWARENESS. When the client is pre-launch (no own-channel videos), do NOT cite audit findings or calibration accuracy that don't exist. The leverage and risk language shifts to positioning, persona, cohort, and Spine. Mechanic 11 (recommendation/AI-citation layer convergence) is often a leverage for pre-launch GEO/AEO clients.

7. NO HYPE WORDS: leverage (verb sense ok in 'leverage point'), unlock, robust, innovative, compelling, drives, taps into, resonates with, powerful, game-changer, cutting-edge, transformative.

8. NO GENERIC ADVICE. "Post consistently" / "engage your audience" / "build a brand" are immediate cuts — they don't survive the cardinality discipline.

PLATFORM MECHANICS — the verified craft-knowledge layer. Cite by number in mechanics_cited when invoked.

${renderPlatformMechanics()}`;

// ──────────────────────────────────────────────────
// User prompt builder
// ──────────────────────────────────────────────────

function buildUserPrompt({
  client, spine, businessContext, audit, calibration,
  cohortComp, cohortDist, recentUploads, pillars, formats, seeds,
  isPrelaunch, priorSynthesis,
}) {
  const lines = [];
  lines.push(`CLIENT: ${client.name}`);
  lines.push(`Lifecycle stage: ${client.lifecycle_stage || 'unknown'}${isPrelaunch ? ' · PRE-LAUNCH' : ''}`);
  if (isPrelaunch && client.prelaunch_intended_launch_at) {
    const days = Math.round((new Date(client.prelaunch_intended_launch_at).getTime() - Date.now()) / 86_400_000);
    lines.push(`Intended launch: ${days > 0 ? `${days} days from now` : `${-days} days past intended date`}`);
  }
  if (!isPrelaunch && client.subscriber_count) {
    lines.push(`Subscribers: ${client.subscriber_count.toLocaleString()}`);
  }
  lines.push('');

  if (isPrelaunch) {
    lines.push('PRE-LAUNCH NOTE: no own-channel videos exist. Audit and calibration are not available. State diagnosis must work from Spine + persona + cohort + business context. Mechanic 11 (recommendation/AI-citation substrate convergence) is often the leverage for pre-launch positioning work.');
    lines.push('');
  }

  // Spine + persona
  if (spine) {
    lines.push('STRATEGY SPINE:');
    if (spine.positioning_oneliner)  lines.push(`- Positioning: ${spine.positioning_oneliner}`);
    if (spine.audience_read)         lines.push(`- Audience read: ${spine.audience_read}`);
    if (spine.editorial_pov)         lines.push(`- Editorial POV: ${spine.editorial_pov}`);
    if (spine.voice_tone)            lines.push(`- Voice + tone: ${spine.voice_tone}`);
    if (spine.competitive_posture)   lines.push(`- Competitive posture: ${spine.competitive_posture}`);
    if (spine.guardrails)            lines.push(`- Guardrails: ${spine.guardrails}`);
    lines.push('');

    const p = spine.audience_persona;
    if (p && typeof p === 'object') {
      lines.push('AUDIENCE PERSONA:');
      if (p.pain_points?.length)        lines.push(`- Pain points: ${p.pain_points.join('; ')}`);
      if (p.motivations?.length)        lines.push(`- Motivations: ${p.motivations.join('; ')}`);
      if (p.questions_asked?.length)    lines.push(`- Questions asked: ${p.questions_asked.join('; ')}`);
      if (p.voice_patterns?.length)     lines.push(`- Voice patterns: ${p.voice_patterns.join('; ')}`);
      if (p.trust_signals?.length)      lines.push(`- Trust signals: ${p.trust_signals.join('; ')}`);
      if (p.adjacent_interests?.length) lines.push(`- Adjacent interests: ${p.adjacent_interests.join('; ')}`);
      lines.push('');
    }
  }

  if (businessContext) {
    lines.push('BUSINESS CONTEXT:');
    if (businessContext.one_line_summary)     lines.push(`- ${businessContext.one_line_summary}`);
    if (businessContext.products_offered)     lines.push(`- Sells: ${businessContext.products_offered}`);
    if (businessContext.products_not_offered) lines.push(`- Does NOT sell: ${businessContext.products_not_offered}`);
    if (businessContext.target_market)        lines.push(`- Target market: ${businessContext.target_market}`);
    lines.push('');
  }

  // Cohort
  if (cohortComp) {
    lines.push('COHORT COMPOSITION:');
    lines.push(`- Peer: ${cohortComp.peer} · Aspirational: ${cohortComp.aspirational} · Reference: ${cohortComp.reference}`);
    lines.push('');
  }
  if (cohortDist) {
    lines.push(`PEER COHORT DISTRIBUTIONS (${cohortDist.channelCount} peer channels, ${cohortDist.videosAnalyzed} videos / 90d):`);
    if (cohortDist.subDistribution) {
      lines.push(`- Subs p25/p50/p75: ${formatN(cohortDist.subDistribution.p25)} / ${formatN(cohortDist.subDistribution.p50)} / ${formatN(cohortDist.subDistribution.p75)}`);
    }
    if (cohortDist.formatMix) {
      lines.push(`- Format mix: ${cohortDist.formatMix.long_pct}% long-form / ${cohortDist.formatMix.shorts_pct}% Shorts`);
    }
    if (cohortDist.lengthHistogram) {
      const lh = cohortDist.lengthHistogram;
      lines.push(`- Long-form length: 0-5m:${lh['0-5m']} 5-10m:${lh['5-10m']} 10-20m:${lh['10-20m']} 20-40m:${lh['20-40m']} 40m+:${lh['40m+']}`);
    }
    if (cohortDist.topVideos?.length) {
      lines.push('- Top peer videos:');
      cohortDist.topVideos.forEach(v => {
        lines.push(`    "${v.title}" — ${v.channelName} · ${formatN(v.views)} views · ${v.durationMin || '?'}m · ${v.format}`);
      });
    }
    lines.push('');
  }

  // Audit
  if (audit) {
    lines.push(`LATEST REPOSITIONING AUDIT (${new Date(audit.created_at).toLocaleDateString()}, ${audit.videos_scored} videos):`);
    if (audit.composite_distribution) {
      const d = audit.composite_distribution;
      lines.push(`- Composite tiers: ${d.very_likely_outperform || 0} very_likely / ${d.likely_solid || 0} likely / ${d.risky || 0} risky / ${d.predicted_under || 0} under`);
    }
    if (audit.systemic_strengths?.length) {
      lines.push(`- Systemic strengths: ${audit.systemic_strengths.map(s => `${s.dimension}(${Math.round((s.share_over || 0) * 100)}%)`).join(', ')}`);
    }
    if (audit.systemic_gaps?.length) {
      lines.push(`- Systemic gaps: ${audit.systemic_gaps.map(g => `${g.dimension}(${Math.round((g.share_under || 0) * 100)}%)`).join(', ')}`);
    }
    lines.push('');
  }

  // Calibration
  if (calibration) {
    lines.push(`LATEST CALIBRATION (${new Date(calibration.created_at).toLocaleDateString()}):`);
    if (calibration.composite_accuracy != null) {
      lines.push(`- Composite accuracy: ${Math.round(calibration.composite_accuracy * 100)}% exact / ${Math.round((calibration.composite_adjacent_accuracy || 0) * 100)}% within ±1 (n=${calibration.videos_calibrated})`);
    }
    if (calibration.format_split_enabled && calibration.per_format_metrics) {
      const pf = calibration.per_format_metrics;
      for (const fmt of ['shorts', 'long_form']) {
        const b = pf[fmt];
        if (!b || b.insufficientData) continue;
        const ex = b.compositeAccuracy != null ? Math.round(b.compositeAccuracy * 100) : null;
        lines.push(`  · ${fmt}: ${ex}% exact (n=${b.n})`);
      }
    }
    lines.push('');
  }

  // Recent uploads
  if (recentUploads?.length) {
    lines.push(`RECENT UPLOADS (last 30d, ${recentUploads.length} videos):`);
    recentUploads.slice(0, 5).forEach(v => {
      lines.push(`- "${v.title}" — ${formatN(v.view_count || 0)} views · ${v.is_short ? 'short' : 'long'} · ${new Date(v.published_at).toLocaleDateString()}`);
    });
    lines.push('');
  } else if (!isPrelaunch) {
    lines.push('RECENT UPLOADS (last 30d): none. Channel appears quiet.');
    lines.push('');
  }

  // Pillars / formats / seeds — the strategic-commitment layer
  if (pillars?.length) {
    lines.push(`ACTIVE PILLARS (${pillars.length}):`);
    pillars.forEach(p => lines.push(`- ${p.title}${p.format_type ? ` [${p.format_type}]` : ''}`));
    lines.push('');
  }
  if (formats?.length) {
    lines.push(`ACTIVE RECURRING FORMATS (${formats.length}):`);
    formats.forEach(f => lines.push(`- "${f.name}" [${f.creative_execution} · ${f.cadence} · ${f.status}]${f.pillar_label ? ` · pillar: ${f.pillar_label}` : ''}`));
    lines.push('');
  }
  if (seeds?.length) {
    lines.push(`RECENT CONCEPT SEEDS (${seeds.length}):`);
    seeds.slice(0, 5).forEach(s => lines.push(`- "${s.title}" [${s.status}]`));
    lines.push('');
  }

  // Prior synthesis for diff. Letting the writer see what was true
  // LAST time lets the changes_since_last narrative be specific
  // ("cohort coverage strengthened: peers added 3→8") rather than
  // a vague catch-all ("things have changed").
  if (priorSynthesis) {
    const days = Math.round((Date.now() - new Date(priorSynthesis.generated_at).getTime()) / 86_400_000);
    lines.push(`PRIOR SYNTHESIS (${days}d ago, ${new Date(priorSynthesis.generated_at).toLocaleDateString()}):`);
    if (priorSynthesis.strategic_state) lines.push(`Prior state: ${priorSynthesis.strategic_state}`);
    if (priorSynthesis.leverage_points?.length) {
      lines.push('Prior leverage points:');
      priorSynthesis.leverage_points.forEach((lp, i) => lines.push(`  ${i + 1}. ${lp.title}`));
    }
    if (priorSynthesis.risks?.length) {
      lines.push('Prior risks:');
      priorSynthesis.risks.forEach((r, i) => lines.push(`  ${i + 1}. ${r.title}`));
    }
    lines.push('In your synthesis, populate changes_since_last with a 2-4 sentence narrative comparing this synthesis to the prior one — what is new, what carried over, what is gone. Be specific (cite which leverage/risk shifted), not vague.');
    lines.push('');
  } else {
    lines.push('No prior synthesis exists. Leave changes_since_last null.');
    lines.push('');
  }

  lines.push('Produce the synthesis JSON now. Cardinality: exactly 3 leverage points, exactly 3 risks. Cite mechanics by number. Label hypotheses with validation method.');
  return lines.join('\n');
}

// ──────────────────────────────────────────────────
// Parsing
// ──────────────────────────────────────────────────

function parseSynthesisResponse(raw) {
  if (!raw) return null;
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace  = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const lenient = cleaned
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(lenient); } catch (err) {
    console.warn('[diagnosticSynthesis] parse failed:', err?.message);
    return null;
  }
}

function formatN(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ──────────────────────────────────────────────────
// Critique + revise (Ship 3, 2026-06-19)
// Same family as weeklyBriefService v6/v7 — adversarial reviewer
// reads the same context the writer had plus the draft and flags
// every defensible failure. Output: a numbered critique list or
// the literal string "NO MATERIAL ISSUES" if clean.
// ──────────────────────────────────────────────────

const CRITIQUE_SYSTEM_PROMPT = `You are a skeptical senior strategist reviewing a junior strategist's draft strategic-state synthesis. You have the same client context the writer had. Your job is to surface every flaw the writer would defend in person but cannot defend on paper.

You are NOT writing the revised synthesis. You are writing a critique. Be direct, specific, and harsh — the writer is a strong professional who uses clear feedback to ship a better artifact.

CHECK FOR:

1. CARDINALITY VIOLATIONS — the synthesis must contain EXACTLY 3 leverage points and EXACTLY 3 risks. Four is a fail. Two is a fail. Flag if violated.

2. UNLABELED HYPOTHESES — every claim in rationale or early_warning_signal must be either (a) traceable to a specific supplied input (persona pain point, cohort distribution number, audit finding, calibration accuracy, business context, mechanic), OR (b) prefixed with "Hypothesis (validate with: <concrete source>)". Speculation framed as fact is the #1 failure. Language like "likely", "probably", "typically", "tends to" without the prefix = flag by leverage_points[N] or risks[N].

3. MISSING PROVENANCE — every leverage point and risk MUST have a provenance field naming which workspaces fed it. An empty or generic provenance ("intuition", "general best practice") is a fail.

4. MECHANIC CITATION DRIFT — when a leverage or risk invokes one of the 12 platform mechanics, mechanics_cited must include the mechanic number. The mechanics:
${renderMechanicsForCritique()}
   Three failure modes to flag separately:
   a. Recommendation invokes a mechanic but mechanics_cited is empty → flag missing citation
   b. Recommendation contradicts a mechanic → flag the contradiction and name the mechanic by number
   c. Claim asserts a craft rule NOT covered by any mechanic AND not labeled Hypothesis → folklore-as-fact, flag

5. STATE-SHAPED VIOLATIONS — this synthesis is STATE-SHAPED ("what is true right now"), NOT OUTPUT-SHAPED ("what to publish"). A leverage point that says "Publish a video titled X about Y" is a violation — that belongs in the weekly brief. A leverage point that says "Strengthen cohort signal by tagging 5 more peer channels" is correct. Flag any output-shaped items.

6. DRILLDOWN VALIDITY — each drilldown_tab must be one of: audience, weekly-brief, pre-flight, repositioning, cohort-roles, calibration, competitor-scan, install, opportunities. Any other string = flag.

7. CHANGES_SINCE_LAST DISCIPLINE — if a prior synthesis exists in the user prompt, changes_since_last must be specific. Vague language like "things evolved" or "context has shifted" without naming WHAT shifted = fail. Required to name at least one specific change.

8. GENERIC ADVICE — items like "post consistently", "build engagement", "tell good stories", "drive subscriber growth" never survive cardinality discipline. Flag for cut.

9. HYPE WORDS — leverage (verb), unlock, robust, innovative, compelling, drives, taps, resonates, powerful, transformative, game-changer, cutting-edge. Flag each.

OUTPUT FORMAT:

If the draft is clean and you find no material issues, output exactly:
NO MATERIAL ISSUES

Otherwise, output a numbered list of issues. For each:
- Cite the location (leverage_points[N], risks[N], unblockers[N], strategic_state, or changes_since_last)
- Quote the offending phrase (in quotes, ≤15 words)
- State the rule violated (one short sentence)
- Specify the fix (one short sentence)

Be ruthless about real flaws; do not invent ones. If a claim IS supported by the supplied data, do not flag it just to fill space.`;

function buildCritiquePrompt({ draftRaw, userPrompt }) {
  return `CONTEXT THE WRITER HAD:

${userPrompt}

═══════════════════════════════════════════════════════
THE WRITER'S DRAFT SYNTHESIS (raw JSON):

${draftRaw}

═══════════════════════════════════════════════════════

Review the draft against the rubric. Output the critique now.`;
}

function buildRevisePrompt({ draftRaw, critiqueText, userPrompt }) {
  return `CONTEXT YOU HAD:

${userPrompt}

═══════════════════════════════════════════════════════
YOUR DRAFT SYNTHESIS (raw JSON):

${draftRaw}

═══════════════════════════════════════════════════════
A SKEPTICAL REVIEWER'S CRITIQUE:

${critiqueText}

═══════════════════════════════════════════════════════

Integrate the critique where it has merit. Output the REVISED synthesis as the same JSON schema — strategic_state, leverage_points (exactly 3), risks (exactly 3), unblockers, changes_since_last, notes. Apply the critique's fixes: add hypothesis labels where flagged, cite mechanics by number where invoked, replace generic language with specific input-cited language, cut output-shaped items in favor of state-shaped items.

OUTPUT ONLY the revised JSON. No preamble, no markdown fences, no closing remarks.`;
}

export default {
  generateDiagnosticSynthesis,
  getLatestSynthesis,
  listSyntheses,
  loadSynthesisById,
  archiveSynthesis,
  DIAGNOSTIC_SYNTHESIS_PROMPT_VERSION,
};
