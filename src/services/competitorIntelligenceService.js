/**
 * Competitor Intelligence Service
 * Full View Analytics - Crux Media
 *
 * Orchestrates Claude-powered analysis for the Intelligence Panel:
 * - Audience interest analysis
 * - Thumbnail pattern analysis (metadata + vision)
 * - Title suggestions
 * - Series concept generation
 *
 * All results are cached in the competitor_insights Supabase table.
 */

import { supabase } from './supabaseClient';
import { claudeAPI } from './claudeAPI';
import { getBrandContextWithSignals } from './brandContextService';

// Cache TTLs in days
const CACHE_TTLS = {
  audience_topics: 7,
  thumbnail_pattern: 7,
  thumbnail_vision: 7,
  title_suggestions: 3,
  series_concepts: 14,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJSON(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return JSON.parse(cleaned);
}

function cacheKey(channelIds) {
  return [...channelIds].sort().join(',');
}

function isCacheValid(generatedAt, ttlDays) {
  if (!generatedAt) return false;
  const age = Date.now() - new Date(generatedAt).getTime();
  return age < ttlDays * 24 * 60 * 60 * 1000;
}

// ─── Cache Layer ──────────────────────────────────────────────────────────────

async function getCached(insightType, clientId) {
  if (!supabase) return null;

  const { data } = await supabase
    .from('competitor_insights')
    .select('insight_data, generated_at')
    .eq('insight_type', insightType)
    .eq('client_id', clientId)
    .is('video_id', null)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data && isCacheValid(data.generated_at, CACHE_TTLS[insightType] || 7)) {
    return data.insight_data;
  }
  return null;
}

async function setCache(insightType, clientId, data, usage = {}) {
  if (!supabase) return;

  await supabase.from('competitor_insights').upsert({
    video_id: null,
    channel_id: null,
    client_id: clientId,
    insight_type: insightType,
    insight_data: data,
    generated_at: new Date().toISOString(),
    model_used: 'claude-sonnet-4-5',
    tokens_used: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    cost: usage.cost || 0,
  }, {
    onConflict: 'idx_competitor_insights_flexible_unique',
    ignoreDuplicates: false,
  });
}

export async function invalidateCache(insightType, clientId) {
  if (!supabase) return;

  await supabase
    .from('competitor_insights')
    .delete()
    .eq('insight_type', insightType)
    .eq('client_id', clientId)
    .is('video_id', null);
}

// ─── Data Fetching Helpers ────────────────────────────────────────────────────

async function getTopCompetitorVideos(channelIds, { days = 90, limit = 200, excludeShorts = false } = {}) {
  if (!supabase || !channelIds.length) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  let query = supabase
    .from('videos')
    .select('id, title, channel_id, view_count, like_count, comment_count, published_at, thumbnail_url, video_type, duration_seconds, detected_format, title_patterns, channels(name)')
    .in('channel_id', channelIds)
    .gte('published_at', cutoff.toISOString())
    .order('view_count', { ascending: false })
    .limit(limit);

  if (excludeShorts) {
    query = query.neq('video_type', 'short');
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

async function getDetectedSeries(channelIds, { limit = 20 } = {}) {
  if (!supabase || !channelIds.length) return [];

  const { data, error } = await supabase
    .from('detected_series')
    .select('id, channel_id, series_name, video_count, avg_views, total_views, channels(name)')
    .in('channel_id', channelIds)
    .gte('video_count', 3)
    .order('avg_views', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[intelligence] detected_series query failed:', error.message);
    return [];
  }
  return data || [];
}

// ─── 1. AUDIENCE INTEREST ANALYSIS ───────────────────────────────────────────

const AUDIENCE_SYSTEM_PROMPT = `You are a YouTube audience analyst. Given competitor video performance data from a specific niche, identify what the audience cares about. Analyze title topics, engagement patterns, and viewing preferences.

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "topics": [
    {
      "topic": "Topic name (2-4 words)",
      "frequency": <number of videos about this>,
      "avgViews": <average views for this topic>,
      "sentiment": "positive" | "neutral" | "controversial",
      "trendDirection": "rising" | "stable" | "declining",
      "exampleTitles": ["title1", "title2"]
    }
  ],
  "audienceProfile": "2-3 sentence description of what this audience responds to and why",
  "topInterests": ["interest1", "interest2", "interest3", "interest4", "interest5"],
  "contentAppetite": {
    "preferredLength": "shorts" | "medium" | "long",
    "preferredFormat": "format name",
    "engagementDrivers": ["driver1", "driver2", "driver3"]
  }
}

Return 8-12 topics, ordered by audience interest strength (avgViews * frequency).`;

export async function analyzeAudienceInterests(channelIds, clientId, { days = 90, forceRefresh = false } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  if (!forceRefresh) {
    const cached = await getCached('audience_topics', clientId);
    if (cached) return cached;
  }

  const videos = await getTopCompetitorVideos(channelIds, { days, limit: 200 });
  if (!videos.length) throw new Error('No competitor videos found');

  const videoSummary = videos.map(v =>
    `"${v.title}" — ${(v.view_count || 0).toLocaleString()} views, ${(v.like_count || 0).toLocaleString()} likes, ${v.video_type || 'long'}, ${v.channels?.name || 'Unknown'}`
  ).join('\n');

  const prompt = `Analyze audience interests from these ${videos.length} competitor videos (last ${days} days):\n\n${videoSummary}`;

  const result = await claudeAPI.call(prompt, AUDIENCE_SYSTEM_PROMPT, 'audience_intel', 2048);

  let data;
  try {
    data = parseJSON(result.text);
  } catch {
    data = {
      topics: [],
      audienceProfile: result.text,
      topInterests: [],
      contentAppetite: { preferredLength: 'unknown', preferredFormat: 'unknown', engagementDrivers: [] },
    };
  }

  await setCache('audience_topics', clientId, data, { input_tokens: result.usage?.input_tokens, output_tokens: result.usage?.output_tokens, cost: result.cost });

  return data;
}

// ─── Algorithmic Topic Extraction (instant, no AI) ────────────────────────────

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'will', 'more',
  'when', 'who', 'what', 'how', 'why', 'this', 'that', 'with', 'from',
  'they', 'been', 'said', 'each', 'which', 'their', 'about', 'would',
  'make', 'like', 'just', 'over', 'such', 'take', 'than', 'them', 'very',
  'some', 'could', 'into', 'other', 'then', 'these', 'its', 'his',
  'only', 'new', 'also', 'get', 'got', 'did', 'may', 'after', 'use',
]);

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

export function extractTopicsAlgorithmic(videos) {
  const topics = {};

  videos.forEach(v => {
    const seen = new Set();
    [...extractNgrams(v.title, 2), ...extractNgrams(v.title, 3)].forEach(ng => {
      if (!seen.has(ng)) {
        seen.add(ng);
        if (!topics[ng]) topics[ng] = { count: 0, totalViews: 0, totalLikes: 0, videos: [] };
        topics[ng].count++;
        topics[ng].totalViews += v.view_count || 0;
        topics[ng].totalLikes += v.like_count || 0;
        if (topics[ng].videos.length < 3) topics[ng].videos.push(v);
      }
    });
  });

  return Object.entries(topics)
    .filter(([, data]) => data.count >= 3)
    .map(([topic, data]) => ({
      topic,
      count: data.count,
      avgViews: Math.round(data.totalViews / data.count),
      avgLikes: Math.round(data.totalLikes / data.count),
      score: data.count * (data.totalViews / data.count),
      examples: data.videos.slice(0, 3),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

// ─── 2. THUMBNAIL PATTERN ANALYSIS ───────────────────────────────────────────

const THUMBNAIL_SYSTEM_PROMPT = `You are a YouTube thumbnail strategist. Given the top-performing competitor videos (titles, view counts, formats, video types), analyze patterns in what gets clicked. Infer thumbnail strategies from the content patterns.

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "patterns": [
    {
      "pattern": "Pattern name (e.g., 'Bold Text Overlay', 'Before/After Split', 'Reaction Face')",
      "description": "What this pattern looks like and why it works",
      "inferredFrom": "What data signals this pattern",
      "frequency": "common" | "occasional" | "rare",
      "avgPerformanceMultiplier": <number vs channel average>,
      "recommendation": "How to apply this to your thumbnails"
    }
  ],
  "thumbnailRules": [
    "Rule 1: ...",
    "Rule 2: ...",
    "Rule 3: ..."
  ],
  "topPerformerInsight": "What the top 5 videos have in common visually"
}

Return 5-8 patterns.`;

export async function analyzeThumbnailPatterns(channelIds, clientId, { days = 90, forceRefresh = false } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  if (!forceRefresh) {
    const cached = await getCached('thumbnail_pattern', clientId);
    if (cached) return cached;
  }

  const videos = await getTopCompetitorVideos(channelIds, { days, limit: 30, excludeShorts: true });
  if (!videos.length) throw new Error('No competitor videos found');

  const videoSummary = videos.map((v, i) =>
    `#${i + 1}: "${v.title}" — ${(v.view_count || 0).toLocaleString()} views, format: ${v.detected_format || 'unknown'}, channel: ${v.channels?.name || 'Unknown'}`
  ).join('\n');

  const prompt = `Analyze thumbnail patterns from these top ${videos.length} competitor videos:\n\n${videoSummary}`;

  const result = await claudeAPI.call(prompt, THUMBNAIL_SYSTEM_PROMPT, 'thumbnail_analysis', 2048);

  let data;
  try {
    data = parseJSON(result.text);
    data.thumbnails = videos.slice(0, 30).map(v => ({
      id: v.id,
      title: v.title,
      thumbnailUrl: v.thumbnail_url,
      views: v.view_count,
      channel: v.channels?.name || 'Unknown',
      type: v.video_type,
    }));
  } catch {
    data = {
      patterns: [],
      thumbnailRules: [result.text],
      topPerformerInsight: '',
      thumbnails: videos.slice(0, 30).map(v => ({
        id: v.id,
        title: v.title,
        thumbnailUrl: v.thumbnail_url,
        views: v.view_count,
        channel: v.channels?.name || 'Unknown',
        type: v.video_type,
      })),
    };
  }

  await setCache('thumbnail_pattern', clientId, data, { input_tokens: result.usage?.input_tokens, output_tokens: result.usage?.output_tokens, cost: result.cost });

  return data;
}

// Vision-based deep thumbnail analysis
const THUMBNAIL_VISION_PROMPT = `You are a YouTube thumbnail expert. Analyze these competitor thumbnails and identify visual patterns that drive clicks.

For each thumbnail, note: color palette, text overlay (yes/no, font style), faces (yes/no, expressions), composition style, branding elements.

Then synthesize across all thumbnails:

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "visualPatterns": [
    {
      "pattern": "Pattern name",
      "frequency": <count of thumbnails using it>,
      "description": "Visual description of the pattern",
      "effectiveness": "high" | "medium" | "low",
      "howToReplicate": "Step-by-step instruction to create this style"
    }
  ],
  "colorTrends": ["dominant color 1", "dominant color 2"],
  "textUsage": {
    "percentWithText": <0-100>,
    "avgWordCount": <number>,
    "commonStyles": ["bold", "outlined", etc.]
  },
  "faceUsage": {
    "percentWithFaces": <0-100>,
    "commonExpressions": ["surprised", "happy", etc.]
  },
  "actionItems": [
    "Specific improvement 1",
    "Specific improvement 2",
    "Specific improvement 3"
  ]
}`;

export async function analyzeThumbnailsDeep(videoIds, clientId, { forceRefresh = false } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  if (!forceRefresh) {
    const cached = await getCached('thumbnail_vision', clientId);
    if (cached) return cached;
  }

  // Fetch videos with thumbnails
  const { data: videos, error } = await supabase
    .from('videos')
    .select('id, title, thumbnail_url, view_count, channels(name)')
    .in('id', videoIds)
    .not('thumbnail_url', 'is', null)
    .order('view_count', { ascending: false })
    .limit(12);

  if (error) throw error;
  if (!videos?.length) throw new Error('No videos with thumbnails found');

  // Fetch thumbnail images and convert to base64 for Claude Vision
  const imageContents = [];
  for (const video of videos.slice(0, 8)) {
    try {
      const response = await fetch(video.thumbnail_url);
      if (!response.ok) continue;
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const mediaType = response.headers.get('content-type') || 'image/jpeg';

      imageContents.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      });
      imageContents.push({
        type: 'text',
        text: `Thumbnail for: "${video.title}" (${(video.view_count || 0).toLocaleString()} views, ${video.channels?.name || 'Unknown'})`,
      });
    } catch (e) {
      console.warn('[intelligence] Failed to fetch thumbnail:', e.message);
    }
  }

  if (imageContents.length === 0) throw new Error('Could not fetch any thumbnail images');

  // Use the Claude API proxy with image content
  const apiKey = claudeAPI.loadAPIKey();
  if (!apiKey) throw new Error('Claude API key not configured');

  const response = await fetch('/api/claude-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model: 'claude-sonnet-4-5-20250929',
      maxTokens: 2048,
      system: THUMBNAIL_VISION_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze these competitor YouTube thumbnails and identify visual patterns:' },
          ...imageContents,
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Vision API failed: ${response.status}`);
  }

  const result = await response.json();
  const inputTokens = result.usage?.input_tokens || 0;
  const outputTokens = result.usage?.output_tokens || 0;
  claudeAPI.updateUsageStats(inputTokens, outputTokens, 'thumbnail_vision');

  let data;
  try {
    data = parseJSON(result.content[0].text);
  } catch {
    data = {
      visualPatterns: [],
      colorTrends: [],
      textUsage: {},
      faceUsage: {},
      actionItems: [result.content?.[0]?.text || 'Analysis complete'],
    };
  }

  await setCache('thumbnail_vision', clientId, data, { input_tokens: inputTokens, output_tokens: outputTokens, cost: claudeAPI.calculateCost(inputTokens, outputTokens) });

  return data;
}

// Get raw thumbnail grid data (no AI, instant)
export async function getThumbnailGrid(channelIds, { days = 90, limit = 30 } = {}) {
  const videos = await getTopCompetitorVideos(channelIds, { days, limit, excludeShorts: true });
  return videos
    .filter(v => v.thumbnail_url)
    .map(v => ({
      id: v.id,
      title: v.title,
      thumbnailUrl: v.thumbnail_url,
      views: v.view_count,
      likes: v.like_count,
      channel: v.channels?.name || 'Unknown',
      type: v.video_type,
      format: v.detected_format,
    }));
}

// ─── 3. TITLE SUGGESTIONS ────────────────────────────────────────────────────

const TITLE_SYSTEM_PROMPT = `You are a YouTube title strategist. Generate video title suggestions that combine proven competitor patterns with the client's brand voice.

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "titles": [
    {
      "title": "The actual suggested title",
      "format": "tutorial" | "listicle" | "question" | "comparison" | "story" | "reaction" | "challenge",
      "hookType": "curiosity gap" | "number" | "controversy" | "authority" | "urgency" | "personal",
      "estimatedCTR": "high" | "medium",
      "inspiredBy": "Title of the competitor video that inspired this",
      "rationale": "1 sentence: why this title would work for this audience",
      "topicArea": "topic cluster this belongs to"
    }
  ]
}`;

export async function generateTitleSuggestions(channelIds, clientId, { topics = [], formats = [], count = 10, forceRefresh = false } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  const cacheId = `${clientId}_${topics.sort().join(',')}_${formats.sort().join(',')}`;
  if (!forceRefresh) {
    const cached = await getCached('title_suggestions', cacheId);
    if (cached) return cached;
  }

  // Fetch top performing competitor videos
  const videos = await getTopCompetitorVideos(channelIds, { days: 90, limit: 50 });
  if (!videos.length) throw new Error('No competitor videos found');

  // Get brand context
  let brandBlock = '';
  try {
    brandBlock = await getBrandContextWithSignals(clientId, 'title_generation') || '';
  } catch (e) {
    console.warn('[intelligence] Brand context fetch failed:', e.message);
  }

  const topTitles = videos.slice(0, 30).map(v =>
    `"${v.title}" — ${(v.view_count || 0).toLocaleString()} views (${v.channels?.name || 'Unknown'})`
  ).join('\n');

  let prompt = `Generate ${count} video title suggestions based on what works for competitors.

Top-performing competitor titles (these work in this space):
${topTitles}`;

  if (topics.length > 0) {
    prompt += `\n\nFocus on these topics: ${topics.join(', ')}`;
  }
  if (formats.length > 0) {
    prompt += `\n\nPreferred formats: ${formats.join(', ')}`;
  }
  if (brandBlock) {
    prompt += `\n\n<brand_context>\n${brandBlock}\n</brand_context>`;
  }

  const result = await claudeAPI.call(prompt, TITLE_SYSTEM_PROMPT, 'title_lab', 2048);

  let data;
  try {
    data = parseJSON(result.text);
  } catch {
    data = { titles: [{ title: result.text, format: 'unknown', hookType: 'unknown', estimatedCTR: 'medium', inspiredBy: '', rationale: '', topicArea: '' }] };
  }

  await setCache('title_suggestions', cacheId, data, { input_tokens: result.usage?.input_tokens, output_tokens: result.usage?.output_tokens, cost: result.cost });

  return data;
}

// ─── 4. SERIES CONCEPT GENERATION ─────────────────────────────────────────────

const SERIES_SYSTEM_PROMPT = `You are a YouTube content strategist designing recurring series concepts. Based on competitor success and the client's brand, propose series ideas that could become signature content.

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "series": [
    {
      "name": "Series Name",
      "premise": "1-2 sentence series concept",
      "format": "interview" | "tutorial" | "vlog" | "documentary" | "debate" | "challenge" | "explainer",
      "cadence": "weekly" | "biweekly" | "monthly",
      "targetLength": "under 1 min" | "5-10 min" | "10-20 min" | "20-30 min" | "30+ min",
      "pilotTitle": "Suggested title for episode 1",
      "pilotHook": "Opening hook for episode 1 (1-2 sentences)",
      "whyItWorks": "2 sentences: strategic rationale",
      "competitorEvidence": [
        {"seriesName": "", "channel": "", "avgViews": 0, "videoCount": 0}
      ],
      "differentiator": "How this is different from the competitor version"
    }
  ]
}`;

export async function generateSeriesConcepts(channelIds, clientId, { count = 5, forceRefresh = false } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  if (!forceRefresh) {
    const cached = await getCached('series_concepts', clientId);
    if (cached) return cached;
  }

  // Fetch competitor series
  const competitorSeries = await getDetectedSeries(channelIds);

  // Fetch top videos for topic context
  const videos = await getTopCompetitorVideos(channelIds, { days: 90, limit: 100 });

  // Get brand context
  let brandBlock = '';
  try {
    brandBlock = await getBrandContextWithSignals(clientId, 'series_generation') || '';
  } catch (e) {
    console.warn('[intelligence] Brand context fetch failed:', e.message);
  }

  let prompt = `Generate ${count} content series concepts.`;

  if (competitorSeries.length > 0) {
    const seriesSummary = competitorSeries.slice(0, 10).map(s =>
      `"${s.series_name}" by ${s.channels?.name || 'Unknown'} — ${s.video_count} episodes, ${(s.avg_views || 0).toLocaleString()} avg views`
    ).join('\n');
    prompt += `\n\nSuccessful competitor series:\n${seriesSummary}`;
  }

  if (videos.length > 0) {
    const topicSummary = videos.slice(0, 30).map(v =>
      `"${v.title}" — ${(v.view_count || 0).toLocaleString()} views`
    ).join('\n');
    prompt += `\n\nTop competitor videos (for topic inspiration):\n${topicSummary}`;
  }

  if (brandBlock) {
    prompt += `\n\n<brand_context>\n${brandBlock}\n</brand_context>`;
  }

  const result = await claudeAPI.call(prompt, SERIES_SYSTEM_PROMPT, 'series_concepts', 2048);

  let data;
  try {
    data = parseJSON(result.text);
  } catch {
    data = { series: [{ name: 'Generated Concept', premise: result.text, format: 'unknown', cadence: 'weekly', targetLength: '10-20 min', pilotTitle: '', pilotHook: '', whyItWorks: '', competitorEvidence: [], differentiator: '' }] };
  }

  // Include raw competitor series for display
  data.competitorSeries = competitorSeries.map(s => ({
    name: s.series_name,
    channel: s.channels?.name || 'Unknown',
    videoCount: s.video_count,
    avgViews: s.avg_views,
  }));

  await setCache('series_concepts', clientId, data, { input_tokens: result.usage?.input_tokens, output_tokens: result.usage?.output_tokens, cost: result.cost });

  return data;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export default {
  analyzeAudienceInterests,
  extractTopicsAlgorithmic,
  analyzeThumbnailPatterns,
  analyzeThumbnailsDeep,
  getThumbnailGrid,
  generateTitleSuggestions,
  generateSeriesConcepts,
  invalidateCache,
  getTopCompetitorVideos,
};
