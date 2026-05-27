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
    { id: 'shorts',   label: 'Shorts (<3 min)',           min: 0,    max: SHORTS_DURATION_THRESHOLD, isShorts: true  },
    { id: 'lf_3_8',   label: 'Short long-form (3–8 min)', min: 181,  max: 480,                       isShorts: false },
    { id: 'lf_8_15',  label: 'Mid (8–15 min)',            min: 481,  max: 900,                       isShorts: false },
    { id: 'lf_15_25', label: 'Long (15–25 min)',          min: 901,  max: 1500,                      isShorts: false },
    { id: 'doc_25p',  label: 'Documentary (25 min+)',     min: 1501, max: Infinity,                  isShorts: false },
  ];

  const total = videos.length;
  // Separate baselines: long-form is dramatically higher-volume than
  // Shorts on YouTube, so comparing a long-form bucket median against
  // an all-videos scope median (which Shorts drag down) makes every
  // long-form bucket look like it "outperforms scope by 600%" when
  // really it's outperforming a Shorts-diluted baseline. Compare each
  // bucket against its own length-class baseline.
  const longFormViews = videos
    .filter(v => (v.duration_seconds || 0) > SHORTS_DURATION_THRESHOLD)
    .map(v => v.view_count || 0)
    .filter(v => v > 0);
  const shortsViews = videos
    .filter(v => (v.duration_seconds || 0) <= SHORTS_DURATION_THRESHOLD && (v.duration_seconds || 0) > 0)
    .map(v => v.view_count || 0)
    .filter(v => v > 0);
  const longFormMedian = longFormViews.length >= 5 ? trimmedMedian(longFormViews) : null;
  const shortsMedian = shortsViews.length >= 5 ? trimmedMedian(shortsViews) : null;

  return buckets.map(b => {
    const matched = videos.filter(v => (v.duration_seconds || 0) >= b.min && (v.duration_seconds || 0) <= b.max);
    const freq = matched.length / total;
    const views = matched.map(v => v.view_count || 0).filter(v => v > 0);
    const medianViews = views.length >= 5 ? trimmedMedian(views) : null;
    const baseline = b.isShorts ? shortsMedian : longFormMedian;
    const baselineLabel = b.isShorts ? 'shorts median' : 'long-form median';
    const viewsLift = (medianViews && baseline) ? medianViews / baseline : null;
    return {
      id: b.id,
      label: b.label,
      count: matched.length,
      freq,
      medianViews,
      viewsLift,
      baselineLabel,
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
// Cadence hotspots — slots where median performance runs above the
// scope baseline but supply is thin. The brief uses these to anchor
// "performs X% better but no one is consistently producing it" claims.
// ──────────────────────────────────────────────────
function extractCadenceHotspots(cadenceGaps) {
  if (!cadenceGaps || !cadenceGaps.liftGrid) return [];
  const { grid, liftGrid, medianGrid, confidenceGrid, labels } = cadenceGaps;
  const hotspots = [];
  for (let d = 0; d < 7; d++) {
    for (let b = 0; b < 4; b++) {
      const lift = liftGrid[d]?.[b];
      const conf = confidenceGrid[d]?.[b];
      const uploads = grid[d]?.[b] || 0;
      // Hotspots must clear the "statistical" bar — n ≥ 30 AND not
      // outlier-dominated (one viral video can't carry the cell).
      // "Directional" cells get filtered: their lift numbers are
      // exactly the kind of thing that produces a misleading "1503%
      // above scope median" claim with 14 uploads, where one viral
      // video does all the work.
      if (lift != null && lift >= 1.3 && conf === 'statistical' && uploads >= 5) {
        hotspots.push({
          day: labels.days[d],
          block: labels.blocks[b],
          uploads,
          lift,
          medianViews: medianGrid[d]?.[b] || null,
          confidence: conf,
        });
      }
    }
  }
  hotspots.sort((a, b) => b.lift - a.lift);
  return hotspots;
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

  // v3 prompt: product-specific categorization + brand-name exclusion.
  // Bump invalidates old clusters that may have named competitor brands
  // in theme labels (e.g. 'Ring Doorbell Moments').
  const cacheKey = `whitespace_topics:v3-no-brands:${hashIds(scopeChannelIds)}:${titles.length}`;
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

BRAND NAME RULE (CRITICAL):
- DO NOT name specific competitor product brands in theme names. Refer to product categories generically.
- WRONG: "Ring Doorbell Moments", "Nest Cam Captures", "Vivint Setup", "SimpliSafe Installs"
- RIGHT: "Doorbell Camera Moments", "Outdoor Camera Captures", "Alarm System Setup", "Professional Installs"
- A specific brand may appear in example titles (because that's the data), but never in the theme name itself. The theme is the category; brands are instances of it.

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
  const BRIEF_PROMPT_VERSION = 'v5-baseline-fix';
  const cacheKey = `whitespace_brief:${BRIEF_PROMPT_VERSION}:${hashIds(scopeChannelIds)}:${windowDays}:${bizKey}`;
  const cached = await loadCache(cacheKey);
  if (cached) return cached;

  try {
    const claudeAPI = (await import('./claudeAPI')).default;

    // Topic coverage with explicit gap/saturated split so Claude can
    // anchor "opportunity to own X" claims to specific themes.
    const topicSummary = topicCoverage.map(t =>
      `${t.coverage.toUpperCase()}: ${t.name} (${t.count} titles)`
    ).join('\n');

    // Format summary now includes median views + lift vs the LENGTH-
    // CLASS baseline (long-form vs long-form, shorts vs shorts). Using
    // an all-videos scope median inflated every long-form bucket's
    // apparent lift by ~5-7× because Shorts pull the baseline down.
    // The label in each line tells Claude what it's reading.
    const formatSummary = formatGaps.map(b => {
      const liftStr = b.viewsLift != null
        ? ` — median views ${b.medianViews?.toLocaleString()} (${b.viewsLift >= 1 ? '+' : ''}${((b.viewsLift - 1) * 100).toFixed(0)}% vs ${b.baselineLabel})`
        : '';
      return `${b.isGap ? 'GAP' : 'OK'}: ${b.label} — ${b.count} videos (${(b.freq * 100).toFixed(1)}% of supply)${liftStr}`;
    }).join('\n');

    // Cadence: include lift hotspots so Claude can cite specific slots
    // where median views run high but supply is thin. Hotspots now
    // require statistical-confidence cells (n ≥ 30 + not outlier-
    // dominated); directional cells are excluded because that's where
    // a single viral video can produce a misleading "1500% lift" claim.
    const totalUploads = cadenceGaps.total;
    const cadenceHotspots = extractCadenceHotspots(cadenceGaps).slice(0, 4);
    const hotspotLines = cadenceHotspots.length
      ? cadenceHotspots.map(h => `- ${h.day} ${h.block}: ${h.uploads} uploads, median views ${h.medianViews?.toLocaleString()} (+${Math.round((h.lift - 1) * 100)}% vs scope median, ${h.confidence} confidence)`).join('\n')
      : '- (no slots meet statistical-confidence threshold — cadence data alone is not enough to anchor a leadership claim; lean on topic/format findings)';
    const cadenceSummary = `Total uploads in window: ${totalUploads} over ${windowDays} days.\nHigh-lift / under-supplied slots (n ≥ 30 uploads in the slot AND not outlier-dominated):\n${hotspotLines}`;

    // Business-context block — the offer/not-offer fields constrain
    // which opportunities the brief can recommend. Without this, the
    // brief happily suggests categories the client doesn't sell.
    const businessBlock = businessContext
      ? `\n\nCLIENT BUSINESS CONTEXT (HARD CONSTRAINT — recommendations MUST fit within what this client offers):
${businessContext.one_line_summary ? `Summary: ${businessContext.one_line_summary}\n` : ''}${businessContext.products_offered ? `OFFERS:\n${businessContext.products_offered}\n` : ''}${businessContext.products_not_offered ? `DOES NOT OFFER (do NOT recommend content in these categories):\n${businessContext.products_not_offered}\n` : ''}${businessContext.target_market ? `Target market: ${businessContext.target_market}` : ''}`
      : '';

    const prompt = `You are writing the "Unclaimed Territory" section of a competitive audit for a channel entering the "${scopeLabel}" space. The audience is a strategist who will turn these findings into content pillars later — they do NOT need pitchable show ideas. They need clear, evidence-led observations about where the cohort is thin, where performance is high, and where leadership is available.

Scope: ${scopeChannelIds.length} channels · ${videos.length} videos analyzed · last ${windowDays} days.

Topic coverage:
${topicSummary || 'No topic data.'}

Format coverage:
${formatSummary}

Cadence:
${cadenceSummary}${businessBlock}

Generate 3-5 numbered findings. Each finding should read as one of these three observation patterns:

PATTERN A — Topic ownership opportunity:
"There is opportunity to own [creative category / topic / angle]." Cite the specific gap themes from the topic coverage data (saturation level + title count). When multiple gap themes cluster around a single ownable position, name that position.
Example: "There is opportunity to own the long-form 'install diagnostics' category — only 4 of 247 titles in the cohort touch it, and none of the 12 channels covers it consistently."

PATTERN B — Performance gap with no consistent producer:
"No channel is consistently producing [format / topic / cadence type] but that same content is performing [X]% better than others." Anchor to the format-bucket lift numbers or cadence hotspots above. The point of this pattern is to surface where supply is thin but demand (median views) is high.
Example: "No channel in the cohort consistently produces 15–25 minute long-form content, yet the videos that do hit that length perform 87% above the scope median view count."

PATTERN C — Leadership / first-mover opportunity:
"There is opportunity to lead this space in [specific angle / cadence / format / tone]." Use this when topic + format + cadence converge — when a clear positioning is unclaimed and the data backs it as a winnable axis.
Example: "There is opportunity to lead this space in evening-cadence long-form — the Mon/Tue 6pm–12am slot performs 2.1× the scope median but is supplied by only 3 of the cohort's 247 videos."

EACH FINDING MUST INCLUDE:
- TITLE: 2-7 word headline naming what the opportunity IS. Plain English, no jargon. Examples: "Own DIY install guidance" / "Lead the 15-25 minute long-form slot" / "Mid-week evening cadence is unclaimed".
- BODY: 1-2 sentences in one of the patterns above. MUST cite specific numbers from the input (title counts, format frequencies, lift percentages, cadence slot uploads). Use the exact numbers above — do not invent or round heavily.

TITLE-BODY COHERENCE (CRITICAL):
- ONE FINDING = ONE PIECE OF EVIDENCE. The title must summarize the body, and the body must cite the specific evidence the title implies. Do NOT bundle multiple disparate topic gaps under an umbrella title (e.g., title "Own professional installation storytelling" + body listing 3 unrelated gaps like thermostat, smart lock, and home renovation — those are three different findings, not one).
- If you have a topic finding, the body cites the specific topic theme(s) from topic coverage, NOT a bundle of unrelated themes.
- If you have a format finding, the body cites the specific format bucket and its lift number, NOT a generalization across multiple buckets.
- If you have a cadence finding, the body cites the specific slot(s) from the hotspot list, NOT generic "cohort posts on weekends" claims.
- When the title says "the X format" or "X category," the X must appear in the body as a concrete cited piece of evidence.

REQUIREMENTS:
- Return 3-5 findings, mixing patterns A / B / C when the data supports it. Don't manufacture findings from thin data — if cadence has no hotspots and only one format bucket has a meaningful lift, two strong findings is better than five weak ones. Minimum is 3.
${businessContext?.products_not_offered ? '- Each finding must point at territory the client could actually claim given their offer. If the only unclaimed topic theme is a category the client does NOT sell, find a different finding (lean on format or cadence) rather than pointing at out-of-scope topics.' : ''}
- Findings are OBSERVATIONS, not pitches. Do NOT propose specific shows, episode formats, or content series titles. The strategist turns these into pillars later.
- The lift baselines above are LENGTH-CLASS baselines (long-form vs long-form median, shorts vs shorts median). When you cite a lift number, say "above long-form median" or "above shorts median" — NOT "above scope median" or "above the cohort." Using "above scope median" misrepresents the comparison.

BRAND NAME RULE (CRITICAL):
- DO NOT name specific competitor product brands anywhere in title or body. This applies to ALL competitor brands in the cohort data.
- Refer to product CATEGORIES generically (e.g., "video doorbells," "outdoor security cameras," "professionally-monitored alarm systems").
- The ONLY brand name allowed is the client's own.

Return ONLY valid JSON:
{ "opportunities": [ { "title": "2-7 word opportunity headline", "body": "1-2 sentence observation with specific numbers from the input", "pattern": "A" | "B" | "C", "tags": ["topic gap" | "format gap" | "cadence gap"] } ] }`;

    const systemPrompt = `You write the Unclaimed Territory section of a competitive audit. Output is for a strategist who will turn your findings into content pillars later. Findings are OBSERVATIONS anchored in specific numbers from the input — not pitch ideas, not series concepts, not memo headers, and not abstract positioning angles.
- Write in one of three patterns: "there is opportunity to own X," "no one consistently produces X but X performs Y% better," or "there is opportunity to lead this space in X."
- Always cite specific numbers (title counts, format frequencies, lift percentages, slot uploads). A finding with no numbers is a violation.
- Always return 3-5 findings. The input always has enough signal across topic / format / cadence to produce at least 3.
- Never name competitor product brands; refer to product categories generically.
- If business context is provided, only point at territory the client could claim within their offer.
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
