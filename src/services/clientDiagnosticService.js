/**
 * Client diagnostic — pivot Research v2's competitor data so the CLIENT is
 * the primary axis. Returns "what works in your cohort" and (when the
 * client has its own YouTube channel) "where you're underperforming the
 * cohort." Powers the ClientDiagnostic panel that appears above the lens
 * tabs when a client is pinned in the ScopeBar.
 */

import { supabase } from './supabaseClient';

const SHORTS_THRESHOLD = 180;

// Title patterns mirror those in patternsService — kept tight and copied
// here to keep this service self-contained.
const TITLE_PATTERNS = [
  { id: 'question',   label: 'Question (?)',         test: t => /\?$|^(why|how|what|when|where|who|is|are|can|should|will|does|did)\b/i.test(t) },
  { id: 'how_to',     label: 'How / How to',         test: t => /^how\b/i.test(t) },
  { id: 'why',        label: 'Why',                  test: t => /^why\b/i.test(t) },
  { id: 'number',     label: 'Number in title',      test: t => /\b\d+\b/.test(t) },
  { id: 'listicle',   label: 'Listicle (top N, N ways)', test: t => /\b(top|best|worst)\s+\d+\b|\b\d+\s+(things|ways|tips|reasons|secrets|signs|mistakes)\b/i.test(t) },
  { id: 'all_caps',   label: 'ALL CAPS word',        test: t => /\b[A-Z]{4,}\b/.test(t) },
  { id: 'emoji',      label: 'Emoji',                test: t => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t) },
  { id: 'colon',      label: 'Colon (subtitle)',     test: t => /:/.test(t) },
  { id: 'vs',         label: 'vs / versus',          test: t => /\bvs\.?\b|\bversus\b/i.test(t) },
  { id: 'parenthet',  label: 'Parenthetical',        test: t => /\(.+\)/.test(t) },
];

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
  const scopeMedian = all.length > 0 ? median(all) : null;
  const patterns = TITLE_PATTERNS.map(p => {
    const matched = videos.filter(v => p.test(v.title || ''));
    const matchedViews = matched.map(v => v.view_count || 0).filter(n => n > 0);
    const m = matchedViews.length > 0 ? median(matchedViews) : null;
    const lift = (m != null && scopeMedian && scopeMedian > 0 && matched.length >= 5) ? m / scopeMedian : null;
    return {
      id: p.id,
      label: p.label,
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
  const scopeMedian = all.length > 0 ? median(all) : null;
  const counts = {};
  const viewsByBucket = {};
  for (const v of videos) {
    const b = durationBucket(v.duration_seconds);
    counts[b] = (counts[b] || 0) + 1;
    if (v.view_count > 0) (viewsByBucket[b] ||= []).push(v.view_count);
  }
  return Object.keys(BUCKET_LABELS).map(id => {
    const count = counts[id] || 0;
    const m = viewsByBucket[id]?.length ? median(viewsByBucket[id]) : null;
    return {
      id,
      label: BUCKET_LABELS[id],
      count,
      freq: videos.length > 0 ? count / videos.length : 0,
      medianViews: m,
      lift: (m != null && scopeMedian && scopeMedian > 0 && count >= 3) ? m / scopeMedian : null,
    };
  });
}

function cadenceStats(videos) {
  if (!videos?.length) return [];
  const all = videos.map(v => v.view_count || 0).filter(n => n > 0);
  const scopeMedian = all.length > 0 ? median(all) : null;
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
    const m = s.views.length > 0 ? median(s.views) : null;
    return {
      day: DAY_LABELS[s.dayIdx],
      block: BLOCK_LABELS[s.block],
      slot: `${DAY_LABELS[s.dayIdx]} ${BLOCK_LABELS[s.block]}`,
      count: s.count,
      medianViews: m,
      lift: (m != null && scopeMedian && scopeMedian > 0 && s.count >= 3) ? m / scopeMedian : null,
    };
  });
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

  // 2. Cohort videos (the client's pinned competitors)
  let cohortVideos = [];
  if (scopeChannelIds?.length) {
    const { data } = await supabase
      .from('videos')
      .select('title, view_count, duration_seconds, published_at')
      .in('channel_id', scopeChannelIds)
      .gte('published_at', cutoff)
      .lte('published_at', nowIso)
      .gt('view_count', 0)
      .limit(2000);
    cohortVideos = data || [];
  }

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

  // 4. Top working patterns (cohort) — sorted by lift desc, filtered for real lift
  const workingPatterns = cohort.patterns
    .filter(p => p.lift != null && p.lift >= 1.15 && p.freq >= 0.05)
    .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
    .slice(0, 5);

  // 5. Top working format buckets
  const workingBuckets = cohort.buckets
    .filter(b => b.lift != null && b.lift >= 1.15)
    .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
    .slice(0, 3);

  // 6. Top working time slots
  const workingSlots = cohort.cadence
    .filter(s => s.lift != null && s.lift >= 1.15)
    .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
    .slice(0, 5);

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
    },
    cohort,
    clientStats,
    workingPatterns,
    workingBuckets,
    workingSlots,
    gaps,
  };
}

// ──────────────────────────────────────────────────
// Briefing — Claude-synthesized prose from the diagnostic data.
// Cached per (clientId, dataSignature) so we don't burn tokens every
// page load. Returns null on failure (UI degrades gracefully).
// ──────────────────────────────────────────────────
const BRIEFING_CACHE_HOURS = 24 * 3; // re-synthesize every 3 days

export async function loadOrGenerateBriefing(diagnostic) {
  if (!diagnostic || !supabase) return null;
  const { client, mode, workingPatterns, workingBuckets, workingSlots, gaps, cohort } = diagnostic;

  // Cache signature — when the underlying data changes, we re-generate.
  const sig = [
    client.id, mode,
    workingPatterns.map(p => `${p.id}:${p.lift?.toFixed(2)}`).join(','),
    workingBuckets.map(b => `${b.id}:${b.lift?.toFixed(2)}`).join(','),
    workingSlots.slice(0, 3).map(s => `${s.day}-${s.block}:${s.lift?.toFixed(2)}`).join(','),
    gaps.map(g => `${g.id}:${g.freqRatio.toFixed(1)}`).join(','),
  ].join('|');
  const cacheKey = `client_briefing:${client.id}:${sig.slice(0, 200)}`;

  const cached = await loadCache(cacheKey);
  if (cached) return cached;

  if (!workingPatterns.length && !workingBuckets.length && !workingSlots.length) return null;

  try {
    const claudeAPI = (await import('./claudeAPI')).default;

    const patternLines = workingPatterns.map(p =>
      `- ${p.label}: cohort uses on ${(p.freq * 100).toFixed(0)}% of videos, lift ${((p.lift - 1) * 100).toFixed(0)}%`
    ).join('\n') || '(none with significant lift)';

    const bucketLines = workingBuckets.map(b =>
      `- ${b.label}: cohort uses on ${(b.freq * 100).toFixed(0)}% of videos, lift ${((b.lift - 1) * 100).toFixed(0)}%`
    ).join('\n') || '(none with significant lift)';

    const slotLines = workingSlots.slice(0, 5).map(s =>
      `- ${s.slot} (MT): ${s.count} cohort uploads, lift ${((s.lift - 1) * 100).toFixed(0)}%`
    ).join('\n') || '(none with significant lift)';

    const gapLines = gaps.length > 0 ? gaps.map(g =>
      `- ${g.label}: cohort uses ${(g.cohortFreq * 100).toFixed(0)}%, ${client.name} uses ${(g.clientFreq * 100).toFixed(0)}% (${g.freqRatio.toFixed(1)}× ratio)`
    ).join('\n') : null;

    const prompt = `You are writing a weekly action briefing for the YouTube channel "${client.name}" based on what's working in their competitive cohort.

COHORT SIGNAL (${cohort.videoCount} videos)
Title patterns with lift:
${patternLines}

Length sweet spots:
${bucketLines}

Posting time sweet spots (Mountain Time):
${slotLines}
${gapLines ? `\nGAPS (where ${client.name} uses these patterns less than the cohort):\n${gapLines}` : ''}

Write a 3-5 sentence briefing for ${client.name}. Lead with the single highest-leverage move they should make this week. Be specific — name the pattern, the lift, and what to do. Cite concrete numbers. Avoid platitudes. ${gapLines ? 'Anchor at least one recommendation against an explicit gap from the GAPS section.' : 'Frame recommendations prescriptively since you do not have their own channel data.'}

Return ONLY valid JSON:
{ "headline": "8-12 word punchy title", "body": "3-5 sentences" }`;

    const systemPrompt = `You write punchy, prescriptive briefings for YouTube channel operators. One paragraph, one clear next move. Cite numbers. No fluff. Return ONLY valid JSON.`;

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
