/**
 * Brand Context Service
 * CRUD operations for brand context, Claude-powered extraction from pasted content,
 * and prompt injection helpers for enriching Claude API outputs with brand intelligence.
 */

import { supabase } from './supabaseClient';
import claudeAPI from './claudeAPI';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';

// ─── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * Fetch the current (active) brand context for a channel.
 * Returns null if no context exists.
 */
export async function getCurrentBrandContext(channelId) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!channelId) return null;

  const { data, error } = await supabase
    .from('brand_context')
    .select('*')
    .eq('channel_id', channelId)
    .eq('is_current', true)
    .maybeSingle();

  if (error) {
    console.error('[brandContext] Error fetching current context:', error);
    return null;
  }
  return data;
}

/**
 * Save a new brand context snapshot. Marks any existing current snapshot
 * as historical (is_current = false) before inserting the new one.
 */
export async function saveBrandContext(channelId, contextData) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!channelId) throw new Error('channelId is required');

  // Mark any existing current snapshot as historical
  const { error: unsetError } = await supabase
    .from('brand_context')
    .update({ is_current: false })
    .eq('channel_id', channelId)
    .eq('is_current', true);

  if (unsetError) {
    console.error('[brandContext] Error unsetting current:', unsetError);
    // Continue anyway — the unique index will prevent duplicates
  }

  // Insert new snapshot
  const { data, error } = await supabase
    .from('brand_context')
    .insert({
      channel_id: channelId,
      is_current: true,
      snapshot_date: new Date().toISOString(),
      brand_voice: contextData.brand_voice || {},
      messaging_priorities: contextData.messaging_priorities || {},
      audience_signals: contextData.audience_signals || {},
      content_themes: contextData.content_themes || {},
      visual_identity: contextData.visual_identity || {},
      platform_presence: contextData.platform_presence || {},
      source_urls: contextData.source_urls || {},
      raw_extraction: contextData.raw_extraction || null,
      extraction_model: contextData.extraction_model || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * List all brand context snapshots for a channel, newest first.
 */
export async function getBrandContextHistory(channelId) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!channelId) return [];

  const { data, error } = await supabase
    .from('brand_context')
    .select('id, snapshot_date, is_current, extraction_model, created_at')
    .eq('channel_id', channelId)
    .order('snapshot_date', { ascending: false });

  if (error) {
    console.error('[brandContext] Error fetching history:', error);
    return [];
  }
  return data || [];
}

// ─── EXTRACTION ────────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a brand analyst extracting structured brand intelligence from website content and social media posts. Given raw content from a brand's online presence, extract a comprehensive brand context profile.

Return ONLY valid JSON (no markdown fences, no commentary), starting with { and ending with }.

The JSON must have exactly these top-level keys:
- brand_voice
- messaging_priorities
- audience_signals
- content_themes
- visual_identity
- platform_presence

Be specific and cite which content informed each observation. If information for a section is not available in the provided content, return an empty object {} for that section.`;

/**
 * Send pasted raw content to Claude for structured brand context extraction.
 * Returns the extracted context data (parsed JSON) plus metadata.
 */
export async function extractBrandContext(rawText, brandName) {
  if (!rawText || !rawText.trim()) {
    throw new Error('No content provided for extraction');
  }

  const prompt = `Extract a brand context profile for "${brandName}" from the following content.

Focus on:
1. Brand voice — how do they communicate? What language patterns emerge? What tone descriptors apply?
2. Current priorities — what are they pushing right now commercially? Active campaigns, product focus, primary CTAs
3. Audience signals — what content formats get disproportionate engagement? What content gaps exist?
4. Content themes — what topics recur across their content? Any seasonal patterns?
5. Visual identity — what does their visual language communicate? Color palette, photography style, thumbnail implications
6. Platform presence — per-platform breakdown if multiple platforms are represented

Return this exact JSON structure:
{
  "brand_voice": {
    "primary_attributes": ["attribute1", "attribute2"],
    "tone_descriptors": ["description of tone"],
    "language_patterns": {
      "frequently_used_phrases": [],
      "avoided_language": [],
      "hashtags": []
    },
    "voice_summary": "One paragraph summary of the brand voice"
  },
  "messaging_priorities": {
    "current_campaigns": [{"name": "", "status": "active|upcoming", "description": "", "priority_signal": "high|medium|low"}],
    "product_focus": [{"product_line": "", "emphasis_level": "primary|secondary", "detected_from": []}],
    "primary_ctas": [{"action": "", "placement": []}],
    "strategic_themes": []
  },
  "audience_signals": {
    "high_engagement_formats": [{"format": "", "platform": "", "signal_strength": "strong|moderate|weak", "notes": ""}],
    "audience_demographics_observed": {"age_skew": "", "interest_clusters": [], "notes": ""},
    "content_gaps": [{"observation": "", "youtube_opportunity": ""}]
  },
  "content_themes": {
    "themes": [{"theme": "", "frequency": "high|medium|low", "platforms": [], "sub_topics": []}],
    "seasonal_patterns": [{"period": "", "themes": []}]
  },
  "visual_identity": {
    "color_palette": {"primary": [], "usage_notes": ""},
    "photography_style": {"dominant_approach": "", "notes": ""},
    "thumbnail_implications": []
  },
  "platform_presence": {}
}

---

RAW CONTENT:

${rawText.slice(0, 80000)}`;

  const result = await claudeAPI.call(
    prompt,
    EXTRACTION_SYSTEM_PROMPT,
    'brand_context_extraction',
    4096
  );

  const parsed = parseClaudeJSON(result.text, {
    brand_voice: {},
    messaging_priorities: {},
    audience_signals: {},
    content_themes: {},
    visual_identity: {},
    platform_presence: {},
  });

  return {
    ...parsed,
    raw_extraction: result.text,
    extraction_model: 'claude-sonnet-4-5',
    usage: result.usage,
    cost: result.cost,
  };
}

// ─── PROMPT INJECTION ──────────────────────────────────────────────────────────

/**
 * Which context sections to include per task type.
 */
const TASK_SECTIONS = {
  audit_summary: ['brand_voice', 'messaging_priorities', 'audience_signals'],
  audit_opportunities: ['brand_voice', 'messaging_priorities', 'content_themes', 'audience_signals'],
  audit_recommendations: ['brand_voice', 'messaging_priorities', 'content_themes', 'audience_signals'],
  executive_narrative: ['messaging_priorities', 'content_themes'],
  competitor_insight: ['brand_voice', 'messaging_priorities'],
};

/**
 * Section display names for the prompt.
 */
const SECTION_LABELS = {
  brand_voice: 'Brand Voice',
  messaging_priorities: 'Current Messaging Priorities',
  audience_signals: 'Cross-Platform Audience Signals',
  content_themes: 'Recurring Content Themes',
  visual_identity: 'Visual Identity',
  platform_presence: 'Platform Presence',
};

/**
 * Convert a JSONB section into readable bullet-point prose for Claude.
 * This is more token-efficient and comprehensible than raw JSON.stringify.
 */
function formatSection(key, data) {
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    return '';
  }

  const lines = [];

  if (key === 'brand_voice') {
    if (data.primary_attributes?.length) {
      lines.push(`- Primary attributes: ${data.primary_attributes.join(', ')}`);
    }
    if (data.tone_descriptors?.length) {
      data.tone_descriptors.forEach(t => lines.push(`- Tone: ${t}`));
    }
    if (data.language_patterns?.frequently_used_phrases?.length) {
      lines.push(`- Key phrases: ${data.language_patterns.frequently_used_phrases.join(', ')}`);
    }
    if (data.language_patterns?.avoided_language?.length) {
      lines.push(`- Avoids: ${data.language_patterns.avoided_language.join(', ')}`);
    }
    if (data.voice_summary) {
      lines.push(`- Summary: ${data.voice_summary}`);
    }
  } else if (key === 'messaging_priorities') {
    if (data.current_campaigns?.length) {
      data.current_campaigns.forEach(c => {
        lines.push(`- Campaign: ${c.name} (${c.status}, ${c.priority_signal} priority) — ${c.description || ''}`);
      });
    }
    if (data.product_focus?.length) {
      data.product_focus.forEach(p => {
        lines.push(`- Product focus: ${p.product_line} (${p.emphasis_level})`);
      });
    }
    if (data.primary_ctas?.length) {
      data.primary_ctas.forEach(c => {
        lines.push(`- CTA: ${c.action}`);
      });
    }
    if (data.strategic_themes?.length) {
      lines.push(`- Strategic themes: ${data.strategic_themes.join(', ')}`);
    }
  } else if (key === 'audience_signals') {
    if (data.high_engagement_formats?.length) {
      data.high_engagement_formats.forEach(f => {
        lines.push(`- High-engagement format: ${f.format} (${f.platform}, ${f.signal_strength})${f.notes ? ' — ' + f.notes : ''}`);
      });
    }
    if (data.content_gaps?.length) {
      data.content_gaps.forEach(g => {
        lines.push(`- Content gap: ${g.observation}${g.youtube_opportunity ? ' → YouTube opportunity: ' + g.youtube_opportunity : ''}`);
      });
    }
    if (data.audience_demographics_observed?.interest_clusters?.length) {
      lines.push(`- Audience interests: ${data.audience_demographics_observed.interest_clusters.join(', ')}`);
    }
  } else if (key === 'content_themes') {
    if (data.themes?.length) {
      data.themes.forEach(t => {
        lines.push(`- Theme: ${t.theme} (${t.frequency} frequency)${t.sub_topics?.length ? ' — subtopics: ' + t.sub_topics.join(', ') : ''}`);
      });
    }
    if (data.seasonal_patterns?.length) {
      data.seasonal_patterns.forEach(s => {
        lines.push(`- Seasonal (${s.period}): ${s.themes?.join(', ') || ''}`);
      });
    }
  } else if (key === 'visual_identity') {
    if (data.color_palette?.primary?.length) {
      lines.push(`- Brand colors: ${data.color_palette.primary.join(', ')}${data.color_palette.usage_notes ? ' — ' + data.color_palette.usage_notes : ''}`);
    }
    if (data.photography_style?.dominant_approach) {
      lines.push(`- Photography: ${data.photography_style.dominant_approach}`);
    }
    if (data.thumbnail_implications?.length) {
      data.thumbnail_implications.forEach(t => lines.push(`- Thumbnail guidance: ${t}`));
    }
  } else if (key === 'platform_presence') {
    for (const [platform, info] of Object.entries(data)) {
      if (info && typeof info === 'object') {
        const parts = [];
        if (info.follower_count) parts.push(`${info.follower_count.toLocaleString()} followers`);
        if (info.posting_frequency) parts.push(info.posting_frequency);
        if (info.engagement_rate_estimate) parts.push(`${info.engagement_rate_estimate} engagement`);
        if (info.notes) parts.push(info.notes);
        lines.push(`- ${platform}: ${parts.join(', ')}`);
      }
    }
  } else {
    // Fallback: compact JSON for unknown sections
    lines.push(JSON.stringify(data, null, 2));
  }

  return lines.join('\n');
}

/**
 * Build a prompt injection block for a specific task type.
 * Only includes sections relevant to the task. Returns empty string if
 * context is null or has no relevant data.
 *
 * @param {Object|null} context - A brand_context row from Supabase
 * @param {string} task - One of: audit_summary, audit_opportunities, audit_recommendations, executive_narrative, competitor_insight
 * @returns {string} Prompt block wrapped in <brand_context> tags, or empty string
 */
export function buildBrandContextForTask(context, task) {
  if (!context) return '';

  const relevantKeys = TASK_SECTIONS[task] || Object.keys(SECTION_LABELS);
  const sections = [];

  for (const key of relevantKeys) {
    const data = context[key];
    const formatted = formatSection(key, data);
    if (formatted) {
      sections.push(`## ${SECTION_LABELS[key] || key}\n${formatted}`);
    }
  }

  if (sections.length === 0) return '';

  return `Use the following brand context to make your analysis commercially aligned and brand-aware. Reference the brand's actual priorities, voice, and audience signals in your output.

<brand_context>
${sections.join('\n\n')}
</brand_context>`;
}
