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

export const BRIEF_PROMPT_VERSION = 'v6-weekly-brief-distributions-critic';
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
  const [spine, businessContext, audit, calibration, cohortComp, cohortDist, clientChannel] = await Promise.all([
    loadSpine(clientId),
    loadActiveBusinessContext(clientId),
    auditId ? loadAuditById(auditId) : loadLatestAudit(clientId),
    calibrationRunId ? loadCalibrationById(calibrationRunId) : loadLatestCalibration(clientId),
    getCohortComposition(clientId).catch(() => null),
    loadCohortDistributions(clientId).catch(() => null),
    loadClientChannel(clientId),
  ]);

  // 2026-06-09: pre-launch clients can't have an audit or calibration
  // (no videos exist to audit, no predictions to validate). The brief
  // still generates from Spine + persona + cohort + business context;
  // the prompt switches to a launch-strategy register instead of the
  // "fix systemic gaps in your existing catalog" register.
  const isPrelaunch = !!clientChannel?.is_prelaunch;

  if (!isPrelaunch) {
    if (!audit) {
      return { error: 'No repositioning audit found for this client. Run an audit at Strategy → Repositioning first.' };
    }
    if (!calibration) {
      return { error: 'No calibration run found. Run calibration at Strategy → Calibration first (needs the audit you just ran as the source).' };
    }
  } else if (!spine?.audience_persona && !spine?.audience_read && !businessContext?.target_market) {
    // Pre-launch with no audience signal at all — the brief would
    // be pure imagination. Tell the strategist what to fill in.
    return { error: 'Pre-launch client needs at least one of: Spine audience_read, business context target_market, or a synthesized audience persona. Fill out the Spine or run the Audience workspace synthesis first.' };
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
    cohortDist,
    isPrelaunch,
  });

  // 3) Draft → critique → revise loop. Three calls:
  //    a. DRAFT — the brief writer makes the v1 brief.
  //    b. CRITIQUE — an adversarial reviewer scores it against the same
  //       context, calling out unlabeled hypotheses, persona coverage
  //       gaps, missing dog-fooding, and any unsupported inference.
  //    c. REVISE — the writer integrates the critique. Final brief.
  //
  // Targets the failure class identified 2026-06-12: prompt rules
  // applied probabilistically catch some hypothesis-label violations
  // and miss others. The critic pass is the structural fix.
  try {
    // ─── a. Draft ───
    const draftResult = await claudeAPI.call(
      userPrompt,
      SYSTEM_PROMPT,
      'weekly_strategist_brief_draft',
      2200,
    );
    const draftText = (draftResult?.text || '').trim();
    if (!draftText) {
      return { error: 'LLM returned empty draft', promptVersion: BRIEF_PROMPT_VERSION };
    }

    // ─── b. Critique ───
    const critiquePrompt = buildCritiquePrompt({ draftText, userPrompt });
    const critiqueResult = await claudeAPI.call(
      critiquePrompt,
      CRITIQUE_SYSTEM_PROMPT,
      'weekly_strategist_brief_critique',
      1800,
    );
    const critiqueText = (critiqueResult?.text || '').trim();

    // ─── c. Revise ───
    // If the critique is empty or signals "no material issues", skip
    // the revision and return the draft. Saves a Claude call when the
    // first pass was clean.
    const skipRevision = !critiqueText || /\bNO MATERIAL ISSUES\b/i.test(critiqueText);
    let finalText = draftText;
    if (!skipRevision) {
      const revisePrompt = buildRevisePrompt({ draftText, critiqueText, userPrompt });
      const reviseResult = await claudeAPI.call(
        revisePrompt,
        REVISE_SYSTEM_PROMPT,
        'weekly_strategist_brief_revise',
        2200,
      );
      const revisedText = (reviseResult?.text || '').trim();
      if (revisedText) finalText = revisedText;
    }

    return {
      text:                   finalText,
      draftText,
      critiqueText:           skipRevision ? null : critiqueText,
      revisionApplied:        !skipRevision,
      promptVersion:          BRIEF_PROMPT_VERSION,
      // Pre-launch clients have null audit/calibration — the migration
      // 095 schema allows null on these FK columns, so we just pass
      // through with optional chaining.
      sourceAuditId:          audit?.id || null,
      sourceCalibrationRunId: calibration?.id || null,
      model:                  DEFAULT_MODEL,
      isPrelaunch,
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
    .select('id, name, subscriber_count, total_view_count, is_prelaunch, prelaunch_intended_launch_at')
    .eq('id', clientId)
    .maybeSingle();
  return data || null;
}

/**
 * Peer cohort distributions — the structural fix for the 344.7K-class
 * failure (reported 2026-06-12). Single aggregates ("avg 344.7K subs")
 * let the model invent narrative; distributions give it the actual
 * shape so claims can be cited or labeled as hypotheses honestly.
 *
 * Returns:
 *   {
 *     channelCount:       N peer channels analyzed
 *     subDistribution:    { p25, p50, p75 } sub counts across peers
 *     videoCount:         N peer videos in the last 90 days
 *     formatMix:          { shorts_pct, long_pct, shorts_n, long_n }
 *     lengthHistogram:    long-form bucket counts (0-5m / 5-10m / 10-20m / 20-40m / 40m+)
 *     uploadCadence:      { medianPerWeek, p25PerWeek, p75PerWeek }
 *     titleTokens:        top 10 recurring tokens in peer top-quartile videos
 *     topVideos:          top 10 cohort videos by views (title, channel name, views, length, format)
 *   }
 *
 * Window: 90 days (matches the cadence the brief speaks to). Null when
 * peer cohort empty or no video data.
 */
async function loadCohortDistributions(clientId) {
  if (!supabase) return null;

  // 1. Resolve peer cohort channel IDs
  const { data: links } = await supabase
    .from('client_channels')
    .select('channel_id, cohort_role')
    .eq('client_id', clientId)
    .eq('cohort_role', 'peer');
  const peerIds = (links || []).map(l => l.channel_id);
  if (peerIds.length === 0) return null;

  // 2. Peer channel meta + videos in last 90d, in parallel
  const sinceIso = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [{ data: channels }, { data: videos }] = await Promise.all([
    supabase
      .from('channels')
      .select('id, name, subscriber_count')
      .in('id', peerIds),
    supabase
      .from('videos')
      .select('channel_id, title, view_count, duration_seconds, is_short, published_at')
      .in('channel_id', peerIds)
      .gte('published_at', sinceIso)
      .order('view_count', { ascending: false })
      .limit(500),  // cap for prompt size; top 500 by views across peers
  ]);

  const channelById = new Map((channels || []).map(c => [c.id, c]));
  const vids = videos || [];

  // 3. Sub distribution (p25/p50/p75)
  const subCounts = (channels || []).map(c => c.subscriber_count || 0).sort((a, b) => a - b);
  const subDistribution = subCounts.length ? {
    p25: subCounts[Math.floor(subCounts.length * 0.25)] || 0,
    p50: subCounts[Math.floor(subCounts.length * 0.50)] || 0,
    p75: subCounts[Math.floor(subCounts.length * 0.75)] || 0,
    min: subCounts[0],
    max: subCounts[subCounts.length - 1],
  } : null;

  // 4. Format mix
  const shortsCount = vids.filter(v => v.is_short).length;
  const longCount   = vids.length - shortsCount;
  const formatMix = vids.length ? {
    shorts_pct: Math.round((shortsCount / vids.length) * 100),
    long_pct:   Math.round((longCount / vids.length) * 100),
    shorts_n:   shortsCount,
    long_n:     longCount,
  } : null;

  // 5. Length histogram (long-form only — Shorts are <60s by definition)
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
  const lengthHistogram = longVids.length ? buckets : null;

  // 6. Upload cadence per channel (videos / week over the 90d window)
  const weeks = 90 / 7;
  const byChannel = new Map();
  for (const v of vids) {
    if (!byChannel.has(v.channel_id)) byChannel.set(v.channel_id, 0);
    byChannel.set(v.channel_id, byChannel.get(v.channel_id) + 1);
  }
  const perWeekRates = [...byChannel.values()].map(n => n / weeks).sort((a, b) => a - b);
  const uploadCadence = perWeekRates.length ? {
    medianPerWeek: round1(perWeekRates[Math.floor(perWeekRates.length * 0.5)]),
    p25PerWeek:    round1(perWeekRates[Math.floor(perWeekRates.length * 0.25)]),
    p75PerWeek:    round1(perWeekRates[Math.floor(perWeekRates.length * 0.75)]),
  } : null;

  // 7. Title token patterns — top 10 recurring tokens in top-quartile videos
  const topQuartile = vids.slice(0, Math.max(1, Math.floor(vids.length / 4)));
  const stopWords = new Set(['the','a','an','to','of','for','and','or','in','on','with','is','it','this','that','your','my','i','you','we','they','at','as','from','by','how','what','why','when','do','can','will','vs','&','-','|','|']);
  const tokenCounts = new Map();
  for (const v of topQuartile) {
    const tokens = (v.title || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !stopWords.has(t));
    const seen = new Set();
    for (const t of tokens) {
      if (seen.has(t)) continue;        // count per-video, not per-occurrence
      seen.add(t);
      tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1);
    }
  }
  const titleTokens = [...tokenCounts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([token, count]) => ({ token, channels: count }));

  // 8. Top 10 cohort videos by views (with attribution)
  const topVideos = vids.slice(0, 10).map(v => ({
    title:           v.title,
    channelName:     channelById.get(v.channel_id)?.name || 'Unknown',
    views:           v.view_count || 0,
    durationSeconds: v.duration_seconds || 0,
    format:          v.is_short ? 'short' : 'long',
    publishedAt:     v.published_at,
  }));

  return {
    channelCount:    peerIds.length,
    videosAnalyzed:  vids.length,
    windowDays:      90,
    subDistribution,
    formatMix,
    lengthHistogram,
    uploadCadence,
    titleTokens,
    topVideos,
  };
}

function round1(n) { return Math.round(n * 10) / 10; }

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
5. NAME SPECIFIC VIDEOS when recommending a test. If a bullet says "test a title rewrite on an older underperforming video" or "investigate the runtime on a long-form video," the bullet MUST name a specific video from the calibration mismatches list or audit data. NEVER use placeholder phrases like "a similar video", "an older video", "one of your existing videos" — those phrases mean the brief is suggesting work the strategist still has to plan. Name the candidate video by title.

EVIDENCE DISCIPLINE — every claim is one of two kinds, and you must label them:
- DATA-BACKED: a claim traceable to a specific supplied data point (cohort composition counts, calibration accuracy %, audit finding, persona trust signal, business context line, named video). Write these as normal prose. The cited fact is the warrant.
- HYPOTHESIS: a claim that requires inference beyond the supplied data — including "the cohort likely skews technical", "this audience probably prefers shorter videos", "this category tends to peak at 11pm", or any "likely/probably/typically/seems" assertion. These MUST be prefixed with **"Hypothesis (validate with: <specific data source the strategist could fetch>)"**. Example: "Hypothesis (validate with: a title-pattern audit of peer cohort videos): the cohort over-indexes on tool-tutorial titles." If you cannot name a concrete validation source, the hypothesis is too speculative to include — cut it.
This is not optional. A bullet without a labeled hypothesis section may not contain any inferred claims at all. Speculation framed as data is the failure mode this rule prevents. The hypothesis label is a feature, not an admission of weakness — it converts the brief into a partial research agenda, which makes it more rigorous, not less.

PERSONA COVERAGE — before finalizing the bullets, run two passes against the persona:
- Trust signals coverage: for each trust signal in the persona, decide whether a recommendation addresses it OR explicitly defer it with a reason. If a trust signal goes uncovered and undeferred, the brief is incomplete; add a bullet or a deferral line.
- Pain points coverage: same discipline. Every pain point either gets surfaced in a recommendation or is explicitly deferred with reason (e.g., "Deferred: stakeholder-buy-in pain point — addressed in the executive memo, not the brief.").
If the brief covers fewer than half of the persona's trust signals and pain points across the bullet set, you are leaving the highest-leverage material on the table; restructure before returning.

META-OPPORTUNITY (recursive proof check) — if the client's offering relates to content, discoverability, media, audience-building, or AI-era visibility, ALWAYS evaluate whether the channel itself can serve as live proof of the offering. The most credible artifact for "we make brands discoverable in LLMs" is a Crux-client channel that demonstrably is. When this applies, include a bullet about how the upcoming content slate either does or does not function as dog-fooded evidence — and what's needed to make it so. Skip this check only when the client's offering is unrelated to media/discoverability/audience.

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

function buildUserPrompt({ clientName, clientChannel, spine, businessContext, audit, calibration, cohortComp, cohortDist, isPrelaunch }) {
  const lines = [];

  // ── Client header ──
  lines.push(`CLIENT: ${clientName}`);
  if (clientChannel?.subscriber_count) {
    lines.push(`Channel scale: ${formatN(clientChannel.subscriber_count)} subscribers · ${formatN(clientChannel.total_view_count)} total views`);
  }
  lines.push('');

  // ── Pre-launch mode block ──
  // 2026-06-09: when the client hasn't launched, there's no audit /
  // calibration / video catalog. The brief shape changes to launch
  // strategy + first-content seeds grounded in audience persona +
  // cohort signal. The LLM needs to know this up front so it doesn't
  // try to cite analytics that don't exist.
  if (isPrelaunch) {
    lines.push('=== PRE-LAUNCH CLIENT MODE ===');
    lines.push('This client has NOT launched a YouTube channel yet.');
    if (clientChannel?.prelaunch_intended_launch_at) {
      const days = Math.round((new Date(clientChannel.prelaunch_intended_launch_at).getTime() - Date.now()) / 86_400_000);
      if (days > 0)       lines.push(`Intended launch: ${days} days from now.`);
      else if (days === 0) lines.push('Intended launch: today.');
      else                 lines.push(`Intended launch was ${-days} days ago (past intended date).`);
    }
    lines.push('There is no repositioning audit, no calibration, no client video catalog. Do NOT cite or fabricate any of those.');
    lines.push('');
    lines.push('THE BRIEF SHAPE FOR PRE-LAUNCH:');
    lines.push('1. Launch positioning — what the first 5-10 videos should establish.');
    lines.push('2. Specific opening concepts grounded in the audience persona (cite actual persona questions in the audience\'s own words).');
    lines.push('3. Cohort patterns to emulate vs avoid — what peer/aspirational channels in this space do that matches the brand register vs what they do that the persona\'s voice patterns would reject.');
    lines.push('4. Editorial/production constraints the persona reveals (voice register, trust signals, what NOT to do).');
    lines.push('5. The single most-important thing to get right before publishing the first video.');
    lines.push('');
  }

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

    // 2026-06-09: audience persona block. Synthesized object on the
    // spine that gives the brief generator audience-specific language
    // (specific pain points, recurring questions in the audience's own
    // words) instead of generic declarations. Render the structured
    // lists so the LLM can cite them directly in bullets.
    const persona = spine.audience_persona;
    if (persona && typeof persona === 'object') {
      const fields = [];
      if (persona.pain_points?.length)        fields.push(`Pain points: ${persona.pain_points.join('; ')}`);
      if (persona.motivations?.length)        fields.push(`Motivations: ${persona.motivations.join('; ')}`);
      if (persona.questions_asked?.length)    fields.push(`Audience questions (in their own words): ${persona.questions_asked.join('; ')}`);
      if (persona.voice_patterns?.length)     fields.push(`Voice patterns: ${persona.voice_patterns.join('; ')}`);
      if (persona.trust_signals?.length)      fields.push(`Trust signals: ${persona.trust_signals.join('; ')}`);
      if (persona.adjacent_interests?.length) fields.push(`Adjacent interests: ${persona.adjacent_interests.join('; ')}`);
      if (fields.length) {
        lines.push('AUDIENCE PERSONA (synthesized from search queries + Spine + pillars — cite specific pain points and questions in the brief):');
        fields.forEach(s => lines.push(`- ${s}`));
        lines.push('');
      }
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

  // ── Cohort distributions ──
  // Per the 2026-06-12 critique: pass shapes, not single averages, so the
  // model cites real claims about cohort behavior instead of inventing
  // narrative from an aggregate stat. Any claim about cohort behavior in
  // the brief MUST be traceable to one of these distributions, OR labeled
  // as a hypothesis with the validation method specified.
  if (cohortDist) {
    lines.push(`PEER COHORT DISTRIBUTIONS (${cohortDist.channelCount} peer channels, ${cohortDist.videosAnalyzed} videos in the last ${cohortDist.windowDays} days — cite these directly; do not invent cohort claims):`);
    if (cohortDist.subDistribution) {
      const sd = cohortDist.subDistribution;
      lines.push(`- Subscriber distribution: p25 ${formatN(sd.p25)} / p50 ${formatN(sd.p50)} / p75 ${formatN(sd.p75)} (min ${formatN(sd.min)}, max ${formatN(sd.max)})`);
    }
    if (cohortDist.formatMix) {
      const f = cohortDist.formatMix;
      lines.push(`- Format mix: ${f.long_pct}% long-form (n=${f.long_n}) / ${f.shorts_pct}% Shorts (n=${f.shorts_n})`);
    }
    if (cohortDist.lengthHistogram) {
      const lh = cohortDist.lengthHistogram;
      lines.push(`- Long-form length histogram: 0-5m: ${lh['0-5m']}, 5-10m: ${lh['5-10m']}, 10-20m: ${lh['10-20m']}, 20-40m: ${lh['20-40m']}, 40m+: ${lh['40m+']}`);
    }
    if (cohortDist.uploadCadence) {
      const u = cohortDist.uploadCadence;
      lines.push(`- Upload cadence: median ${u.medianPerWeek} videos/week per peer (p25 ${u.p25PerWeek} / p75 ${u.p75PerWeek})`);
    }
    if (cohortDist.titleTokens?.length) {
      const tokensStr = cohortDist.titleTokens.map(t => `"${t.token}" (${t.channels} videos)`).join(', ');
      lines.push(`- Top-quartile title tokens (recurring across top-performing peer videos): ${tokensStr}`);
    }
    if (cohortDist.topVideos?.length) {
      lines.push('- Top 10 peer videos by views (last 90d):');
      cohortDist.topVideos.forEach((v, i) => {
        const mins = v.durationSeconds ? `${Math.round(v.durationSeconds / 60)}m` : '?';
        lines.push(`    ${i + 1}. "${v.title}" — ${v.channelName} · ${formatN(v.views)} views · ${mins} · ${v.format}`);
      });
    }
    lines.push('');
  }

  // ── Repositioning audit findings ──
  // Skip entirely for pre-launch clients — no audit exists, no fields
  // to render. (The PRE-LAUNCH MODE block above tells the LLM not to
  // cite analytics.)
  if (audit) {
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
  } // end if (audit)

  // ── Calibration findings ──
  if (calibration) {
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
  } // end if (calibration)

  lines.push('');
  if (isPrelaunch) {
    lines.push('Draft the pre-launch strategist brief per the PRE-LAUNCH MODE shape above. 4-5 numbered bullets in markdown. Action-led, evidence-cited (from the audience persona + cohort composition + Spine — NOT from analytics that don\'t exist), brand-register-aware. Cite specific persona questions in the audience\'s own words. No preamble, no closing, no headers.');
  } else {
    lines.push('Draft the weekly strategist brief. 4-5 numbered bullets in markdown. Action-led, evidence-cited, calibration-honest, brand-register-aware. No preamble, no closing, no headers.');
  }
  return lines.join('\n');
}

function formatN(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ──────────────────────────────────────────────────
// Critique + revise (2026-06-12)
// ──────────────────────────────────────────────────

const CRITIQUE_SYSTEM_PROMPT = `You are a skeptical senior strategist reviewing a junior strategist's draft weekly brief. You have the same context the writer had. Your job is to surface every flaw the writer would defend in person but cannot defend on paper.

You are NOT writing the revision. You are writing a critique. Be direct, specific, and harsh — the writer is a strong professional who will use clear feedback to ship a better artifact.

CHECK FOR:

1. UNLABELED HYPOTHESES — every claim must be either (a) traceable to a specific supplied data point, OR (b) prefixed with "Hypothesis (validate with: <concrete source>)". Speculation framed as fact is the #1 failure to flag. Examples of language that ALWAYS requires a hypothesis label: "likely", "probably", "typically", "tends to", "this category usually", "the cohort skews", "audiences in this space prefer". If the writer used any of these without the prefix, FLAG IT BY BULLET NUMBER.

2. UNSUPPORTED INFERENCE FROM AGGREGATES — single aggregate stats (avg subscriber count, single view-count number) cannot support claims about saturation, headroom, audience preference, or category dynamics. If the writer cited an average and then made causal/structural claims downstream, that's overreach. Flag specifically.

3. COHORT CLAIMS NOT TRACEABLE TO DISTRIBUTIONS — the user prompt supplied peer cohort distributions (format mix, length histogram, upload cadence, title tokens, top videos). Any cohort behavior claim in the brief MUST cite from one of these distributions explicitly. If the writer made a cohort claim without naming the distribution it came from, flag it.

4. PERSONA COVERAGE GAPS — count the persona's trust signals and pain points. Identify which are addressed in the bullets, which are explicitly deferred with reason, and which are silently missed. Silent misses are flaws — flag each one.

5. PLATFORM HEURISTICS GAPS — strategy without craft is half a brief. The brief should not be silent on hook structure, retention mechanics, packaging (title + thumbnail interplay), or first-30-second physics WHEN those are relevant to the recommendations. If the writer recommended a new content type or test without naming how it must work as a video, flag it.

6. META-OPPORTUNITY MISS — for clients in content / discoverability / media / audience-building / AI-visibility, the brief must evaluate whether the channel itself functions as live proof of the offering. If missing, flag.

7. NAMED-VIDEO RULE VIOLATION — bullets recommending a test on existing content must name the specific video. Phrases like "a similar video" or "one of your videos" are flaws. Flag each.

8. TONE — hype words, view-count promises, generic "post consistently"-class advice. Flag each.

OUTPUT FORMAT:

If the draft is clean and you find no material issues, output exactly:
NO MATERIAL ISSUES

Otherwise, output a numbered list of issues. For each issue:
- Cite the bullet number from the draft
- Quote the offending phrase (in quotes, ≤15 words)
- State the rule violated (one short sentence)
- Specify the fix (one short sentence — what should change)

Be ruthless about real flaws; do not invent ones. If a claim IS supported by the supplied data, do not flag it just to fill space.`;

const REVISE_SYSTEM_PROMPT = `You are the same senior strategist who drafted the brief, now revising it based on a skeptical reviewer's critique. The critique is concrete; you apply each item where it has merit, push back (briefly, internally) on items that don't, and ship a revised brief that defends every claim.

YOU MUST:
- Preserve everything the critique did not flag — do not rewrite from scratch
- For each flagged claim: either cite the specific data point that supports it, OR prefix with "Hypothesis (validate with: <concrete source>)", OR cut it
- For persona coverage gaps the critique surfaced: either add a bullet, or merge the gap into an existing bullet, or add an explicit deferral line ("Deferred: <signal/pain> — <reason>")
- For platform-heuristics gaps: only add craft guidance that is grounded in known YouTube physics; do not invent
- For meta-opportunity miss: if applicable, add a dedicated bullet about the channel as live proof of the offering
- Hold to the 4-5 bullet format. If the critique adds material, prefer densifying existing bullets over adding a sixth

OUTPUT: the revised brief only. Same format as the original (numbered list, markdown). No preamble, no closing remarks, no meta-commentary about what changed.`;

function buildCritiquePrompt({ draftText, userPrompt }) {
  return `CONTEXT THE WRITER HAD:

${userPrompt}

═══════════════════════════════════════════════════════
THE WRITER'S DRAFT BRIEF:

${draftText}

═══════════════════════════════════════════════════════

Review the draft against the rubric. Output the critique now.`;
}

function buildRevisePrompt({ draftText, critiqueText, userPrompt }) {
  return `CONTEXT YOU HAD:

${userPrompt}

═══════════════════════════════════════════════════════
YOUR DRAFT:

${draftText}

═══════════════════════════════════════════════════════
THE REVIEWER'S CRITIQUE:

${critiqueText}

═══════════════════════════════════════════════════════

Apply the critique. Output the revised brief now.`;
}

export default { generateWeeklyBrief, BRIEF_PROMPT_VERSION };
