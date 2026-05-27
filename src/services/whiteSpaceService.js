/**
 * White Space service — finds gaps in a category's content coverage,
 * augmented with a Claude-synthesized opportunity brief.
 *
 * Operates on public-data signals only:
 *   - Topic coverage from title + description text (Claude extraction, cached)
 *   - Format gaps from duration buckets
 *   - Cadence gaps from posting-time density
 *   - AI opportunity brief synthesizing the gaps for pitch decks
 *
 * Briefs are cached per scope hash in the existing competitor_intelligence_cache
 * table so we don't re-call Claude on every page load.
 *
 * ──────────────────────────────────────────────────
 * Sibling: gapDetectionService
 * ──────────────────────────────────────────────────
 * whiteSpaceService is the strategist-facing brief layer (Claude-augmented,
 * cached, audit-pack and deliverable-bound). gapDetectionService is the
 * deterministic algorithmic engine that powers the standalone Gap Detection
 * tab and NextUpPanel — synchronous, no-budget, no AI. They're not
 * redundant; see gapDetectionService.js for the boundary.
 */

import { supabase } from './supabaseClient';
import { resolveScopeToChannelIds } from './patternsService.js';
import { trimmedMedian, liftConfidence } from './statsHelpers.js';

const SHORTS_DURATION_THRESHOLD = 180;
const BRIEF_CACHE_HOURS = 24 * 7; // refresh weekly

// ──────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────

/**
 * Run the full White Space analysis for a scope.
 * Returns topic coverage, format gaps, cadence gaps, and an opportunity brief.
 */
export async function analyzeWhiteSpace({ scopeChannelIds, windowDays = 90, scopeLabel = 'this scope', clientId = null }) {
  if (!scopeChannelIds?.length) {
    return { empty: true };
  }

  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
  const nowIso = new Date().toISOString();

  // Pull videos for the scope. Cap by current time to exclude scheduled
  // / upcoming videos that would skew cadence + topic clustering.
  const { data: videos } = await supabase
    .from('videos')
    .select('id, channel_id, title, description, duration_seconds, view_count, published_at')
    .in('channel_id', scopeChannelIds)
    .gte('published_at', cutoff)
    .lte('published_at', nowIso)
    .gt('view_count', 0)
    .limit(2000);

  if (!videos?.length) return { empty: true };

  const formatGaps = computeFormatGaps(videos);
  const cadenceGaps = computeCadenceGaps(videos);
  const topicCoverage = await computeTopicCoverage({ videos, scopeChannelIds, scopeLabel });
  const brief = await loadOrGenerateBrief({
    scopeChannelIds, scopeLabel, windowDays,
    topicCoverage, formatGaps, cadenceGaps, videos,
    clientId,
  });

  return {
    videoCount: videos.length,
    channelCount: scopeChannelIds.length,
    topicCoverage,
    formatGaps,
    cadenceGaps,
    brief,
  };
}

export { resolveScopeToChannelIds };

// ──────────────────────────────────────────────────
// Format gaps — duration buckets with low representation
// ──────────────────────────────────────────────────
function computeFormatGaps(videos) {
  const buckets = [
    { id: 'shorts',   label: 'Shorts (<3 min)',           min: 0,    max: SHORTS_DURATION_THRESHOLD },
    { id: 'lf_3_8',   label: 'Short long-form (3–8 min)', min: 181,  max: 480 },
    { id: 'lf_8_15',  label: 'Mid (8–15 min)',            min: 481,  max: 900 },
    { id: 'lf_15_25', label: 'Long (15–25 min)',          min: 901,  max: 1500 },
    { id: 'doc_25p',  label: 'Documentary (25 min+)',     min: 1501, max: Infinity },
  ];

  const total = videos.length;
  return buckets.map(b => {
    const matched = videos.filter(v => (v.duration_seconds || 0) >= b.min && (v.duration_seconds || 0) <= b.max);
    const freq = matched.length / total;
    return {
      id: b.id,
      label: b.label,
      count: matched.length,
      freq,
      // Flag as gap if <8% of videos in this length bucket
      isGap: freq < 0.08,
    };
  });
}

// ──────────────────────────────────────────────────
// Cadence gaps — day-of-week × time-of-day density (Mountain Time)
// ──────────────────────────────────────────────────
function computeCadenceGaps(videos) {
  // 7 days × 4 time blocks (Night/Morning/Afternoon/Evening, MT).
  // grid       = upload counts per cell
  // viewsGrid  = arrays of view_counts per cell — we'll reduce to medians + lift
  const grid       = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
  const viewsGrid  = Array.from({ length: 7 }, () => [[], [], [], []]);
  const allViews   = [];

  for (const v of videos) {
    if (!v.published_at) continue;
    const d = new Date(v.published_at);
    const mtFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Denver',
      weekday: 'short', hour: 'numeric', hour12: false,
    });
    const parts = mtFormatter.formatToParts(d);
    const wd = parts.find(p => p.type === 'weekday')?.value;
    const hr = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const dayIdx = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wd);
    if (dayIdx < 0) continue;
    const block = hr < 6 ? 0 : hr < 12 ? 1 : hr < 18 ? 2 : 3;
    grid[dayIdx][block]++;
    if (v.view_count > 0) {
      viewsGrid[dayIdx][block].push(v.view_count);
      allViews.push(v.view_count);
    }
  }

  // Scope-wide trimmed baseline so one bought-views outlier can't anchor it.
  const scopeMedian = allViews.length > 0 ? trimmedMedian(allViews) : null;

  // Reduce per-cell arrays to {medianViews, viewsLift, confidence}
  const medianGrid     = Array.from({ length: 7 }, () => [null, null, null, null]);
  const liftGrid       = Array.from({ length: 7 }, () => [null, null, null, null]);
  const confidenceGrid = Array.from({ length: 7 }, () => ['insufficient', 'insufficient', 'insufficient', 'insufficient']);
  for (let d = 0; d < 7; d++) {
    for (let b = 0; b < 4; b++) {
      const arr = viewsGrid[d][b];
      const m = arr.length > 0 ? trimmedMedian(arr) : null;
      // liftConfidence applies the drop-top sensitivity test on top of
      // the sample-size threshold — a slot dominated by one outlier
      // video gets downgraded to 'directional' even at n≥30.
      const conf = liftConfidence({ sampleValues: arr, currentMedian: m, kind: 'cadenceCell' });
      confidenceGrid[d][b] = conf;
      if (conf !== 'insufficient' && m != null && scopeMedian && scopeMedian > 0) {
        medianGrid[d][b] = m;
        liftGrid[d][b] = m / scopeMedian;
      }
    }
  }

  return {
    grid,
    medianGrid,
    liftGrid,
    confidenceGrid,
    scopeMedian,
    labels: {
      days:   ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      blocks: ['12am–6am', '6am–12pm', '12pm–6pm', '6pm–12am'],
    },
    total: videos.length,
  };
}

// ──────────────────────────────────────────────────
// Topic coverage — Claude-extracted, cached
// ──────────────────────────────────────────────────
async function computeTopicCoverage({ videos, scopeChannelIds, scopeLabel }) {
  // Build a sample of titles for Claude to extract themes from.
  // Limit to ~80 titles to keep tokens reasonable.
  const titles = videos
    .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
    .slice(0, 80)
    .map(v => v.title)
    .filter(Boolean);

  if (titles.length < 5) return [];

  // v2 prompt: product-specific categorization (previous prompt drifted
  // toward emotional/thematic). Bumping the cache key invalidates old
  // emotional-leaning clusters.
  const cacheKey = `whitespace_topics:v2-product-specific:${hashIds(scopeChannelIds)}:${titles.length}`;
  const cached = await loadCache(cacheKey);
  if (cached) return cached;

  try {
    const claudeAPI = (await import('./claudeAPI')).default;
    const prompt = `Below are ${titles.length} video titles from competitor channels in the "${scopeLabel}" space.

Cluster them into 8-12 topic themes. For each theme:
- Name it in 2-5 words
- Count how many titles belong to that theme
- Decide whether it's "saturated" (covered by many titles), "moderate", or a "gap" (covered by very few)
- Provide 1-2 example titles

CRITICAL — categorization style:
- PREFER PRODUCT-SPECIFIC themes when the underlying content is product-focused. Examples in a home security space: "Security Camera Reviews", "Smart Lock Installs", "Doorbell Comparisons", "Robot Vacuum Surveillance", "Alarm System Setup". These are actionable for a strategy deliverable because they map to concrete content the client can produce.
- AVOID falling back to emotional / thematic categorization ("Heartwarming Family Moments", "Funny Pet Antics", "Customer Stories") UNLESS the videos are genuinely emotion-led and have no underlying product or topic specificity. A doorbell video with a heartwarming family clip is still primarily a doorbell video.
- When a cluster could be either product-specific or emotional, choose product-specific. The emotional framing belongs in the example titles, not the theme name.
- Gaps named at the product level ("Smart Lock Reviews — gap") are far more useful than gaps named at the emotional level ("Customer Appreciation — gap"). The former tells the analyst what to build; the latter tells them nothing.

Titles:
${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Return ONLY valid JSON in this shape:
{ "topics": [ { "name": "string", "count": N, "coverage": "saturated" | "moderate" | "gap", "exampleTitles": ["..."] } ] }`;

    const systemPrompt = `You are an analyst identifying which content themes a category covers heavily vs. lightly. Prefer product/topic-specific theme names over emotional or thematic ones — a strategy deliverable needs categories the client can act on. Be honest about gaps: if a topic has only 1-3 titles out of ${titles.length}, it's a gap and a creator could own it. Saturated = >15% of titles. Moderate = 5-15%. Gap = <5%. Return ONLY valid JSON.`;

    const result = await claudeAPI.call(prompt, systemPrompt, 'whitespace_topics', 1500);
    const { parseClaudeJSON } = await import('../lib/parseClaudeJSON');
    const parsed = parseClaudeJSON(result.text, { topics: [] });
    const topics = parsed.topics || [];
    await saveCache(cacheKey, topics);
    return topics;
  } catch (err) {
    console.warn('[whiteSpace] topic extraction failed:', err);
    return [];
  }
}

// ──────────────────────────────────────────────────
// Opportunity brief — Claude synthesis
// ──────────────────────────────────────────────────
async function loadOrGenerateBrief({ scopeChannelIds, scopeLabel, windowDays, topicCoverage, formatGaps, cadenceGaps, videos, clientId = null }) {
  // Load business context first so it's part of the cache key — a
  // context update should invalidate a stale brief.
  let businessContext = null;
  if (clientId) {
    const { data } = await supabase
      .from('client_business_context')
      .select('id, products_offered, products_not_offered, target_market, one_line_summary, confirmed_at')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .maybeSingle();
    businessContext = data || null;
  }
  const bizKey = businessContext?.id || 'no-biz';
  // Prompt version — bump when the brief prompt changes substantively
  // so stale briefs generated under older rules get re-generated.
  const BRIEF_PROMPT_VERSION = 'v2-brand-exclusivity';
  const cacheKey = `whitespace_brief:${BRIEF_PROMPT_VERSION}:${hashIds(scopeChannelIds)}:${windowDays}:${bizKey}`;
  const cached = await loadCache(cacheKey);
  if (cached) return cached;

  try {
    const claudeAPI = (await import('./claudeAPI')).default;

    // Compact gap summary for Claude
    const topicSummary = topicCoverage.map(t =>
      `${t.coverage.toUpperCase()}: ${t.name} (${t.count} titles)`
    ).join('\n');

    const formatSummary = formatGaps.map(b =>
      `${b.isGap ? 'GAP' : 'OK'}: ${b.label} — ${b.count} videos (${(b.freq * 100).toFixed(1)}%)`
    ).join('\n');

    const totalUploads = cadenceGaps.total;
    const morningUploads = cadenceGaps.grid.reduce((s, day) => s + day[1], 0);
    const morningPct = totalUploads > 0 ? (morningUploads / totalUploads) * 100 : 0;
    const cadenceSummary = `Total uploads: ${totalUploads} over ${windowDays} days. Morning slot (6am–12pm MT) uploads: ${morningUploads} (${morningPct.toFixed(1)}%). Most-empty time blocks should be called out as cadence gaps.`;

    // Business-context block — the offer/not-offer fields constrain
    // which opportunities the brief can recommend. Without this, the
    // brief happily suggests categories the client doesn't sell.
    const businessBlock = businessContext
      ? `\n\nCLIENT BUSINESS CONTEXT (HARD CONSTRAINT — recommendations MUST fit within what this client offers):
${businessContext.one_line_summary ? `Summary: ${businessContext.one_line_summary}\n` : ''}${businessContext.products_offered ? `OFFERS:\n${businessContext.products_offered}\n` : ''}${businessContext.products_not_offered ? `DOES NOT OFFER (do NOT recommend content in these categories):\n${businessContext.products_not_offered}\n` : ''}${businessContext.target_market ? `Target market: ${businessContext.target_market}` : ''}`
      : '';

    const prompt = `You are writing a pitch-deck-ready opportunity brief for a client interested in the "${scopeLabel}" space.

Scope: ${scopeChannelIds.length} channels · ${videos.length} videos analyzed · last ${windowDays} days.

Topic coverage:
${topicSummary || 'No topic data.'}

Format coverage:
${formatSummary}

Cadence:
${cadenceSummary}${businessBlock}

Generate 3-5 numbered opportunities. Each opportunity should be:
- A specific, defensible angle a new entrant could own (or a current channel could expand into)
- Backed by the data above (cite specific numbers, formats, topics, or time slots)
- Written in 2-4 sentences total
- Tagged with one of: "topic gap", "format gap", "cadence gap", "audience gap"
${businessContext?.products_not_offered ? '- WITHIN this client\'s product/service offer. If a cohort gap is in a category the client does NOT sell, do not recommend it — say so explicitly if the strongest gaps are out-of-scope.' : ''}

BRAND NAME RULE (CRITICAL — applies to BOTH the opportunity TITLE and the BODY text):
- DO NOT name specific competitor product brands by name anywhere in the opportunity. This applies to ALL competitor brands including those mentioned in cohort data (Ring, Nest, Nest Cam, Vivint, SimpliSafe, Brinks, ADT, Wyze, Arlo, Blink, eufy, Lorex, etc.).
- Refer to product CATEGORIES generically: "video doorbell," "outdoor security camera," "smart lock," "professionally-monitored alarm system," "indoor camera."
- WRONG: "showcase how Nest Cam detects motion," "compare to Ring Pro features," "alternative to SimpliSafe."
- RIGHT: "showcase how a professional-grade doorbell detects motion," "compare against DIY equipment in the same category," "the case for professional monitoring vs DIY equivalents."
- The ONLY brand name you may mention is the client's own brand (taken from the business context above, if any). Mentioning a competitor by name — even as an example or analogy — counts as a violation.

Avoid platitudes. Each opportunity must point at something concrete and absent. If the data doesn't support 5 opportunities, return fewer.

Return ONLY valid JSON:
{ "opportunities": [ { "title": "string", "body": "2-4 sentence opportunity", "tags": ["topic gap"] } ] }`;

    const systemPrompt = `You're an analyst writing the kind of brief that makes a CMO say "let's pursue this."
- Lead with the claim, not the data. Data is evidence.
- Cite specific numbers from the input.
- One concrete example is worth more than three abstractions.
- If a category is truly well-covered, say so — don't manufacture gaps.
- Treat the client's business context as a HARD constraint: never recommend content in categories the client does not sell, AND never name specific competitor product brands in body text — refer to product categories generically instead.
Return ONLY valid JSON.`;

    const result = await claudeAPI.call(prompt, systemPrompt, 'whitespace_brief', 2000);
    const { parseClaudeJSON } = await import('../lib/parseClaudeJSON');
    const parsed = parseClaudeJSON(result.text, { opportunities: [] });
    const brief = {
      opportunities: parsed.opportunities || [],
      generatedAt: new Date().toISOString(),
    };
    await saveCache(cacheKey, brief);
    return brief;
  } catch (err) {
    console.warn('[whiteSpace] brief generation failed:', err);
    return { opportunities: [], error: err.message };
  }
}

// ──────────────────────────────────────────────────
// Lightweight cache using competitor_intelligence_cache table
// ──────────────────────────────────────────────────
async function loadCache(key) {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from('competitor_intelligence_cache')
      .select('payload, updated_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (!data) return null;
    const ageHours = (Date.now() - new Date(data.updated_at).getTime()) / 3600000;
    if (ageHours > BRIEF_CACHE_HOURS) return null;
    return data.payload;
  } catch (err) {
    return null;
  }
}

async function saveCache(key, payload) {
  if (!supabase) return;
  try {
    await supabase
      .from('competitor_intelligence_cache')
      .upsert({ cache_key: key, payload, updated_at: new Date().toISOString() }, { onConflict: 'cache_key' });
  } catch (err) {
    console.warn('[whiteSpace] cache save failed:', err);
  }
}

function hashIds(ids) {
  // Stable hash for an unordered set of IDs
  return [...(ids || [])].sort().slice(0, 50).join(',').slice(0, 200);
}

export default { analyzeWhiteSpace, resolveScopeToChannelIds };
