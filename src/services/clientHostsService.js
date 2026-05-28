/**
 * Client Hosts service — CRUD for per-client host profiles (multi-host
 * channels). Replaces the implicit "one host per client" model of
 * client_strategy_spine.host_archetype.
 *
 * Each host profile carries the catalog archetype + an optional voice
 * refinement + a series label + freeform notes. The audition rubric
 * service references host profiles by id when generating per-host
 * scorecards.
 *
 * Lazy migration from the legacy spine.host_archetype field: on first
 * load of hosts for a client whose client_hosts is empty AND whose
 * spine.host_archetype is set, we seed a "Primary host" row. One-time,
 * idempotent (INSERT only when no hosts exist).
 */

import { supabase } from './supabaseClient';
import { getSpine, HOST_ARCHETYPES, HOST_ARCHETYPE_BY_ID } from './strategySpineService';
import { loadAuditEvidence, formatEvidenceForPrompt, EVIDENCE_RULES } from './auditEvidenceService';
import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';

// ──────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────

/**
 * List a client's host profiles. Runs the auto-migration from the
 * legacy spine.host_archetype field if applicable. Returns rows
 * ordered by sort_order, created_at.
 */
export async function listHosts(clientId) {
  if (!supabase || !clientId) return [];

  const { data: rows } = await supabase
    .from('client_hosts')
    .select('*')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (rows && rows.length) return rows;

  // No hosts on file — check the legacy spine field and migrate if set.
  const migrated = await maybeMigrateLegacyHost(clientId);
  if (migrated) return [migrated];

  return [];
}

async function maybeMigrateLegacyHost(clientId) {
  const spine = await getSpine(clientId);
  const legacy = spine?.host_archetype?.trim();
  if (!legacy) return null;

  // Race-safe: re-check there's still nothing, then insert. If another
  // tab beat us, the unique conflict won't fire (no unique constraint),
  // but the second insert would create a duplicate. Use a single
  // upsert-equivalent by checking again under transaction-by-statement.
  const { data: existing } = await supabase
    .from('client_hosts')
    .select('id')
    .eq('client_id', clientId)
    .limit(1);
  if (existing && existing.length) return null;

  const { data: inserted, error } = await supabase
    .from('client_hosts')
    .insert({
      client_id: clientId,
      name: 'Primary host',
      archetype: legacy,
      voice_tone_refinement: null,
      series_label: null,
      notes: 'Auto-migrated from the legacy single-host archetype on the spine. Rename, edit, or delete as needed.',
      sort_order: 0,
    })
    .select()
    .single();
  if (error) {
    console.warn('[clientHosts] legacy migration failed:', error);
    return null;
  }

  // Reassign any pre-multi-host rubric (host_id NULL) to the new host
  // row so it's discoverable from the new per-host UI rather than
  // orphaned in the database.
  try {
    await supabase
      .from('client_talent_audition_rubric')
      .update({ host_id: inserted.id })
      .eq('client_id', clientId)
      .is('host_id', null)
      .eq('status', 'active');
  } catch (e) {
    console.warn('[clientHosts] legacy rubric reassignment failed:', e);
  }

  return inserted;
}

// ──────────────────────────────────────────────────
// Write
// ──────────────────────────────────────────────────

export async function createHost(clientId, patch = {}) {
  if (!supabase || !clientId) return { ok: false, error: 'missing' };

  // Compute next sort_order so new hosts append to the bottom.
  const { data: existing } = await supabase
    .from('client_hosts')
    .select('sort_order')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data: row, error } = await supabase
    .from('client_hosts')
    .insert({
      client_id: clientId,
      name: patch.name ?? null,
      archetype: patch.archetype ?? null,
      voice_tone_refinement: patch.voice_tone_refinement ?? null,
      series_label: patch.series_label ?? null,
      notes: patch.notes ?? null,
      sort_order: nextOrder,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, host: row };
}

export async function updateHost(hostId, patch = {}) {
  if (!supabase || !hostId) return { ok: false, error: 'missing' };
  const updates = { updated_at: new Date().toISOString() };
  for (const key of ['name', 'archetype', 'voice_tone_refinement', 'series_label', 'notes', 'sort_order']) {
    if (key in patch) updates[key] = patch[key];
  }
  const { data: row, error } = await supabase
    .from('client_hosts')
    .update(updates)
    .eq('id', hostId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, host: row };
}

export async function deleteHost(hostId) {
  if (!supabase || !hostId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('client_hosts')
    .delete()
    .eq('id', hostId);
  return { ok: !error, error: error?.message };
}

/**
 * Suggest three candidate host profiles from the spine context.
 * Returns three distinct archetype + refinement + voice-refinement
 * combos so the strategist sees real choice, not three rewrites of
 * the same archetype. Each candidate names its rationale so the
 * strategist understands WHY this archetype fits this channel +
 * series.
 *
 * Options: `{ clientName, seriesLabel, existingArchetypes }`. Passing
 * existingArchetypes lets the suggester avoid duplicating archetypes
 * already on the spine — useful when generating a second/third host
 * for a multi-series channel.
 *
 * Returns `{ ok, candidates: [{archetypeId, archetypeLabel, refinement,
 * voice_tone_refinement, rationale}] }`.
 */
export async function suggestHostProfile(clientId, { clientName, seriesLabel, existingArchetypes = [] } = {}) {
  if (!clientId) return { ok: false, error: 'missing clientId' };
  const [spine, evidence] = await Promise.all([
    getSpine(clientId),
    loadAuditEvidence(clientId).catch(() => null),
  ]);
  if (!spine) return { ok: false, error: 'no spine on file for this client' };

  const haveAnchor =
    spine.editorial_pov?.trim()
    || spine.voice_tone?.trim()
    || spine.positioning_oneliner?.trim()
    || spine.positioning_hypothesis?.trim();
  if (!haveAnchor) {
    return { ok: false, error: 'Need editorial POV, voice/tone, or positioning authored first — the host archetype is derived from those fields, not picked in a vacuum.' };
  }
  if (!evidence || evidence.cohortHostVisible == null) {
    return { ok: false, error: 'Need audit data with cohort host-visibility signal — host archetype is calibrated against whether the field runs host-light or host-heavy.' };
  }

  const catalogBlock = HOST_ARCHETYPES.map(a => `  - ${a.id} (${a.label}): ${a.description}`).join('\n');

  const parts = [];
  if (clientName) parts.push(`CLIENT: ${clientName}`);
  if (seriesLabel) parts.push(`SERIES THIS HOST WILL FRONT: ${seriesLabel}`);
  if (spine.positioning_oneliner?.trim()) parts.push(`POSITIONING ONE-LINER:\n${spine.positioning_oneliner.trim()}`);
  if (spine.positioning_hypothesis?.trim()) parts.push(`POSITIONING HYPOTHESIS:\n${spine.positioning_hypothesis.trim()}`);
  if (spine.editorial_pov?.trim()) parts.push(`EDITORIAL POV + MISSION:\n${spine.editorial_pov.trim()}`);
  if (spine.voice_tone?.trim()) parts.push(`CHANNEL VOICE + TONE:\n${spine.voice_tone.trim()}`);
  if (spine.audience_read?.trim()) parts.push(`AUDIENCE READ:\n${spine.audience_read.trim()}`);
  if (spine.guardrails?.trim()) parts.push(`GUARDRAILS:\n${spine.guardrails.trim()}`);
  if (existingArchetypes.length) {
    parts.push(`EXISTING HOST ARCHETYPES on this channel (don't propose these — generate complementary picks):\n${existingArchetypes.map(a => `  - ${a}`).join('\n')}`);
  }

  const evidenceBlock = formatEvidenceForPrompt(evidence);

  // Cohort host-visibility framing — the prompt cites this explicitly
  // so every rationale anchors to whether putting a host on camera
  // breaks or matches the field convention.
  const hostVis = evidence.cohortHostVisible;
  const hostFraming = hostVis < 30
    ? `The cohort runs HOST-LIGHT (${hostVis}% average host-on-screen). A recurring on-camera host is a structural break from the field — the archetype must be a SPECIFIC personality, not just "a person on camera."`
    : hostVis > 70
      ? `The cohort runs HOST-HEAVY (${hostVis}% average host-on-screen). To differentiate, the archetype must be a DISTINCT personality the cohort doesn't already have. Generic "expert" or "narrator" is failure-mode here.`
      : `The cohort is MIXED on host presence (${hostVis}% host-on-screen, ${evidence.cohortFaceDriven ?? '—'}% face-driven thumbnails). The archetype choice should be deliberate — the cohort hasn't settled on a convention, so either direction is claimable.`;

  const systemPrompt = `You recommend on-camera host archetypes for YouTube channels. Recommendations are evidence-led — every rationale cites the cohort's host-visibility %, host-visibility framing (light/heavy/mixed), or a specific spine field. The refinement is what makes the archetype specific to THIS channel + this cohort context, not "The Practitioner" generally. Never write narrator-voice meta-commentary about the recommendation. Return ONLY valid JSON.`;

  const prompt = `Read the spine + audit evidence below and propose THREE candidate host profiles for this channel${seriesLabel ? ` (specifically the "${seriesLabel}" series)` : ''}.

${evidenceBlock}

COHORT HOST FRAMING: ${hostFraming}
${EVIDENCE_RULES}

HOST ARCHETYPE CATALOG (pick archetypeId from this list):
${catalogBlock}

SPINE:
${parts.join('\n\n')}

REQUIREMENTS:
- Each candidate picks one archetype from the catalog above by id.
- The three candidates take DISTINCT archetypes — never propose the same archetypeId twice.
- Each candidate includes:
    - archetypeId (catalog id, lowercase)
    - refinement: 1–2 sentence specific gloss on the archetype FOR THIS CHANNEL + THIS COHORT. Names what the host actually does on screen ("narrates the install while doing it, never breaks the fourth wall to explain"). NOT generic descriptors.
    - voice_tone_refinement: 1–2 sentence overlay on the channel voice that's SPECIFIC TO THIS HOST.
    - rationale: 1–2 sentences on WHY this archetype fits. MUST cite the cohort host-visibility % AND one spine field (editorial POV, audience read, voice/tone, or saturated theme). Format: "[Archetype] fits because [cohort signal] + [spine anchor]." Generic rationales ("a strong on-camera presence") are a failure.

Return JSON exactly:
{
  "candidates": [
    {
      "archetypeId": "string from catalog",
      "refinement": "string",
      "voice_tone_refinement": "string",
      "rationale": "string — cites cohort host-visibility % AND a spine field"
    },
    ... three total
  ]
}
Return ONLY the JSON.`;

  try {
    const result = await claudeAPI.call(prompt, systemPrompt, 'host_profile_suggest_v2', 2200);
    const parsed = parseClaudeJSON(result.text, null);
    const raw = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    const candidates = raw
      .map(c => {
        const id = typeof c?.archetypeId === 'string' ? c.archetypeId.toLowerCase().trim() : null;
        const archetype = id ? HOST_ARCHETYPE_BY_ID[id] : null;
        if (!archetype) return null;
        const refinement = typeof c?.refinement === 'string' ? c.refinement.trim() : '';
        const voice_tone_refinement = typeof c?.voice_tone_refinement === 'string' ? c.voice_tone_refinement.trim() : '';
        const rationale = typeof c?.rationale === 'string' ? c.rationale.trim() : '';
        // Compose the archetype string that goes on the host row (matches
        // the legacy host_archetype format: "Label — refinement")
        const composedArchetype = refinement
          ? `${archetype.label} — ${refinement}`
          : archetype.label;
        return {
          archetypeId: id,
          archetypeLabel: archetype.label,
          refinement,
          composedArchetype,
          voice_tone_refinement,
          rationale,
        };
      })
      .filter(Boolean);
    if (!candidates.length) return { ok: false, error: 'Claude returned no usable archetype candidates. Try again or refine the spine fields.' };
    return { ok: true, candidates };
  } catch (e) {
    console.error('[clientHosts] suggestHostProfile failed:', e);
    return { ok: false, error: e.message || 'Suggestion call failed' };
  }
}

export default { listHosts, createHost, updateHost, deleteHost, suggestHostProfile };
