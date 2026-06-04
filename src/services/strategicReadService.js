/**
 * Strategic-read service — the LLM pass that sits on top of the
 * deterministic concept scorer.
 *
 * The deterministic scorecard answers "what does the math say?" The
 * strategic read answers "what does this mean for the channel?" — in
 * 3-4 sentences a senior strategist would actually write, citing the
 * specific numbers and naming the drag / skew honestly.
 *
 * Architecture:
 *   - One Claude call per scorecard. Stateless. Cheap (~$0.01-0.03).
 *   - Versioned prompt — bumping STRATEGIC_READ_PROMPT_VERSION
 *     invalidates the cached text on the scorecard row; the orchestrator
 *     regenerates against the current prompt.
 *   - Output is plain text (3-4 sentences, no markdown). The UI renders
 *     it as a paragraph beneath the deterministic per-dimension panel.
 *
 * Tone rules (enforced via the system prompt):
 *   - Evidence-led: lead with a specific number from the deterministic
 *     scores, not a vague claim.
 *   - Honest about directional vs. statistical confidence — directional
 *     numbers get named as hypotheses, not commitments.
 *   - Honest about format-skew warnings — when a title pattern's lift
 *     is mostly Shorts-driven and the concept is long-form, the read
 *     says so explicitly.
 *   - No AI-tell vocabulary ("leverage", "robust", "innovative",
 *     "stands out", "unlock"). Match the audit-brief register.
 *
 * The strategic read is NOT a forecast ("expect 50K views"). It's a
 * concept-gate read ("clears the bar / clears with caveats / re-work
 * before producing").
 */

export const STRATEGIC_READ_PROMPT_VERSION = 'v2-scorer-strategic-read-brand-register';

/**
 * Generate a 3-4 sentence strategic narrative for a scored concept.
 *
 * @param {Object} args
 * @param {Object} args.input            concept input (see migration 086 header)
 * @param {Object} args.scoringOutput    deterministic output from scoreConcept()
 * @param {Object} [args.cohortSummary]  cohort context the read can cite:
 *                                       { clientName, channelCount, videoCount,
 *                                         topGap?, topBreakout? }
 * @returns {Promise<{ text: string | null, promptVersion: string, error?: string }>}
 */
export async function generateStrategicRead({ input, scoringOutput, cohortSummary = {} }) {
  if (!input || !scoringOutput) {
    return { text: null, promptVersion: STRATEGIC_READ_PROMPT_VERSION, error: 'missing input or scoring output' };
  }

  try {
    const claudeAPI = (await import('./claudeAPI')).default;
    const userPrompt = buildUserPrompt({ input, scoringOutput, cohortSummary });
    const result = await claudeAPI.call(
      userPrompt,
      SYSTEM_PROMPT,
      'concept_strategic_read',
      400,                                // 3-4 sentences fits well under 400 tokens
    );
    const text = (result?.text || '').trim();
    if (!text) {
      return { text: null, promptVersion: STRATEGIC_READ_PROMPT_VERSION, error: 'empty response' };
    }
    return { text, promptVersion: STRATEGIC_READ_PROMPT_VERSION };
  } catch (err) {
    console.warn('[strategicRead] generation failed:', err);
    return { text: null, promptVersion: STRATEGIC_READ_PROMPT_VERSION, error: err?.message || 'unknown error' };
  }
}

// ──────────────────────────────────────────────────
// Prompt construction
// ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior YouTube strategist writing the brief read on a pre-flight concept scorecard for a producer.

Your job: in 3-4 sentences, translate the deterministic per-dimension scores into a strategic narrative the producer can act on. NOT a forecast — this is a concept gate ("clears the bar to produce", "clears with caveats", "re-work before producing").

Rules:
- Lead with the strongest specific number from the scores (e.g. "Wed 6am-12pm carries a +90% statistical lift").
- Name any drag or format-skew warning explicitly. If a pattern's lift is mostly Shorts-driven and this concept is long-form, say so.
- Distinguish statistical from directional confidence in plain English. Directional = "early signal, worth testing once" not "this will work".
- Brand-register check: if the channel's voice + editorial POV indicate a trust-sensitive register (finance, legal, medical, professional services), question whether high-lift hype-flavored tweaks (ALL CAPS, emoji, clickbait phrasing) would violate brand register — even when the cohort data supports them. Cohort lift on a register-mismatched tweak is short-term clicks at the cost of long-term audience trust; flag this explicitly when relevant.
- Close with the gate read: does it clear / clear with caveats / need re-work, with the dominant reason.
- Plain language. NO hype words: leverage, unlock, robust, innovative, stands out, compelling, powerful, game-changer, cutting-edge.
- No bullets, no markdown, no headers. Continuous prose, 3-4 sentences.
- Do NOT predict view counts. Do NOT promise outcomes. Frame as concept-gate verdict, not forecast.`;

function buildUserPrompt({ input, scoringOutput, cohortSummary }) {
  const lines = [];
  lines.push('CONCEPT:');
  lines.push(`- Title: "${input.title}"`);
  lines.push(`- Format: ${input.format}`);
  if (input.planned_day && input.planned_hour_block) {
    lines.push(`- Planned slot: ${input.planned_day} ${input.planned_hour_block}`);
  }
  if (input.length_seconds) {
    const mins = Math.round(input.length_seconds / 60);
    lines.push(`- Planned length: ~${mins} min`);
  }
  if (input.topic_label) lines.push(`- Topic: ${input.topic_label}`);
  if (input.notes) lines.push(`- Strategist notes: ${input.notes}`);
  lines.push('');

  // Cohort context — gives the read something to anchor "claims the X gap" / "matches the Y breakout"
  if (cohortSummary.clientName || cohortSummary.channelCount) {
    lines.push('COHORT CONTEXT:');
    if (cohortSummary.clientName) lines.push(`- Client: ${cohortSummary.clientName}`);
    if (cohortSummary.channelCount && cohortSummary.videoCount) {
      lines.push(`- Cohort: ${cohortSummary.channelCount} channels, ${cohortSummary.videoCount} videos in window`);
    }
    if (cohortSummary.topGap) lines.push(`- Notable gap in cohort: ${cohortSummary.topGap}`);
    if (cohortSummary.topBreakout) lines.push(`- Active breakout in cohort: ${cohortSummary.topBreakout}`);
    lines.push('');
  }

  // Phase 2.7b — brand-register context. Lets the LLM judge whether
  // pattern-tweak suggestions (especially ALL CAPS / emoji / hype
  // language) align with the channel's editorial voice, instead of
  // taking cohort-level lift numbers as universally portable.
  const spine = cohortSummary.spine || {};
  if (spine.editorial_pov?.trim() || spine.voice_tone?.trim()) {
    lines.push('BRAND REGISTER (from Strategy Spine):');
    if (spine.editorial_pov?.trim()) {
      lines.push(`- Editorial POV: ${spine.editorial_pov.trim()}`);
    }
    if (spine.voice_tone?.trim()) {
      lines.push(`- Voice + tone: ${spine.voice_tone.trim()}`);
    }
    lines.push('');
  }

  lines.push('DETERMINISTIC SCORES:');
  lines.push(`- Composite tier: ${scoringOutput.composite_tier}`);
  if (scoringOutput.composite_rationale) {
    lines.push(`- Composite rationale: ${scoringOutput.composite_rationale}`);
  }

  // Per-dimension detail. Skip nulls (e.g. shorts has no length score).
  const { scores } = scoringOutput;
  if (scores?.title_patterns) {
    const tp = scores.title_patterns;
    lines.push(`- Title patterns: tier=${tp.tier}, best matched lift=${tp.composite_lift_pct == null ? 'n/a' : tp.composite_lift_pct + '%'}`);
    if (tp.matched?.length) {
      const matchLines = tp.matched.map(m => {
        const skew = m.format_skew_warning ? ` [SKEW: ${m.format_skew_warning}]` : '';
        return `    · ${m.label}: ${m.lift_pct >= 0 ? '+' : ''}${m.lift_pct}% ${m.confidence} (n=${m.n})${skew}`;
      });
      lines.push(...matchLines);
    }
    if (tp.drags?.length) {
      const dragLines = tp.drags.map(d => `    · DRAG — ${d.label}: ${d.lift_pct}% ${d.confidence} (n=${d.n})`);
      lines.push(...dragLines);
    }
  }
  if (scores?.slot) {
    const s = scores.slot;
    lines.push(`- Slot (${s.day} ${s.block}): tier=${s.tier}, lift=${s.lift_pct == null ? 'n/a' : (s.lift_pct >= 0 ? '+' : '') + s.lift_pct + '%'} ${s.confidence} (n=${s.n})`);
  }
  if (scores?.length) {
    const l = scores.length;
    lines.push(`- Length (${l.bucket}): tier=${l.tier}, lift=${l.lift_pct == null ? 'n/a' : (l.lift_pct >= 0 ? '+' : '') + l.lift_pct + '%'} ${l.confidence} (n=${l.n})`);
  }
  if (scores?.topic) {
    const t = scores.topic;
    const matchedNote = t.matched_topic_name ? ` (matched "${t.matched_topic_name}")` : ' (no cohort match — novel)';
    lines.push(`- Topic "${t.label}"${matchedNote}: tier=${t.tier}, saturation=${t.saturation}, share=${t.cohort_share_pct ?? '0'}%`);
  }

  if (scoringOutput.suggested_tweaks?.length) {
    lines.push('');
    lines.push('SUGGESTED TWEAKS (rank-ordered by projected impact):');
    scoringOutput.suggested_tweaks.forEach((tw, i) => {
      lines.push(`${i + 1}. [${tw.dimension}] ${tw.suggestion}`);
    });
  }

  lines.push('');
  lines.push('Write the 3-4 sentence strategic read for the producer.');
  return lines.join('\n');
}

export default { generateStrategicRead, STRATEGIC_READ_PROMPT_VERSION };
