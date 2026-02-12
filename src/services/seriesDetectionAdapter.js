/**
 * Series Detection Adapter for Performance Tab
 *
 * Bridges the Performance tab's row shape to the detection functions
 * in seriesDetection.js, and provides a standalone semantic detection
 * function that doesn't depend on audit infrastructure.
 */

import { detectSeriesByPattern } from './seriesDetection';
import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';

// ============================================
// Row shape adaptation
// ============================================

function adaptRow(row) {
  return {
    title: row.title,
    youtube_video_id: row.youtubeVideoId || row.video_id || row.title,
    view_count: row.views || 0,
    video_type: row.type || 'long',
    published_at: row.publishDate || null,
    _original: row,
  };
}

// ============================================
// Pass 1: Pattern Detection (instant, free)
// ============================================

export function runPatternDetection(rows) {
  if (!rows || rows.length === 0) return { patternSeries: [], uncategorizedRows: [] };

  const adapted = rows.map(adaptRow);
  const idToRow = new Map(adapted.map(a => [a.youtube_video_id, a._original]));

  const { patternSeries, uncategorized } = detectSeriesByPattern(adapted);

  return {
    patternSeries: patternSeries.map(s => ({
      name: s.name,
      videos: s.videoIds.map(id => idToRow.get(id)).filter(Boolean),
      detectionMethod: 'pattern',
    })),
    uncategorizedRows: uncategorized.map(v => idToRow.get(v.youtube_video_id)).filter(Boolean),
  };
}

// ============================================
// Pass 2: Semantic Detection (user-initiated)
// ============================================

const SYSTEM_PROMPT = `You are a YouTube content analyst. Given a list of video titles from one channel, identify recurring content series or thematic groupings.

A "series" is 3+ videos that share a common theme, format, or subject that the creator treats as a recurring concept — even if they don't formally name it.

Rules:
- Only include groupings with 3+ videos
- Use clear, descriptive series names
- A video can only belong to one series
- Focus on recurring INTENT, not just keyword overlap
- Return ONLY valid JSON, no other text`;

export async function runSemanticDetection(uncategorizedRows, existingSeriesNames = []) {
  if (uncategorizedRows.length < 5) return [];

  const capped = uncategorizedRows.slice(0, 100);

  const prompt = `Here are ${capped.length} video titles from a YouTube channel that don't match obvious title patterns.

Already-detected series (via pattern matching): ${existingSeriesNames.length > 0 ? existingSeriesNames.join(', ') : 'None'}

Videos:
${capped.map((r, i) => `${i}. "${r.title}" (${(r.views || 0).toLocaleString()} views)`).join('\n')}

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

  const result = await claudeAPI.call(prompt, SYSTEM_PROMPT, 'series_analysis_ai', 2000);
  const parsed = parseClaudeJSON(result.text, { series: [] });

  return (parsed.series || [])
    .filter(s => s.videoIndices && s.videoIndices.length >= 3)
    .map(s => ({
      name: s.name,
      videos: s.videoIndices.map(idx => capped[idx]).filter(Boolean),
      detectionMethod: 'semantic',
      confidence: s.confidence || 'medium',
    }))
    .filter(s => s.videos.length >= 3);
}

// ============================================
// Cost estimation
// ============================================

export function estimateAICost(videoCount) {
  const capped = Math.min(videoCount, 100);
  // ~40 chars per title line, plus system prompt (~400 chars), plus response (~1500 tokens)
  const inputChars = 400 + capped * 50;
  const inputTokens = Math.ceil(inputChars / 4);
  const outputTokens = 1500;
  const cost = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
  return `~$${cost.toFixed(3)}`;
}
