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
      strategic_goals: contextData.strategic_goals || {},
      resource_constraints: contextData.resource_constraints || {},
      content_boundaries: contextData.content_boundaries || {},
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

/**
 * Look up a channel by youtube_channel_id and return its current brand context.
 * Useful in the audit flow when we have a YouTube ID but not the internal UUID.
 */
export async function getContextByYoutubeChannelId(youtubeChannelId) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!youtubeChannelId) return { channelId: null, context: null };

  const { data: channel } = await supabase
    .from('channels')
    .select('id')
    .eq('youtube_channel_id', youtubeChannelId)
    .maybeSingle();

  if (!channel) return { channelId: null, context: null };

  const context = await getCurrentBrandContext(channel.id);
  return { channelId: channel.id, context };
}

/**
 * Search channels by name (for brand context page channel picker).
 * Returns all channels, not just clients.
 */
export async function searchChannels(query, limit = 10) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!query || !query.trim()) return [];

  const { data, error } = await supabase
    .from('channels')
    .select('id, name, thumbnail_url, subscriber_count, is_client, is_competitor, youtube_channel_id')
    .ilike('name', `%${query.trim()}%`)
    .order('subscriber_count', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[brandContext] Search error:', error);
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
  audit_summary: ['brand_voice', 'messaging_priorities', 'audience_signals', 'strategic_goals'],
  audit_opportunities: ['brand_voice', 'messaging_priorities', 'content_themes', 'audience_signals', 'strategic_goals', 'resource_constraints', 'content_boundaries'],
  audit_recommendations: ['brand_voice', 'messaging_priorities', 'content_themes', 'audience_signals', 'strategic_goals', 'resource_constraints', 'content_boundaries'],
  executive_narrative: ['messaging_priorities', 'content_themes', 'strategic_goals'],
  competitor_insight: ['brand_voice', 'messaging_priorities'],
  video_ideation: ['brand_voice', 'messaging_priorities', 'content_themes', 'audience_signals', 'strategic_goals', 'resource_constraints', 'content_boundaries'],
  content_intelligence: ['brand_voice', 'messaging_priorities', 'content_themes', 'audience_signals', 'strategic_goals', 'resource_constraints', 'content_boundaries'],
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
  strategic_goals: 'Strategic Goals',
  resource_constraints: 'Resource Constraints',
  content_boundaries: 'Content Boundaries',
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
    // Extended computed signals (from audienceSignalService)
    if (data._computed) {
      const c = data._computed;
      if (c.optimal_duration?.sweet_spots?.length) {
        c.optimal_duration.sweet_spots.forEach(s => {
          lines.push(`- Optimal video duration: ${s.range} (${s.count} videos, avg ${Math.round(s.avg_views).toLocaleString()} views, ${Math.round(s.avg_retention * 100)}% retention)`);
        });
      }
      if (c.posting_patterns?.best_days?.length) {
        lines.push(`- Best posting days: ${c.posting_patterns.best_days.join(', ')}`);
      }
      if (c.posting_patterns?.frequency_insight) {
        lines.push(`- Frequency insight: ${c.posting_patterns.frequency_insight}`);
      }
      if (c.growth_signals?.subscriber_velocity) {
        const sv = c.growth_signals.subscriber_velocity;
        lines.push(`- Subscriber trend: ${sv.trend} (${sv.recent_30d.toLocaleString()} gained last 30d, ${sv.ratio}x vs prior period)`);
      }
      if (c.subscriber_drivers?.length) {
        c.subscriber_drivers.slice(0, 3).forEach(d => {
          lines.push(`- Subscriber driver: ${d.attribute} (${d.note})`);
        });
      }
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
  } else if (key === 'strategic_goals') {
    if (data.current_phase) {
      lines.push(`- Current phase: ${data.current_phase}${data.phase_notes ? ' — ' + data.phase_notes : ''}`);
    }
    if (data.business_objectives?.length) {
      lines.push(`- Business objectives: ${data.business_objectives.join(', ')}`);
    }
    if (data.kpis?.length) {
      lines.push(`- Key KPIs: ${data.kpis.join(', ')}`);
    }
    if (data.growth_targets?.length) {
      data.growth_targets.forEach(t => {
        lines.push(`- Target: ${t.target} ${t.metric}${t.timeframe ? ' within ' + t.timeframe : ''}${t.notes ? ' — ' + t.notes : ''}`);
      });
    }
  } else if (key === 'resource_constraints') {
    if (data.publishing_cadence) {
      const c = data.publishing_cadence;
      lines.push(`- Publishing cadence: ${c.videos_per_period} videos per ${c.period}${c.notes ? ' — ' + c.notes : ''}`);
    }
    if (data.production_capability) {
      const p = data.production_capability;
      const parts = [];
      if (p.team_size) parts.push(`${p.team_size}-person team`);
      if (p.equipment_level) parts.push(`${p.equipment_level} equipment`);
      if (p.editing) parts.push(`${p.editing} editing`);
      if (parts.length) lines.push(`- Production: ${parts.join(', ')}`);
    }
    if (data.budget_tier) {
      lines.push(`- Budget tier: ${data.budget_tier.replace(/_/g, ' ')}`);
    }
    if (data.talent?.length) {
      data.talent.forEach(t => {
        lines.push(`- Talent: ${t.name} (${t.availability}, ${t.comfort_level})${t.notes ? ' — ' + t.notes : ''}`);
      });
    }
    if (data.turnaround?.concept_to_publish) {
      lines.push(`- Turnaround: ${data.turnaround.concept_to_publish}${data.turnaround.notes ? ' — ' + data.turnaround.notes : ''}`);
    }
  } else if (key === 'content_boundaries') {
    if (data.topics_to_avoid?.length) {
      lines.push(`- Topics to avoid: ${data.topics_to_avoid.join(', ')}`);
    }
    if (data.format_constraints) {
      const f = data.format_constraints;
      const parts = [];
      if (f.max_duration) parts.push(`max ${f.max_duration} min`);
      if (f.min_duration) parts.push(`min ${f.min_duration} min`);
      if (f.no_shorts) parts.push('no Shorts');
      if (f.no_livestreams) parts.push('no livestreams');
      if (parts.length) lines.push(`- Format constraints: ${parts.join(', ')}`);
      if (f.notes) lines.push(`- Format notes: ${f.notes}`);
    }
    if (data.compliance?.length) {
      data.compliance.forEach(c => lines.push(`- Compliance: ${c}`));
    }
    if (data.sponsorship_guidelines) {
      lines.push(`- Sponsorship guidelines: ${data.sponsorship_guidelines}`);
    }
    if (data.tone_boundaries?.length) {
      lines.push(`- Tone boundaries: ${data.tone_boundaries.join(', ')}`);
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
 * @param {Object} options - { computedSignals } from audienceSignalService
 * @returns {string} Prompt block wrapped in <brand_context> tags, or empty string
 */
export function buildBrandContextForTask(context, task, { computedSignals } = {}) {
  if (!context) return '';

  const relevantKeys = TASK_SECTIONS[task] || Object.keys(SECTION_LABELS);
  const sections = [];

  for (const key of relevantKeys) {
    let data = context[key];
    // Merge computed audience signals with manual data
    if (key === 'audience_signals' && computedSignals) {
      data = mergeAudienceSignals(data, computedSignals);
    }
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

// ─── AUDIENCE SIGNAL MERGE ─────────────────────────────────────────────────────

/**
 * Merge auto-computed audience signals with manually-entered brand context signals.
 * Manual entries take precedence (override layer).
 */
export function mergeAudienceSignals(manualSignals, computedSignals) {
  if (!computedSignals) return manualSignals || {};
  if (!manualSignals || Object.keys(manualSignals).length === 0) return computedSignals;

  const merged = { ...computedSignals };

  // high_engagement_formats: computed first, manual overrides by format name
  if (manualSignals.high_engagement_formats?.length) {
    const manualFormats = new Set(manualSignals.high_engagement_formats.map(f => f.format?.toLowerCase()));
    const filtered = (merged.high_engagement_formats || []).filter(
      f => !manualFormats.has(f.format?.toLowerCase())
    );
    merged.high_engagement_formats = [...filtered, ...manualSignals.high_engagement_formats];
  }

  // content_gaps: computed first, then manual appended
  if (manualSignals.content_gaps?.length) {
    merged.content_gaps = [...(merged.content_gaps || []), ...manualSignals.content_gaps];
  }

  // audience_demographics_observed: manual always wins completely
  if (manualSignals.audience_demographics_observed &&
      Object.keys(manualSignals.audience_demographics_observed).length > 0 &&
      manualSignals.audience_demographics_observed.interest_clusters?.length) {
    merged.audience_demographics_observed = manualSignals.audience_demographics_observed;
  }

  return merged;
}

/**
 * Convenience helper: fetch brand context + compute audience signals, return prompt block.
 * Replaces the 2-step pattern used across multiple callers.
 */
export async function getBrandContextWithSignals(channelId, task) {
  const bc = await getCurrentBrandContext(channelId);
  if (!bc) return '';

  let computedSignals = null;
  try {
    const { computeAudienceSignals } = await import('./audienceSignalService');
    computedSignals = await computeAudienceSignals(channelId);
  } catch (e) {
    console.warn('[brandContext] Computed audience signals unavailable:', e.message);
  }

  return buildBrandContextForTask(bc, task, { computedSignals });
}
