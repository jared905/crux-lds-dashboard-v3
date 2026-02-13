/**
 * Gap Detection Service
 * Compares competitor video data against client videos to surface
 * formats, patterns, topics, and strategies the client is underusing.
 * Purely algorithmic — no AI API calls.
 */

// ─── Title pattern / format detection (mirrors competitorDatabase.js) ──────

const TITLE_PATTERNS = [
  { name: 'question', regex: /\?/ },
  { name: 'number', regex: /\d+/ },
  { name: 'caps_emphasis', regex: /\b[A-Z]{3,}\b/ },
  { name: 'brackets', regex: /[\(\[\{]/ },
  { name: 'first_person', regex: /\b(I|My|We|Our)\b/i },
  { name: 'negative', regex: /\b(never|stop|avoid|worst|fail|bad|terrible|don't)\b/i },
  { name: 'power_word', regex: /\b(secret|ultimate|best|perfect|complete|easy|simple|amazing)\b/i },
];

const CONTENT_FORMATS = [
  { name: 'tutorial', regex: /\b(tutorial|how to|guide|learn|teach|step by step|tips|tricks)\b/i },
  { name: 'review', regex: /\b(review|reaction|reacts?|responds?|first time|listening to|watching)\b/i },
  { name: 'vlog', regex: /\b(vlog|behind|day in|life|personal|story|journey|update)\b/i },
  { name: 'comparison', regex: /\b(vs\.?|versus|compare|comparison|battle)\b/i },
  { name: 'listicle', regex: /\b(top \d+|best|worst|\d+ (things|ways|tips|reasons))\b/i },
  { name: 'challenge', regex: /\b(challenge|try|attempt|test|experiment)\b/i },
];

const PATTERN_LABELS = {
  question: 'Question Hook',
  number: 'Numbers in Title',
  caps_emphasis: 'CAPS Emphasis',
  brackets: 'Brackets/Parentheses',
  first_person: 'First Person ("I/My")',
  negative: 'Negative Hooks',
  power_word: 'Power Words',
};

const FORMAT_LABELS = {
  tutorial: 'Tutorial / How-To',
  review: 'Review / Reaction',
  vlog: 'Vlog / Personal',
  comparison: 'Comparison / VS',
  listicle: 'Listicle / Top N',
  challenge: 'Challenge / Experiment',
};

function detectTitlePatterns(title) {
  if (!title) return [];
  return TITLE_PATTERNS.filter(p => p.regex.test(title)).map(p => p.name);
}

function detectContentFormat(title) {
  if (!title) return null;
  const match = CONTENT_FORMATS.find(f => f.regex.test(title));
  return match ? match.name : null;
}

// ─── Scoring (mirrors opportunityService.js weights) ────────────────────────

const IMPACT_WEIGHTS = { high: 1.0, medium: 0.6, low: 0.3 };
const CONFIDENCE_WEIGHTS = { high: 1.0, medium: 0.6, low: 0.3 };
const EFFORT_INVERSE = { low: 1.0, medium: 0.6, high: 0.3 };

function computeScore(impact, confidence, effort) {
  const i = IMPACT_WEIGHTS[impact] || 0.5;
  const c = CONFIDENCE_WEIGHTS[confidence] || 0.5;
  const e = EFFORT_INVERSE[effort] || 0.5;
  return i * 0.4 + c * 0.3 + e * 0.3;
}

const fmtInt = (n) => (!n || isNaN(n)) ? '0' : Math.round(n).toLocaleString();

// ─── Stopwords for topic extraction ──────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'as', 'be', 'was', 'are',
  'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you',
  'your', 'he', 'she', 'his', 'her', 'they', 'them', 'their', 'its',
  'not', 'no', 'do', 'does', 'did', 'will', 'can', 'could', 'would',
  'should', 'have', 'has', 'had', 'been', 'being', 'so', 'if', 'then',
  'than', 'when', 'what', 'how', 'why', 'who', 'which', 'where',
  'about', 'up', 'out', 'all', 'just', 'more', 'most', 'very',
  'also', 'into', 'over', 'after', 'before', 'between', 'each',
  'every', 'both', 'few', 'some', 'any', 'other', 'new', 'old',
  'one', 'two', 'three', 'first', 'last', 'get', 'got', 'make',
  'made', 'like', 'know', 'think', 'see', 'look', 'come', 'go',
  'here', 'there', 'now', 'still', 'even', 'back', 'only', 'way',
  'part', 'ep', 'episode', 'video', 'full', 'official',
]);

// ─── 1. FORMAT GAPS ─────────────────────────────────────────────────────────

function detectFormatGaps(clientVideos, competitorVideos) {
  const gaps = [];

  // Detect formats for client videos
  const clientFormats = {};
  clientVideos.forEach(v => {
    const fmt = detectContentFormat(v.title);
    if (fmt) clientFormats[fmt] = (clientFormats[fmt] || 0) + 1;
  });

  // Count competitor formats (already in DB but we re-detect for consistency)
  const compFormats = {};
  const compFormatVideos = {};
  competitorVideos.forEach(v => {
    const fmt = v.detected_format || detectContentFormat(v.title);
    if (fmt) {
      compFormats[fmt] = (compFormats[fmt] || 0) + 1;
      if (!compFormatVideos[fmt]) compFormatVideos[fmt] = [];
      compFormatVideos[fmt].push(v);
    }
  });

  const clientTotal = clientVideos.length || 1;
  const compTotal = competitorVideos.length || 1;

  for (const fmt of Object.keys(compFormats)) {
    const compPct = compFormats[fmt] / compTotal;
    const clientPct = (clientFormats[fmt] || 0) / clientTotal;
    const clientCount = clientFormats[fmt] || 0;

    // Gap: competitor uses format significantly more than client
    if (compPct > 0.10 && clientPct < 0.05) {
      const ratio = Math.round(compPct / Math.max(clientPct, 0.01));
      const formatVideos = (compFormatVideos[fmt] || [])
        .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
        .slice(0, 5);

      const avgViews = formatVideos.length > 0
        ? formatVideos.reduce((s, v) => s + (v.view_count || 0), 0) / formatVideos.length
        : 0;

      const gapSize = Math.min(1, (compPct - clientPct) * 3);

      gaps.push({
        id: `format_${fmt}`,
        type: 'format',
        typeLabel: 'Format Gap',
        title: `Competitors use ${FORMAT_LABELS[fmt] || fmt} ${ratio}x more`,
        description: `${Math.round(compPct * 100)}% of competitor videos use the ${FORMAT_LABELS[fmt] || fmt} format, but only ${Math.round(clientPct * 100)}% of yours do (${clientCount} videos).`,
        action: `Create ${FORMAT_LABELS[fmt] || fmt} content — competitors average ${fmtInt(avgViews)} views with this format.`,
        evidence: {
          competitorStat: `${compFormats[fmt]} videos (${Math.round(compPct * 100)}%)`,
          clientStat: `${clientCount} videos (${Math.round(clientPct * 100)}%)`,
          topExamples: formatVideos.map(v => ({
            title: v.title,
            views: v.view_count,
            channel: v.channels?.name || v.channel_name || '—',
          })),
        },
        gapSize,
        impact: avgViews > 50000 ? 'high' : avgViews > 10000 ? 'medium' : 'low',
        confidence: compFormats[fmt] >= 10 ? 'high' : compFormats[fmt] >= 5 ? 'medium' : 'low',
        effort: 'medium',
      });
    }
  }

  return gaps;
}

// ─── 2. TITLE PATTERN GAPS ──────────────────────────────────────────────────

function detectTitlePatternGaps(clientVideos, competitorVideos) {
  const gaps = [];

  // Detect patterns for client videos
  const clientPatterns = {};
  clientVideos.forEach(v => {
    detectTitlePatterns(v.title).forEach(p => {
      clientPatterns[p] = (clientPatterns[p] || 0) + 1;
    });
  });

  // Competitor patterns (use DB field or re-detect)
  const compPatterns = {};
  const compPatternViews = {};
  competitorVideos.forEach(v => {
    const patterns = v.title_patterns || detectTitlePatterns(v.title);
    patterns.forEach(p => {
      compPatterns[p] = (compPatterns[p] || 0) + 1;
      if (!compPatternViews[p]) compPatternViews[p] = { totalViews: 0, count: 0, topVideos: [] };
      compPatternViews[p].totalViews += v.view_count || 0;
      compPatternViews[p].count++;
      compPatternViews[p].topVideos.push(v);
    });
  });

  const clientTotal = clientVideos.length || 1;
  const compTotal = competitorVideos.length || 1;

  for (const pattern of Object.keys(compPatterns)) {
    const compPct = compPatterns[pattern] / compTotal;
    const clientPct = (clientPatterns[pattern] || 0) / clientTotal;

    if (compPct > 0.20 && clientPct < 0.10) {
      const data = compPatternViews[pattern];
      const avgViews = data.count > 0 ? data.totalViews / data.count : 0;
      const topVideos = data.topVideos
        .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
        .slice(0, 5);

      const gapSize = Math.min(1, (compPct - clientPct) * 2.5);

      gaps.push({
        id: `pattern_${pattern}`,
        type: 'pattern',
        typeLabel: 'Title Pattern Gap',
        title: `Underusing "${PATTERN_LABELS[pattern] || pattern}" in titles`,
        description: `${Math.round(compPct * 100)}% of competitor titles use ${PATTERN_LABELS[pattern] || pattern}, but only ${Math.round(clientPct * 100)}% of yours do.`,
        action: `Incorporate ${PATTERN_LABELS[pattern] || pattern} into your titles — competitors average ${fmtInt(avgViews)} views with this pattern.`,
        evidence: {
          competitorStat: `${compPatterns[pattern]} videos (${Math.round(compPct * 100)}%)`,
          clientStat: `${clientPatterns[pattern] || 0} videos (${Math.round(clientPct * 100)}%)`,
          topExamples: topVideos.map(v => ({
            title: v.title,
            views: v.view_count,
            channel: v.channels?.name || v.channel_name || '—',
          })),
        },
        gapSize,
        impact: avgViews > 50000 ? 'high' : avgViews > 10000 ? 'medium' : 'low',
        confidence: compPatterns[pattern] >= 15 ? 'high' : compPatterns[pattern] >= 8 ? 'medium' : 'low',
        effort: 'low',
      });
    }
  }

  return gaps;
}

// ─── 3. CONTENT TYPE GAPS (Shorts vs Long-form) ────────────────────────────

function detectTypeGaps(clientVideos, competitorVideos) {
  const gaps = [];

  const clientShorts = clientVideos.filter(v => v.type === 'short').length;
  const clientLongs = clientVideos.filter(v => v.type === 'long').length;
  const clientTotal = clientVideos.length || 1;

  const compShorts = competitorVideos.filter(v => v.video_type === 'short' || v.is_short).length;
  const compLongs = competitorVideos.filter(v => v.video_type === 'long' || (!v.is_short && v.video_type !== 'short')).length;
  const compTotal = competitorVideos.length || 1;

  const clientShortPct = clientShorts / clientTotal;
  const compShortPct = compShorts / compTotal;

  // Shorts gap: competitors do shorts, client doesn't
  if (compShortPct > 0.25 && clientShortPct < 0.10) {
    const compShortVideos = competitorVideos
      .filter(v => v.video_type === 'short' || v.is_short)
      .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
      .slice(0, 5);

    const avgShortViews = compShortVideos.length > 0
      ? compShortVideos.reduce((s, v) => s + (v.view_count || 0), 0) / compShortVideos.length
      : 0;

    gaps.push({
      id: 'type_shorts_missing',
      type: 'content_type',
      typeLabel: 'Content Type Gap',
      title: `Competitors invest in Shorts — you don't`,
      description: `${Math.round(compShortPct * 100)}% of competitor content is Shorts, but only ${Math.round(clientShortPct * 100)}% of yours is. That's ${compShorts} competitor Shorts vs ${clientShorts} of yours.`,
      action: `Start publishing Shorts — competitors average ${fmtInt(avgShortViews)} views on their Shorts.`,
      evidence: {
        competitorStat: `${compShorts} Shorts (${Math.round(compShortPct * 100)}%)`,
        clientStat: `${clientShorts} Shorts (${Math.round(clientShortPct * 100)}%)`,
        topExamples: compShortVideos.map(v => ({
          title: v.title,
          views: v.view_count,
          channel: v.channels?.name || v.channel_name || '—',
        })),
      },
      gapSize: Math.min(1, (compShortPct - clientShortPct) * 2),
      impact: 'high',
      confidence: compShorts >= 10 ? 'high' : 'medium',
      effort: 'medium',
    });
  }

  // Long-form gap: competitors do long-form, client only does shorts
  const clientLongPct = clientLongs / clientTotal;
  const compLongPct = compLongs / compTotal;

  if (compLongPct > 0.50 && clientLongPct < 0.20) {
    const compLongVideos = competitorVideos
      .filter(v => v.video_type === 'long' || (!v.is_short && v.video_type !== 'short'))
      .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
      .slice(0, 5);

    const avgLongViews = compLongVideos.length > 0
      ? compLongVideos.reduce((s, v) => s + (v.view_count || 0), 0) / compLongVideos.length
      : 0;

    gaps.push({
      id: 'type_longform_missing',
      type: 'content_type',
      typeLabel: 'Content Type Gap',
      title: `Competitors focus on long-form — you're underinvested`,
      description: `${Math.round(compLongPct * 100)}% of competitor content is long-form, but only ${Math.round(clientLongPct * 100)}% of yours is.`,
      action: `Invest in long-form content — competitors average ${fmtInt(avgLongViews)} views on long-form videos.`,
      evidence: {
        competitorStat: `${compLongs} long-form (${Math.round(compLongPct * 100)}%)`,
        clientStat: `${clientLongs} long-form (${Math.round(clientLongPct * 100)}%)`,
        topExamples: compLongVideos.map(v => ({
          title: v.title,
          views: v.view_count,
          channel: v.channels?.name || v.channel_name || '—',
        })),
      },
      gapSize: Math.min(1, (compLongPct - clientLongPct) * 2),
      impact: 'high',
      confidence: compLongs >= 10 ? 'high' : 'medium',
      effort: 'high',
    });
  }

  return gaps;
}

// ─── 4. FREQUENCY GAPS ──────────────────────────────────────────────────────

function detectFrequencyGaps(clientVideos, competitorVideos, competitorChannelCount) {
  const gaps = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Client uploads in last 30 days
  const clientRecent = clientVideos.filter(v =>
    v.publishDate && new Date(v.publishDate) >= thirtyDaysAgo
  ).length;

  // Competitor uploads in last 30 days (per channel average)
  const compRecent = competitorVideos.filter(v =>
    v.published_at && new Date(v.published_at) >= thirtyDaysAgo
  ).length;

  const channelCount = Math.max(competitorChannelCount || 1, 1);
  const compAvgPerChannel = compRecent / channelCount;

  if (compAvgPerChannel > 2 && clientRecent < compAvgPerChannel * 0.6) {
    const ratio = compAvgPerChannel / Math.max(clientRecent, 0.5);
    const avgViewsPerUpload = clientVideos.length > 0
      ? clientVideos.reduce((s, v) => s + (v.views || 0), 0) / clientVideos.length
      : 0;
    const missingUploads = Math.round(compAvgPerChannel - clientRecent);
    const estimatedViews = missingUploads * avgViewsPerUpload;

    gaps.push({
      id: 'frequency_low_cadence',
      type: 'frequency',
      typeLabel: 'Frequency Gap',
      title: `Publishing ${ratio.toFixed(1)}x less than competitors`,
      description: `You published ${clientRecent} videos in the last 30 days. Competitors average ${compAvgPerChannel.toFixed(1)} uploads/month per channel.`,
      action: `Increase to ${Math.ceil(compAvgPerChannel)} uploads/month — that's ~${missingUploads} more videos, potentially adding ${fmtInt(estimatedViews)} views.`,
      evidence: {
        competitorStat: `${compAvgPerChannel.toFixed(1)} uploads/month (avg per channel)`,
        clientStat: `${clientRecent} uploads in last 30 days`,
        topExamples: [],
      },
      gapSize: Math.min(1, (1 - clientRecent / compAvgPerChannel) * 1.5),
      impact: estimatedViews > 50000 ? 'high' : estimatedViews > 10000 ? 'medium' : 'low',
      confidence: 'high',
      effort: 'high',
    });
  }

  return gaps;
}

// ─── 5. SERIES GAPS ─────────────────────────────────────────────────────────

async function detectSeriesGaps(clientVideos, competitorChannelIds) {
  const gaps = [];
  if (!competitorChannelIds.length) return gaps;

  try {
    const { supabase } = await import('./supabaseClient');
    if (!supabase) return gaps;

    const { data: compSeries, error } = await supabase
      .from('detected_series')
      .select('name, video_count, total_views, avg_views, performance_trend, channel_id, channels(name)')
      .in('channel_id', competitorChannelIds)
      .gte('video_count', 3)
      .order('avg_views', { ascending: false })
      .limit(20);

    if (error || !compSeries?.length) return gaps;

    // Check if client has series: simple prefix detection on client titles
    const clientTitleWords = {};
    clientVideos.forEach(v => {
      if (!v.title) return;
      const words = v.title.split(/[\s\-|:]+/).slice(0, 3).join(' ').toLowerCase().trim();
      if (words.length > 5) {
        clientTitleWords[words] = (clientTitleWords[words] || 0) + 1;
      }
    });
    const clientSeriesCount = Object.values(clientTitleWords).filter(c => c >= 3).length;

    const growingSeries = compSeries.filter(s =>
      s.performance_trend === 'growing' || s.avg_views > 10000
    );

    if (growingSeries.length > 0 && clientSeriesCount < 2) {
      const topSeries = growingSeries.slice(0, 5);
      const avgSeriesViews = topSeries.reduce((s, r) => s + (r.avg_views || 0), 0) / topSeries.length;

      gaps.push({
        id: 'series_missing',
        type: 'series',
        typeLabel: 'Series Gap',
        title: `Competitors have ${growingSeries.length} successful series — you have ${clientSeriesCount}`,
        description: `Competitors run recurring content series that build audience expectation and loyalty. Their top series average ${fmtInt(avgSeriesViews)} views per episode.`,
        action: `Start a recurring series — pick a topic you can produce consistently. Competitor series include: ${topSeries.map(s => `"${s.name}"`).join(', ')}.`,
        evidence: {
          competitorStat: `${growingSeries.length} growing/high-performing series`,
          clientStat: `${clientSeriesCount} detected series`,
          topExamples: topSeries.map(s => ({
            title: `${s.name} (${s.video_count} episodes)`,
            views: s.avg_views,
            channel: s.channels?.name || '—',
          })),
        },
        gapSize: Math.min(1, (growingSeries.length - clientSeriesCount) / 5),
        impact: avgSeriesViews > 30000 ? 'high' : avgSeriesViews > 10000 ? 'medium' : 'low',
        confidence: growingSeries.length >= 3 ? 'high' : 'medium',
        effort: 'high',
      });
    }
  } catch (err) {
    console.error('[GapDetection] Series gap detection failed:', err);
  }

  return gaps;
}

// ─── 6. TOPIC GAPS (n-gram extraction) ──────────────────────────────────────

function extractNgrams(title, n) {
  if (!title) return [];
  const words = title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));

  const ngrams = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function detectTopicGaps(clientVideos, competitorVideos) {
  const gaps = [];

  // Extract 2-gram and 3-gram topic clusters from competitor titles
  const compTopics = {};
  competitorVideos.forEach(v => {
    const seen = new Set();
    [...extractNgrams(v.title, 2), ...extractNgrams(v.title, 3)].forEach(ng => {
      if (!seen.has(ng)) {
        seen.add(ng);
        if (!compTopics[ng]) compTopics[ng] = { count: 0, totalViews: 0, videos: [] };
        compTopics[ng].count++;
        compTopics[ng].totalViews += v.view_count || 0;
        compTopics[ng].videos.push(v);
      }
    });
  });

  // Extract client topic clusters
  const clientTopics = new Set();
  clientVideos.forEach(v => {
    [...extractNgrams(v.title, 2), ...extractNgrams(v.title, 3)].forEach(ng => {
      clientTopics.add(ng);
    });
  });

  // Find competitor topics the client never covers
  const topicGaps = Object.entries(compTopics)
    .filter(([ng, data]) => data.count >= 3 && !clientTopics.has(ng))
    .map(([ng, data]) => ({
      topic: ng,
      count: data.count,
      avgViews: data.totalViews / data.count,
      topVideos: data.videos
        .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
        .slice(0, 3),
    }))
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 8);

  topicGaps.forEach((topic, idx) => {
    gaps.push({
      id: `topic_${idx}_${topic.topic.replace(/\s+/g, '_')}`,
      type: 'topic',
      typeLabel: 'Topic Gap',
      title: `Competitors cover "${topic.topic}" — you don't`,
      description: `${topic.count} competitor videos mention "${topic.topic}" with an average of ${fmtInt(topic.avgViews)} views. You have no videos covering this topic.`,
      action: `Create content around "${topic.topic}" — proven demand from ${topic.count} competitor videos.`,
      evidence: {
        competitorStat: `${topic.count} videos, avg ${fmtInt(topic.avgViews)} views`,
        clientStat: '0 videos',
        topExamples: topic.topVideos.map(v => ({
          title: v.title,
          views: v.view_count,
          channel: v.channels?.name || v.channel_name || '—',
        })),
      },
      gapSize: Math.min(1, topic.count / 10),
      impact: topic.avgViews > 50000 ? 'high' : topic.avgViews > 10000 ? 'medium' : 'low',
      confidence: topic.count >= 5 ? 'high' : 'medium',
      effort: 'medium',
    });
  });

  return gaps;
}

// ─── ORCHESTRATOR ───────────────────────────────────────────────────────────

export async function detectAllGaps(clientVideos, clientId) {
  if (!clientVideos || clientVideos.length === 0) {
    return { gaps: [], summary: { total: 0, byType: {}, topGapType: null } };
  }

  // 1. Fetch competitor channels + videos
  const { getChannels } = await import('./competitorDatabase');
  const { supabase } = await import('./supabaseClient');
  if (!supabase) return { gaps: [], summary: { total: 0, byType: {}, topGapType: null } };

  const { data: compChannels } = await getChannels({ clientId, isCompetitor: true });
  if (!compChannels || compChannels.length === 0) {
    return { gaps: [], summary: { total: 0, byType: {}, topGapType: null }, noCompetitors: true };
  }

  const channelIds = compChannels.map(c => c.id);

  // 2. Fetch competitor videos (last 90 days)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  const { data: competitorVideos, error: vErr } = await supabase
    .from('videos')
    .select('id, title, channel_id, video_type, is_short, view_count, like_count, comment_count, engagement_rate, published_at, detected_format, title_patterns, duration_seconds, channels(name)')
    .in('channel_id', channelIds)
    .gte('published_at', cutoffDate.toISOString())
    .order('view_count', { ascending: false })
    .limit(500);

  if (vErr) throw vErr;
  if (!competitorVideos || competitorVideos.length === 0) {
    return { gaps: [], summary: { total: 0, byType: {}, topGapType: null }, noVideos: true };
  }

  // 3. Run all detectors
  const [formatGaps, patternGaps, typeGaps, frequencyGaps, seriesGaps, topicGaps] = await Promise.all([
    Promise.resolve(detectFormatGaps(clientVideos, competitorVideos)),
    Promise.resolve(detectTitlePatternGaps(clientVideos, competitorVideos)),
    Promise.resolve(detectTypeGaps(clientVideos, competitorVideos)),
    Promise.resolve(detectFrequencyGaps(clientVideos, competitorVideos, compChannels.length)),
    detectSeriesGaps(clientVideos, channelIds),
    Promise.resolve(detectTopicGaps(clientVideos, competitorVideos)),
  ]);

  // 4. Combine, score, sort
  const allGaps = [
    ...formatGaps,
    ...patternGaps,
    ...typeGaps,
    ...frequencyGaps,
    ...seriesGaps,
    ...topicGaps,
  ].map(gap => ({
    ...gap,
    score: computeScore(gap.impact, gap.confidence, gap.effort),
  })).sort((a, b) => b.score - a.score);

  // 5. Build summary
  const byType = {};
  allGaps.forEach(g => {
    byType[g.type] = (byType[g.type] || 0) + 1;
  });

  const topGapType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    gaps: allGaps,
    summary: {
      total: allGaps.length,
      byType,
      topGapType,
      competitorCount: compChannels.length,
      videoCount: competitorVideos.length,
    },
  };
}
