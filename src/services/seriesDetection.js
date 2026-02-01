/**
 * Series Detection Service
 * Two-pass content series detection:
 *   Pass 1: Regex-based title pattern matching
 *   Pass 2: Claude-powered semantic clustering for uncategorized videos
 */

import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';
import {
  upsertDetectedSeries,
  assignVideosToSeries,
  addAuditCost,
  updateAuditSection,
  updateAuditProgress,
} from './auditDatabase';

// ============================================
// Pass 1: Pattern-Based Detection
// ============================================

/**
 * Detect series by title patterns.
 * Looks for numbered episodes, common separators, and recurring prefixes.
 */
export function detectSeriesByPattern(videos) {
  const seriesMap = new Map(); // name -> { videoIds, pattern }
  const assigned = new Set();

  // Pattern 1: Explicit episode markers
  // "Series Name | Ep 5", "Title - Part 3", "#12 - Topic"
  const episodePatterns = [
    { regex: /^(.+?)[\s]*[|\-–—][\s]*(?:ep(?:isode)?\.?\s*\d+|part\s*\d+|#\d+)/i, group: 1 },
    { regex: /^(?:ep(?:isode)?\.?\s*\d+|part\s*\d+|#\d+)[\s]*[|\-–—:][\s]*(.+)/i, group: 1 },
    { regex: /^(.{5,}?)\s+(?:ep(?:isode)?\.?\s*\d+|part\s*\d+|#\d+)\s*$/i, group: 1 },
  ];

  for (const video of videos) {
    for (const { regex, group } of episodePatterns) {
      const match = video.title.match(regex);
      if (match) {
        const name = cleanSeriesName(match[group]);
        if (name.length >= 3) {
          if (!seriesMap.has(name)) {
            seriesMap.set(name, { videoIds: [], pattern: regex.source });
          }
          seriesMap.get(name).videoIds.push(video.youtube_video_id);
          assigned.add(video.youtube_video_id);
          break;
        }
      }
    }
  }

  // Pattern 2: Bracketed prefixes — "[Series] Title" or "(Series) Title"
  for (const video of videos) {
    if (assigned.has(video.youtube_video_id)) continue;
    const bracketMatch = video.title.match(/^\[([^\]]{3,})\]|^\(([^)]{3,})\)/);
    if (bracketMatch) {
      const name = cleanSeriesName(bracketMatch[1] || bracketMatch[2]);
      if (!seriesMap.has(name)) {
        seriesMap.set(name, { videoIds: [], pattern: 'bracket_prefix' });
      }
      seriesMap.get(name).videoIds.push(video.youtube_video_id);
      assigned.add(video.youtube_video_id);
    }
  }

  // Pattern 3: Recurring title prefixes (3+ videos with same 2-5 word prefix)
  const prefixCounts = {};
  const unassigned = videos.filter(v => !assigned.has(v.youtube_video_id));

  for (const video of unassigned) {
    const words = video.title.split(/\s+/).slice(0, 6);
    for (let len = 2; len <= Math.min(words.length, 5); len++) {
      const prefix = words.slice(0, len).join(' ');
      if (!prefixCounts[prefix]) prefixCounts[prefix] = [];
      prefixCounts[prefix].push(video.youtube_video_id);
    }
  }

  // Sort by length (longer prefixes first) then by count
  const prefixEntries = Object.entries(prefixCounts)
    .filter(([, ids]) => ids.length >= 3)
    .sort((a, b) => {
      const lenDiff = b[0].split(' ').length - a[0].split(' ').length;
      return lenDiff !== 0 ? lenDiff : b[1].length - a[1].length;
    });

  for (const [prefix, videoIds] of prefixEntries) {
    const unassignedIds = videoIds.filter(id => !assigned.has(id));
    if (unassignedIds.length >= 3) {
      const name = cleanSeriesName(prefix);
      if (!seriesMap.has(name)) {
        seriesMap.set(name, { videoIds: [], pattern: `prefix: "${prefix}"` });
      }
      for (const id of unassignedIds) {
        seriesMap.get(name).videoIds.push(id);
        assigned.add(id);
      }
    }
  }

  // Convert map to array, filter to 3+ videos
  const patternSeries = [];
  for (const [name, { videoIds, pattern }] of seriesMap) {
    if (videoIds.length >= 3) {
      patternSeries.push({ name, videoIds, patternRegex: pattern, detectionMethod: 'pattern' });
    }
  }

  const uncategorized = videos.filter(v => !assigned.has(v.youtube_video_id));

  return { patternSeries, uncategorized };
}

function cleanSeriesName(raw) {
  return raw
    .replace(/[:\-–—|]\s*$/, '')
    .replace(/^\s*[:\-–—|]/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// Pass 2: Semantic Clustering via Claude
// ============================================

const SERIES_DETECTION_SYSTEM_PROMPT = `You are a YouTube content analyst. Given a list of video titles from one channel, identify recurring content series or thematic groupings.

A "series" is 3+ videos that share a common theme, format, or subject that the creator treats as a recurring concept — even if they don't formally name it.

Rules:
- Only include groupings with 3+ videos
- Use clear, descriptive series names
- A video can only belong to one series
- Focus on recurring INTENT, not just keyword overlap
- Return ONLY valid JSON, no other text`;

export async function detectSeriesBySemantic(uncategorizedVideos, existingSeriesNames, auditId) {
  if (uncategorizedVideos.length < 5) return [];

  // Limit to 100 videos for the prompt
  const videosForPrompt = uncategorizedVideos.slice(0, 100);

  const prompt = `Here are ${videosForPrompt.length} video titles from a YouTube channel that don't match obvious title patterns.

Already-detected series (via pattern matching): ${existingSeriesNames.length > 0 ? existingSeriesNames.join(', ') : 'None'}

Videos:
${videosForPrompt.map((v, i) => `${i}. "${v.title}" (${(v.view_count || 0).toLocaleString()} views)`).join('\n')}

Identify implicit series/themes. For each, provide:
{
  "series": [
    {
      "name": "Descriptive Series Name",
      "videoIndices": [0, 3, 7],
      "confidence": "high" | "medium"
    }
  ]
}`;

  try {
    const result = await claudeAPI.call(
      prompt,
      SERIES_DETECTION_SYSTEM_PROMPT,
      'audit_series_detection',
      2000
    );

    // Track cost
    if (result.usage) {
      await addAuditCost(auditId, {
        tokens: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0),
        cost: result.cost || 0,
      });
    }

    const parsed = parseClaudeJSON(result.text, { series: [] });

    return (parsed.series || [])
      .filter(s => s.videoIndices && s.videoIndices.length >= 3)
      .map(s => ({
        name: s.name,
        videoIds: s.videoIndices
          .map(idx => videosForPrompt[idx]?.youtube_video_id)
          .filter(Boolean),
        detectionMethod: 'semantic',
        semanticCluster: s.name,
        confidence: s.confidence || 'medium',
      }))
      .filter(s => s.videoIds.length >= 3);

  } catch (err) {
    console.warn('Semantic series detection failed:', err.message);
    return [];
  }
}

// ============================================
// Full Pipeline
// ============================================

/**
 * Run complete series detection for an audit.
 */
export async function runSeriesDetection(auditId, channelId, videos) {
  await updateAuditSection(auditId, 'series_detection', { status: 'running' });
  await updateAuditProgress(auditId, { step: 'series_detection', pct: 17, message: 'Detecting title patterns...' });

  try {
    // Pass 1: Pattern detection
    const { patternSeries, uncategorized } = detectSeriesByPattern(videos);

    await updateAuditProgress(auditId, {
      step: 'series_detection',
      pct: 22,
      message: `Found ${patternSeries.length} pattern series, analyzing ${uncategorized.length} remaining videos...`,
    });

    // Pass 2: Semantic detection on uncategorized videos
    const existingNames = patternSeries.map(s => s.name);
    const semanticSeries = await detectSeriesBySemantic(uncategorized, existingNames, auditId);

    // Merge (semantic series only if they don't heavily overlap with pattern series)
    const allSeries = [...patternSeries];
    for (const semantic of semanticSeries) {
      const overlap = allSeries.some(existing => {
        const overlapCount = semantic.videoIds.filter(id => existing.videoIds.includes(id)).length;
        return overlapCount / semantic.videoIds.length > 0.5;
      });
      if (!overlap) {
        allSeries.push(semantic);
      }
    }

    // Calculate metrics for each series
    const videoMap = new Map(videos.map(v => [v.youtube_video_id, v]));

    const seriesWithMetrics = allSeries.map(series => {
      const seriesVideos = series.videoIds
        .map(id => videoMap.get(id))
        .filter(Boolean);

      const totalViews = seriesVideos.reduce((s, v) => s + (v.view_count || 0), 0);
      const avgViews = seriesVideos.length > 0 ? totalViews / seriesVideos.length : 0;

      const engagementRates = seriesVideos.map(v => {
        const views = Math.max(v.view_count || 1, 1);
        return ((v.like_count || 0) + (v.comment_count || 0)) / views;
      });
      const avgEngagement = engagementRates.length > 0
        ? engagementRates.reduce((a, b) => a + b, 0) / engagementRates.length
        : 0;

      const dates = seriesVideos
        .map(v => v.published_at ? new Date(v.published_at) : null)
        .filter(Boolean)
        .sort((a, b) => a - b);

      let cadenceDays = null;
      if (dates.length >= 2) {
        const totalDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
        cadenceDays = Math.round(totalDays / (dates.length - 1));
      }

      // Determine trend
      let performanceTrend = 'stable';
      if (seriesVideos.length >= 4) {
        const half = Math.floor(seriesVideos.length / 2);
        const firstHalf = seriesVideos.slice(0, half);
        const secondHalf = seriesVideos.slice(half);
        const firstAvg = firstHalf.reduce((s, v) => s + (v.view_count || 0), 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((s, v) => s + (v.view_count || 0), 0) / secondHalf.length;
        if (secondAvg > firstAvg * 1.2) performanceTrend = 'growing';
        else if (secondAvg < firstAvg * 0.8) performanceTrend = 'declining';
      } else if (seriesVideos.length <= 3 && dates.length > 0) {
        const daysSinceFirst = (Date.now() - dates[0]) / (1000 * 60 * 60 * 24);
        if (daysSinceFirst < 180) performanceTrend = 'new';
      }

      return {
        ...series,
        videoCount: seriesVideos.length,
        totalViews,
        avgViews: Math.round(avgViews),
        avgEngagementRate: avgEngagement,
        firstPublished: dates[0]?.toISOString() || null,
        lastPublished: dates[dates.length - 1]?.toISOString() || null,
        cadenceDays,
        performanceTrend,
      };
    });

    // Sort by total views desc
    seriesWithMetrics.sort((a, b) => b.totalViews - a.totalViews);

    // Save to database
    await updateAuditProgress(auditId, { step: 'series_detection', pct: 28, message: 'Saving series data...' });

    const savedSeries = await upsertDetectedSeries(seriesWithMetrics, channelId, auditId);

    // Assign videos to series
    for (let i = 0; i < savedSeries.length; i++) {
      const original = seriesWithMetrics[i];
      if (original && savedSeries[i]) {
        await assignVideosToSeries(savedSeries[i].id, original.videoIds);
      }
    }

    const uncategorizedCount = videos.length - seriesWithMetrics.reduce((s, se) => s + se.videoCount, 0);

    const seriesSummary = {
      series: seriesWithMetrics.map(s => ({
        name: s.name,
        detectionMethod: s.detectionMethod,
        videoCount: s.videoCount,
        totalViews: s.totalViews,
        avgViews: s.avgViews,
        avgEngagementRate: s.avgEngagementRate,
        firstPublished: s.firstPublished,
        lastPublished: s.lastPublished,
        cadenceDays: s.cadenceDays,
        performanceTrend: s.performanceTrend,
      })),
      uncategorized_count: uncategorizedCount,
      total_series: seriesWithMetrics.length,
    };

    await updateAuditProgress(auditId, { step: 'series_detection', pct: 30, message: `Detected ${seriesWithMetrics.length} series` });
    await updateAuditSection(auditId, 'series_detection', {
      status: 'completed',
      result_data: seriesSummary,
    });

    return seriesSummary;

  } catch (err) {
    await updateAuditSection(auditId, 'series_detection', {
      status: 'failed',
      error_message: err.message,
    });
    throw err;
  }
}
