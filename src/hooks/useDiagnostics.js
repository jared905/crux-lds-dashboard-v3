/**
 * useDiagnostics Hook
 * Extracts the core diagnostic computation from DiagnosticEngine into a reusable hook.
 * Returns: { primaryConstraint, constraintSeverity, constraintEvidence, patterns, metrics }
 */

import { useMemo } from 'react';

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

// Common English words that are NOT content topics
const STOP_WORDS = new Set([
  // Articles, pronouns, prepositions, conjunctions
  'a','an','the','and','but','or','nor','for','yet','so','in','on','at','to','by',
  'of','up','out','off','over','into','with','from','than','then','that','this',
  'these','those','what','which','who','whom','whose','where','when','how','why',
  'i','me','my','we','us','our','you','your','he','him','his','she','her','it',
  'its','they','them','their','all','any','both','each','every','some','such',
  // Common verbs and auxiliaries
  'is','are','was','were','be','been','being','have','has','had','do','does','did',
  'will','would','shall','should','may','might','must','can','could',
  'get','got','getting','make','made','makes','making','take','took','takes',
  'come','came','go','went','gone','going','know','knew','think','thought',
  'see','saw','seen','look','looked','give','gave','find','found','tell','told',
  'say','said','keep','kept','let','begin','began','show','showed','shown',
  'want','wanted','need','needed','try','tried','leave','left','call','called',
  'put','run','mean','turn','start','started','help','helped','become','became',
  // Common adjectives and adverbs
  'about','above','after','again','also','always','back','before','best','better',
  'big','even','ever','first','good','great','here','high','just','last','like',
  'little','long','many','more','most','much','never','new','next','not','now',
  'often','old','only','other','own','part','real','really','right','same','small',
  'still','sure','things','through','under','until','upon','very','well',
  // YouTube/video generic terms
  'video','videos','watch','episode','part','series','full','official','live',
  'shorts','short','clip','clips','channel','subscribe','review','reaction',
  'update','podcast','vlog','stream',
  // Generic filler
  'one','two','three','four','five','way','ways','time','times','thing','things',
  'day','days','year','years','week','weeks','month','months','people','world',
  'life','work','down','don','doesn','didn','won','isn','aren','wasn','weren',
  'can\'t','don\'t','won\'t','didn\'t','isn\'t','aren\'t','wasn\'t','weren\'t',
  'everything','nothing','something','anything','everyone','someone','anyone',
  'top','best','worst','biggest','most','least','using','doing','being',
]);

/**
 * Extract meaningful topic phrases from video titles.
 * Returns bigrams (2-word phrases) and single words, with strict thresholds
 * to avoid surfacing incidental words like "friend" or "money" as topics.
 *
 * A word/phrase must appear in enough videos to represent a deliberate
 * content pattern, not just coincidental language.
 */
function extractTopicPhrases(rows) {
  const singleWords = {};
  const bigrams = {};

  rows.forEach(r => {
    const title = (r.title || '').toLowerCase()
      .replace(/[^\w\s'-]/g, ' ')  // keep apostrophes, hyphens
      .replace(/\s+/g, ' ')
      .trim();

    const words = title.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));

    // Single words (require length > 4 for singles — short words are rarely topics)
    words.filter(w => w.length > 4).forEach(word => {
      if (!singleWords[word]) singleWords[word] = [];
      singleWords[word].push(r);
    });

    // Bigrams — consecutive meaningful words form better topic phrases
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      if (!bigrams[phrase]) bigrams[phrase] = [];
      bigrams[phrase].push(r);
    }
  });

  // Scale minimum count with catalog size so "3 of 200" doesn't pass
  const minCount = Math.max(3, Math.ceil(rows.length * 0.08)); // at least 8% of catalog
  const topics = [];

  // Bigrams first — more specific, more trustworthy as "topics"
  Object.entries(bigrams)
    .filter(([, videos]) => videos.length >= minCount)
    .forEach(([phrase, videos]) => {
      const avgViews = videos.reduce((s, v) => s + (v.views || 0), 0) / videos.length;
      const avgCTR = videos.reduce((s, v) => s + (v.ctr || 0), 0) / videos.length;
      const avgRet = videos.reduce((s, v) => s + (v.retention || 0), 0) / videos.length;
      topics.push({ phrase, videos, avgViews, avgCTR, avgRet, count: videos.length, isBigram: true });
    });

  // Singles — higher bar: skip if a bigram covers this word, require more appearances
  const bigramWords = new Set(topics.flatMap(t => t.phrase.split(' ')));
  const singleMinCount = Math.max(4, Math.ceil(rows.length * 0.10)); // at least 10% of catalog
  Object.entries(singleWords)
    .filter(([word, videos]) => videos.length >= singleMinCount && !bigramWords.has(word))
    .forEach(([word, videos]) => {
      const avgViews = videos.reduce((s, v) => s + (v.views || 0), 0) / videos.length;
      const avgCTR = videos.reduce((s, v) => s + (v.ctr || 0), 0) / videos.length;
      const avgRet = videos.reduce((s, v) => s + (v.retention || 0), 0) / videos.length;
      topics.push({ phrase: word, videos, avgViews, avgCTR, avgRet, count: videos.length, isBigram: false });
    });

  return topics;
}

/**
 * Title structure patterns to test against performance data.
 * Each pattern has a regex test, a human label, and a tip for what to do about it.
 */
const TITLE_STRUCTURES = [
  {
    key: 'question',
    label: 'Question titles',
    test: (t) => /\?/.test(t) || /^(how|why|what|when|where|who|can|does|is|are|should|will|would|do)\b/i.test(t),
    winTip: 'Questions spark curiosity and promise an answer — lean into them.',
    loseTip: 'Your audience responds better to declarative titles than questions.',
  },
  {
    key: 'list_number',
    label: 'List / number titles',
    test: (t) => /\b\d+\s+(ways|tips|tricks|reasons|mistakes|secrets|steps|things|rules|signs|habits|lessons|ideas|facts|myths|strategies)\b/i.test(t) || /^(top\s+)?\d+\b/i.test(t),
    winTip: 'Numbers set clear expectations and signal scannable value.',
    loseTip: 'Listicle-style titles aren\'t landing — try narrative or question framing instead.',
  },
  {
    key: 'how_to',
    label: '"How to" titles',
    test: (t) => /^how\s+(to|i|we|you)\b/i.test(t),
    winTip: 'Tutorial framing works well — viewers are searching for solutions.',
    loseTip: '"How to" framing is underperforming — try leading with the outcome instead of the process.',
  },
  {
    key: 'brackets',
    label: 'Bracket / parenthetical titles',
    test: (t) => /[\[\(].{2,}[\]\)]/.test(t),
    winTip: 'Brackets add context or urgency (e.g. "[FULL GUIDE]") — keep using them.',
    loseTip: 'Bracket tags aren\'t helping — try cleaner titles without the extra context.',
  },
  {
    key: 'emotional',
    label: 'Emotional hook titles',
    test: (t) => /\b(secret|truth|shocking|actually|finally|changed|ruined|perfect|insane|crazy|unbelievable|incredible|amazing|terrible|horrible|dangerous|warning|urgent|revealed|exposed|wrong|real reason)\b/i.test(t),
    winTip: 'Emotional language drives clicks — use it, but keep the payoff honest.',
    loseTip: 'Strong emotional language is hurting performance — your audience prefers straightforward titles.',
  },
  {
    key: 'negative',
    label: 'Negative framing titles',
    test: (t) => /\b(don't|stop|never|avoid|worst|wrong|mistake|mistakes|fail|quit|dying|dead|broke|broken|warning|dangerous|scam|lie|lies)\b/i.test(t),
    winTip: 'Loss aversion is powerful — "don\'t do X" grabs attention.',
    loseTip: 'Negative framing is turning viewers off — lead with positive outcomes instead.',
  },
  {
    key: 'personal',
    label: 'Personal / story titles',
    test: (t) => /^(i |i'|my |we |our )/i.test(t) || /\b(my experience|my journey|i tried|i tested|i spent)\b/i.test(t),
    winTip: 'First-person framing builds trust — viewers engage with personal stakes.',
    loseTip: 'Personal framing isn\'t resonating — try more universal angles.',
  },
  {
    key: 'short_title',
    label: 'Short titles (under 40 chars)',
    test: (t) => t.length < 40,
    winTip: 'Concise titles are winning — tight, punchy phrasing outperforms.',
    loseTip: 'Short titles are underperforming — add more context or specificity.',
  },
  {
    key: 'long_title',
    label: 'Long titles (over 70 chars)',
    test: (t) => t.length > 70,
    winTip: 'Longer, descriptive titles are performing well — detail is valued.',
    loseTip: 'Titles over 70 chars are underperforming — tighten the phrasing.',
  },
];

/**
 * Analyze title structures against performance metrics.
 * Compares avg views for videos WITH each pattern vs WITHOUT.
 * Returns sorted array of significant findings.
 */
function analyzeTitleStructures(rows, minSample = 3) {
  const results = [];

  for (const struct of TITLE_STRUCTURES) {
    const matching = rows.filter(r => struct.test(r.title || ''));
    const notMatching = rows.filter(r => !struct.test(r.title || ''));

    if (matching.length < minSample || notMatching.length < minSample) continue;

    const avgViewsWith = matching.reduce((s, r) => s + (r.views || 0), 0) / matching.length;
    const avgViewsWithout = notMatching.reduce((s, r) => s + (r.views || 0), 0) / notMatching.length;
    const viewsMultiplier = avgViewsWithout > 0 ? avgViewsWith / avgViewsWithout : 1;

    const avgCTRWith = matching.reduce((s, r) => s + (r.ctr || 0), 0) / matching.length;
    const avgCTRWithout = notMatching.reduce((s, r) => s + (r.ctr || 0), 0) / notMatching.length;

    const avgRetWith = matching.reduce((s, r) => s + (r.retention || 0), 0) / matching.length;
    const avgRetWithout = notMatching.reduce((s, r) => s + (r.retention || 0), 0) / notMatching.length;

    // Only surface if meaningful difference (>25% in either direction)
    const delta = Math.abs(viewsMultiplier - 1);
    if (delta < 0.25) continue;

    const isWin = viewsMultiplier > 1;

    results.push({
      ...struct,
      matchCount: matching.length,
      totalCount: rows.length,
      avgViewsWith,
      avgViewsWithout,
      viewsMultiplier,
      avgCTRWith,
      avgCTRWithout,
      avgRetWith,
      avgRetWithout,
      isWin,
      delta,
      topExamples: [...(isWin ? matching : notMatching)]
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 5),
    });
  }

  // Sort by strongest signal first
  results.sort((a, b) => b.delta - a.delta);
  return results;
}

/**
 * Pure computation function (no React dependency) for use in services/server-side.
 * @param {Array} rows - Video analytics rows
 * @returns {Object|null} Diagnostic results
 */
export function computeDiagnostics(rows) {
  if (!rows || rows.length === 0) return null;

  // ── Separate long-form and Shorts ──
  // CTR and retention analysis uses long-form only (Shorts have different
  // discovery mechanics — no thumbnail click, different retention scale).
  // Views-based analysis (topics, velocity) uses all formats.
  const longForm = rows.filter(r => r.type !== 'short');
  const hasLongForm = longForm.length >= 3;

  // All-format metrics (for views-based analysis)
  const totalViews = rows.reduce((s, r) => s + (r.views || 0), 0);
  const viewsPerVideo = totalViews / rows.length;

  // Long-form CTR metrics (for packaging/discovery analysis)
  const lfTotalImpressions = longForm.reduce((s, r) => s + (r.impressions || 0), 0);
  const lfAvgCTR = lfTotalImpressions > 0
    ? longForm.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / lfTotalImpressions
    : 0;

  const lfSortedByCTR = [...longForm].sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
  const lfTop20Pct = Math.max(1, Math.ceil(longForm.length * 0.2));
  const lfBenchmarkCTR = lfSortedByCTR.length > 0
    ? lfSortedByCTR.slice(0, lfTop20Pct).reduce((s, r) => s + (r.ctr || 0), 0) / lfTop20Pct
    : 0;

  // Long-form retention metrics (Shorts retention on a different scale)
  const lfTotalViews = longForm.reduce((s, r) => s + (r.views || 0), 0);
  const lfAvgRetention = lfTotalViews > 0
    ? longForm.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / lfTotalViews
    : 0;

  const lfSortedByRetention = [...longForm].sort((a, b) => (b.retention || 0) - (a.retention || 0));
  const lfBenchmarkRetention = lfSortedByRetention.length > 0
    ? lfSortedByRetention.slice(0, lfTop20Pct).reduce((s, r) => s + (r.retention || 0), 0) / lfTop20Pct
    : 0;

  const industryBenchmarks = {
    ctr: 0.05,       // long-form benchmark
    retention: 0.45,  // long-form benchmark
    subsPerView: 0.005
  };

  const ctrGap = lfBenchmarkCTR > 0 ? (lfAvgCTR - lfBenchmarkCTR) / lfBenchmarkCTR : 0;
  const retentionGap = lfBenchmarkRetention > 0 ? (lfAvgRetention - lfBenchmarkRetention) / lfBenchmarkRetention : 0;

  // Identify primary constraint (using long-form metrics for CTR/retention)
  let primaryConstraint = "Discovery";
  let constraintSeverity = "Monitor";
  let constraintEvidence = "";

  if (hasLongForm && ctrGap < -0.3) {
    primaryConstraint = "Discovery (CTR)";
    constraintSeverity = "Critical";
    constraintEvidence = `Long-form CTR (${fmtPct(lfAvgCTR)}) is ${Math.abs(ctrGap * 100).toFixed(0)}% below your top performers (${fmtPct(lfBenchmarkCTR)}). Poor packaging is limiting impressions. Based on ${longForm.length} long-form videos.`;
  } else if (hasLongForm && retentionGap < -0.3) {
    primaryConstraint = "Retention (AVD)";
    constraintSeverity = "Critical";
    constraintEvidence = `Long-form retention (${fmtPct(lfAvgRetention)}) is ${Math.abs(retentionGap * 100).toFixed(0)}% below your top performers (${fmtPct(lfBenchmarkRetention)}). Content isn't holding attention. Based on ${longForm.length} long-form videos.`;
  } else if (hasLongForm && lfAvgCTR < industryBenchmarks.ctr) {
    primaryConstraint = "Discovery (CTR)";
    constraintSeverity = "Warning";
    constraintEvidence = `Long-form CTR (${fmtPct(lfAvgCTR)}) is below industry average (${fmtPct(industryBenchmarks.ctr)}). Thumbnails and titles need optimization. Based on ${longForm.length} long-form videos.`;
  } else if (hasLongForm && lfAvgRetention < industryBenchmarks.retention) {
    primaryConstraint = "Retention";
    constraintSeverity = "Warning";
    constraintEvidence = `Long-form retention (${fmtPct(lfAvgRetention)}) is below industry average (${fmtPct(industryBenchmarks.retention)}). Content quality or pacing needs work. Based on ${longForm.length} long-form videos.`;
  } else {
    primaryConstraint = "Velocity";
    constraintSeverity = "Monitor";
    constraintEvidence = "Core metrics are healthy. Focus on upload frequency and topic selection to scale.";
  }

  // Pattern detection
  const patterns = [];

  // PATTERN 1: Format Ecosystem Analysis
  const shorts = rows.filter(r => r.type === 'short');
  const longs = rows.filter(r => r.type === 'long');

  if (shorts.length >= 3 && longs.length >= 3) {
    const shortsAvgViews = shorts.reduce((s, r) => s + r.views, 0) / shorts.length;
    const longsAvgViews = longs.reduce((s, r) => s + r.views, 0) / longs.length;
    const shortsAvgCTR = shorts.reduce((s, r) => s + (r.ctr || 0), 0) / shorts.length;
    const longsAvgCTR = longs.reduce((s, r) => s + (r.ctr || 0), 0) / longs.length;
    const shortsAvgRetention = shorts.reduce((s, r) => s + (r.retention || 0), 0) / shorts.length;
    const longsAvgRetention = longs.reduce((s, r) => s + (r.retention || 0), 0) / longs.length;
    const shortsAvgSubs = shorts.reduce((s, r) => s + (r.subscribers || 0), 0) / shorts.length;
    const longsAvgSubs = longs.reduce((s, r) => s + (r.subscribers || 0), 0) / longs.length;
    const shortsAvgImpressions = shorts.reduce((s, r) => s + (r.impressions || 0), 0) / shorts.length;
    const longsAvgImpressions = longs.reduce((s, r) => s + (r.impressions || 0), 0) / longs.length;
    const shortsAvgWatchTime = shorts.reduce((s, r) => s + ((r.retention || 0) * (r.duration || 0)), 0) / shorts.length;
    const longsAvgWatchTime = longs.reduce((s, r) => s + ((r.retention || 0) * (r.duration || 0)), 0) / longs.length;

    const shortsTotalViews = shorts.reduce((s, r) => s + r.views, 0);
    const longsTotalViews = longs.reduce((s, r) => s + r.views, 0);
    const shortsViewShare = shortsTotalViews / (shortsTotalViews + longsTotalViews);
    const shortsTotalSubs = shorts.reduce((s, r) => s + (r.subscribers || 0), 0);
    const longsTotalSubs = longs.reduce((s, r) => s + (r.subscribers || 0), 0);
    const shortsSubShare = shortsTotalSubs / (shortsTotalSubs + longsTotalSubs);
    const shortsTotalImpressions = shorts.reduce((s, r) => s + (r.impressions || 0), 0);
    const longsTotalImpressions = longs.reduce((s, r) => s + (r.impressions || 0), 0);
    const shortsReachShare = shortsTotalImpressions / (shortsTotalImpressions + longsTotalImpressions);
    const formatRatio = shorts.length / longs.length;

    const topShorts = [...shorts].sort((a, b) => b.views - a.views).slice(0, 5);
    const topLongs = [...longs].sort((a, b) => b.views - a.views).slice(0, 5);

    patterns.push({
      type: "Format Ecosystem Analysis",
      finding: "Shorts vs Long-form performance comparison",
      confidence: shorts.length >= 10 && longs.length >= 10 ? "High" : "Medium",
      recommendation: `
📊 INDIVIDUAL FORMAT METRICS

SHORTS (${shorts.length} videos):
• Views/video: ${fmtInt(shortsAvgViews)}
• Subscribers/video: ${fmtInt(shortsAvgSubs)}
• Retention: ${fmtPct(shortsAvgRetention)}
• Watch Time: ${(shortsAvgWatchTime / 60).toFixed(1)} min
• CTR: ${fmtPct(shortsAvgCTR)}
• Impressions: ${fmtInt(shortsAvgImpressions)}

LONG-FORM (${longs.length} videos):
• Views/video: ${fmtInt(longsAvgViews)}
• Subscribers/video: ${fmtInt(longsAvgSubs)}
• Retention: ${fmtPct(longsAvgRetention)}
• Watch Time: ${(longsAvgWatchTime / 60).toFixed(1)} min
• CTR: ${fmtPct(longsAvgCTR)}
• Impressions: ${fmtInt(longsAvgImpressions)}

🔄 CHANNEL CONTRIBUTION

Output Mix:
• You produce ${formatRatio.toFixed(1)} Shorts for every 1 Long-form video

Total Views:
• ${fmtPct(shortsViewShare)} from Shorts (${fmtInt(shortsTotalViews)} views)
• ${fmtPct(1 - shortsViewShare)} from Long-form (${fmtInt(longsTotalViews)} views)

Total Subscribers:
• ${fmtPct(shortsSubShare)} from Shorts (${fmtInt(shortsTotalSubs)} subs)
• ${fmtPct(1 - shortsSubShare)} from Long-form (${fmtInt(longsTotalSubs)} subs)

Total Reach:
• ${fmtPct(shortsReachShare)} from Shorts (${fmtInt(shortsTotalImpressions)} impressions)
• ${fmtPct(1 - shortsReachShare)} from Long-form (${fmtInt(longsTotalImpressions)} impressions)

🎯 KEY OBSERVATIONS

Discovery: ${shortsAvgImpressions > longsAvgImpressions
  ? `Shorts get ${Math.abs(((shortsAvgImpressions - longsAvgImpressions) / longsAvgImpressions) * 100).toFixed(0)}% more impressions per video`
  : `Long-form gets ${Math.abs(((longsAvgImpressions - shortsAvgImpressions) / shortsAvgImpressions) * 100).toFixed(0)}% more impressions per video`}

Engagement: ${shortsAvgWatchTime > longsAvgWatchTime
  ? `Shorts deliver ${Math.abs(((shortsAvgWatchTime - longsAvgWatchTime) / longsAvgWatchTime) * 100).toFixed(0)}% more watch time per video`
  : `Long-form delivers ${Math.abs(((longsAvgWatchTime - shortsAvgWatchTime) / shortsAvgWatchTime) * 100).toFixed(0)}% more watch time per video`}

Subscriber Efficiency: ${shortsAvgSubs > longsAvgSubs
  ? `Shorts acquire ${Math.abs(((shortsAvgSubs - longsAvgSubs) / longsAvgSubs) * 100).toFixed(0)}% more subscribers per video`
  : `Long-form acquires ${Math.abs(((longsAvgSubs - shortsAvgSubs) / shortsAvgSubs) * 100).toFixed(0)}% more subscribers per video`}
      `.trim(),
      sampleSize: `${shorts.length} Shorts, ${longs.length} long-form`,
      opportunity: 0,
      effort: "N/A",
      action: null,
      videoExamples: [
        ...topShorts.map(v => ({ ...v, format: 'Short' })),
        ...topLongs.map(v => ({ ...v, format: 'Long' }))
      ].map(v => ({
        title: `[${v.format}] ${v.title}`,
        views: v.views,
        ctr: v.ctr,
        retention: v.retention,
        youtubeVideoId: v.youtubeVideoId,
        youtubeUrl: v.youtubeUrl,
      }))
    });
  }

  // PATTERN 2 & 3: Topic Analysis (using phrase extraction, not raw word splitting)
  // Uses median instead of mean to resist one-hit-wonder skew
  const allTopics = extractTopicPhrases(rows);

  // Compute median views for outlier-resistant scoring
  const getMedian = (arr) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const channelMedianViews = getMedian(rows.map(r => r.views || 0));

  // Enrich topics with median views for outlier-resistant comparison
  const enrichedTopics = allTopics.map(t => ({
    ...t,
    medianViews: getMedian(t.videos.map(v => v.views || 0)),
    // Consistency: what % of videos in this topic are below channel average?
    belowAvgPct: t.videos.filter(v => (v.views || 0) < viewsPerVideo).length / t.videos.length,
    aboveAvgPct: t.videos.filter(v => (v.views || 0) > viewsPerVideo).length / t.videos.length,
  }));

  // Weak topics: use median to avoid penalizing a topic because of one bad video
  const weakTopics = enrichedTopics
    .filter(t => t.medianViews < channelMedianViews * 0.6 && t.belowAvgPct >= 0.6)
    .sort((a, b) => a.medianViews - b.medianViews);

  if (weakTopics.length > 0) {
    const weakest = weakTopics[0];
    const worstVideos = [...weakest.videos].sort((a, b) => a.views - b.views).slice(0, 5);
    const label = weakest.phrase;

    // Show additional weak topics in the recommendation text
    const otherWeak = weakTopics.slice(1, 3);
    const otherWeakNote = otherWeak.length > 0
      ? `\n\nAlso underperforming: ${otherWeak.map(t => `"${t.phrase}" (${t.count} videos, ${fmtInt(t.medianViews)} median views, ${((t.belowAvgPct) * 100).toFixed(0)}% below avg)`).join('; ')}.`
      : '';

    patterns.push({
      type: "Topic Elimination",
      finding: `"${label}" content consistently underperforms`,
      delta: `${weakest.count} videos, ${((1 - weakest.medianViews/channelMedianViews) * 100).toFixed(0)}% below median`,
      confidence: weakest.count >= 5 ? "High" : "Medium",
      recommendation: `KILL: "${label}" content underperforms across ${weakest.count} videos — median of ${fmtInt(weakest.medianViews)} views vs your channel median of ${fmtInt(channelMedianViews)}. ${((weakest.belowAvgPct) * 100).toFixed(0)}% of these videos land below your channel average. This isn't a fluke — the topic consistently misses.${otherWeakNote}`,
      sampleSize: `${weakest.count} videos`,
      opportunity: Math.max(0, (viewsPerVideo - weakest.avgViews) * 2),
      effort: "Low",
      action: `Remove "${label}" topics from your content calendar. Reallocate those slots to proven winners.`,
      videoExamples: worstVideos.map(v => ({ title: v.title, views: v.views, ctr: v.ctr, retention: v.retention, youtubeVideoId: v.youtubeVideoId, youtubeUrl: v.youtubeUrl }))
    });
  }

  // PATTERN 3: Double Down on Winners
  const strongTopics = enrichedTopics
    .filter(t => t.medianViews > channelMedianViews * 1.4 && t.aboveAvgPct >= 0.6)
    .sort((a, b) => b.medianViews - a.medianViews);

  if (strongTopics.length > 0) {
    const strongest = strongTopics[0];
    const currentFrequency = Math.max(1, strongest.count / Math.max(1, rows.length / 30));
    const targetFrequency = Math.min(Math.ceil(currentFrequency * 2), 8);
    const topVideos = [...strongest.videos].sort((a, b) => b.views - a.views).slice(0, 5);
    const label = strongest.phrase;

    // Show additional strong topics
    const otherStrong = strongTopics.slice(1, 3);
    const otherStrongNote = otherStrong.length > 0
      ? `\n\nAlso outperforming: ${otherStrong.map(t => `"${t.phrase}" (${t.count} videos, ${fmtInt(t.medianViews)} median views, ${((t.aboveAvgPct) * 100).toFixed(0)}% above avg)`).join('; ')}.`
      : '';

    patterns.push({
      type: "Topic Amplification",
      finding: `"${label}" content outperforms — scale production`,
      delta: `${strongest.count} videos, ${((strongest.medianViews/channelMedianViews - 1) * 100).toFixed(0)}% above median`,
      confidence: strongest.count >= 5 ? "High" : "Medium",
      recommendation: `GROW: "${label}" content outperforms consistently — ${strongest.count} videos with a median of ${fmtInt(strongest.medianViews)} views vs your channel median of ${fmtInt(channelMedianViews)}. ${((strongest.aboveAvgPct) * 100).toFixed(0)}% land above your channel average (${fmtPct(strongest.avgCTR)} CTR, ${fmtPct(strongest.avgRet)} retention). Increase production from ~${Math.round(currentFrequency)}/month to ${targetFrequency}/month.${otherStrongNote}`,
      sampleSize: `${strongest.count} videos`,
      opportunity: Math.max(0, (strongest.avgViews - viewsPerVideo) * targetFrequency * 3),
      effort: "Low",
      action: `Add ${targetFrequency - Math.round(currentFrequency)} more "${label}" videos to next month's calendar.${otherStrong.length > 0 ? ` Also explore more "${otherStrong[0].phrase}" content.` : ''}`,
      videoExamples: topVideos.map(v => ({ title: v.title, views: v.views, ctr: v.ctr, retention: v.retention, youtubeVideoId: v.youtubeVideoId, youtubeUrl: v.youtubeUrl }))
    });
  }

  // PATTERN 4: Title Structure Analysis
  // Tests 9 structural patterns (questions, lists, how-to, brackets, emotional hooks,
  // negative framing, personal stories, title length) against actual view performance.
  const structureFindings = analyzeTitleStructures(rows);

  // Surface the strongest winning pattern
  const topWin = structureFindings.find(s => s.isWin);
  if (topWin) {
    const multiplierPct = ((topWin.viewsMultiplier - 1) * 100).toFixed(0);
    const ctrNote = topWin.avgCTRWith > 0 && topWin.avgCTRWithout > 0
      ? ` CTR: ${fmtPct(topWin.avgCTRWith)} vs ${fmtPct(topWin.avgCTRWithout)}.`
      : '';
    const retNote = topWin.avgRetWith > 0 && topWin.avgRetWithout > 0
      ? ` Retention: ${fmtPct(topWin.avgRetWith)} vs ${fmtPct(topWin.avgRetWithout)}.`
      : '';

    // Build a summary of ALL winning patterns (not just the top one)
    const allWins = structureFindings.filter(s => s.isWin);
    const otherWins = allWins.slice(1, 4);
    const otherWinsSummary = otherWins.length > 0
      ? `\n\nOther patterns that outperform: ${otherWins.map(w => `${w.label} (+${((w.viewsMultiplier - 1) * 100).toFixed(0)}%, ${w.matchCount} videos)`).join('; ')}.`
      : '';

    patterns.push({
      type: "Title Structure — What Works",
      finding: `${topWin.label} get ${multiplierPct}% more views`,
      delta: `${topWin.matchCount} of ${topWin.totalCount} videos (${((topWin.matchCount / topWin.totalCount) * 100).toFixed(0)}%)`,
      confidence: topWin.matchCount >= 8 ? "High" : "Medium",
      recommendation: `WINNING PATTERN: ${topWin.label} average ${fmtInt(topWin.avgViewsWith)} views vs ${fmtInt(topWin.avgViewsWithout)} for other titles — a ${multiplierPct}% lift across ${topWin.matchCount} videos.${ctrNote}${retNote} ${topWin.winTip}${otherWinsSummary}`,
      sampleSize: `${topWin.matchCount} matching, ${topWin.totalCount - topWin.matchCount} without`,
      opportunity: Math.max(0, (topWin.avgViewsWith - topWin.avgViewsWithout) * (topWin.totalCount - topWin.matchCount) * 0.3),
      effort: "Low",
      action: `Apply "${topWin.label.toLowerCase()}" framing to your next 5 uploads. Study the top examples below for the pattern.`,
      videoExamples: topWin.topExamples.map(v => ({ title: v.title, views: v.views, ctr: v.ctr, retention: v.retention, youtubeVideoId: v.youtubeVideoId, youtubeUrl: v.youtubeUrl }))
    });
  }

  // Surface the strongest losing pattern (what to avoid)
  const topLoss = structureFindings.find(s => !s.isWin);
  if (topLoss) {
    const dropPct = ((1 - topLoss.viewsMultiplier) * 100).toFixed(0);

    patterns.push({
      type: "Title Structure — What to Avoid",
      finding: `${topLoss.label} get ${dropPct}% fewer views`,
      delta: `${topLoss.matchCount} of ${topLoss.totalCount} videos`,
      confidence: topLoss.matchCount >= 8 ? "High" : "Medium",
      recommendation: `UNDERPERFORMING PATTERN: ${topLoss.label} average ${fmtInt(topLoss.avgViewsWith)} views vs ${fmtInt(topLoss.avgViewsWithout)} for other titles — a ${dropPct}% drop across ${topLoss.matchCount} videos. ${topLoss.loseTip}`,
      sampleSize: `${topLoss.matchCount} matching, ${topLoss.totalCount - topLoss.matchCount} without`,
      opportunity: Math.max(0, (topLoss.avgViewsWithout - topLoss.avgViewsWith) * topLoss.matchCount * 0.3),
      effort: "Low",
      action: `Avoid "${topLoss.label.toLowerCase()}" framing. Reframe upcoming titles using your winning patterns instead.`,
      videoExamples: topLoss.topExamples.map(v => ({ title: v.title, views: v.views, ctr: v.ctr, retention: v.retention, youtubeVideoId: v.youtubeVideoId, youtubeUrl: v.youtubeUrl }))
    });
  }

  // PATTERN 5: Duration Sweet Spot (long-form only)
  if (hasLongForm) {
    const lfWithDuration = longForm.filter(r => r.duration > 0);
    if (lfWithDuration.length >= 5) {
      // Bucket into duration ranges
      const buckets = [
        { label: 'Under 5 min', min: 0, max: 300, videos: [] },
        { label: '5–10 min', min: 300, max: 600, videos: [] },
        { label: '10–15 min', min: 600, max: 900, videos: [] },
        { label: '15–20 min', min: 900, max: 1200, videos: [] },
        { label: '20–30 min', min: 1200, max: 1800, videos: [] },
        { label: 'Over 30 min', min: 1800, max: Infinity, videos: [] },
      ];

      lfWithDuration.forEach(r => {
        const bucket = buckets.find(b => r.duration >= b.min && r.duration < b.max);
        if (bucket) bucket.videos.push(r);
      });

      // Only consider buckets with 3+ videos
      const viable = buckets
        .filter(b => b.videos.length >= 3)
        .map(b => ({
          ...b,
          count: b.videos.length,
          avgViews: b.videos.reduce((s, v) => s + (v.views || 0), 0) / b.videos.length,
          avgCTR: b.videos.reduce((s, v) => s + (v.ctr || 0), 0) / b.videos.length,
          avgRet: b.videos.reduce((s, v) => s + (v.retention || 0), 0) / b.videos.length,
        }));

      if (viable.length >= 2) {
        const lfAvgViews = lfWithDuration.reduce((s, r) => s + (r.views || 0), 0) / lfWithDuration.length;
        const best = viable.reduce((a, b) => a.avgViews > b.avgViews ? a : b);
        const worst = viable.reduce((a, b) => a.avgViews < b.avgViews ? a : b);
        const bestMultiplier = lfAvgViews > 0 ? best.avgViews / lfAvgViews : 1;

        // Only report if there's a meaningful gap (>30% between best and worst)
        if (best.avgViews > worst.avgViews * 1.3) {
          const topExamples = [...best.videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);

          // Build a mini breakdown of all viable buckets
          const bucketBreakdown = viable
            .sort((a, b) => b.avgViews - a.avgViews)
            .map(b => `• ${b.label}: ${fmtInt(b.avgViews)} avg views, ${fmtPct(b.avgRet)} retention (${b.count} videos)`)
            .join('\n');

          patterns.push({
            type: "Duration Sweet Spot",
            finding: `${best.label} long-form videos outperform by ${((bestMultiplier - 1) * 100).toFixed(0)}%`,
            delta: `${best.count} videos at ${((bestMultiplier - 1) * 100).toFixed(0)}% above avg`,
            confidence: best.count >= 5 ? "High" : "Medium",
            recommendation: `SWEET SPOT: Long-form videos in the ${best.label} range average ${fmtInt(best.avgViews)} views — ${((bestMultiplier - 1) * 100).toFixed(0)}% above your long-form average of ${fmtInt(lfAvgViews)}. Weakest range: ${worst.label} at ${fmtInt(worst.avgViews)} views.\n\nFull breakdown:\n${bucketBreakdown}`,
            sampleSize: `${lfWithDuration.length} long-form videos with duration data`,
            opportunity: Math.max(0, (best.avgViews - lfAvgViews) * (lfWithDuration.length - best.count) * 0.2),
            effort: "Medium",
            action: `Target the ${best.label} range for your next long-form videos. If you're currently making ${worst.label} content, consider tightening edits to hit the sweet spot.`,
            videoExamples: topExamples.map(v => ({ title: v.title, views: v.views, ctr: v.ctr, retention: v.retention, youtubeVideoId: v.youtubeVideoId, youtubeUrl: v.youtubeUrl }))
          });
        }
      }
    }
  }

  // PATTERN 6: Publish Day Analysis
  const videosWithPublishDates = rows.filter(r => r.publishDate);
  if (videosWithPublishDates.length >= 10) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const byDay = {};
    dayNames.forEach(d => { byDay[d] = []; });

    videosWithPublishDates.forEach(r => {
      const d = new Date(r.publishDate);
      if (!isNaN(d.getTime())) {
        byDay[dayNames[d.getDay()]].push(r);
      }
    });

    const dayStats = dayNames
      .map(day => ({
        day,
        videos: byDay[day],
        count: byDay[day].length,
        avgViews: byDay[day].length > 0 ? byDay[day].reduce((s, v) => s + (v.views || 0), 0) / byDay[day].length : 0,
        avgCTR: byDay[day].length > 0 ? byDay[day].reduce((s, v) => s + (v.ctr || 0), 0) / byDay[day].length : 0,
      }))
      .filter(d => d.count >= 2);

    if (dayStats.length >= 3) {
      const bestDay = dayStats.reduce((a, b) => a.avgViews > b.avgViews ? a : b);
      const worstDay = dayStats.reduce((a, b) => a.avgViews < b.avgViews ? a : b);
      const dayAvg = videosWithPublishDates.reduce((s, r) => s + (r.views || 0), 0) / videosWithPublishDates.length;

      if (bestDay.avgViews > worstDay.avgViews * 1.3 && bestDay.count >= 3) {
        const liftPct = ((bestDay.avgViews / dayAvg - 1) * 100).toFixed(0);
        const dayBreakdown = dayStats
          .sort((a, b) => b.avgViews - a.avgViews)
          .map(d => `• ${d.day}: ${fmtInt(d.avgViews)} avg views, ${fmtPct(d.avgCTR)} CTR (${d.count} videos)`)
          .join('\n');
        const bestExamples = [...bestDay.videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);

        patterns.push({
          type: "Publish Timing",
          finding: `${bestDay.day} uploads get ${liftPct}% more views`,
          delta: `${bestDay.count} videos, best of ${dayStats.length} active days`,
          confidence: bestDay.count >= 5 ? "High" : "Medium",
          recommendation: `TIMING: Videos published on ${bestDay.day} average ${fmtInt(bestDay.avgViews)} views — ${liftPct}% above your overall average. Worst day: ${worstDay.day} at ${fmtInt(worstDay.avgViews)} views.\n\nFull breakdown:\n${dayBreakdown}`,
          sampleSize: `${videosWithPublishDates.length} videos with publish dates`,
          opportunity: Math.max(0, (bestDay.avgViews - dayAvg) * 4),
          effort: "Low",
          action: `Shift your upload schedule to ${bestDay.day}. If you publish multiple times a week, prioritize your strongest content for ${bestDay.day}.`,
          videoExamples: bestExamples.map(v => ({ title: v.title, views: v.views, ctr: v.ctr, retention: v.retention, youtubeVideoId: v.youtubeVideoId, youtubeUrl: v.youtubeUrl }))
        });
      }
    }
  }

  // PATTERN 7: Momentum / Trajectory Detection
  if (videosWithPublishDates.length >= 10) {
    const sortedByDate = [...videosWithPublishDates].sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    const recentCount = Math.max(5, Math.ceil(sortedByDate.length * 0.25));
    const recentVideos = sortedByDate.slice(0, recentCount);
    const olderVideos = sortedByDate.slice(recentCount);

    if (olderVideos.length >= 5) {
      const recentAvgViews = recentVideos.reduce((s, r) => s + (r.views || 0), 0) / recentVideos.length;
      const olderAvgViews = olderVideos.reduce((s, r) => s + (r.views || 0), 0) / olderVideos.length;
      const momentum = olderAvgViews > 0 ? (recentAvgViews / olderAvgViews) : 1;

      const recentAvgCTR = recentVideos.reduce((s, r) => s + (r.ctr || 0), 0) / recentVideos.length;
      const olderAvgCTR = olderVideos.reduce((s, r) => s + (r.ctr || 0), 0) / olderVideos.length;
      const recentAvgRet = recentVideos.reduce((s, r) => s + (r.retention || 0), 0) / recentVideos.length;
      const olderAvgRet = olderVideos.reduce((s, r) => s + (r.retention || 0), 0) / olderVideos.length;
      const recentAvgSubs = recentVideos.reduce((s, r) => s + (r.subscribers || 0), 0) / recentVideos.length;
      const olderAvgSubs = olderVideos.reduce((s, r) => s + (r.subscribers || 0), 0) / olderVideos.length;

      // Only surface if meaningful change (>20% in either direction)
      if (Math.abs(momentum - 1) > 0.2) {
        const isGrowing = momentum > 1;
        const changePct = ((momentum - 1) * 100).toFixed(0);
        const arrow = isGrowing ? 'up' : 'down';
        const earliestRecent = recentVideos[recentVideos.length - 1]?.publishDate;
        const dateLabel = earliestRecent ? new Date(earliestRecent).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `last ${recentCount} videos`;

        // Build metrics comparison
        const ctrChange = olderAvgCTR > 0 ? ((recentAvgCTR / olderAvgCTR - 1) * 100).toFixed(0) : '0';
        const retChange = olderAvgRet > 0 ? ((recentAvgRet / olderAvgRet - 1) * 100).toFixed(0) : '0';
        const subsChange = olderAvgSubs > 0 ? ((recentAvgSubs / olderAvgSubs - 1) * 100).toFixed(0) : '0';

        const metricsBreakdown = [
          `• Views/video: ${fmtInt(recentAvgViews)} vs ${fmtInt(olderAvgViews)} (${changePct > 0 ? '+' : ''}${changePct}%)`,
          recentAvgCTR > 0 ? `• CTR: ${fmtPct(recentAvgCTR)} vs ${fmtPct(olderAvgCTR)} (${ctrChange > 0 ? '+' : ''}${ctrChange}%)` : null,
          recentAvgRet > 0 ? `• Retention: ${fmtPct(recentAvgRet)} vs ${fmtPct(olderAvgRet)} (${retChange > 0 ? '+' : ''}${retChange}%)` : null,
          recentAvgSubs > 0 ? `• Subs/video: ${fmtInt(recentAvgSubs)} vs ${fmtInt(olderAvgSubs)} (${subsChange > 0 ? '+' : ''}${subsChange}%)` : null,
        ].filter(Boolean).join('\n');

        const topRecent = [...recentVideos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);

        patterns.push({
          type: "Channel Momentum",
          finding: `Views are trending ${arrow} ${Math.abs(changePct)}% (recent ${recentCount} vs prior ${olderVideos.length})`,
          delta: `${fmtInt(recentAvgViews)} vs ${fmtInt(olderAvgViews)} views/video`,
          confidence: recentCount >= 8 ? "High" : "Medium",
          recommendation: `${isGrowing ? 'ACCELERATING' : 'DECELERATING'}: Your last ${recentCount} videos (since ${dateLabel}) average ${fmtInt(recentAvgViews)} views — ${isGrowing ? 'up' : 'down'} ${Math.abs(changePct)}% vs your prior ${olderVideos.length} videos at ${fmtInt(olderAvgViews)}.\n\nRecent vs Prior:\n${metricsBreakdown}${isGrowing ? '\n\nThe algorithm is rewarding your recent content. Double down on what\'s working.' : '\n\nRecent content is underperforming your track record. Review what changed — topic selection, packaging, upload timing, or production quality.'}`,
          sampleSize: `${recentCount} recent, ${olderVideos.length} prior`,
          opportunity: isGrowing ? 0 : Math.max(0, (olderAvgViews - recentAvgViews) * recentCount),
          effort: isGrowing ? "N/A" : "Medium",
          action: isGrowing
            ? `Keep doing what you're doing. Your recent ${recentCount} videos are outperforming. Study what changed and codify it.`
            : `Compare your recent titles, thumbnails, and topics to your top performers. Something shifted — find it and correct course.`,
          videoExamples: topRecent.map(v => ({ title: v.title, views: v.views, ctr: v.ctr, retention: v.retention, youtubeVideoId: v.youtubeVideoId, youtubeUrl: v.youtubeUrl }))
        });
      }
    }
  }

  // PATTERN 8: Subscriber Conversion Efficiency
  const videosWithSubs = rows.filter(r => (r.subscribers || 0) > 0 && (r.views || 0) > 100);
  if (videosWithSubs.length >= 5) {
    // Calculate subs-per-view ratio for each video
    const withRatio = videosWithSubs.map(r => ({
      ...r,
      subRate: (r.subscribers || 0) / (r.views || 1),
    }));

    const avgSubRate = withRatio.reduce((s, r) => s + r.subRate, 0) / withRatio.length;
    const sortedBySubRate = [...withRatio].sort((a, b) => b.subRate - a.subRate);
    const topConverters = sortedBySubRate.slice(0, Math.max(3, Math.ceil(sortedBySubRate.length * 0.2)));
    const bottomConverters = sortedBySubRate.slice(-Math.max(3, Math.ceil(sortedBySubRate.length * 0.2)));

    const topAvgRate = topConverters.reduce((s, r) => s + r.subRate, 0) / topConverters.length;
    const bottomAvgRate = bottomConverters.reduce((s, r) => s + r.subRate, 0) / bottomConverters.length;

    if (topAvgRate > bottomAvgRate * 2) {
      // Analyze what's different about high-converters
      const topAvgViews = topConverters.reduce((s, r) => s + (r.views || 0), 0) / topConverters.length;
      const topAvgRet = topConverters.reduce((s, r) => s + (r.retention || 0), 0) / topConverters.length;
      const bottomAvgViews = bottomConverters.reduce((s, r) => s + (r.views || 0), 0) / bottomConverters.length;
      const bottomAvgRet = bottomConverters.reduce((s, r) => s + (r.retention || 0), 0) / bottomConverters.length;

      // Check if high-converters skew toward a certain type
      const topLongPct = topConverters.filter(r => r.type !== 'short').length / topConverters.length;
      const bottomLongPct = bottomConverters.filter(r => r.type !== 'short').length / bottomConverters.length;
      let formatNote = '';
      if (topLongPct > bottomLongPct + 0.3) formatNote = ' High-converting videos skew long-form.';
      else if (topLongPct < bottomLongPct - 0.3) formatNote = ' High-converting videos skew Shorts.';

      const topExamples = topConverters.slice(0, 5);

      patterns.push({
        type: "Subscriber Conversion",
        finding: `Top converters earn ${(topAvgRate * 1000).toFixed(1)} subs per 1K views (${((topAvgRate / avgSubRate - 1) * 100).toFixed(0)}% above avg)`,
        delta: `${topConverters.length} high-converting vs ${bottomConverters.length} low-converting`,
        confidence: topConverters.length >= 5 ? "High" : "Medium",
        recommendation: `AUDIENCE BUILDERS: Your top ${topConverters.length} subscriber-converting videos earn ${(topAvgRate * 1000).toFixed(1)} subs per 1K views vs ${(bottomAvgRate * 1000).toFixed(1)} for your weakest. That's a ${(topAvgRate / bottomAvgRate).toFixed(1)}x gap.\n\nHigh converters: ${fmtPct(topAvgRet)} avg retention, ${fmtInt(topAvgViews)} avg views\nLow converters: ${fmtPct(bottomAvgRet)} avg retention, ${fmtInt(bottomAvgViews)} avg views${formatNote}\n\nHigh-retention content converts because viewers who stay longer trust the creator more. These are your audience-building videos — the ones that grow your base, not just your view count.`,
        sampleSize: `${videosWithSubs.length} videos with subscriber data`,
        opportunity: Math.max(0, (topAvgRate - avgSubRate) * totalViews * 0.1),
        effort: "Medium",
        action: `Study your top subscriber-converting videos. What topics, hooks, and CTAs do they share? Make more content in this mold — these are the videos that build a loyal audience.`,
        videoExamples: topExamples.map(v => ({ title: v.title, views: v.views, ctr: v.ctr, retention: v.retention, subscribers: v.subscribers, youtubeVideoId: v.youtubeVideoId, youtubeUrl: v.youtubeUrl }))
      });
    }
  }

  // Packaging Optimization (long-form only — Shorts don't have thumbnail CTR)
  if (hasLongForm && lfAvgCTR < lfBenchmarkCTR * 0.9) {
    const ctrGapPct = ((lfBenchmarkCTR - lfAvgCTR) / lfBenchmarkCTR) * 100;
    const worstCTRVideos = [...longForm].filter(r => r.ctr > 0 && r.impressions > 100).sort((a, b) => a.ctr - b.ctr).slice(0, 5);

    patterns.push({
      type: "Packaging Optimization",
      finding: "Improve long-form thumbnail & title packaging",
      delta: `${ctrGapPct.toFixed(0)}% below your best (long-form)`,
      confidence: "High",
      recommendation: `OPTIMIZE: Long-form average CTR (${fmtPct(lfAvgCTR)}) is ${ctrGapPct.toFixed(0)}% below your top performers (${fmtPct(lfBenchmarkCTR)}). Better thumbnails and titles could unlock ${fmtInt((lfBenchmarkCTR - lfAvgCTR) * lfTotalImpressions)} more views from existing impressions. Analysis based on ${longForm.length} long-form videos.`,
      sampleSize: `${longForm.length} long-form videos`,
      opportunity: Math.max(0, (lfBenchmarkCTR - lfAvgCTR) * lfTotalImpressions),
      effort: "Medium",
      action: "A/B test 3 thumbnail styles on next long-form uploads. Study top 20% CTR videos for title patterns. Use faces, contrast, text overlays.",
      videoExamples: worstCTRVideos.map(v => ({ title: v.title, views: v.views, ctr: v.ctr, retention: v.retention, youtubeVideoId: v.youtubeVideoId, youtubeUrl: v.youtubeUrl }))
    });
  }

  // Retention/Hook Optimization (long-form only — Shorts retention is a different scale)
  if (hasLongForm && lfAvgRetention < lfBenchmarkRetention * 0.9) {
    const retentionGapPct = ((lfBenchmarkRetention - lfAvgRetention) / lfBenchmarkRetention) * 100;
    const worstRetentionVideos = [...longForm].filter(r => r.retention > 0 && r.views > 100).sort((a, b) => a.retention - b.retention).slice(0, 5);

    patterns.push({
      type: "Retention Optimization",
      finding: "Strengthen long-form hooks & pacing",
      delta: `${retentionGapPct.toFixed(0)}% below your best (long-form)`,
      confidence: "High",
      recommendation: `OPTIMIZE: Long-form average retention (${fmtPct(lfAvgRetention)}) is ${retentionGapPct.toFixed(0)}% below your top performers (${fmtPct(lfBenchmarkRetention)}). Better hooks, pacing, and editing could increase watch time significantly. Analysis based on ${longForm.length} long-form videos (Shorts excluded — 80% retention on 30s is not comparable to 45% on 15min).`,
      sampleSize: `${longForm.length} long-form videos`,
      opportunity: Math.max(0, (lfBenchmarkRetention - lfAvgRetention) * lfTotalViews * 0.5),
      effort: "High",
      action: "Analyze first 30 seconds of top long-form performers. Cut fluff. Add pattern interrupts every 45-60 seconds. Tighten edit pacing.",
      videoExamples: worstRetentionVideos.map(v => ({ title: v.title, views: v.views, ctr: v.ctr, retention: v.retention, youtubeVideoId: v.youtubeVideoId, youtubeUrl: v.youtubeUrl }))
    });
  }

  // Upload Velocity Optimization
  const videosWithDates = rows.filter(r => r.publishDate);
  if (videosWithDates.length >= 2) {
    const sortedByDate = [...videosWithDates].sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    let totalDays = 0;
    let intervals = 0;
    for (let i = 0; i < sortedByDate.length - 1; i++) {
      const dateA = new Date(sortedByDate[i].publishDate);
      const dateB = new Date(sortedByDate[i + 1].publishDate);
      totalDays += (dateA - dateB) / (1000 * 60 * 60 * 24);
      intervals++;
    }
    const avgDaysBetween = intervals > 0 ? totalDays / intervals : null;

    if (avgDaysBetween > 10) {
      const targetDays = 7;
      const additionalUploadsPerMonth = Math.floor((30 / targetDays) - (30 / avgDaysBetween));

      patterns.push({
        type: "Upload Velocity",
        finding: "Increase upload consistency",
        delta: `${avgDaysBetween.toFixed(0)} days between uploads`,
        confidence: "Medium",
        recommendation: `OPTIMIZE: You're uploading every ${avgDaysBetween.toFixed(0)} days. Algorithm rewards consistency. Moving to ${targetDays}-day cadence could boost discovery and subscriber retention.`,
        sampleSize: `${sortedByDate.length} videos`,
        opportunity: Math.max(0, viewsPerVideo * additionalUploadsPerMonth * 3),
        effort: "High",
        action: `Build ${Math.ceil(additionalUploadsPerMonth * 1.5)} video buffer. Batch record. Schedule ${targetDays}-day upload rhythm.`,
        videoExamples: []
      });
    }
  }

  // Sort patterns by opportunity size
  patterns.sort((a, b) => (b.opportunity || 0) - (a.opportunity || 0));

  return {
    primaryConstraint,
    constraintSeverity,
    constraintEvidence,
    patterns: patterns.slice(0, 12),
    metrics: {
      avgCTR: lfAvgCTR,
      avgRetention: lfAvgRetention,
      benchmarkCTR: lfBenchmarkCTR,
      benchmarkRetention: lfBenchmarkRetention,
      totalViews,
      viewsPerVideo,
      longFormCount: longForm.length,
      shortsCount: rows.length - longForm.length,
    }
  };
}

/**
 * React hook wrapper around computeDiagnostics.
 * Memoizes the result based on the rows array.
 */
export default function useDiagnostics(rows) {
  return useMemo(() => computeDiagnostics(rows), [rows]);
}
