/**
 * Client diagnostic — pivot Research v2's competitor data so the CLIENT is
 * the primary axis. Returns "what works in your cohort" and (when the
 * client has its own YouTube channel) "where you're underperforming the
 * cohort." Powers the ClientDiagnostic panel that appears above the lens
 * tabs when a client is pinned in the ScopeBar.
 */

import { supabase } from './supabaseClient';
import { trimmedMedian, liftConfidence } from './statsHelpers.js';
import { fetchVideosForChannels, TITLE_PATTERNS } from './patternsService.js';

const SHORTS_THRESHOLD = 180;

// TITLE_PATTERNS now imported from patternsService — single source of
// truth. The previous local copy had diverged definitions (different
// regexes, different ids like 'all_caps' vs 'allcaps', different labels)
// which caused the briefing's pattern stats to silently disagree with
// the Patterns lens table. Reviewer caught the symptom on "ALL CAPS"
// with n=52 in the briefing vs n=123 in the table.

// Local median kept for engagement comparisons; trimmedMedian from
// statsHelpers used for view-count medians where outlier resistance matters.
function median(nums) {
  if (!nums?.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function durationBucket(d) {
  d = d || 0;
  if (d <= SHORTS_THRESHOLD) return 'shorts';
  if (d <= 480) return 'lf_3_8';
  if (d <= 900) return 'lf_8_15';
  if (d <= 1500) return 'lf_15_25';
  return 'doc_25p';
}

const BUCKET_LABELS = {
  shorts: 'Shorts (<3 min)',
  lf_3_8: 'Short long-form (3–8 min)',
  lf_8_15: 'Mid (8–15 min)',
  lf_15_25: 'Long (15–25 min)',
  doc_25p: 'Documentary (25 min+)',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BLOCK_LABELS = ['12am–6am', '6am–12pm', '12pm–6pm', '6pm–12am'];

// ──────────────────────────────────────────────────
// Compute pattern frequencies and per-pattern median views
// ──────────────────────────────────────────────────
function patternStats(videos) {
  if (!videos?.length) return { patterns: [], scopeMedian: null };
  const all = videos.map(v => v.view_count || 0).filter(n => n > 0);
  const scopeMedian = all.length > 0 ? trimmedMedian(all) : null;
  const patterns = TITLE_PATTERNS.map(p => {
    const matched = videos.filter(v => p.test(v.title || ''));
    const matchedViews = matched.map(v => v.view_count || 0).filter(n => n > 0);
    const m = matchedViews.length > 0 ? trimmedMedian(matchedViews) : null;
    const conf = liftConfidence({ sampleValues: matchedViews, currentMedian: m, kind: 'pattern' });
    const lift = (m != null && scopeMedian && scopeMedian > 0 && conf !== 'insufficient') ? m / scopeMedian : null;
    return {
      id: p.id,
      label: p.label,
      confidence: conf,
      count: matched.length,
      freq: matched.length / videos.length,
      medianViews: m,
      lift,
    };
  });
  return { patterns, scopeMedian };
}

function bucketStats(videos) {
  if (!videos?.length) return [];
  const all = videos.map(v => v.view_count || 0).filter(n => n > 0);
  const scopeMedian = all.length > 0 ? trimmedMedian(all) : null;
  const counts = {};
  const viewsByBucket = {};
  for (const v of videos) {
    const b = durationBucket(v.duration_seconds);
    counts[b] = (counts[b] || 0) + 1;
    if (v.view_count > 0) (viewsByBucket[b] ||= []).push(v.view_count);
  }
  return Object.keys(BUCKET_LABELS).map(id => {
    const count = counts[id] || 0;
    const m = viewsByBucket[id]?.length ? trimmedMedian(viewsByBucket[id]) : null;
    const conf = liftConfidence({ sampleValues: viewsByBucket[id] || [], currentMedian: m, kind: 'formatBucket' });
    return {
      id,
      label: BUCKET_LABELS[id],
      count,
      confidence: conf,
      freq: videos.length > 0 ? count / videos.length : 0,
      medianViews: m,
      lift: (m != null && scopeMedian && scopeMedian > 0 && conf !== 'insufficient') ? m / scopeMedian : null,
    };
  });
}

function cadenceStats(videos) {
  if (!videos?.length) return [];
  const all = videos.map(v => v.view_count || 0).filter(n => n > 0);
  const scopeMedian = all.length > 0 ? trimmedMedian(all) : null;
  const slots = {}; // key "day-block" → { count, views: [] }
  for (const v of videos) {
    if (!v.published_at) continue;
    const d = new Date(v.published_at);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Denver', weekday: 'short', hour: 'numeric', hour12: false,
    }).formatToParts(d);
    const wd = parts.find(p => p.type === 'weekday')?.value;
    const hr = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const dayIdx = DAY_LABELS.indexOf(wd);
    if (dayIdx < 0) continue;
    const block = hr < 6 ? 0 : hr < 12 ? 1 : hr < 18 ? 2 : 3;
    const key = `${dayIdx}-${block}`;
    if (!slots[key]) slots[key] = { dayIdx, block, count: 0, views: [] };
    slots[key].count++;
    if (v.view_count > 0) slots[key].views.push(v.view_count);
  }
  return Object.values(slots).map(s => {
    const m = s.views.length > 0 ? trimmedMedian(s.views) : null;
    const conf = liftConfidence({ sampleValues: s.views, currentMedian: m, kind: 'cadenceCell' });
    return {
      day: DAY_LABELS[s.dayIdx],
      block: BLOCK_LABELS[s.block],
      slot: `${DAY_LABELS[s.dayIdx]} ${BLOCK_LABELS[s.block]}`,
      count: s.count,
      confidence: conf,
      medianViews: m,
      lift: (m != null && scopeMedian && scopeMedian > 0 && conf !== 'insufficient') ? m / scopeMedian : null,
    };
  });
}

// ──────────────────────────────────────────────────
// Archetype clustering — segment the cohort by how a channel makes
// content, not just what category it's in. A manufacturer-brand channel
// (Blink, 0.6% engagement, 7.5/wk cadence) and an independent reviewer
// (Smart Home Solver, 5.2% engagement, 2/mo) have fundamentally different
// success math; averaging them produces a meaningless "cohort norm."
//
// Uses the existing identity tags from migration 066:
//   creator-led | brand-owned | network | institutional | legacy-media
// ──────────────────────────────────────────────────

const ARCHETYPE_TAGS = new Set(['creator-led', 'brand-owned', 'network', 'institutional', 'legacy-media']);

const ARCHETYPE_LABELS = {
  'creator-led': 'Creator-led',
  'brand-owned': 'Brand-owned (manufacturer)',
  'network': 'Network / publisher',
  'institutional': 'Institutional / org',
  'legacy-media': 'Legacy media',
  'unknown': 'Unclassified',
};

async function fetchChannelArchetypes(channelIds) {
  if (!channelIds?.length) return new Map();
  const { data } = await supabase
    .from('channel_tags')
    .select('channel_id, tag')
    .in('channel_id', channelIds);
  // Build channel_id → archetype tag. First identity tag wins.
  const m = new Map();
  for (const row of (data || [])) {
    if (!ARCHETYPE_TAGS.has(row.tag)) continue;
    if (!m.has(row.channel_id)) m.set(row.channel_id, row.tag);
  }
  return m;
}

function analyzeArchetypes(cohortVideos, archetypeByChannel) {
  // Group videos by archetype
  const grouped = {};
  for (const v of cohortVideos) {
    const arch = archetypeByChannel.get(v.channel_id) || 'unknown';
    if (!grouped[arch]) grouped[arch] = [];
    grouped[arch].push(v);
  }

  // Per-archetype norms: engagement, top patterns, top length, top slots
  const breakdown = [];
  for (const [arch, vids] of Object.entries(grouped)) {
    if (vids.length < 10) continue; // skip tiny archetypes — not enough signal
    const engSamples = vids
      .map(v => v.view_count > 0 ? ((v.like_count || 0) + (v.comment_count || 0)) / v.view_count : null)
      .filter(e => e != null && e >= 0);
    const medianEngagement = engSamples.length > 0 ? median(engSamples) : null;
    const viewSamples = vids.map(v => v.view_count || 0).filter(n => n > 0);
    const medianViews = viewSamples.length > 0 ? trimmedMedian(viewSamples) : null;
    const channelsInArchetype = new Set(vids.map(v => v.channel_id));

    breakdown.push({
      archetype: arch,
      label: ARCHETYPE_LABELS[arch] || arch,
      channelCount: channelsInArchetype.size,
      videoCount: vids.length,
      medianViews,
      medianEngagement,
      patterns: patternStats(vids).patterns
        .filter(p => p.lift != null && p.lift >= 1.15 && p.confidence !== 'insufficient')
        .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
        .slice(0, 3),
      buckets: bucketStats(vids)
        .filter(b => b.lift != null && b.lift >= 1.15 && b.confidence !== 'insufficient')
        .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
        .slice(0, 2),
    });
  }
  // Sort by channel count desc — biggest archetype first
  return breakdown.sort((a, b) => b.channelCount - a.channelCount);
}

// ──────────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────────
export async function computeClientDiagnostic({ clientId, scopeChannelIds, windowDays = 90 }) {
  if (!clientId || !supabase) return null;

  // 1. Look up the client row (channels.is_client = true)
  const { data: client } = await supabase
    .from('channels')
    .select('id, name, youtube_channel_id, thumbnail_url')
    .eq('id', clientId)
    .eq('is_client', true)
    .maybeSingle();
  if (!client) return null;

  const isStub = !client.youtube_channel_id || client.youtube_channel_id.startsWith('stub_');

  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
  const nowIso = new Date().toISOString();

  // 2. Cohort videos (the client's pinned competitors). Use the same
  // paginated fetcher patternsService uses so the briefing's pattern
  // counts match the Patterns lens table exactly. Previously each
  // service had its own fetch with different limits, which produced
  // mismatched n= values across the audit.
  let cohortVideos = [];
  let archetypeByChannel = new Map();
  if (scopeChannelIds?.length) {
    [cohortVideos, archetypeByChannel] = await Promise.all([
      fetchVideosForChannels(scopeChannelIds, { windowDays }),
      fetchChannelArchetypes(scopeChannelIds),
    ]);
  }

  // Look up the client's own archetype (if tagged)
  const clientArchetypeMap = await fetchChannelArchetypes([client.id]);
  const clientArchetype = clientArchetypeMap.get(client.id) || null;

  // 3. Client's own videos (only if real YouTube channel)
  let clientVideos = [];
  if (!isStub) {
    const { data } = await supabase
      .from('videos')
      .select('title, view_count, duration_seconds, published_at')
      .eq('channel_id', client.id)
      .gte('published_at', cutoff)
      .lte('published_at', nowIso)
      .limit(500);
    clientVideos = data || [];
  }

  const mode = (!isStub && clientVideos.length >= 5) ? 'comparison' : 'prescriptive';

  const archetypeBreakdown = analyzeArchetypes(cohortVideos, archetypeByChannel);

  // If the client has its own archetype tag, also compute the patterns
  // for ONLY their archetype peers — the most relevant comparison set.
  const peerVideos = clientArchetype
    ? cohortVideos.filter(v => archetypeByChannel.get(v.channel_id) === clientArchetype)
    : null;
  const peerStats = peerVideos && peerVideos.length >= 10
    ? {
        archetype: clientArchetype,
        label: ARCHETYPE_LABELS[clientArchetype] || clientArchetype,
        videoCount: peerVideos.length,
        patterns: patternStats(peerVideos).patterns,
        buckets: bucketStats(peerVideos),
        cadence: cadenceStats(peerVideos),
      }
    : null;

  const cohort = {
    videoCount: cohortVideos.length,
    patterns: patternStats(cohortVideos).patterns,
    buckets: bucketStats(cohortVideos),
    cadence: cadenceStats(cohortVideos),
  };
  const clientStats = mode === 'comparison' ? {
    videoCount: clientVideos.length,
    patterns: patternStats(clientVideos).patterns,
    buckets: bucketStats(clientVideos),
    cadence: cadenceStats(clientVideos),
  } : null;

  // 4. Top working patterns / buckets / slots — sort statistical (n above
  // the per-kind threshold) first so they get the headline, with directional
  // (small-but-non-trivial sample) appearing below with a badge.
  const sortLift = (arr) => arr
    .filter(x => x.lift != null && x.lift >= 1.15)
    .sort((a, b) => {
      const aStat = a.confidence === 'statistical' ? 1 : 0;
      const bStat = b.confidence === 'statistical' ? 1 : 0;
      if (aStat !== bStat) return bStat - aStat;
      return (b.lift ?? 0) - (a.lift ?? 0);
    });

  const workingPatterns = sortLift(cohort.patterns.filter(p => p.freq >= 0.05)).slice(0, 5);
  const workingBuckets  = sortLift(cohort.buckets).slice(0, 3);
  const workingSlots    = sortLift(cohort.cadence).slice(0, 5);

  // 7. Gaps (comparison mode only): cohort patterns where client lags by 2× freq
  let gaps = [];
  if (mode === 'comparison') {
    gaps = workingPatterns
      .map(coh => {
        const cli = clientStats.patterns.find(p => p.id === coh.id);
        if (!cli) return null;
        const cohFreq = coh.freq;
        const cliFreq = cli.freq;
        if (cohFreq < 0.05) return null;
        const freqRatio = cohFreq / Math.max(cliFreq, 0.01);
        if (freqRatio < 2) return null; // cohort uses it ≥2× more than client
        return {
          id: coh.id,
          label: coh.label,
          cohortFreq: cohFreq,
          clientFreq: cliFreq,
          cohortLift: coh.lift,
          freqRatio,
        };
      })
      .filter(Boolean)
      .slice(0, 5);
  }

  return {
    mode,
    client: {
      id: client.id,
      name: client.name,
      thumbnail: client.thumbnail_url,
      isStub,
      archetype: clientArchetype,
      archetypeLabel: clientArchetype ? ARCHETYPE_LABELS[clientArchetype] : null,
    },
    cohort,
    clientStats,
    workingPatterns,
    workingBuckets,
    workingSlots,
    gaps,
    archetypeBreakdown, // each archetype's norms + top patterns
    peerStats,          // statistics restricted to client's archetype peers
  };
}

// ──────────────────────────────────────────────────
// Briefing — Claude-synthesized prose from the diagnostic data.
// Cached per (clientId, dataSignature) so we don't burn tokens every
// page load. Returns null on failure (UI degrades gracefully).
// ──────────────────────────────────────────────────
const BRIEFING_CACHE_HOURS = 24 * 3; // re-synthesize every 3 days

// Bump when the prompt structure or hedging rules change — invalidates
// every cached briefing so stale pre-hedging output stops being served.
const BRIEFING_PROMPT_VERSION = 'v8-archetype-aware';

export async function loadOrGenerateBriefing(diagnostic) {
  if (!diagnostic || !supabase) return null;
  const { client, mode, workingPatterns, workingBuckets, workingSlots, gaps, cohort, archetypeBreakdown, peerStats } = diagnostic;

  // Cache signature — when the underlying data OR the prompt version
  // changes, we re-generate. Includes archetype info so changes there
  // also flush.
  const sig = [
    BRIEFING_PROMPT_VERSION,
    client.id, mode, client.archetype || '',
    workingPatterns.map(p => `${p.id}:${p.lift?.toFixed(2)}:${p.confidence}`).join(','),
    workingBuckets.map(b => `${b.id}:${b.lift?.toFixed(2)}:${b.confidence}`).join(','),
    workingSlots.slice(0, 3).map(s => `${s.day}-${s.block}:${s.lift?.toFixed(2)}:${s.confidence}`).join(','),
    gaps.map(g => `${g.id}:${g.freqRatio.toFixed(1)}`).join(','),
    (archetypeBreakdown || []).map(a => `${a.archetype}:${a.channelCount}`).join(','),
  ].join('|');
  const cacheKey = `client_briefing:${client.id}:${sig.slice(0, 200)}`;

  const cached = await loadCache(cacheKey);
  if (cached) return cached;

  if (!workingPatterns.length && !workingBuckets.length && !workingSlots.length) return null;

  try {
    const claudeAPI = (await import('./claudeAPI')).default;

    // Data lines spell out frequency vs views-lift explicitly so the model
    // cannot conflate them. v3 prompt produced "uploads at 81% higher
    // frequency than baseline" when the actual claim was "videos posted
    // here get 81% MORE VIEWS than the cohort median" — different sentence,
    // different defensibility.
    const fmtLine = (label, freq, lift, n, conf) => {
      const tag = conf === 'statistical' ? '[STATISTICAL]' : '[DIRECTIONAL — small sample]';
      return `- ${label}: appears in ${(freq * 100).toFixed(0)}% of cohort videos (n=${n}). Videos using this pattern get ${((lift - 1) * 100).toFixed(0)}% MORE VIEWS than the cohort median. ${tag}`;
    };
    const patternLines = workingPatterns.map(p => fmtLine(p.label, p.freq, p.lift, p.count, p.confidence)).join('\n') || '(none with significant lift)';
    const bucketLines  = workingBuckets.map(b  => fmtLine(b.label, b.freq, b.lift, b.count, b.confidence)).join('\n') || '(none with significant lift)';
    const slotLines    = workingSlots.slice(0, 5).map(s => {
      const tag = s.confidence === 'statistical' ? '[STATISTICAL]' : '[DIRECTIONAL — small sample]';
      return `- ${s.slot} (MT) slot: ${s.count} cohort uploads land here. Videos posted in this slot get ${((s.lift - 1) * 100).toFixed(0)}% MORE VIEWS than the cohort median (n=${s.count}). ${tag}`;
    }).join('\n') || '(none with significant lift)';

    const gapLines = gaps.length > 0 ? gaps.map(g =>
      `- ${g.label}: cohort uses ${(g.cohortFreq * 100).toFixed(0)}%, ${client.name} uses ${(g.clientFreq * 100).toFixed(0)}% (${g.freqRatio.toFixed(1)}× ratio)`
    ).join('\n') : null;

    // Count statistical vs directional findings so the prompt can tell
    // Claude what kind of briefing this is.
    const statCount =
      workingPatterns.filter(p => p.confidence === 'statistical').length +
      workingBuckets.filter(b => b.confidence === 'statistical').length +
      workingSlots.filter(s => s.confidence === 'statistical').length;
    const dirCount =
      workingPatterns.filter(p => p.confidence === 'directional').length +
      workingBuckets.filter(b => b.confidence === 'directional').length +
      workingSlots.filter(s => s.confidence === 'directional').length;

    const evidenceState = statCount > 0
      ? `statistical-evidence available (${statCount} robust findings, ${dirCount} directional)`
      : `${dirCount > 0 ? 'directional-only' : 'no'} evidence — no finding passes the sample-size + outlier-resistance test`;

    // Archetype context — segments the cohort by how channels MAKE
    // content (manufacturer-brand vs. independent reviewer vs. educator).
    // Averaging these together produces meaningless norms; the briefing
    // should ground recommendations in the client's archetype peers.
    const archetypeLines = (archetypeBreakdown || [])
      .map(a => `- ${a.label}: ${a.channelCount} channels, ${a.videoCount} videos, median engagement ${a.medianEngagement != null ? (a.medianEngagement * 100).toFixed(1) + '%' : 'n/a'}, top patterns: ${(a.patterns || []).slice(0, 2).map(p => `${p.label} (+${Math.round((p.lift - 1) * 100)}%)`).join(', ') || 'none with significant lift'}`)
      .join('\n');

    const archetypeBlock = archetypeBreakdown && archetypeBreakdown.length > 1
      ? `\nCOHORT SEGMENTED BY ARCHETYPE (channels grouped by how they make content — manufacturer-brand vs. creator-led vs. educator, etc. These have fundamentally different success math; averaging them is misleading):\n${archetypeLines}\n${client.archetypeLabel ? `\n${client.name} is tagged as: **${client.archetypeLabel}** — recommendations should reference this archetype's peers, not the whole cohort.\n` : ''}`
      : '';

    const prompt = `You are writing the executive briefing for a YouTube category audit of "${client.name}'s" competitive cohort.

EVIDENCE STATE: ${evidenceState}
${archetypeBlock}
${gapLines ? `STRUCTURAL GAPS (most reliable signal — survives small-sample variance because it's a frequency comparison, not a view-count lift):\n${gapLines}\n` : ''}
COHORT SIGNAL — Title patterns:
${patternLines}

Length buckets:
${bucketLines}

Time-of-day slots:
${slotLines}

CRITICAL RULES — read carefully:
1. **Lead with the structural gap section if it exists.** Gaps are the most reliable evidence in this dataset — they're frequency-of-use comparisons that don't depend on small-sample medians.
2. **Each lift is tagged [STATISTICAL] or [DIRECTIONAL — small sample].** STATISTICAL means sample is large enough AND removing the top outlier doesn't collapse the lift. DIRECTIONAL means the lift exists but may be one-video-dominated.
3. **You may state a [STATISTICAL] finding with conviction and a number.**
4. **For [DIRECTIONAL] findings you MUST hedge** ("early signal", "worth testing whether", "small sample suggests"). NEVER quote a directional lift percentage without "(directional, n=X)" appended.
5. **If evidence state is "directional-only" or "no evidence"**, the briefing's job is to say so plainly — "the cohort doesn't show statistically reliable patterns yet; here's where to test" — NOT to manufacture conviction. A briefing that admits the data is thin is more credible than one that fakes signal.
6. **Don't invent insights** beyond what the data says. If there's no clear winner, lead with "the strongest signal here is structural — your usage of X is N× below cohort norm — start there."
7. **TERMINOLOGY — critical:** A "lift" number is ALWAYS a VIEWS comparison ("videos using this pattern get X% MORE VIEWS than the cohort median"). It is NEVER a frequency claim ("the cohort uploads X% more often"). The data lines spell this out — if you describe a lift, the sentence MUST be about views, never about upload frequency. Misreading lift as frequency invalidates the briefing.
8. **GROUND RECOMMENDATIONS IN ARCHETYPE PEERS, not the whole cohort.** If ${client.name} is tagged with an archetype, prefer patterns from that archetype's segment over whole-cohort averages — a manufacturer-brand and an independent reviewer have different success math. Call out the archetype explicitly when relevant ("among brand-owned peers, the median engagement is X% — that's the right baseline, not the cohort's Y%"). If the cohort doesn't separate cleanly by archetype OR ${client.name} has no archetype tag, fall back to the whole-cohort signal without inventing archetype framing.
9. **CLOSE WITH AN ACTIONABLE NEXT STEP.** The final sentence must tell ${client.name} what to do this week, separating "act on" (statistical findings) from "test" (directional findings). Examples of the closing pattern:
   - "Anchor the next four uploads on emoji titles and Monday afternoon slots; treat Saturday morning and 8–15 minute length as test bets."
   - "Start with the Why-title gap (statistical, lift +X%); reserve one upload to A/B-test the Saturday slot before committing schedule changes."
   A briefing that ends on "needs more data to confirm" is advisory, not actionable. Always point at the next move, even when the move is "run these two tests this week."

Output: 3-5 sentence briefing. First sentence = the single highest-leverage move (gap-led if a gap exists, otherwise the strongest statistical finding, otherwise an honest "data is too thin for confident recommendations"). Cite concrete numbers from the lines above. No platitudes.

Return ONLY valid JSON:
{ "headline": "8-12 word punchy title", "body": "3-5 sentences" }`;

    const systemPrompt = `You write executive briefings for YouTube channel operators. Your reputation depends on never claiming a confidently-wrong number. The audit data tags every finding as [STATISTICAL] or [DIRECTIONAL]; respect those tags rigorously — directional findings get hedged, statistical findings get cited with numbers. Gap analysis (frequency comparisons) is more reliable than view-count lifts and should lead when present. If the evidence is thin, say so plainly rather than fake conviction. Return ONLY valid JSON.`;

    const result = await claudeAPI.call(prompt, systemPrompt, 'client_briefing', 600);
    const { parseClaudeJSON } = await import('../lib/parseClaudeJSON');
    const parsed = parseClaudeJSON(result.text, { headline: '', body: '' });
    const briefing = {
      headline: parsed.headline || 'This week, here\'s where to push',
      body: parsed.body || '',
      generatedAt: new Date().toISOString(),
      mode,
    };
    await saveCache(cacheKey, briefing);
    return briefing;
  } catch (err) {
    console.warn('[clientDiagnostic] briefing failed:', err);
    return null;
  }
}

async function loadCache(key) {
  try {
    const { data } = await supabase
      .from('competitor_intelligence_cache')
      .select('payload, updated_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (!data) return null;
    const ageHours = (Date.now() - new Date(data.updated_at).getTime()) / 3600000;
    if (ageHours > BRIEFING_CACHE_HOURS) return null;
    return data.payload;
  } catch { return null; }
}

async function saveCache(key, payload) {
  try {
    await supabase.from('competitor_intelligence_cache').upsert(
      { cache_key: key, payload, updated_at: new Date().toISOString() },
      { onConflict: 'cache_key' }
    );
  } catch (err) { console.warn('[clientDiagnostic] cache save failed:', err); }
}

export default { computeClientDiagnostic, loadOrGenerateBriefing };
