/**
 * Executive justification memo service — the LLM pass that turns a
 * scored concept into a stakeholder-approval artifact.
 *
 * Different audience than the strategic-read:
 *   strategic_read    → producer-facing concept gate (3-4 sentences)
 *   executive_memo    → marketing-decision-maker-facing justification
 *                       (one-page markdown, sectioned, defensible to a
 *                       VP / legal / compliance reviewer)
 *
 * Use case: institutional brand clients (foundations, trust-sensitive
 * B2C, D2C consumer, QSR) — Director of Marketing needs to justify
 * "here's why we're greenlighting this video" to a VP or to a legal
 * reviewer. The memo is the artifact the Director copies into the
 * approval thread / brief.
 *
 * Architecture:
 *   - One Claude call per scorecard, on-demand (NOT auto-generated like
 *     strategic_read). Most scorecards don't need a memo; only the ones
 *     headed to approval do.
 *   - Versioned prompt — bumping EXECUTIVE_MEMO_PROMPT_VERSION invalidates
 *     cached memos; the orchestrator regenerates on next view.
 *   - Output is markdown — sections matter so the artifact reads like
 *     something a strategist would draft, not LLM prose. Sections:
 *       ## Verdict        (one-line greenlight call)
 *       ## Hypothesis     (what we're testing, who it's for, what success looks like)
 *       ## Why now        (market/cohort context that makes this timely)
 *       ## Predicted performance (confidence-honest, cited to scorer)
 *       ## Risk register  (what could go wrong, what mitigations exist)
 *       ## Success criteria (measurable indicators)
 *
 * Tone constraints (enforced via system prompt):
 *   - Speaks to a Director presenting to a VP. NOT to a creator.
 *   - Evidence-led — every claim cites a deterministic number from the
 *     scorer, not generic strategic-speak.
 *   - Brand-register aware — trust-sensitive registers get explicit
 *     brand-safety framing in the Risk register. Casual-register channels
 *     don't pretend to be trust-sensitive.
 *   - No hype vocabulary (leverage, unlock, robust, innovative, etc.).
 *   - No view-count forecasts. Performance section uses confidence
 *     language (statistical / directional / insufficient data) verbatim
 *     from the scorer.
 *   - Risk register names format-skew warnings and dimension drags as
 *     specific risks with mitigations, not generic disclaimers.
 *
 * Token target: ~1200-1500 tokens (one page). The producer's strategic
 * read is 3-4 sentences; this memo is the full artifact.
 */

export const EXECUTIVE_MEMO_PROMPT_VERSION = 'v1-executive-memo';

/**
 * Generate the executive justification memo for a scored concept.
 *
 * @param {Object} args
 * @param {Object} args.input             concept input (see migration 086 header)
 * @param {Object} args.scoringOutput     deterministic output from scoreConcept()
 * @param {string} [args.strategicRead]   prior 3-4 sentence strategist narrative (optional, used as context)
 * @param {Array}  [args.alternativeTitles] LLM-suggested reframes (optional, surfaced in the memo for transparency)
 * @param {Object} [args.cohortSummary]   { clientName, channelCount, videoCount, topGap, topBreakout }
 * @param {Object} [args.spine]           brand voice + editorial POV (for register-aware framing)
 * @returns {Promise<{ text: string | null, promptVersion: string, error?: string }>}
 */
export async function generateExecutiveMemo({
  input,
  scoringOutput,
  strategicRead = null,
  alternativeTitles = [],
  cohortSummary = {},
  spine = null,
}) {
  if (!input || !scoringOutput) {
    return { text: null, promptVersion: EXECUTIVE_MEMO_PROMPT_VERSION, error: 'missing input or scoring output' };
  }

  try {
    const claudeAPI = (await import('./claudeAPI')).default;
    const userPrompt = buildUserPrompt({ input, scoringOutput, strategicRead, alternativeTitles, cohortSummary, spine });
    const result = await claudeAPI.call(
      userPrompt,
      SYSTEM_PROMPT,
      'concept_executive_memo',
      2000,                // one-page memo fits comfortably under 2000 tokens
    );
    const text = (result?.text || '').trim();
    if (!text) {
      return { text: null, promptVersion: EXECUTIVE_MEMO_PROMPT_VERSION, error: 'empty response' };
    }
    return { text, promptVersion: EXECUTIVE_MEMO_PROMPT_VERSION };
  } catch (err) {
    console.warn('[executiveMemo] generation failed:', err);
    return { text: null, promptVersion: EXECUTIVE_MEMO_PROMPT_VERSION, error: err?.message || 'unknown error' };
  }
}

// ──────────────────────────────────────────────────
// Prompt construction
// ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior YouTube strategist drafting a one-page executive justification memo for a video concept. The audience is a Director of Marketing who will present this to a VP — sometimes through a legal or compliance review.

This is NOT the producer's gate-read (3-4 sentences). This is the full justification artifact. The Director will copy this into the approval thread.

Output format: GitHub-flavored markdown. Use these exact section headers in this order:

## Verdict
## Hypothesis
## Why now
## Predicted performance
## Risk register
## Success criteria

Section content rules:

VERDICT — one line. One of: "Greenlight", "Greenlight with caveats", "Re-work before producing", "Hold — insufficient data". No preamble. The composite tier maps:
  very_likely_outperform → Greenlight
  likely_solid → Greenlight (note specific caveat if any dimension is risky/predicted_under)
  risky → Greenlight with caveats OR Re-work before producing (your call based on what's broken)
  predicted_under → Re-work before producing
Insufficient-data scenarios (no cohort match, low-n directional everywhere) → Hold.

HYPOTHESIS — 2-3 sentences. What is this video testing? Who is the audience? What does success look like in plain terms (not view counts — clarity, action, share-worthiness, brand-position reinforcement)?

WHY NOW — 2-3 sentences. Cite specific cohort context: notable gap, active breakout, surface trends. If the cohort context is thin, say "Cohort data shows X but doesn't yet support a strong timing claim" rather than inventing one.

PREDICTED PERFORMANCE — 2-3 sentences. Lead with the strongest specific number from the deterministic scores ("Title pattern X carries +90% statistical lift across the cohort"). Use the scorer's confidence language verbatim — "statistical" / "directional" / "insufficient". Distinguish what's evidenced from what's a hypothesis. NEVER predict view counts.

RISK REGISTER — bullet list, 2-5 items. Each bullet: "**[Risk]** Description — *Mitigation: ...*". Surface specifically:
  - Format-skew warnings (e.g., "Title pattern lift is mostly Shorts-driven; this is long-form")
  - Drags (negative-lift patterns matched in the title)
  - Brand-register risks for trust-sensitive channels — if the channel's voice + editorial POV indicate finance / legal / medical / professional services, name the brand-trust risk of any hype-flavored tweak suggestions even when cohort lift supports them.
  - Slot risks (low-confidence slot picks)
  - Topic saturation risks (over-published topics)
Each risk MUST have a concrete mitigation, not "monitor closely".

SUCCESS CRITERIA — bullet list, 3-5 measurable indicators. Mix of leading and lagging:
  - First-48h indicators (view velocity vs channel median, retention through hook beat)
  - Mid-window indicators (impressions:CTR ratio if surface_fit is part of the call)
  - Lagging indicators (relative-to-channel-baseline performance, search query share if applicable)
NEVER absolute view counts. ALWAYS relative to channel baseline.

Voice rules across the whole memo:
- Director-to-VP register: confident, evidence-led, not hedge-laden, not hype-laden.
- NO words: leverage, unlock, robust, innovative, stands out, compelling, powerful, game-changer, cutting-edge, drives, taps into, resonates with.
- Use plain nouns and verbs. "The cohort's Tuesday-morning lift is +90%" not "Tuesday morning emerges as a powerful publishing window."
- Brand-register check: if voice + editorial POV indicate trust-sensitive, the Risk register MUST address brand-trust exposure on any hype-flavored elements.
- If a section genuinely has insufficient data, write "Insufficient cohort data to support a [specific claim]. The producer should [concrete next step]." Do NOT invent claims.`;

function buildUserPrompt({ input, scoringOutput, strategicRead, alternativeTitles, cohortSummary, spine }) {
  const lines = [];

  // ── Concept ──
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
  if (input.target_surface) lines.push(`- Target surface: ${input.target_surface}`);
  if (input.hook_beat) lines.push(`- Hook beat (first 30s promise): ${input.hook_beat}`);
  if (input.notes) lines.push(`- Strategist notes: ${input.notes}`);
  lines.push('');

  // ── Client + cohort ──
  if (cohortSummary.clientName || cohortSummary.channelCount) {
    lines.push('CLIENT + COHORT CONTEXT:');
    if (cohortSummary.clientName) lines.push(`- Client: ${cohortSummary.clientName}`);
    if (cohortSummary.channelCount && cohortSummary.videoCount) {
      lines.push(`- Cohort: ${cohortSummary.channelCount} channels, ${cohortSummary.videoCount} videos in window`);
    }
    if (cohortSummary.topGap) lines.push(`- Notable gap in cohort: ${cohortSummary.topGap}`);
    if (cohortSummary.topBreakout) lines.push(`- Active breakout in cohort: ${cohortSummary.topBreakout}`);
    lines.push('');
  }

  // ── Brand register (Strategy Spine) ──
  if (spine?.editorial_pov?.trim() || spine?.voice_tone?.trim() || spine?.audience_persona?.trim()) {
    lines.push('BRAND REGISTER (from Strategy Spine):');
    if (spine.editorial_pov?.trim()) lines.push(`- Editorial POV: ${spine.editorial_pov.trim()}`);
    if (spine.voice_tone?.trim())    lines.push(`- Voice + tone: ${spine.voice_tone.trim()}`);
    if (spine.audience_persona?.trim()) lines.push(`- Audience persona: ${spine.audience_persona.trim()}`);
    lines.push('');
  }

  // ── Deterministic scores ──
  lines.push('DETERMINISTIC SCORES:');
  lines.push(`- Composite tier: ${scoringOutput.composite_tier}`);
  if (scoringOutput.composite_rationale) {
    lines.push(`- Composite rationale: ${scoringOutput.composite_rationale}`);
  }

  const { scores } = scoringOutput;
  if (scores?.title_patterns) {
    const tp = scores.title_patterns;
    lines.push(`- Title patterns: tier=${tp.tier}, best matched lift=${tp.composite_lift_pct == null ? 'n/a' : tp.composite_lift_pct + '%'}`);
    if (tp.matched?.length) {
      tp.matched.forEach(m => {
        const skew = m.format_skew_warning ? ` [FORMAT SKEW: ${m.format_skew_warning}]` : '';
        lines.push(`    · ${m.label}: ${m.lift_pct >= 0 ? '+' : ''}${m.lift_pct}% ${m.confidence} (n=${m.n})${skew}`);
      });
    }
    if (tp.drags?.length) {
      tp.drags.forEach(d => {
        lines.push(`    · DRAG — ${d.label}: ${d.lift_pct}% ${d.confidence} (n=${d.n})`);
      });
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
  if (scores?.surface_fit) {
    const sf = scores.surface_fit;
    lines.push(`- Surface fit (${sf.target_surface}): tier=${sf.tier}, share=${sf.share_pct == null ? 'n/a' : sf.share_pct + '%'} (${sf.confidence})`);
  }
  if (scores?.search_keyword_match) {
    const sk = scores.search_keyword_match;
    lines.push(`- Search keyword match: tier=${sk.tier}, matches=${sk.matched_keywords?.length || 0} (${sk.confidence})`);
  }
  if (scores?.curiosity_gap) {
    const cg = scores.curiosity_gap;
    lines.push(`- Curiosity gap (LLM 1-10): tier=${cg.tier}, rating=${cg.rating}/10`);
  }
  if (scores?.hook_promise_delivery) {
    const hp = scores.hook_promise_delivery;
    lines.push(`- Hook promise delivery: tier=${hp.tier}, ${hp.alignment || 'no alignment data'}`);
  }
  if (scores?.topic_authority) {
    const ta = scores.topic_authority;
    lines.push(`- Topic authority: tier=${ta.tier}, similarity to historical hits=${ta.historical_similarity == null ? 'n/a' : ta.historical_similarity.toFixed(3)}`);
  }

  if (scoringOutput.suggested_tweaks?.length) {
    lines.push('');
    lines.push('SUGGESTED TWEAKS (scorer-generated, rank-ordered by projected impact):');
    scoringOutput.suggested_tweaks.forEach((tw, i) => {
      lines.push(`${i + 1}. [${tw.dimension}] ${tw.suggestion}`);
    });
  }

  // ── Existing strategist narrative (for tone-matching) ──
  if (strategicRead?.trim()) {
    lines.push('');
    lines.push('STRATEGIC READ (already drafted for the producer — use as a tone anchor, expand into the memo):');
    lines.push(strategicRead.trim());
  }

  // ── Alternative titles (so the memo can reference "we considered X reframes") ──
  if (alternativeTitles?.length) {
    lines.push('');
    lines.push('ALTERNATIVE TITLES CONSIDERED:');
    alternativeTitles.forEach((alt, i) => {
      const addresses = alt.addresses ? ` (addresses: ${alt.addresses})` : '';
      lines.push(`${i + 1}. "${alt.title}"${addresses}`);
    });
  }

  lines.push('');
  lines.push('Draft the one-page executive justification memo in markdown with the six sections specified.');
  return lines.join('\n');
}

export default { generateExecutiveMemo, EXECUTIVE_MEMO_PROMPT_VERSION };
