/**
 * Talent Audition Rubric service — generates and persists the per-client
 * scorecard for auditioning on-camera talent. Closes Part 02 of the
 * audit deliverable.
 *
 * Lifecycle:
 *   - Strategist clicks "Generate rubric" in the Spine UI.
 *   - generateTalentAuditionRubric() reads host_archetype + voice_tone +
 *     editorial_pov + positioning_oneliner + positioning_hypothesis and
 *     asks Claude for 5–7 client-specific criteria.
 *   - Strategist edits the draft criteria; clicks Save.
 *   - saveTalentAuditionRubric() supersedes the prior active row and
 *     inserts the new one. History preserved.
 *   - Printable scorecard reads the active row.
 *
 * The rubric is a downstream artifact of the spine, not part of it —
 * lives in its own table so it can evolve independently and so audit
 * history is intact.
 */

import { supabase } from './supabaseClient';
import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';
import { getSpine } from './strategySpineService';

const CRITERION_WEIGHTS = ['high', 'medium', 'low'];

// ──────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────

export async function getActiveTalentRubric(clientId) {
  if (!supabase || !clientId) return null;
  const { data } = await supabase
    .from('client_talent_audition_rubric')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();
  return data;
}

// ──────────────────────────────────────────────────
// AI generation
// ──────────────────────────────────────────────────

/**
 * Generate a draft rubric from the spine. Does NOT save — returns the
 * proposed criteria + intro_note for the strategist to edit. Returns
 * `{ ok, criteria, introNote, sourceSpineFingerprint, error? }`.
 */
export async function generateTalentAuditionRubric(clientId, { clientName } = {}) {
  if (!clientId) return { ok: false, error: 'missing clientId' };

  const spine = await getSpine(clientId);
  if (!spine) return { ok: false, error: 'no spine on file for this client' };

  // Bare minimum to generate something useful: at least host archetype
  // OR enough of the positioning layer to imply one.
  const haveEnough = spine.host_archetype?.trim()
    || (spine.editorial_pov?.trim() && spine.voice_tone?.trim());
  if (!haveEnough) {
    return { ok: false, error: 'Need at least host archetype OR editorial POV + voice/tone authored before generating a rubric. The rubric is derived from those fields.' };
  }

  const fingerprint = {
    host_archetype: spine.host_archetype || null,
    voice_tone: spine.voice_tone || null,
    editorial_pov: spine.editorial_pov || null,
    positioning_oneliner: spine.positioning_oneliner || null,
    positioning_hypothesis: spine.positioning_hypothesis || null,
  };

  const spineBlock = buildSpineBlock(spine, clientName);
  const prompt = buildGenerationPrompt(spineBlock);
  const systemPrompt = `You design talent audition rubrics for a strategist who hires on-camera hosts for YouTube channels. The rubric must be specific to THIS channel's voice and host archetype — not a generic on-camera scorecard. The output is what a hiring panel actually scores candidates against during auditions. Return ONLY valid JSON.`;

  try {
    const result = await claudeAPI.call(prompt, systemPrompt, 'talent_rubric_generate', 3072);
    const parsed = parseClaudeJSON(result.text, null);
    const criteria = normalizeCriteria(parsed?.criteria);
    if (!criteria.length) {
      return { ok: false, error: 'Claude returned no usable criteria. Try regenerating, or sharpen the spine first.' };
    }
    return {
      ok: true,
      criteria,
      introNote: typeof parsed?.intro_note === 'string' ? parsed.intro_note.trim() : '',
      sourceSpineFingerprint: fingerprint,
    };
  } catch (e) {
    console.error('[talentRubric] generate failed:', e);
    return { ok: false, error: e.message || 'Generation call failed' };
  }
}

// ──────────────────────────────────────────────────
// Save (supersede + insert)
// ──────────────────────────────────────────────────

/**
 * Save a rubric (creating a new active row, superseding the prior one).
 * Caller passes the strategist-edited criteria + introNote.
 */
export async function saveTalentAuditionRubric(clientId, { criteria, introNote, sourceSpineFingerprint }) {
  if (!supabase || !clientId) return { ok: false, error: 'missing' };
  const normalized = normalizeCriteria(criteria);
  if (!normalized.length) return { ok: false, error: 'No criteria to save' };

  // Supersede previous active row
  await supabase
    .from('client_talent_audition_rubric')
    .update({ status: 'superseded' })
    .eq('client_id', clientId)
    .eq('status', 'active');

  const { data: row, error } = await supabase
    .from('client_talent_audition_rubric')
    .insert({
      client_id: clientId,
      status: 'active',
      criteria: normalized,
      intro_note: introNote?.trim() || null,
      source_spine_fingerprint: sourceSpineFingerprint || null,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, rubric: row };
}

export async function deleteTalentRubric(rubricId) {
  if (!supabase || !rubricId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('client_talent_audition_rubric')
    .delete()
    .eq('id', rubricId);
  return { ok: !error, error: error?.message };
}

// ──────────────────────────────────────────────────
// Prompt formatting + criterion normalization
// ──────────────────────────────────────────────────

function buildSpineBlock(spine, clientName) {
  const parts = [];
  if (clientName) parts.push(`CHANNEL: ${clientName}`);
  if (spine.positioning_oneliner?.trim()) parts.push(`CHANNEL ARTICULATION (one-liner):\n${spine.positioning_oneliner.trim()}`);
  if (spine.positioning_hypothesis?.trim()) parts.push(`POSITIONING HYPOTHESIS:\n${spine.positioning_hypothesis.trim()}`);
  if (spine.editorial_pov?.trim()) parts.push(`EDITORIAL POV + MISSION:\n${spine.editorial_pov.trim()}`);
  if (spine.voice_tone?.trim()) parts.push(`VOICE + TONE (affirmative):\n${spine.voice_tone.trim()}`);
  if (spine.host_archetype?.trim()) parts.push(`HOST ARCHETYPE:\n${spine.host_archetype.trim()}`);
  if (spine.guardrails?.trim()) parts.push(`GUARDRAILS — what hosts must NOT do:\n${spine.guardrails.trim()}`);
  if (spine.audience_read?.trim()) parts.push(`AUDIENCE READ:\n${spine.audience_read.trim()}`);
  return parts.join('\n\n');
}

function buildGenerationPrompt(spineBlock) {
  return `Read the spine below and propose a TALENT AUDITION RUBRIC for this channel — the scorecard the hiring panel uses to score on-camera candidates against this specific channel's voice and host archetype.

REQUIREMENTS:
- Propose 5–7 criteria. Fewer is better than padding.
- Criteria must be SPECIFIC TO THIS CHANNEL. "Camera presence" is a generic criterion any channel could use — useless here. "Holds silence after a hard question without filling the air" is a criterion that names what THIS host archetype actually requires.
- Each criterion needs a disqualifier — what knocks a candidate out regardless of other strengths.
- Scoring is a 1–5 scale, with anchor descriptions for 1, 3, and 5. Anchors must be observable behaviors during an audition, not abstractions.
- Weight each criterion: "high" / "medium" / "low". Generally 2–3 high, the rest medium/low.
- Include an intro_note (1–2 sentences) the hiring panel reads before scoring — what this rubric is for, what to keep in mind. Should reference the channel's voice/archetype in concrete terms.

SPINE:
${spineBlock}

Return JSON exactly:
{
  "intro_note": "string — 1–2 sentences for the hiring panel",
  "criteria": [
    {
      "name": "string — short criterion name, 2–5 words",
      "what_excellence_looks_like": "string — what a 5/5 candidate demonstrates during the audition, in this channel's voice",
      "disqualifier": "string — what knocks a candidate out regardless of other strengths",
      "scoring_anchors": {
        "1": "string — observable 1/5 behavior",
        "3": "string — observable 3/5 behavior",
        "5": "string — observable 5/5 behavior"
      },
      "weight": "high" | "medium" | "low"
    },
    ...
  ]
}

Return ONLY the JSON.`;
}

function normalizeCriteria(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    if (!name) continue;
    const weight = CRITERION_WEIGHTS.includes(c.weight) ? c.weight : 'medium';
    const anchors = c.scoring_anchors && typeof c.scoring_anchors === 'object' ? c.scoring_anchors : {};
    out.push({
      name,
      what_excellence_looks_like: typeof c.what_excellence_looks_like === 'string' ? c.what_excellence_looks_like.trim() : '',
      disqualifier: typeof c.disqualifier === 'string' ? c.disqualifier.trim() : '',
      scoring_anchors: {
        1: typeof anchors[1] === 'string' ? anchors[1].trim() : (typeof anchors['1'] === 'string' ? anchors['1'].trim() : ''),
        3: typeof anchors[3] === 'string' ? anchors[3].trim() : (typeof anchors['3'] === 'string' ? anchors['3'].trim() : ''),
        5: typeof anchors[5] === 'string' ? anchors[5].trim() : (typeof anchors['5'] === 'string' ? anchors['5'].trim() : ''),
      },
      weight,
    });
  }
  return out;
}

export default {
  getActiveTalentRubric,
  generateTalentAuditionRubric,
  saveTalentAuditionRubric,
  deleteTalentRubric,
};
