/**
 * Atomizer Service
 * Full View Analytics - Crux Media
 *
 * Analyzes transcripts with Claude to extract clips, shorts, and quotes
 * scored by virality. Results stored in Supabase.
 */

import { supabase } from './supabaseClient';
import { claudeAPI } from './claudeAPI';

// ============================================
// SYSTEM PROMPT
// ============================================

const ATOMIZER_SYSTEM_PROMPT = `You are a YouTube content strategist specializing in repurposing long-form content into high-performing short-form pieces. Analyze the provided transcript and extract the best opportunities for clips, shorts, and quotable moments.

Respond with ONLY a JSON object (no markdown, no code fences) in this exact format:
{
  "clips": [
    {
      "title": "Compelling clip title",
      "startTimecode": "MM:SS or HH:MM:SS",
      "endTimecode": "MM:SS or HH:MM:SS",
      "transcript_excerpt": "Key excerpt from this segment (2-3 sentences)",
      "hook": "The opening hook line for the clip",
      "viralityScore": 8,
      "rationale": "Why this segment would perform well as a standalone clip"
    }
  ],
  "shorts": [
    {
      "title": "Short-form title (under 60 chars)",
      "timecode": "MM:SS approximate location in transcript",
      "transcript_excerpt": "The key moment (1-2 sentences)",
      "hook": "Opening hook optimized for vertical format",
      "viralityScore": 7,
      "rationale": "Why this works as a YouTube Short",
      "suggestedCTA": "Call to action for the Short"
    }
  ],
  "quotes": [
    {
      "text": "The exact quotable line",
      "timecode": "MM:SS approximate location",
      "viralityScore": 6,
      "suggestedVisual": "Visual treatment suggestion for this quote card"
    }
  ],
  "summary": "One-paragraph summary of the transcript's main themes and repurposing potential",
  "totalAtomizedPieces": 12
}

Guidelines:
- Clips: 2-5 minute segments that work as standalone YouTube videos. Look for complete stories, strong arguments, or surprising reveals.
- Shorts: Under 60 seconds. Look for punchy moments, hot takes, surprising stats, emotional peaks.
- Quotes: Single sentences or short phrases that work as quote cards for social media.
- Virality scores 1-10: 8-10 = high viral potential, 5-7 = solid content, 1-4 = niche value.
- If timecodes aren't available, estimate based on position in the transcript (beginning, middle, end).
- Extract at least 3 clips, 3 shorts, and 3 quotes when the transcript is long enough.`;

// ============================================
// TRANSCRIPT ANALYSIS
// ============================================

/**
 * Analyze a transcript using Claude to extract atomized content pieces.
 *
 * @param {string} text - The transcript text
 * @param {string} title - Title for the transcript
 * @returns {Promise<Object>} Parsed atomizer results
 */
export async function analyzeTranscript(text, title = 'Untitled') {
  const wordCount = text.trim().split(/\s+/).length;

  const prompt = `Analyze this transcript and extract the best clips, shorts, and quotes:

Title: ${title}
Word Count: ${wordCount}

--- TRANSCRIPT ---
${text}
--- END TRANSCRIPT ---`;

  const result = await claudeAPI.call(prompt, ATOMIZER_SYSTEM_PROMPT, 'atomizer', 4096);

  // Parse JSON response (handle markdown code block wrapping)
  let parsed;
  try {
    let responseText = result.text.trim();
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error('Failed to parse atomizer response. The AI returned an unexpected format.');
  }

  return {
    ...parsed,
    usage: result.usage,
    cost: result.cost,
  };
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Save a transcript to Supabase.
 *
 * @param {Object} transcript
 * @param {string} transcript.title
 * @param {string} transcript.text
 * @param {string} transcript.sourceType - 'paste' | 'youtube_captions' | 'upload'
 * @param {string} [transcript.sourceUrl]
 * @param {string} [transcript.clientId]
 * @returns {Promise<Object>} Saved transcript record
 */
export async function saveTranscript({ title, text, sourceType = 'paste', sourceUrl, clientId }) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('transcripts')
    .insert({
      title,
      transcript_text: text,
      source_type: sourceType,
      source_url: sourceUrl || null,
      client_id: clientId || null,
      word_count: text.trim().split(/\s+/).length,
      created_by: user?.id || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Mark a transcript as analyzed.
 */
export async function markTranscriptAnalyzed(transcriptId, model = 'claude-sonnet-4-5') {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('transcripts')
    .update({ analyzed_at: new Date().toISOString(), analysis_model: model })
    .eq('id', transcriptId);

  if (error) throw error;
}

/**
 * Save atomized content items from analysis results.
 *
 * @param {string} transcriptId - UUID of the parent transcript
 * @param {Object} analysisResults - Parsed atomizer response (clips, shorts, quotes)
 * @param {string} [clientId]
 * @returns {Promise<Array>} Saved atomized content records
 */
export async function saveAtomizedContent(transcriptId, analysisResults, clientId) {
  if (!supabase) throw new Error('Supabase not configured');

  const items = [];

  // Map clips
  (analysisResults.clips || []).forEach(clip => {
    items.push({
      transcript_id: transcriptId,
      client_id: clientId || null,
      content_type: 'clip',
      title: clip.title,
      timecode_start: clip.startTimecode,
      timecode_end: clip.endTimecode,
      transcript_excerpt: clip.transcript_excerpt,
      hook: clip.hook,
      virality_score: clip.viralityScore,
      rationale: clip.rationale,
      status: 'suggested',
    });
  });

  // Map shorts
  (analysisResults.shorts || []).forEach(short => {
    items.push({
      transcript_id: transcriptId,
      client_id: clientId || null,
      content_type: 'short',
      title: short.title,
      timecode_start: short.timecode,
      transcript_excerpt: short.transcript_excerpt,
      hook: short.hook,
      virality_score: short.viralityScore,
      rationale: short.rationale,
      suggested_cta: short.suggestedCTA,
      status: 'suggested',
    });
  });

  // Map quotes
  (analysisResults.quotes || []).forEach(quote => {
    items.push({
      transcript_id: transcriptId,
      client_id: clientId || null,
      content_type: 'quote',
      transcript_excerpt: quote.text,
      timecode_start: quote.timecode,
      virality_score: quote.viralityScore,
      suggested_visual: quote.suggestedVisual,
      status: 'suggested',
    });
  });

  if (!items.length) return [];

  const { data, error } = await supabase
    .from('atomized_content')
    .insert(items)
    .select();

  if (error) throw error;
  return data;
}

/**
 * Create a brief from an approved atomized content item.
 *
 * @param {string} atomizedContentId
 * @param {string} clientId
 * @returns {Promise<Object>} Created brief record
 */
export async function createBriefFromAtomized(atomizedContentId, clientId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: { user } } = await supabase.auth.getUser();

  // Get the atomized content item
  const { data: item, error: fetchError } = await supabase
    .from('atomized_content')
    .select('*')
    .eq('id', atomizedContentId)
    .single();

  if (fetchError) throw fetchError;

  // Create the brief
  const { data: brief, error: briefError } = await supabase
    .from('briefs')
    .insert({
      client_id: clientId || item.client_id,
      title: item.title || item.transcript_excerpt?.slice(0, 60) || 'Untitled Brief',
      status: 'draft',
      source_type: 'atomizer',
      source_id: atomizedContentId,
      brief_data: {
        content_type: item.content_type,
        hook: item.hook,
        transcript_excerpt: item.transcript_excerpt,
        timecode_start: item.timecode_start,
        timecode_end: item.timecode_end,
        virality_score: item.virality_score,
        rationale: item.rationale,
        suggested_cta: item.suggested_cta,
        suggested_visual: item.suggested_visual,
      },
      created_by: user?.id || null,
    })
    .select()
    .single();

  if (briefError) throw briefError;

  // Update atomized content status
  await supabase
    .from('atomized_content')
    .update({
      status: 'brief_created',
      brief_id: brief.id,
      reviewed_by: user?.id || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', atomizedContentId);

  return brief;
}

/**
 * Get transcripts for a client, ordered by most recent.
 */
export async function getTranscripts(clientId, { limit = 20 } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  let query = supabase
    .from('transcripts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Get atomized content for a transcript.
 */
export async function getAtomizedContent(transcriptId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('atomized_content')
    .select('*')
    .eq('transcript_id', transcriptId)
    .order('virality_score', { ascending: false });

  if (error) throw error;
  return data;
}

export default {
  analyzeTranscript,
  saveTranscript,
  markTranscriptAnalyzed,
  saveAtomizedContent,
  createBriefFromAtomized,
  getTranscripts,
  getAtomizedContent,
};
