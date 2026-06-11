#!/usr/bin/env node
/**
 * Pearl 27 handoff execution + verification.
 *
 * Self-contained Node script that runs the cohort surgery + Spine
 * completion documented in the 2026-06-11 strategy-session handoff:
 *   Part 1 — Cohort surgery (REMOVE 9, RETAG 7, KEEP 5, ADD 6)
 *   Part 2 — Pillars (P1–P5)
 *   Part 3 — Recurring formats (F1–F4)
 *   Part 4 — Business context refinement (versioned)
 *   Part 5 — Verification
 *
 * Safe defaults:
 *   - DRY-RUN by default. Prints a full diff of planned operations
 *     without writing anything. Re-run with --apply to execute.
 *   - REMOVE = DELETE junction rows in client_channels (per spec).
 *   - Business context is versioned: existing active row → 'superseded',
 *     new row inserted as 'active'. Matches the migration 082 lifecycle.
 *   - Pillars / formats: skip if same title/name already active (idempotent).
 *   - ADD: tries auto-resolve via YouTube Data API. Falls back to
 *     candidates-listed-skip for low-confidence matches so we never
 *     silently insert the wrong channel.
 *   - All writes wrapped in per-section try/catch so a single failure
 *     doesn't abort the whole run; failures reported at end.
 *
 * Required env (read from .env.local OR process.env):
 *   SUPABASE_URL                — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — service role key (bypasses RLS)
 *   YOUTUBE_API_KEY             — YouTube Data API v3 key (Part 1D channel resolution)
 *
 * Usage:
 *   node scripts/pearl27-handoff.mjs              # dry-run report
 *   node scripts/pearl27-handoff.mjs --apply      # execute
 *   node scripts/pearl27-handoff.mjs --apply --skip-add  # skip Part 1D
 *   node scripts/pearl27-handoff.mjs --verify-only       # Part 5 only
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── CLI flags ──────────────────────────────────────
const FLAGS = process.argv.slice(2);
const APPLY        = FLAGS.includes('--apply');
const SKIP_ADD     = FLAGS.includes('--skip-add');
const VERIFY_ONLY  = FLAGS.includes('--verify-only');
const VERBOSE      = FLAGS.includes('--verbose');

// ─── Constants ──────────────────────────────────────
const PEARL_ID = 'a4de64a1-a63b-4aa0-babb-ab8026a357fb';

// PART 1A — REMOVE (delete junction rows)
const REMOVE_NAMES = [
  'AI Edge',
  'Holistic SEO & Digital',
  'Brian Dean',
  'Clearscope',
  'RankYa',
  'Matt Diggity',
  'Semrush',
  'Vendasta',
  'HubSpot Marketing',
];

// PART 1B — RETAG (update cohort_role on existing junction rows)
const RETAG = [
  { name: 'Google Search Central',                 role: 'reference' },
  { name: 'Matt Wolfe',                            role: 'reference' },
  { name: 'Julian Goldie SEO',                     role: 'reference' },
  { name: 'The AI Advantage',                      role: 'reference' },
  { name: 'Neil Patel',                            role: 'aspirational' },
  { name: "Lenny's Podcast",                       role: 'aspirational' },
  { name: 'Nate Herk',                             role: 'aspirational' },  // fuzzy — "Nate Herk | AI Automation"
];

// PART 1C — KEEP AS PEER (no write; confirm tag)
const KEEP_AS_PEER = [
  'Marketing Against the Grain',
  'The Artificial Intelligence Show Podcast',
  'Surfer Academy',
  'Content and Conversation',
  'iPullRank',
];

// PART 1D — ADD (resolve via YouTube API, then insert)
//
// If you already know the exact channel ID, paste it into explicitChannelId
// to skip the search step. Otherwise the script searches by `searchHint`
// and accepts the top result if its title closely matches `name`.
const ADD = [
  { name: 'Authority Hacker',   role: 'peer',         searchHint: 'Authority Hacker Gael Breton Mark Webster', explicitChannelId: null },
  { name: 'Ryan Doser',         role: 'peer',         searchHint: 'Ryan Doser AI',                              explicitChannelId: null },
  { name: 'Grace Leung',        role: 'peer',         searchHint: 'Grace Leung AI marketing',                   explicitChannelId: null },
  { name: 'Cleo Abram',         role: 'aspirational', searchHint: 'Cleo Abram Huge If True',                    explicitChannelId: null },
  { name: 'Johnny Harris',      role: 'aspirational', searchHint: 'Johnny Harris',                              explicitChannelId: null },
  { name: 'The AI Daily Brief', role: 'reference',    searchHint: 'The AI Daily Brief Nathaniel Whittemore',    explicitChannelId: null },
];

// PART 2 — Pillars (insert as active)
const PILLARS = [
  {
    title: 'Discoverability, Decoded',
    creative_description:
      'The "what is this and how does it work" pillar. How LLMs and AI agents actually choose what to cite and recommend; AEO/GEO defined in business language; SEO vs. AI-era discoverability. Owns the category-language job the Spine\'s editorial POV claims. Maps to persona questions: "How do I get my brand mentioned when customers ask ChatGPT…", "What\'s the difference between SEO and optimizing for AI-driven search?", "What does GEO and AEO actually mean in practice?"',
    intended_audience: 'Marketing leaders, brand strategists, and growth executives encountering AI-era discoverability for the first time and needing the category language.',
    format_type: 'category-education',
    sort_order: 1,
  },
  {
    title: 'The Receipts',
    creative_description:
      'Campaign breakdowns with real numbers: how a brand went from absent to cited, what was done across YouTube/Reddit/forums (proactive and reactive conversation influence), what moved. Maps to: "How do I measure if we\'re visible in LLM outputs?" and the persona trust signal "evidence of working with established brands." This is the differentiating pillar — no competitor in the cohort operates it.',
    intended_audience: 'Skeptical buyers who need proof before commitment; senior stakeholders who need defensible case data for internal championing.',
    format_type: 'proof-case-studies',
    sort_order: 2,
  },
  {
    title: 'The Shift',
    creative_description:
      'Operator\'s read on platform and model changes within 48 hours of news: AI Overviews changes, model releases, citation-behavior shifts, what it means for brand visibility. Keyed to reference-tier outlier triggers (Goldie/Wolfe/AI Daily Brief spikes = publish signal for the rational, senior-stakeholder version).',
    intended_audience: 'Operators tracking the AI-search space in real time; the rational/senior cohort of the "AI news" audience.',
    format_type: 'market-intelligence-reactive',
    sort_order: 3,
  },
  {
    title: 'Boardroom Translation',
    creative_description:
      'Frameworks for taking this upstairs: explaining AI discoverability to a CMO/board, budgeting for an unproven category, measuring ROI, competitive-risk framing. Maps to: "How do I explain AI discoverability strategy to my CMO or board?", the "board asking what\'s our AI strategy" pain point, and the buy-in motivations. Also direct sales enablement for Pearl\'s GTM.',
    intended_audience: 'Marketing leaders preparing to defend AI-discoverability budget; Pearl\'s sales team needs assets here too.',
    format_type: 'executive-enablement',
    sort_order: 4,
  },
  {
    title: 'AI & Human',
    creative_description:
      'Quarterly flagship franchise — "State of AI Discoverability." Original-data quarterly examining how human discovery behavior is changing in AI-mediated contexts and what Pearl observes across live campaigns. Cinematic execution. The recursion IS the strategy: original research is what AI engines cite, so the flagship about being the answer becomes the answer — Pearl executing its own methodology on itself, in public.',
    intended_audience: 'Cross-segment — flagship that lands with the senior stakeholder cohort AND surfaces in AI engine citations as the artifact that proves the methodology.',
    format_type: 'quarterly-flagship-data-led',
    sort_order: 5,
  },
];

// PART 3 — Recurring formats (insert as active)
const FORMATS = [
  {
    name: 'The Weekly Desk',
    creative_execution: 'talking_head',
    cadence: 'weekly',
    estimated_episode_length: '8-15 min',
    production_complexity: 'medium',
    production_notes: 'Face-led talking head, high-end production + motion graphics, rational/consultative register per Spine voice (strategic restraint, signal over noise; the Lenny lane, never the INSANE lane). Primary engine — ~60% of output. The hypothesis-testing surface: packaging-first development, every video a positioning test against the peer cohort.',
    persona_rationale:
      'Matches the persona voice register (consultative, evidence-cited, no hype) and serves Pillars 1, 3, and 4. The audience asks definitional and translational questions — the talking-head format gives the host time and frame to answer with both authority and warmth.',
    pillar_label: 'Discoverability, Decoded / The Shift / Boardroom Translation',
    counter_argument:
      'Talking-head can drift into commentary without proof — only works if every episode is paired with concrete examples or data. Without F2 (The Breakdown) as the proof-anchor, this format risks the "claims without receipts" failure mode that Pearl is positioned to avoid.',
    status: 'active',
    format_position: 1,
  },
  {
    name: 'The Breakdown',
    creative_execution: 'case_study',
    cadence: 'biweekly',
    estimated_episode_length: '10-18 min',
    production_complexity: 'high',
    production_notes:
      'Receipts format serving P2. Structure: visibility problem → what was done (conversation influence across surfaces) → the numbers → the principle. ~25% of output. Each episode doubles as a GTM asset for Pearl\'s sales team — explicit acceptance criterion: "if episode one is finished, what does sales do with it tomorrow morning?"',
    persona_rationale:
      'Persona trust signal #1 is "evidence of working with established brands." This format IS that evidence. Also: the differentiating pillar — no competitor in the current cohort operates a real receipts format.',
    pillar_label: 'The Receipts',
    counter_argument:
      'Highest production cost per episode and the format that depends on real client wins to publish. Pre-launch this means no inventory; resolves only once Pearl has 2–3 named campaigns finished and contractually citable. Plan: pilot with a self-applied case study (Pearl optimizing Pearl\'s own discoverability) as episode one to seed the format while real client work matures.',
    status: 'active',
    format_position: 2,
  },
  {
    name: 'The Shift',
    creative_execution: 'react_response',
    cadence: 'ad_hoc',
    estimated_episode_length: '4-8 min',
    production_complexity: 'low',
    production_notes:
      'Fast-turnaround serving P3. Trigger: reference-tier outlier spike (Goldie / Wolfe / AI Daily Brief) or platform announcement (AI Overviews update, model release, citation policy change). 48-hour publish window. Lighter graphics package to protect turnaround.',
    persona_rationale:
      'The persona asks "how do I read the AI search landscape" and "what does this announcement mean for my brand." The sober, operator-perspective version of news commentary is underserved — Goldie/Wolfe own the breathless register; this format owns the rational one.',
    pillar_label: 'The Shift',
    counter_argument:
      'Reactive content can paint Pearl as a follower not a leader. Mitigation: every Shift episode must end with a Pearl-specific operational implication ("here\'s what we\'re changing in client work because of this"), not just summarized commentary. Without that discipline, this format dilutes the positioning.',
    status: 'active',
    format_position: 3,
  },
  {
    name: 'State of AI Discoverability',
    creative_execution: 'document_review',
    cadence: 'quarterly',
    estimated_episode_length: '20-35 min',
    production_complexity: 'high',
    production_notes:
      'Cinematic data-led documentary serving P5. One per quarter, real promotion runway each. Anchored to original data every time — NEVER theme-only, or drifts into the contested "AI & society" editorial lane where Pearl has no edge (per Spine guardrails). Each edition repurposes into: report PDF (citable artifact for AEO), sales deck module, 6–10 clips for The Weekly Desk and socials, press/podcast pitch material. Show carries its own name/identity (a franchise living on Pearl\'s channel, not the channel as "Pearl 27") — host decision pending screen tests; show-brand survives host changes and packages as a media asset in any future transaction.',
    persona_rationale:
      'The flagship that proves the methodology. Persona trust signal "evidence of established credibility" and "data-backed claims" — both satisfied in one quarterly artifact. The recursion is the moat: original research is what AI engines cite, so being the answer to "what\'s the state of AI discoverability" makes Pearl the cited answer.',
    pillar_label: 'AI & Human',
    counter_argument:
      'Quarterly cadence is fragile — miss one edition and the franchise loses credibility and AEO-citation compounding. Highest planning cost: requires committed data collection across every prior quarter, not a quarter-of-effort dash. Also: drift risk into "AI & society" lane is real — every edition needs a Pearl-original data point, never just analysis of other people\'s data.',
    status: 'active',
    format_position: 4,
  },
];

// PART 4 — Business context (versioned: supersede existing active, insert new active)
const BUSINESS_CONTEXT = {
  one_line_summary:
    "Pearl 27 — AI-era discoverability consultancy. Makes brands visible and recommendable in LLM and AI-agent contexts through proactive and reactive conversation influence across the surfaces AI engines cite (YouTube, Reddit, forums, press).",
  target_market:
    "Marketing leaders, brand strategists, and growth executives at mid-to-large established brands who are absent or misrepresented in AI-generated answers and recommendations.",
  products_offered:
    "AEO/GEO strategy and execution; AI-visibility measurement and audits; conversation influence campaigns; AI-era discoverability advisory.",
  products_not_offered:
    "Traditional SEO agency services; martech/AI implementation consulting; AI development; generic digital marketing.",
  notes: "Preserve the phrase 'proactive and reactive conversation influence' — it is the methodology in five words.",
  status: 'active',
};

// ─── Env loader ──────────────────────────────────────
function loadEnv() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..');
  const envPath = path.join(repoRoot, '.env.local');
  const fromFile = fs.existsSync(envPath)
    ? Object.fromEntries(
        fs.readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('='))
          .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
      )
    : {};
  return {
    SUPABASE_URL:              process.env.SUPABASE_URL              || fromFile.SUPABASE_URL              || fromFile.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || fromFile.SUPABASE_SERVICE_ROLE_KEY || fromFile.SUPABASE_SERVICE_KEY,
    YOUTUBE_API_KEY:           process.env.YOUTUBE_API_KEY           || fromFile.YOUTUBE_API_KEY,
  };
}

// ─── Helpers ─────────────────────────────────────────
const log = (...a) => console.log(...a);
const sep = () => console.log('─'.repeat(72));
const banner = (s) => { console.log(); sep(); console.log(' ' + s); sep(); };

function normalize(s) { return String(s || '').trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' '); }
function looseMatch(haystack, needle) {
  const h = normalize(haystack), n = normalize(needle);
  if (!h || !n) return false;
  return h === n || h.includes(n) || n.includes(h);
}

async function searchYouTubeChannel(searchHint, apiKey) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('q', searchHint);
  url.searchParams.append('type', 'channel');
  url.searchParams.append('maxResults', '5');
  url.searchParams.append('key', apiKey);
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return (j.items || []).map(it => ({
    youtube_channel_id: it.snippet?.channelId || it.id?.channelId,
    title:              it.snippet?.channelTitle || it.snippet?.title,
    description:        it.snippet?.description || '',
    thumbnail:          it.snippet?.thumbnails?.medium?.url || null,
  }));
}

async function fetchChannelStats(channelId, apiKey) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.append('part', 'snippet,statistics');
  url.searchParams.append('id', channelId);
  url.searchParams.append('key', apiKey);
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  const it = j.items?.[0];
  if (!it) return null;
  return {
    youtube_channel_id: it.id,
    name:               it.snippet.title,
    description:        it.snippet.description,
    thumbnail_url:      it.snippet.thumbnails?.medium?.url || null,
    subscriber_count:   parseInt(it.statistics.subscriberCount) || 0,
    video_count:        parseInt(it.statistics.videoCount) || 0,
    total_view_count:   parseInt(it.statistics.viewCount) || 0,
  };
}

// ─── Main ────────────────────────────────────────────
async function main() {
  const env = loadEnv();
  if (!env.SUPABASE_URL)              { console.error('Missing SUPABASE_URL'); process.exit(1); }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  if (!env.YOUTUBE_API_KEY && !SKIP_ADD && !VERIFY_ONLY) {
    console.error('Missing YOUTUBE_API_KEY (needed for Part 1D channel resolution). Set it OR pass --skip-add.');
    process.exit(1);
  }

  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  banner(`PEARL 27 HANDOFF — ${APPLY ? '⚠  APPLY MODE  ⚠' : 'DRY-RUN'}`);
  log(`Pearl 27 client_id: ${PEARL_ID}`);
  log(`Mode: ${APPLY ? 'APPLY (writes will execute)' : 'DRY-RUN (no writes)'}${SKIP_ADD ? ' · --skip-add' : ''}${VERIFY_ONLY ? ' · --verify-only' : ''}`);

  // Confirm client row
  const { data: client, error: clientErr } = await sb
    .from('channels')
    .select('id, name, is_client, is_prelaunch, prelaunch_intended_launch_at')
    .eq('id', PEARL_ID).maybeSingle();
  if (clientErr || !client) {
    console.error('Could not load Pearl 27 client row:', clientErr?.message || 'not found'); process.exit(1);
  }
  log(`Client: ${client.name} · is_client=${client.is_client} · is_prelaunch=${client.is_prelaunch}`);

  if (VERIFY_ONLY) {
    await runVerification(sb);
    return;
  }

  // Load current cohort
  const { data: junctions } = await sb
    .from('client_channels')
    .select('channel_id, cohort_role')
    .eq('client_id', PEARL_ID);
  const cohortChannelIds = (junctions || []).map(j => j.channel_id);
  const { data: cohortChannels } = await sb
    .from('channels')
    .select('id, name, youtube_channel_id, subscriber_count, video_count, is_competitor')
    .in('id', cohortChannelIds);
  const cohortMap = new Map((cohortChannels || []).map(c => [c.id, c]));
  const cohort = (junctions || []).map(j => ({
    channel_id: j.channel_id,
    role:       j.cohort_role,
    name:       cohortMap.get(j.channel_id)?.name || '(unknown)',
    ytId:       cohortMap.get(j.channel_id)?.youtube_channel_id || null,
    subs:       cohortMap.get(j.channel_id)?.subscriber_count || 0,
  }));

  banner('CURRENT COHORT');
  log(`Total: ${cohort.length}`);
  const byRole = cohort.reduce((m, c) => { (m[c.role] ||= []).push(c); return m; }, {});
  for (const role of Object.keys(byRole)) {
    log(`  ${role}: ${byRole[role].length}`);
  }
  if (VERBOSE) for (const c of cohort.sort((a,b) => a.name.localeCompare(b.name))) {
    log(`    ${c.role.padEnd(13)} | ${c.name.padEnd(40)} | ${c.subs.toLocaleString().padStart(10)} subs`);
  }

  // Plan: build per-section ops
  const ops = { remove: [], retag: [], keep: [], add: [], pillars: [], formats: [], biz: null };
  const warnings = [];

  // ─── Part 1A — REMOVE ──────────────────────────
  banner('PART 1A — REMOVE (delete junction rows)');
  for (const name of REMOVE_NAMES) {
    const matches = cohort.filter(c => looseMatch(c.name, name));
    if (matches.length === 0) {
      log(`  SKIP  | "${name}" — not in cohort (already removed?)`);
    } else if (matches.length > 1) {
      warnings.push(`REMOVE ambiguous: "${name}" matched ${matches.length}: ${matches.map(m => m.name).join(', ')}`);
      log(`  AMBIG | "${name}" → ${matches.length} matches — SKIPPED`);
    } else {
      ops.remove.push(matches[0]);
      log(`  DELETE| "${matches[0].name}" (role=${matches[0].role}, channel_id=${matches[0].channel_id})`);
    }
  }

  // ─── Part 1B — RETAG ───────────────────────────
  banner('PART 1B — RETAG');
  for (const { name, role } of RETAG) {
    const matches = cohort.filter(c => looseMatch(c.name, name));
    if (matches.length === 0) {
      warnings.push(`RETAG missing: "${name}" not in cohort`);
      log(`  MISS  | "${name}" — not in cohort`);
    } else if (matches.length > 1) {
      warnings.push(`RETAG ambiguous: "${name}" matched ${matches.length}: ${matches.map(m => m.name).join(', ')}`);
      log(`  AMBIG | "${name}" → ${matches.length} matches — SKIPPED`);
    } else if (matches[0].role === role) {
      log(`  SKIP  | "${matches[0].name}" already ${role}`);
    } else {
      ops.retag.push({ ...matches[0], newRole: role });
      log(`  RETAG | "${matches[0].name}" ${matches[0].role} → ${role}`);
    }
  }

  // ─── Part 1C — KEEP AS PEER (verify-only) ──────
  banner('PART 1C — KEEP AS PEER (verify)');
  for (const name of KEEP_AS_PEER) {
    const matches = cohort.filter(c => looseMatch(c.name, name));
    if (matches.length === 0) {
      warnings.push(`KEEP missing: "${name}" not in cohort`);
      log(`  MISS  | "${name}" — not in cohort`);
    } else if (matches[0].role === 'peer') {
      log(`  OK    | "${matches[0].name}" already peer`);
    } else {
      warnings.push(`KEEP role mismatch: "${matches[0].name}" is ${matches[0].role}, expected peer`);
      log(`  WARN  | "${matches[0].name}" is ${matches[0].role}, not peer`);
    }
  }

  // ─── Part 1D — ADD (resolve via YouTube API) ───
  banner(SKIP_ADD ? 'PART 1D — ADD (SKIPPED)' : 'PART 1D — ADD');
  if (!SKIP_ADD) {
    for (const target of ADD) {
      try {
        let chan;
        if (target.explicitChannelId) {
          chan = await fetchChannelStats(target.explicitChannelId, env.YOUTUBE_API_KEY);
          if (!chan) { warnings.push(`ADD ${target.name}: explicit channelId did not resolve`); log(`  FAIL  | ${target.name} — explicit ID did not resolve`); continue; }
        } else {
          const candidates = await searchYouTubeChannel(target.searchHint, env.YOUTUBE_API_KEY);
          if (candidates.length === 0) { warnings.push(`ADD ${target.name}: no search candidates`); log(`  FAIL  | ${target.name} — no candidates`); continue; }
          const top = candidates[0];
          if (!looseMatch(top.title, target.name)) {
            warnings.push(`ADD ${target.name}: top candidate "${top.title}" doesn't loose-match name`);
            log(`  LOWCF | ${target.name} — top candidate "${top.title}" — needs explicit ID; candidates: ${candidates.map(c=>c.title).join(', ')}`);
            continue;
          }
          chan = await fetchChannelStats(top.youtube_channel_id, env.YOUTUBE_API_KEY);
          if (!chan) { warnings.push(`ADD ${target.name}: stats fetch failed`); log(`  FAIL  | ${target.name} — stats fetch failed`); continue; }
        }
        // Check if channel already exists in DB
        const { data: existing } = await sb.from('channels')
          .select('id, name, youtube_channel_id')
          .eq('youtube_channel_id', chan.youtube_channel_id).maybeSingle();
        // Check if already in cohort
        const alreadyInCohort = existing ? cohort.find(c => c.channel_id === existing.id) : null;
        ops.add.push({
          target, chan,
          existingDbId:    existing?.id || null,
          existingCohortRole: alreadyInCohort?.role || null,
        });
        const tag = alreadyInCohort
          ? (alreadyInCohort.role === target.role ? `ALREADY ${target.role}` : `RETAG (${alreadyInCohort.role}→${target.role})`)
          : existing ? `INSERT JUNCTION (channel exists)` : `INSERT CHANNEL + JUNCTION (new)`;
        log(`  ADD   | ${target.name.padEnd(22)} → ${chan.youtube_channel_id} · ${chan.name} · ${chan.subscriber_count.toLocaleString()} subs · ${tag}`);
      } catch (e) {
        warnings.push(`ADD ${target.name}: ${e.message}`);
        log(`  ERR   | ${target.name} — ${e.message}`);
      }
    }
  }

  // ─── Part 2 — PILLARS ──────────────────────────
  banner('PART 2 — PILLARS');
  const { data: existingPillars } = await sb.from('client_pillars')
    .select('id, title, status').eq('client_id', PEARL_ID);
  for (const p of PILLARS) {
    const dup = (existingPillars || []).find(ep =>
      normalize(ep.title) === normalize(p.title) && ep.status === 'active');
    if (dup) {
      log(`  SKIP  | "${p.title}" already exists active (id=${dup.id})`);
    } else {
      ops.pillars.push(p);
      log(`  INSERT| "${p.title}" (sort_order=${p.sort_order}, format_type=${p.format_type})`);
    }
  }

  // ─── Part 3 — FORMATS ──────────────────────────
  banner('PART 3 — RECURRING FORMATS');
  const { data: existingFormats } = await sb.from('client_recurring_formats')
    .select('id, name, status').eq('client_id', PEARL_ID).is('archived_at', null);
  for (const f of FORMATS) {
    const dup = (existingFormats || []).find(ef => normalize(ef.name) === normalize(f.name) && ['active', 'piloting'].includes(ef.status));
    if (dup) {
      log(`  SKIP  | "${f.name}" already exists ${dup.status} (id=${dup.id})`);
    } else {
      ops.formats.push(f);
      log(`  INSERT| "${f.name}" [${f.creative_execution} · ${f.cadence}]`);
    }
  }

  // ─── Part 4 — BUSINESS CONTEXT ─────────────────
  banner('PART 4 — BUSINESS CONTEXT (versioned)');
  const { data: activeBiz } = await sb.from('client_business_context')
    .select('id, one_line_summary, target_market, status, confirmed_at')
    .eq('client_id', PEARL_ID).eq('status', 'active').maybeSingle();
  ops.biz = { supersedeId: activeBiz?.id || null };
  if (activeBiz) {
    log(`  EXISTING ACTIVE: id=${activeBiz.id} → will be set status='superseded'`);
    if (VERBOSE) log(`    one_line_summary: ${activeBiz.one_line_summary?.slice(0, 120)}…`);
  } else {
    log('  No existing active row — will insert new active row only');
  }
  log(`  INSERT NEW: status='active', one_line_summary="${BUSINESS_CONTEXT.one_line_summary.slice(0,80)}…"`);

  // ─── Warnings summary ──────────────────────────
  if (warnings.length) {
    banner('WARNINGS');
    for (const w of warnings) log(`  ! ${w}`);
  }

  // ─── Dry-run exit ──────────────────────────────
  if (!APPLY) {
    banner('DRY-RUN COMPLETE — no writes executed');
    log('Re-run with --apply to execute. To skip Part 1D channel resolution, also pass --skip-add.');
    return;
  }

  // ─── EXECUTE ───────────────────────────────────
  banner('EXECUTING — writes in progress');
  const exec = { remove: 0, retag: 0, add_channels: 0, add_junctions: 0, retag_via_add: 0, pillars: 0, formats: 0, biz: 0, errors: [] };

  // 1A — DELETE junction rows
  for (const r of ops.remove) {
    const { error } = await sb.from('client_channels')
      .delete().eq('client_id', PEARL_ID).eq('channel_id', r.channel_id);
    if (error) exec.errors.push(`REMOVE ${r.name}: ${error.message}`);
    else exec.remove++;
  }
  log(`  1A: removed ${exec.remove}/${ops.remove.length} junction rows`);

  // 1B — UPDATE cohort_role on existing junctions
  for (const r of ops.retag) {
    const { error } = await sb.from('client_channels')
      .update({ cohort_role: r.newRole, cohort_role_updated_at: new Date().toISOString() })
      .eq('client_id', PEARL_ID).eq('channel_id', r.channel_id);
    if (error) exec.errors.push(`RETAG ${r.name}: ${error.message}`);
    else exec.retag++;
  }
  log(`  1B: retagged ${exec.retag}/${ops.retag.length} junctions`);

  // 1D — INSERT channels + junctions for ADDs
  for (const op of ops.add) {
    try {
      let channelId = op.existingDbId;
      if (!channelId) {
        const { data: created, error: createErr } = await sb.from('channels')
          .insert({
            youtube_channel_id: op.chan.youtube_channel_id,
            name:               op.chan.name,
            thumbnail_url:      op.chan.thumbnail_url,
            subscriber_count:   op.chan.subscriber_count,
            video_count:        op.chan.video_count,
            total_view_count:   op.chan.total_view_count,
            is_competitor:      true,
            is_client:          false,
            created_via:        'manual',
          })
          .select('id').single();
        if (createErr) { exec.errors.push(`ADD channel ${op.target.name}: ${createErr.message}`); continue; }
        channelId = created.id;
        exec.add_channels++;
      }
      if (op.existingCohortRole === op.target.role) {
        // already tagged correctly — skip
        continue;
      }
      if (op.existingCohortRole) {
        // retag existing junction
        const { error } = await sb.from('client_channels')
          .update({ cohort_role: op.target.role, cohort_role_updated_at: new Date().toISOString() })
          .eq('client_id', PEARL_ID).eq('channel_id', channelId);
        if (error) exec.errors.push(`ADD retag ${op.target.name}: ${error.message}`);
        else exec.retag_via_add++;
      } else {
        const { error } = await sb.from('client_channels')
          .insert({
            client_id:   PEARL_ID,
            channel_id:  channelId,
            cohort_role: op.target.role,
            cohort_role_updated_at: new Date().toISOString(),
          });
        if (error) exec.errors.push(`ADD junction ${op.target.name}: ${error.message}`);
        else exec.add_junctions++;
      }
    } catch (e) { exec.errors.push(`ADD ${op.target.name}: ${e.message}`); }
  }
  log(`  1D: added ${exec.add_channels} channel rows · inserted ${exec.add_junctions} junctions · retagged-via-add ${exec.retag_via_add}`);

  // 2 — Pillars
  for (const p of ops.pillars) {
    const { error } = await sb.from('client_pillars').insert({
      client_id:            PEARL_ID,
      status:               'active',
      title:                p.title,
      creative_description: p.creative_description,
      intended_audience:    p.intended_audience,
      format_type:          p.format_type,
      sort_order:           p.sort_order,
      source:               'handoff-2026-06-11',
    });
    if (error) exec.errors.push(`PILLAR ${p.title}: ${error.message}`);
    else exec.pillars++;
  }
  log(`  2: inserted ${exec.pillars}/${ops.pillars.length} pillars`);

  // 3 — Formats
  for (const f of ops.formats) {
    const { error } = await sb.from('client_recurring_formats').insert({
      client_id:                PEARL_ID,
      source:                   'manual',
      name:                     f.name,
      creative_execution:       f.creative_execution,
      cadence:                  f.cadence,
      persona_rationale:        f.persona_rationale,
      pillar_label:             f.pillar_label,
      estimated_episode_length: f.estimated_episode_length,
      production_complexity:    f.production_complexity,
      production_notes:         f.production_notes,
      counter_argument:         f.counter_argument,
      format_position:          f.format_position,
      status:                   f.status,
    });
    if (error) exec.errors.push(`FORMAT ${f.name}: ${error.message}`);
    else exec.formats++;
  }
  log(`  3: inserted ${exec.formats}/${ops.formats.length} formats`);

  // 4 — Business context (supersede + insert)
  if (ops.biz.supersedeId) {
    const { error: supErr } = await sb.from('client_business_context')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('id', ops.biz.supersedeId);
    if (supErr) exec.errors.push(`BIZ supersede: ${supErr.message}`);
  }
  const { error: bizInsErr } = await sb.from('client_business_context').insert({
    client_id:            PEARL_ID,
    status:               'active',
    one_line_summary:     BUSINESS_CONTEXT.one_line_summary,
    target_market:        BUSINESS_CONTEXT.target_market,
    products_offered:     BUSINESS_CONTEXT.products_offered,
    products_not_offered: BUSINESS_CONTEXT.products_not_offered,
    notes:                BUSINESS_CONTEXT.notes,
    confirmed_at:         new Date().toISOString(),
  });
  if (bizInsErr) exec.errors.push(`BIZ insert: ${bizInsErr.message}`);
  else exec.biz = 1;
  log(`  4: business context superseded=${ops.biz.supersedeId ? 1 : 0}, new active inserted=${exec.biz}`);

  if (exec.errors.length) {
    banner('WRITE ERRORS');
    for (const e of exec.errors) log(`  ✗ ${e}`);
  }

  // ─── Part 5 — Verification ─────────────────────
  await runVerification(sb);
}

async function runVerification(sb) {
  banner('PART 5 — VERIFICATION');

  // 1. Final cohort shape
  const { data: junctions } = await sb.from('client_channels')
    .select('channel_id, cohort_role').eq('client_id', PEARL_ID);
  const ids = (junctions || []).map(j => j.channel_id);
  const { data: chs } = await sb.from('channels')
    .select('id, name, youtube_channel_id, subscriber_count').in('id', ids);
  const byId = new Map((chs || []).map(c => [c.id, c]));
  const rows = (junctions || []).map(j => ({
    name: byId.get(j.channel_id)?.name || '?',
    ytId: byId.get(j.channel_id)?.youtube_channel_id || '?',
    subs: byId.get(j.channel_id)?.subscriber_count || 0,
    role: j.cohort_role,
  })).sort((a,b) => a.role.localeCompare(b.role) || (b.subs - a.subs));
  const counts = rows.reduce((m, r) => { m[r.role] = (m[r.role] || 0) + 1; return m; }, {});
  log(`Cohort total: ${rows.length} (${Object.entries(counts).map(([k,v]) => `${v} ${k}`).join(' / ')})`);
  for (const r of rows) log(`  ${r.role.padEnd(13)} | ${r.name.padEnd(40)} | ${r.subs.toLocaleString().padStart(10)} subs | ${r.ytId}`);

  // 2. Sources populated for get_brand_context
  const [{ data: spine }, { data: pillars }, { data: formats }, { data: biz }] = await Promise.all([
    sb.from('client_strategy_spine').select('positioning_oneliner, audience_persona_synthesized_at').eq('client_id', PEARL_ID).maybeSingle(),
    sb.from('client_pillars').select('id, title, status, sort_order').eq('client_id', PEARL_ID).eq('status', 'active').order('sort_order'),
    sb.from('client_recurring_formats').select('id, name, status').eq('client_id', PEARL_ID).in('status', ['active','piloting']).is('archived_at', null),
    sb.from('client_business_context').select('id, one_line_summary, status').eq('client_id', PEARL_ID).eq('status', 'active').maybeSingle(),
  ]);
  log(`\nSources populated: ${[
    spine ? 'spine' : null,
    (pillars||[]).length ? `pillars(${pillars.length})` : null,
    (formats||[]).length ? `formats(${formats.length})` : null,
    biz ? 'business' : null,
  ].filter(Boolean).join(', ') || 'NONE'}`);
  log('\nActive pillars:');  for (const p of pillars || []) log(`  ${p.sort_order}. ${p.title}`);
  log('\nActive formats:');  for (const f of formats || []) log(`  · ${f.name} (${f.status})`);
  log(`\nActive business context one_line_summary: ${biz?.one_line_summary?.slice(0, 120) || '—'}`);

  // 3. Confirm baseline peer-only filter is intact (informational — the dashboard's resolveCohortChannels with roles=['peer'] is the canonical filter; we just confirm the count of peers exists)
  log(`\nBaseline pool (peers only): ${counts.peer || 0} channels`);

  // 4. Resolved channel IDs for the ADD targets
  log('\nResolved channel IDs for ADD set (for spot-check):');
  for (const target of ADD) {
    const match = rows.find(r => looseMatch(r.name, target.name));
    log(`  ${target.name.padEnd(22)} → ${match ? `${match.ytId}  · ${match.name} · ${match.role}` : '— NOT RESOLVED —'}`);
  }
  banner('DONE');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
