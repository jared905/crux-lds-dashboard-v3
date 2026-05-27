/**
 * Strategy Spine service — the per-client evolving doc that
 * audit packs / briefings / quarterlies all render from.
 *
 * Hybrid model:
 *   - Strategist authors: positioning_hypothesis, audience_read,
 *     quarterly_stance, active_plays. The judgment layer.
 *   - Service computes: computed_snapshot (archetype mix, format mix,
 *     cadence, opportunities). Cached and regenerable.
 *
 * v1 surface: read/write strategist fields + active plays CRUD.
 * Snapshot computation is stubbed for now and will fill in as the
 * audit pack is refactored onto the spine.
 */
import { supabase } from './supabaseClient';
import { computeClientDiagnostic } from './clientDiagnosticService';
import { analyzePatterns } from './patternsService';
import { analyzeWhiteSpace } from './whiteSpaceService';
import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';

const PLAY_STATUSES = ['in_flight', 'concluded_won', 'concluded_lost', 'paused'];
export const PLAY_STATUS_LABELS = {
  in_flight: 'In flight',
  concluded_won: 'Concluded — won',
  concluded_lost: 'Concluded — lost',
  paused: 'Paused',
};

// ──────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────

/**
 * Load a client's spine. Creates an empty row on first read so the UI
 * can bind fields without a separate "exists?" check.
 */
export async function getSpine(clientId) {
  if (!supabase || !clientId) return null;
  const { data, error } = await supabase
    .from('client_strategy_spine')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) {
    console.warn('[spine] read failed:', error);
    return null;
  }
  if (data) return data;
  // First touch — create an empty spine row.
  const { data: created, error: createErr } = await supabase
    .from('client_strategy_spine')
    .insert({ client_id: clientId, active_plays: [] })
    .select()
    .single();
  if (createErr) {
    console.warn('[spine] create-on-read failed:', createErr);
    return null;
  }
  return created;
}

// ──────────────────────────────────────────────────
// Update strategist fields
// ──────────────────────────────────────────────────

const FIELD_TIMESTAMP_MAP = {
  positioning_hypothesis: 'positioning_updated_at',
  positioning_oneliner: 'positioning_oneliner_updated_at',
  audience_read: 'audience_updated_at',
  quarterly_stance: 'quarterly_stance_updated_at',
  guardrails: 'guardrails_updated_at',
  competitive_posture: 'competitive_posture_updated_at',
  editorial_pov: 'editorial_pov_updated_at',
  voice_tone: 'voice_tone_updated_at',
  host_archetype: 'host_archetype_updated_at',
  // quarterly_stance_label rides on the same timestamp; updated together.
};

export const POSITIONING_ONELINER_MAX_CHARS = 120;

// Host archetype catalog — the on-camera personas the talent audition
// rubric chooses against. Surfaced as a picker in the spine UI; AI
// suggestion in Phase D will propose one of these from sample videos.
export const HOST_ARCHETYPES = [
  { id: 'authority',    label: 'The Authority',    description: 'Subject expert. Didactic. Establishes credibility through knowledge density.' },
  { id: 'storyteller',  label: 'The Storyteller',  description: 'Narrative-led. Emotional arc per episode. Lessons land through story.' },
  { id: 'companion',    label: 'The Companion',    description: 'Conversational, intimate. "Friend at coffee." Low-production, high-warmth.' },
  { id: 'showman',      label: 'The Showman',      description: 'High-energy entertainer. Pace, surprise, spectacle. Brand-personality dominant.' },
  { id: 'practitioner', label: 'The Practitioner', description: 'Demonstrates. Hands-on. Viewer watches the work, not the talk.' },
  { id: 'sage',         label: 'The Sage',         description: 'Older voice. Perspective. Speaks slowly; what is said matters more than how much.' },
  { id: 'analyst',      label: 'The Analyst',      description: 'Frameworks + data. Visualizes thinking. Persuades by structure rather than emotion.' },
  { id: 'guide',        label: 'The Guide',        description: 'Walks the viewer through a transformation step-by-step. Coaching posture.' },
];

export const HOST_ARCHETYPE_BY_ID = Object.fromEntries(HOST_ARCHETYPES.map(a => [a.id, a]));

/**
 * Update a single strategist field. Touches the corresponding
 * *_updated_at so the UI can show "X days ago" + drift comparisons.
 */
export async function updateSpineField(clientId, field, value) {
  if (!supabase || !clientId || !field) return { ok: false, error: 'missing' };
  const stampField = FIELD_TIMESTAMP_MAP[field];
  const patch = { [field]: value ?? null };
  if (stampField) patch[stampField] = new Date().toISOString();
  const { error } = await supabase
    .from('client_strategy_spine')
    .update(patch)
    .eq('client_id', clientId);
  return { ok: !error, error: error?.message };
}

/**
 * Update quarterly stance text + label in one shot — they always change
 * together and share quarterly_stance_updated_at.
 */
export async function updateQuarterlyStance(clientId, { text, label }) {
  if (!supabase || !clientId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('client_strategy_spine')
    .update({
      quarterly_stance: text ?? null,
      quarterly_stance_label: label ?? null,
      quarterly_stance_updated_at: new Date().toISOString(),
    })
    .eq('client_id', clientId);
  return { ok: !error, error: error?.message };
}

// ──────────────────────────────────────────────────
// Active plays — JSONB array CRUD
// ──────────────────────────────────────────────────

function newPlayId() {
  return 'play_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Rewrite the entire active_plays array. Caller is responsible for
 * sending a valid array; we validate status values defensively.
 */
async function writePlays(clientId, plays) {
  const normalized = (plays || []).map(p => ({
    ...p,
    status: PLAY_STATUSES.includes(p.status) ? p.status : 'in_flight',
  }));
  const { error } = await supabase
    .from('client_strategy_spine')
    .update({ active_plays: normalized })
    .eq('client_id', clientId);
  return { ok: !error, error: error?.message, plays: normalized };
}

export async function addActivePlay(clientId, play) {
  if (!supabase || !clientId) return { ok: false, error: 'missing' };
  const spine = await getSpine(clientId);
  if (!spine) return { ok: false, error: 'no spine' };
  const next = [
    ...(spine.active_plays || []),
    {
      id: newPlayId(),
      name: play?.name || 'Untitled play',
      hypothesis: play?.hypothesis || '',
      started_at: play?.started_at || new Date().toISOString().slice(0, 10),
      status: play?.status || 'in_flight',
      evidence: play?.evidence || '',
      notes: play?.notes || '',
    },
  ];
  return writePlays(clientId, next);
}

export async function updateActivePlay(clientId, playId, patch) {
  if (!supabase || !clientId || !playId) return { ok: false, error: 'missing' };
  const spine = await getSpine(clientId);
  if (!spine) return { ok: false, error: 'no spine' };
  const next = (spine.active_plays || []).map(p =>
    p.id === playId ? { ...p, ...patch } : p
  );
  return writePlays(clientId, next);
}

export async function removeActivePlay(clientId, playId) {
  if (!supabase || !clientId || !playId) return { ok: false, error: 'missing' };
  const spine = await getSpine(clientId);
  if (!spine) return { ok: false, error: 'no spine' };
  const next = (spine.active_plays || []).filter(p => p.id !== playId);
  return writePlays(clientId, next);
}

// ──────────────────────────────────────────────────
// Computed snapshot (v1 stub)
// ──────────────────────────────────────────────────

/**
 * Refresh the cached computed_snapshot for a client. Runs the same
 * analysis pipeline as the audit pack (diagnostic + patterns + white
 * space) and stores compact summaries so the spine view can render
 * meaningful signal without re-running the heavy compute on every load.
 *
 * Cost note: this triggers a Claude call inside analyzeWhiteSpace (for
 * the opportunity brief). Cents per click. Strategist-controlled.
 */
export async function refreshSnapshot(clientId) {
  if (!supabase || !clientId) return { ok: false, error: 'missing' };

  // Pull the client row for headline context
  const { data: client } = await supabase
    .from('channels')
    .select('id, name, subscriber_count, video_count, lifecycle_stage, is_client')
    .eq('id', clientId)
    .single();

  // Pinned competitor cohort size + sync health
  const { data: junctions } = await supabase
    .from('client_channels')
    .select('channel_id')
    .eq('client_id', clientId);
  const competitorIds = (junctions || []).map(j => j.channel_id);

  let competitorsErrored = 0;
  let competitorsCategorized = 0;
  if (competitorIds.length) {
    const { data: errored } = await supabase
      .from('channels')
      .select('id')
      .in('id', competitorIds)
      .not('last_sync_error', 'is', null);
    competitorsErrored = errored?.length || 0;

    const { data: categorized } = await supabase
      .from('channel_categories')
      .select('channel_id')
      .in('channel_id', competitorIds);
    competitorsCategorized = new Set((categorized || []).map(r => r.channel_id)).size;
  }

  // Run the heavy compute pipeline in parallel. Each piece feeds one
  // of the snapshot slots. Failures degrade gracefully — the slot stays
  // null rather than blowing up the whole refresh.
  const [diagnostic, patterns, whiteSpace] = await Promise.all([
    competitorIds.length
      ? computeClientDiagnostic({ clientId, scopeChannelIds: competitorIds, windowDays: 90 }).catch(() => null)
      : null,
    competitorIds.length
      ? analyzePatterns({ scopeChannelIds: competitorIds, windowDays: 90 }).catch(() => null)
      : null,
    competitorIds.length
      ? analyzeWhiteSpace({ scopeChannelIds: competitorIds, windowDays: 90, scopeLabel: client?.name || 'cohort' }).catch(() => null)
      : null,
  ]);

  // ─── Build compact summaries for each slot ───

  // archetype_mix — segments with channel counts + engagement medians.
  // Trimmed to the fields a strategist actually skims.
  const archetypeMix = diagnostic?.archetypeBreakdown?.segments?.length
    ? {
        client_archetype: diagnostic.client?.archetypeLabel || null,
        segments: diagnostic.archetypeBreakdown.segments.slice(0, 6).map(a => ({
          archetype: a.archetype,
          label: a.label,
          channel_count: a.channelCount,
          video_count: a.videoCount,
          median_engagement: a.medianEngagement,
          top_patterns: (a.patterns || []).slice(0, 3).map(p => ({
            label: p.label,
            lift: p.lift,
            confidence: p.confidence,
          })),
        })),
        coverage: diagnostic.archetypeBreakdown.coverage || null,
      }
    : null;

  // format_mix — shorts/long ratio (from patternsService.formatBreakdown)
  // + length bands with lifts (from diagnostic.workingBuckets).
  const fb = patterns?.scope?.formatBreakdown;
  const formatMix = (diagnostic?.workingBuckets?.length || fb)
    ? {
        shorts_freq: fb?.shortsFreq ?? null,
        longs_freq: fb?.longsFreq ?? null,
        shorts_count: fb?.shortsCount ?? null,
        longs_count: fb?.longsCount ?? null,
        working_buckets: (diagnostic?.workingBuckets || []).slice(0, 6).map(b => ({
          label: b.label,
          freq: b.freq,
          lift: b.lift,
          count: b.count,
          confidence: b.confidence,
        })),
      }
    : null;

  // cadence — top working slots, segmented by format. Pooling long-form
  // and shorts together produces release-slot artifacts (the cohort's
  // big content releases dominate whatever slot they land in). Per-format
  // gives the strategist actionable "upload here" recommendations.
  const formatSlots = (slots = []) => slots.slice(0, 5).map(s => ({
    slot: s.slot,
    day: s.day,
    block: s.block,
    lift: s.lift,
    count: s.count,
    confidence: s.confidence,
    release_slot_caveat: !!s.releaseSlotCaveat,
  }));
  const longFormSlots = diagnostic?.workingSlotsByFormat?.longForm || [];
  const shortsSlots = diagnostic?.workingSlotsByFormat?.shorts || [];
  const cadence = (longFormSlots.length || shortsSlots.length)
    ? {
        long_form: formatSlots(longFormSlots),
        shorts: formatSlots(shortsSlots),
      }
    : null;

  // outliers — top breakout videos in the cohort (anti-echo: helps
  // strategist see what's actually working without inferring).
  // patternsService returns: { title, views, multiplier, channel: { name, ... },
  //   publishedAt, isSuspect, ... } — extract the primitives we need.
  const outliers = patterns?.scope?.outliers?.length
    ? patterns.scope.outliers.slice(0, 8).map(o => ({
        title: o.title,
        channel_name: o.channel?.name || null,
        views: o.views,
        multiplier: o.multiplier,
        published_at: o.publishedAt,
        suspect: !!o.isSuspect,
      }))
    : null;

  // opportunity_briefs — the Claude-synthesized brief from white-space.
  // Shape is { opportunities: [{ title, body, tags }], generatedAt }.
  // We snapshot the structured fields, not rendered prose, so the UI
  // can re-render without re-calling Claude.
  const opportunityBriefs = whiteSpace?.brief?.opportunities?.length
    ? {
        opportunities: whiteSpace.brief.opportunities.slice(0, 5).map(o => ({
          title: typeof o.title === 'string' ? o.title : '',
          body: typeof o.body === 'string' ? o.body : '',
          tags: Array.isArray(o.tags) ? o.tags.filter(t => typeof t === 'string') : [],
        })),
        generated_at: whiteSpace.brief.generatedAt || null,
      }
    : null;

  const snapshot = {
    version: 2,
    client: {
      id: client?.id,
      name: client?.name,
      subscriber_count: client?.subscriber_count,
      video_count: client?.video_count,
      lifecycle_stage: client?.lifecycle_stage,
      archetype: diagnostic?.client?.archetypeLabel || null,
    },
    cohort: {
      pinned_count: competitorIds.length,
      categorized_count: competitorsCategorized,
      coverage: competitorIds.length
        ? competitorsCategorized / competitorIds.length
        : 0,
      errored_count: competitorsErrored,
      videos_analyzed: diagnostic?.cohort?.videoCount || null,
    },
    archetype_mix: archetypeMix,
    format_mix: formatMix,
    cadence,
    outliers,
    opportunity_briefs: opportunityBriefs,
  };

  const { error } = await supabase
    .from('client_strategy_spine')
    .update({
      computed_snapshot: snapshot,
      snapshot_computed_at: new Date().toISOString(),
    })
    .eq('client_id', clientId);

  return { ok: !error, error: error?.message, snapshot };
}

// ──────────────────────────────────────────────────
// Snapshots — point-in-time captures of the spine
// ──────────────────────────────────────────────────

/**
 * Capture the current spine fields as a snapshot. The label is the
 * strategist's anchor ("Q2 2026 close", "post-rebrand"); notes optional.
 */
export async function captureSpineSnapshot(clientId, { label, notes } = {}) {
  if (!supabase || !clientId) return { ok: false, error: 'missing' };
  const spine = await getSpine(clientId);
  if (!spine) return { ok: false, error: 'no spine to snapshot' };
  const { data: created, error } = await supabase
    .from('client_strategy_spine_snapshots')
    .insert({
      client_id: clientId,
      label: label?.trim() || null,
      notes: notes?.trim() || null,
      positioning_hypothesis: spine.positioning_hypothesis,
      positioning_oneliner: spine.positioning_oneliner,
      audience_read: spine.audience_read,
      quarterly_stance: spine.quarterly_stance,
      quarterly_stance_label: spine.quarterly_stance_label,
      competitive_posture: spine.competitive_posture,
      guardrails: spine.guardrails,
      editorial_pov: spine.editorial_pov,
      voice_tone: spine.voice_tone,
      host_archetype: spine.host_archetype,
      active_plays: spine.active_plays || [],
    })
    .select()
    .single();
  return { ok: !error, snapshot: created, error: error?.message };
}

export async function listSpineSnapshots(clientId) {
  if (!supabase || !clientId) return [];
  const { data } = await supabase
    .from('client_strategy_spine_snapshots')
    .select('id, captured_at, label, notes, quarterly_stance_label')
    .eq('client_id', clientId)
    .order('captured_at', { ascending: false });
  return data || [];
}

export async function getSpineSnapshot(snapshotId) {
  if (!supabase || !snapshotId) return null;
  const { data } = await supabase
    .from('client_strategy_spine_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .maybeSingle();
  return data;
}

export async function deleteSpineSnapshot(snapshotId) {
  if (!supabase || !snapshotId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('client_strategy_spine_snapshots')
    .delete()
    .eq('id', snapshotId);
  return { ok: !error, error: error?.message };
}

// ──────────────────────────────────────────────────
// AI suggestion: positioning one-liner
// ──────────────────────────────────────────────────

/**
 * Generate 3 candidate one-liners from the spine + client name. The
 * strategist picks/edits one — we never auto-save. Each candidate takes
 * a distinct angle (positioning thesis, editorial mission, audience
 * promise) so the strategist has real choice, not three rewrites of the
 * same idea.
 *
 * Returns `{ ok, candidates: string[] }` on success; `{ ok: false,
 * error }` on failure. Candidates are guaranteed to be strings ≤
 * POSITIONING_ONELINER_MAX_CHARS; oversized model output is truncated
 * defensively.
 */
export async function suggestPositioningOneliner(clientId, { clientName } = {}) {
  if (!clientId) return { ok: false, error: 'missing clientId' };

  const spine = await getSpine(clientId);
  if (!spine) return { ok: false, error: 'no spine on file for this client' };

  const haveAny =
    spine.positioning_hypothesis?.trim()
    || spine.editorial_pov?.trim()
    || spine.voice_tone?.trim()
    || spine.competitive_posture?.trim()
    || spine.audience_read?.trim();
  if (!haveAny) {
    return { ok: false, error: 'Spine has no positioning fields authored yet. Write the positioning hypothesis or editorial POV first, then ask for one-liner suggestions.' };
  }

  const parts = [];
  if (clientName) parts.push(`CLIENT: ${clientName}`);
  if (spine.positioning_hypothesis?.trim()) parts.push(`POSITIONING HYPOTHESIS:\n${spine.positioning_hypothesis.trim()}`);
  if (spine.editorial_pov?.trim()) parts.push(`EDITORIAL POV + MISSION:\n${spine.editorial_pov.trim()}`);
  if (spine.competitive_posture?.trim()) parts.push(`COMPETITIVE POSTURE:\n${spine.competitive_posture.trim()}`);
  if (spine.voice_tone?.trim()) parts.push(`VOICE + TONE:\n${spine.voice_tone.trim()}`);
  if (spine.audience_read?.trim()) parts.push(`AUDIENCE READ:\n${spine.audience_read.trim()}`);
  if (spine.host_archetype?.trim()) parts.push(`HOST ARCHETYPE:\n${spine.host_archetype.trim()}`);

  const systemPrompt = `You compress a strategist's working spine into a single-sentence channel articulation — the headline of a client-facing positioning recommendation. The strategist needs a sentence they can paste into a deck, repeat in a meeting, or stick on the wall. Return ONLY valid JSON.`;

  const prompt = `Read the spine below and propose THREE candidate one-liners that articulate what this channel is.

REQUIREMENTS:
- Each candidate is a single sentence, ${POSITIONING_ONELINER_MAX_CHARS} characters or fewer.
- The three candidates take DISTINCT angles, not three rewrites of the same idea. Suggested angle split:
    1. Positioning angle — what this channel competes on (audience + format + edge)
    2. Mission angle — what this channel argues / why it exists
    3. Promise angle — what the audience gets from showing up
- Be specific, not generic. "We help leaders grow" is dead on arrival. "Daily reps for leaders who already know the theory, shot in the moments doctrine usually skips" is alive.
- No marketing throat-clearing — no "We empower", "We inspire", "We are dedicated to". State what the channel IS.
- Match the spine's voice/tone if specified. If voice is warm and unhurried, do not propose a hype-y one-liner.

SPINE:
${parts.join('\n\n')}

Return JSON exactly:
{
  "candidates": [
    { "angle": "positioning", "oneliner": "string ≤${POSITIONING_ONELINER_MAX_CHARS} chars" },
    { "angle": "mission", "oneliner": "string ≤${POSITIONING_ONELINER_MAX_CHARS} chars" },
    { "angle": "promise", "oneliner": "string ≤${POSITIONING_ONELINER_MAX_CHARS} chars" }
  ]
}
Return ONLY the JSON.`;

  try {
    const result = await claudeAPI.call(prompt, systemPrompt, 'positioning_oneliner_suggest', 1024);
    const parsed = parseClaudeJSON(result.text, null);
    const raw = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    const candidates = raw
      .map(c => ({
        angle: typeof c?.angle === 'string' ? c.angle : null,
        oneliner: typeof c?.oneliner === 'string' ? c.oneliner.trim().slice(0, POSITIONING_ONELINER_MAX_CHARS) : null,
      }))
      .filter(c => c.oneliner);
    if (!candidates.length) return { ok: false, error: 'Claude returned no usable candidates. Try again or refine the spine fields.' };
    return { ok: true, candidates };
  } catch (e) {
    console.error('[spine] positioning_oneliner suggest failed:', e);
    return { ok: false, error: e.message || 'Suggestion call failed' };
  }
}

/**
 * Suggest three candidate editorial POV statements. Compresses what
 * tends to read as strategist brainstorm notes ("we want to make the
 * channel a first step in meeting people who...") into evidence-led
 * statements ("We argue X. We exist because Y."). Each candidate takes
 * a distinct angle:
 *   - belief   — what this channel argues/stands for (the editorial core)
 *   - mission  — why this channel exists (the operational reason)
 *   - bet      — what this channel is wagering on being right about
 * Returns `{ ok, candidates: [{angle, text}] }`.
 */
export async function suggestEditorialPov(clientId, { clientName } = {}) {
  if (!clientId) return { ok: false, error: 'missing clientId' };
  const spine = await getSpine(clientId);
  if (!spine) return { ok: false, error: 'no spine on file for this client' };

  // Need at least one other positioning field to anchor against —
  // editorial POV without a one-liner or positioning_hypothesis is
  // generated from nothing and reads like generic marketing copy.
  const haveAnchor =
    spine.positioning_oneliner?.trim()
    || spine.positioning_hypothesis?.trim()
    || spine.competitive_posture?.trim()
    || spine.audience_read?.trim();
  if (!haveAnchor) {
    return { ok: false, error: 'Need positioning or audience read authored first — editorial POV is what this channel argues against the competitive landscape, not a recommendation generated from scratch.' };
  }

  const parts = [];
  if (clientName) parts.push(`CLIENT: ${clientName}`);
  if (spine.positioning_oneliner?.trim()) parts.push(`POSITIONING ONE-LINER:\n${spine.positioning_oneliner.trim()}`);
  if (spine.positioning_hypothesis?.trim()) parts.push(`POSITIONING HYPOTHESIS:\n${spine.positioning_hypothesis.trim()}`);
  if (spine.competitive_posture?.trim()) parts.push(`COMPETITIVE POSTURE:\n${spine.competitive_posture.trim()}`);
  if (spine.voice_tone?.trim()) parts.push(`VOICE + TONE:\n${spine.voice_tone.trim()}`);
  if (spine.audience_read?.trim()) parts.push(`AUDIENCE READ:\n${spine.audience_read.trim()}`);
  if (spine.guardrails?.trim()) parts.push(`GUARDRAILS:\n${spine.guardrails.trim()}`);

  const systemPrompt = `You compress strategist brainstorm into client-facing editorial POV statements — what this channel argues, why it exists, what it's betting on. The strategist's draft language ("we want to...", "I see this being...") gets rewritten into stating language ("We argue...", "We exist because..."). Return ONLY valid JSON.`;

  const prompt = `Read the spine below and propose THREE candidate Editorial POV + Mission statements.

REQUIREMENTS:
- Each candidate is 2–4 sentences. Reads as a statement, not a brief.
- The three candidates take DISTINCT angles, not three rewrites of the same idea:
    1. belief — name what this channel argues. State a conviction. Implies an opposition (something the channel argues AGAINST).
    2. mission — why this channel exists. The operational reason — what would change in the world if this channel succeeded.
    3. bet — what this channel is wagering on being right about. Names a specific bet about audience, category, or moment.
- No marketing throat-clearing — never "we are dedicated to," "we strive to," "we empower," "we believe in [vague abstraction]."
- Reference the audience by what they're doing or feeling, not by demographic category.
- Match the spine's voice/tone if specified.

SPINE:
${parts.join('\n\n')}

Return JSON exactly:
{
  "candidates": [
    { "angle": "belief", "text": "string — 2-4 sentence editorial POV statement" },
    { "angle": "mission", "text": "string — 2-4 sentence editorial POV statement" },
    { "angle": "bet", "text": "string — 2-4 sentence editorial POV statement" }
  ]
}
Return ONLY the JSON.`;

  try {
    const result = await claudeAPI.call(prompt, systemPrompt, 'editorial_pov_suggest', 1536);
    const parsed = parseClaudeJSON(result.text, null);
    const raw = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    const candidates = raw
      .map(c => ({
        angle: typeof c?.angle === 'string' ? c.angle : null,
        text: typeof c?.text === 'string' ? c.text.trim() : null,
      }))
      .filter(c => c.text);
    if (!candidates.length) return { ok: false, error: 'Claude returned no usable candidates. Try again or refine the spine fields.' };
    return { ok: true, candidates };
  } catch (e) {
    console.error('[spine] editorial_pov suggest failed:', e);
    return { ok: false, error: e.message || 'Suggestion call failed' };
  }
}

/**
 * Suggest three candidate voice + tone descriptions. The voice field
 * suffers worst from the "brainstorm-notes-not-statements" problem —
 * strategists write "friendly and approachable" and stop. This compresses
 * into a producer-ready spec: register + pacing + signature moves +
 * anti-pattern. Each candidate takes a distinct angle:
 *   - register   — leads with the speech register (plainspoken, ASMR-quiet, etc.)
 *   - identity   — leads with the speaker's identity ("a SafeStreets installer talking")
 *   - antipattern — leads with what to NOT do (defines voice by what it isn't)
 */
export async function suggestVoiceTone(clientId, { clientName } = {}) {
  if (!clientId) return { ok: false, error: 'missing clientId' };
  const spine = await getSpine(clientId);
  if (!spine) return { ok: false, error: 'no spine on file for this client' };

  const haveAnchor =
    spine.editorial_pov?.trim()
    || spine.positioning_oneliner?.trim()
    || spine.positioning_hypothesis?.trim()
    || spine.host_archetype?.trim();
  if (!haveAnchor) {
    return { ok: false, error: 'Need editorial POV, positioning, or host archetype authored first — voice/tone is calibrated against those, not generated in isolation.' };
  }

  const parts = [];
  if (clientName) parts.push(`CLIENT: ${clientName}`);
  if (spine.positioning_oneliner?.trim()) parts.push(`POSITIONING ONE-LINER:\n${spine.positioning_oneliner.trim()}`);
  if (spine.positioning_hypothesis?.trim()) parts.push(`POSITIONING HYPOTHESIS:\n${spine.positioning_hypothesis.trim()}`);
  if (spine.editorial_pov?.trim()) parts.push(`EDITORIAL POV + MISSION:\n${spine.editorial_pov.trim()}`);
  if (spine.competitive_posture?.trim()) parts.push(`COMPETITIVE POSTURE:\n${spine.competitive_posture.trim()}`);
  if (spine.host_archetype?.trim()) parts.push(`HOST ARCHETYPE:\n${spine.host_archetype.trim()}`);
  if (spine.audience_read?.trim()) parts.push(`AUDIENCE READ:\n${spine.audience_read.trim()}`);
  if (spine.guardrails?.trim()) parts.push(`GUARDRAILS:\n${spine.guardrails.trim()}`);

  const systemPrompt = `You compress strategist brainstorm into producer-ready voice + tone style sheets. The strategist tends to write adjective lists ("friendly and approachable") that producers can't act on. You write what an editor needs: register + pacing + signature moves + what to avoid. Return ONLY valid JSON.`;

  const prompt = `Read the spine below and propose THREE candidate Voice + Tone style sheets.

REQUIREMENTS:
- Each candidate is 2–4 sentences. Reads as something a producer can hold a script against and reject lines that drift from.
- The three candidates take DISTINCT angles:
    1. register   — leads with the speech register and pacing (plainspoken vs hyped, slow vs cracked, etc.). Producer can hear it.
    2. identity   — leads with who is speaking ("an installer talking about their actual work," not "a brand voice"). Producer can cast against it.
    3. antipattern — defines voice by what it's NOT. Names the cliché this channel must avoid (clickbait register, polished marketing voice, etc.). Producer can flag drift toward the anti-pattern in edits.
- Be concrete about signature moves: holds a beat after a hard question, never punches up a noun, refuses corporate jargon, uses concrete examples over abstractions, etc.
- Each candidate must end with something a producer can actually enforce.
- No marketing language ("warm and engaging," "professional yet approachable").

SPINE:
${parts.join('\n\n')}

Return JSON exactly:
{
  "candidates": [
    { "angle": "register", "text": "string — 2-4 sentence voice + tone spec" },
    { "angle": "identity", "text": "string — 2-4 sentence voice + tone spec" },
    { "angle": "antipattern", "text": "string — 2-4 sentence voice + tone spec" }
  ]
}
Return ONLY the JSON.`;

  try {
    const result = await claudeAPI.call(prompt, systemPrompt, 'voice_tone_suggest', 1536);
    const parsed = parseClaudeJSON(result.text, null);
    const raw = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    const candidates = raw
      .map(c => ({
        angle: typeof c?.angle === 'string' ? c.angle : null,
        text: typeof c?.text === 'string' ? c.text.trim() : null,
      }))
      .filter(c => c.text);
    if (!candidates.length) return { ok: false, error: 'Claude returned no usable candidates. Try again or refine the spine fields.' };
    return { ok: true, candidates };
  } catch (e) {
    console.error('[spine] voice_tone suggest failed:', e);
    return { ok: false, error: e.message || 'Suggestion call failed' };
  }
}

export default {
  getSpine,
  updateSpineField,
  updateQuarterlyStance,
  addActivePlay,
  updateActivePlay,
  removeActivePlay,
  refreshSnapshot,
  captureSpineSnapshot,
  listSpineSnapshots,
  getSpineSnapshot,
  deleteSpineSnapshot,
  suggestPositioningOneliner,
  suggestEditorialPov,
  suggestVoiceTone,
  PLAY_STATUS_LABELS,
  POSITIONING_ONELINER_MAX_CHARS,
};
