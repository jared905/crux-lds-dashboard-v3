/**
 * Atomizer Service — V2
 * Full View Analytics - Crux Media
 *
 * Two-pass architecture:
 *   Pass 1 — Analyze transcript → extract long-form & short-form edit directions
 *   Pass 2 — Remix selected elements → synthesize a final production brief
 *
 * Results stored in Supabase (atomized_content + briefs tables).
 */

import { supabase } from './supabaseClient';
import { claudeAPI } from './claudeAPI';
import { getBrandContextWithSignals, getCurrentBrandContext } from './brandContextService';
import { parseClaudeJSON } from '../lib/parseClaudeJSON';

// ============================================
// LEGACY SYSTEM PROMPT (V1 — clips/shorts/quotes)
// ============================================

const ATOMIZER_LEGACY_PROMPT = `You are a YouTube content strategist specializing in repurposing long-form content into high-performing short-form pieces. Analyze the provided transcript and extract the best opportunities for clips, shorts, and quotable moments.

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
// V2 SYSTEM PROMPT — Edit Directions
// ============================================

const ATOMIZER_V2_SYSTEM_PROMPT = `You are a YouTube editor and content strategist. Your job is to analyze a transcript and propose EDIT DIRECTIONS — complete, editor-ready video concepts that an editor can execute using only the existing material.

You will produce two categories:

1. LONG-FORM EDIT DIRECTIONS — standalone YouTube videos (5-20 minutes)
2. SHORT-FORM EDIT DIRECTIONS — YouTube Shorts / Reels (15-60 seconds)

CRITICAL RULES:
- Every hook MUST use EXACT WORDS from the transcript. Quote the speaker verbatim — do not paraphrase, summarize, or invent.
- Do not suggest content, topics, or dialogue that does not exist in the transcript.
- Title variations must use these specific styles:
  - "curiosity_gap": Creates an information gap the viewer needs to close
  - "direct_value": States the benefit or takeaway clearly
  - "pattern_interrupt": Breaks expectations or uses unexpected framing
- Thumbnail suggestions must reference a SPECIFIC moment from the transcript that has visual or emotional energy.
- Narrative arcs should specify which transcript sections to include and in what order.
- IMPORTANT: Most transcripts will NOT have precise timecodes. For timestamps and EDL references, use section descriptions (e.g., "Opening paragraph", "The story about X", "Closing remarks") rather than MM:SS. Only use MM:SS if the transcript contains actual timecodes.
- If context sections (strategy brief, performance data, audience persona, competitor benchmarks) are provided, actively use them to calibrate your recommendations. If any are missing, note this briefly in the summary and explain that those recommendations are more general as a result.
- Virality rationale MUST reference the strategy brief and performance data if provided. Do not give generic reasoning like "this has emotional resonance." Instead tie it to specific context: "This mirrors the hook structure of [top performer title] which drove X% CTR" or "This aligns with the stated goal of [strategy point]." If no context is provided, give the best reasoning you can based on the content itself.

Respond with ONLY a JSON object (no markdown, no code fences) in this exact format:
{
  "long_form_directions": [
    {
      "title": "Working title for the edit direction",
      "format_type": "long-form re-edit",
      "hook": "EXACT transcript words for the first 5-15 seconds — verbatim quote from the speaker",
      "hook_timecode": "MM:SS or section reference if no timecodes available",
      "arc_summary": "Narrative arc: describe the structure (setup > development > payoff) and which transcript sections to include, in what order",
      "title_variations": [
        { "text": "Title option 1", "style": "curiosity_gap" },
        { "text": "Title option 2", "style": "direct_value" },
        { "text": "Title option 3", "style": "pattern_interrupt" }
      ],
      "description": "YouTube description (2-3 short paragraphs with key takeaways and CTA)",
      "thumbnail_suggestion": {
        "concept": "What the thumbnail should communicate",
        "transcript_reference": "The specific moment from the transcript that inspires this — describe the visual or emotional beat",
        "visual_elements": ["element1", "element2", "element3"]
      },
      "estimated_duration": "8-12 min",
      "timestamps": [
        { "in": "Section or paragraph reference for segment start", "out": "Section or paragraph reference for segment end", "note": "What this segment covers" }
      ],
      "edl": [
        { "step": 1, "action": "COLD OPEN on hook quote", "segment": "Opening paragraph or section reference", "pacing": "Quick cut, 3-5 seconds" },
        { "step": 2, "action": "CUT TO main argument", "segment": "Section reference", "pacing": "Let it breathe, 45-60 sec" }
      ],
      "b_roll": [
        { "segment": "Which edit segment this applies to", "direction": "Specific B-roll visual description — not generic. Example: 'close-up of hands typing on keyboard, office environment, warm lighting'" }
      ],
      "motion_graphics": [
        { "timecode_ref": "When in the edit this appears (e.g., 'After hook lands, ~15 sec in')", "type": "lower_third", "content": "What the graphic says", "purpose": "Why it appears here (e.g., 'Builds credibility before the core argument')" }
      ],
      "virality_score": 8,
      "rationale": "1-2 sentences on why this edit direction would perform well — reference strategy brief, performance data, or competitor patterns if provided"
    }
  ],
  "short_form_directions": [
    {
      "title": "Short-form working title",
      "format_type": "YouTube Short",
      "hook": "EXACT transcript words for the first 1-3 seconds — verbatim",
      "hook_timecode": "MM:SS or section reference",
      "arc_summary": "Micro-arc: hook > core moment > punchline or CTA",
      "title_variations": [
        { "text": "Title option 1", "style": "curiosity_gap" },
        { "text": "Title option 2", "style": "direct_value" }
      ],
      "description": "Short description or caption for the Short",
      "thumbnail_suggestion": {
        "concept": "Cover frame concept",
        "transcript_reference": "Specific moment reference",
        "visual_elements": ["element1"]
      },
      "cta": "Call to action for the end of the Short",
      "estimated_duration": "30-45 sec",
      "timestamps": [
        { "in": "Section reference", "out": "Section reference", "note": "Segment description" }
      ],
      "edl": [
        { "step": 1, "action": "OPEN on hook", "segment": "Section reference", "pacing": "Immediate, no delay" }
      ],
      "b_roll": [
        { "segment": "Segment reference", "direction": "Specific B-roll description" }
      ],
      "motion_graphics": [
        { "timecode_ref": "When this appears", "type": "lower_third", "content": "What it says", "purpose": "Why it's here" }
      ],
      "virality_score": 7,
      "rationale": "Why this works as short-form content — reference context if provided"
    }
  ],
  "summary": "One paragraph summarizing the transcript's themes and the overall editorial strategy behind these directions. Note which context inputs informed the strategy and which were unavailable.",
  "total_directions": 8
}

Guidelines:
- Long-form: Propose 2-4 directions. Each should be a complete, editor-ready video concept with a clear narrative arc, full EDL, B-roll directions, and motion graphics notes. Think "editor's brief" — not just "this part was interesting."
- Short-form: Propose 3-5 directions. Punchy, hook-driven, optimized for vertical scroll-stopping. Every Short needs a powerful opener from the transcript, a clear CTA, and at least a short EDL with B-roll notes.
- Virality scores 1-10: Based on hook strength, topic novelty, emotional resonance, and alignment with the channel's proven performers.
- EDL: Write each step as an edit decision an editor can follow. State what plays, what the editor does (cut to, trim, hold on, J-cut, etc.), and any pacing notes.
- B-roll: Be SPECIFIC. Not "show person working" but "close-up of hands typing on keyboard, office environment, warm lighting." Reference what segment each B-roll accompanies.
- Motion graphics types: lower_third, title_card, stat_callout, animated_text, full_screen_text. State exactly what the graphic says and why it appears at that moment.
- Timestamps: If stitching multiple transcript segments, list each segment in order with its own in/out reference.
- If the transcript lacks timecodes, estimate position (beginning/middle/end) and reference by content (e.g., "The section about retirement planning").
- Prioritize moments with: emotional peaks, surprising data, contrarian takes, vulnerable admissions, strong storytelling, or concrete how-to value.`;

// ============================================
// REMIX SYSTEM PROMPT
// ============================================

const REMIX_SYSTEM_PROMPT = `You are a YouTube content director. The user has selected specific elements (hooks, arcs, titles, thumbnails, descriptions) from multiple edit directions proposed by the Atomizer. Your job is to SYNTHESIZE these into one cohesive, production-ready edit brief.

RULES:
- Hooks must remain exact transcript quotes — do not modify the verbatim language.
- Reconcile any conflicting arcs into a single coherent narrative.
- Pick the strongest title (or create a hybrid) from the selected options and explain why.
- The final brief should be something an editor can execute immediately.

Respond with ONLY a JSON object:
{
  "title": "Final chosen or hybrid title",
  "hook": "The exact transcript hook (verbatim, unchanged)",
  "arc": "Complete narrative arc: section-by-section breakdown of how the edit flows",
  "description": "Final YouTube description (2-3 paragraphs, timestamps if applicable, CTA)",
  "thumbnail": {
    "concept": "Final thumbnail direction",
    "transcript_reference": "The moment it references",
    "visual_elements": ["element1", "element2"]
  },
  "cta": "Call to action (if short-form, otherwise null)",
  "format": "long_form or short_form",
  "editor_notes": "Additional notes for the editor — pacing, tone, transitions, anything synthesized from the user's feedback",
  "rationale": "Why this combination works, referencing the source directions"
}`;

// ============================================
// MANUAL CONTEXT BUILDER
// ============================================

/**
 * Build a prompt injection block from user-provided context inputs.
 * Each field is optional — only non-empty fields are included.
 * Appends a note listing which sections were not provided.
 *
 * @param {{ strategyBrief?: string, performanceData?: string, audiencePersona?: string, competitorBenchmarks?: string }} inputs
 * @returns {string} Prompt block wrapped in <manual_context> tags, or empty string
 */
export function buildManualContext(inputs) {
  if (!inputs) return '';

  const sections = [];
  const missing = [];

  const fields = [
    { key: 'strategyBrief', label: 'Client Strategy Brief', missingLabel: 'strategy brief' },
    { key: 'performanceData', label: 'Past Video Performance Data', missingLabel: 'performance data' },
    { key: 'audiencePersona', label: 'Audience Persona Profile', missingLabel: 'audience persona' },
    { key: 'competitorBenchmarks', label: 'Competitor Benchmarks', missingLabel: 'competitor benchmarks' },
  ];

  for (const f of fields) {
    const val = inputs[f.key]?.trim();
    if (val) {
      sections.push(`## ${f.label}\n${val}`);
    } else {
      missing.push(f.missingLabel);
    }
  }

  if (sections.length === 0) return '';

  let block = `<manual_context>\n${sections.join('\n\n')}`;
  if (missing.length > 0) {
    block += `\n\nNote: The following context was not provided, so recommendations in those areas will be more general: ${missing.join(', ')}.`;
  }
  block += '\n</manual_context>';
  return block;
}

// ============================================
// COMPETITOR BENCHMARKS (auto-fetched)
// ============================================

/**
 * Fetch top-performing competitor videos for a client.
 * Returns a formatted prompt block for injection.
 */
export async function getCompetitorBenchmarks(clientId) {
  if (!supabase || !clientId) return '';

  try {
    // Get competitor channel IDs for this client
    const { data: competitors, error: compError } = await supabase
      .from('channels')
      .select('id, name')
      .eq('client_id', clientId)
      .eq('is_competitor', true);

    if (compError || !competitors?.length) return '';

    const channelIds = competitors.map(c => c.id);
    const channelNames = Object.fromEntries(competitors.map(c => [c.id, c.name]));

    // Get top-performing competitor videos
    const { data: videos, error: vidError } = await supabase
      .from('videos')
      .select('title, view_count, channel_id, duration_seconds, published_at, description')
      .in('channel_id', channelIds)
      .order('view_count', { ascending: false })
      .limit(20);

    if (vidError || !videos?.length) return '';

    const lines = videos.map(v => {
      const channel = channelNames[v.channel_id] || 'Unknown';
      const views = (v.view_count || 0).toLocaleString();
      const dur = v.duration_seconds ? (v.duration_seconds < 62 ? 'Short' : `${Math.round(v.duration_seconds / 60)}min`) : '';
      return `- "${v.title}" (${channel}) | ${views} views${dur ? ' | ' + dur : ''}`;
    });

    let block = `<competitor_benchmarks>\n## Top-Performing Competitor Videos\n${lines.join('\n')}`;
    block += '\n\nUse these competitor patterns as calibration: note what formats, hooks, and topics are driving views in this space.';
    block += '\n</competitor_benchmarks>';
    return block;
  } catch (e) {
    console.warn('[atomizer] Competitor benchmarks fetch failed:', e.message);
    return '';
  }
}

// ============================================
// AUTO-POPULATE CONTEXT FIELDS
// ============================================

/**
 * Fetch all 4 context fields from existing data sources and return
 * human-readable text for each. Used to auto-populate the visible
 * context text areas in the Atomizer UI.
 *
 * @param {string} channelId - Client channel ID (for brand context + audience signals)
 * @param {string} clientId - Client ID (for performance + competitor data)
 * @returns {Promise<{ strategyBrief: string, performanceData: string, audiencePersona: string, competitorBenchmarks: string }>}
 */
export async function fetchAtomizerContext(channelId, clientId) {
  const [strategyResult, perfResult, audienceResult, compResult] = await Promise.allSettled([
    fetchStrategyBrief(channelId),
    fetchPerformanceData(clientId),
    fetchAudiencePersona(channelId),
    fetchCompetitorText(clientId),
  ]);

  return {
    strategyBrief: strategyResult.status === 'fulfilled' ? strategyResult.value : '',
    performanceData: perfResult.status === 'fulfilled' ? perfResult.value : '',
    audiencePersona: audienceResult.status === 'fulfilled' ? audienceResult.value : '',
    competitorBenchmarks: compResult.status === 'fulfilled' ? compResult.value : '',
  };
}

/** Strategy Brief — from brand context strategic_goals, messaging_priorities, content_themes */
async function fetchStrategyBrief(channelId) {
  if (!channelId) return '';
  const bc = await getCurrentBrandContext(channelId);
  if (!bc) return '';

  const lines = [];

  // Strategic goals
  const sg = bc.strategic_goals;
  if (sg && typeof sg === 'object') {
    if (sg.current_phase) lines.push(`Current Phase: ${sg.current_phase}${sg.phase_notes ? ' — ' + sg.phase_notes : ''}`);
    if (sg.business_objectives?.length) lines.push(`Business Objectives: ${sg.business_objectives.join(', ')}`);
    if (sg.kpis?.length) lines.push(`KPIs: ${sg.kpis.join(', ')}`);
    if (sg.growth_targets?.length) {
      sg.growth_targets.forEach(t => {
        lines.push(`Target: ${t.target} ${t.metric}${t.timeframe ? ' within ' + t.timeframe : ''}`);
      });
    }
  }

  // Messaging priorities
  const mp = bc.messaging_priorities;
  if (mp && typeof mp === 'object') {
    if (mp.current_campaigns?.length) {
      lines.push('');
      lines.push('Messaging Priorities:');
      mp.current_campaigns.forEach(c => {
        lines.push(`- Campaign: ${c.name}${c.status ? ' (' + c.status + ')' : ''}${c.description ? ' — ' + c.description : ''}`);
      });
    }
    if (mp.primary_ctas?.length) {
      lines.push(`Primary CTAs: ${mp.primary_ctas.map(c => c.action).join(', ')}`);
    }
    if (mp.strategic_themes?.length) {
      lines.push(`Strategic Themes: ${mp.strategic_themes.join(', ')}`);
    }
  }

  // Content themes
  const ct = bc.content_themes;
  if (ct && typeof ct === 'object') {
    if (ct.themes?.length) {
      lines.push('');
      lines.push('Content Themes:');
      ct.themes.forEach(t => {
        lines.push(`- ${t.theme}${t.frequency ? ' (' + t.frequency + ')' : ''}${t.sub_topics?.length ? ' — ' + t.sub_topics.join(', ') : ''}`);
      });
    }
  }

  return lines.join('\n').trim();
}

/** Performance Data — from intelligence_briefs top_performers + metrics_snapshot */
async function fetchPerformanceData(clientId) {
  if (!supabase || !clientId) return '';

  const { data: brief, error } = await supabase
    .from('intelligence_briefs')
    .select('top_performers, metrics_snapshot')
    .eq('client_id', clientId)
    .order('brief_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !brief) return '';

  const lines = [];
  const performers = brief.top_performers;
  if (Array.isArray(performers) && performers.length > 0) {
    lines.push('Top Performers:');
    performers.slice(0, 10).forEach(v => {
      const parts = [`"${v.title}"`];
      if (v.views) parts.push(`${Number(v.views).toLocaleString()} views`);
      if (v.ctr) parts.push(`${(Number(v.ctr) * 100).toFixed(1)}% CTR`);
      if (v.retention) parts.push(`${(Number(v.retention) * 100).toFixed(0)}% retention`);
      lines.push(`- ${parts.join(' | ')}`);
    });
  }

  const ms = brief.metrics_snapshot;
  if (ms) {
    const avgParts = [];
    if (ms.avgCTR) avgParts.push(`Avg CTR: ${(Number(ms.avgCTR) * 100).toFixed(1)}%`);
    if (ms.avgRetention) avgParts.push(`Avg Retention: ${(Number(ms.avgRetention) * 100).toFixed(0)}%`);
    if (ms.totalVideos) avgParts.push(`Videos analyzed: ${ms.totalVideos}`);
    if (avgParts.length) {
      lines.push('');
      lines.push(`Channel Averages: ${avgParts.join(' | ')}`);
    }
  }

  return lines.join('\n').trim();
}

/** Audience Persona — from computed audience signals + brand context audience_signals */
async function fetchAudiencePersona(channelId) {
  if (!channelId) return '';

  let computedSignals = null;
  try {
    const { computeAudienceSignals } = await import('./audienceSignalService');
    computedSignals = await computeAudienceSignals(channelId);
  } catch (e) {
    // Audience signals unavailable
  }

  // Also pull manual audience notes from brand context
  let bcAudience = null;
  try {
    const bc = await getCurrentBrandContext(channelId);
    bcAudience = bc?.audience_signals;
  } catch (e) { /* ignore */ }

  const lines = [];

  // High engagement formats (computed or manual)
  const formats = computedSignals?.high_engagement_formats || bcAudience?.high_engagement_formats || [];
  if (formats.length > 0) {
    lines.push('High Engagement Formats:');
    formats.forEach(f => {
      const parts = [f.format];
      if (f._computed) {
        parts.push(`${f._computed.count} videos`);
        parts.push(`avg ${Math.round(f._computed.avg_views).toLocaleString()} views`);
        if (f._computed.vs_channel_avg) parts.push(`${f._computed.vs_channel_avg > 0 ? '+' : ''}${Math.round(f._computed.vs_channel_avg)}% vs avg`);
        if (f._computed.avg_ctr) parts.push(`${(f._computed.avg_ctr * 100).toFixed(1)}% CTR`);
      } else if (f.notes) {
        parts.push(f.notes);
      }
      lines.push(`- ${parts.join(' | ')}`);
    });
  }

  // Computed signals
  if (computedSignals?._computed) {
    const c = computedSignals._computed;

    if (c.optimal_duration?.sweet_spots?.length) {
      lines.push('');
      lines.push('Duration Sweet Spots:');
      c.optimal_duration.sweet_spots.forEach(s => {
        lines.push(`- ${s.range}: avg ${Math.round(s.avg_views).toLocaleString()} views, ${Math.round(s.avg_retention * 100)}% retention (${s.count} videos)`);
      });
    }

    if (c.posting_patterns) {
      const pp = c.posting_patterns;
      if (pp.best_days?.length) lines.push(`\nBest Posting Days: ${pp.best_days.join(', ')}`);
      if (pp.avg_uploads_per_week) lines.push(`Upload Frequency: ${pp.avg_uploads_per_week.toFixed(1)}/week`);
      if (pp.frequency_insight) lines.push(`Insight: ${pp.frequency_insight}`);
    }

    if (c.subscriber_drivers?.length) {
      lines.push('');
      lines.push('Subscriber Drivers:');
      c.subscriber_drivers.slice(0, 3).forEach(d => {
        lines.push(`- ${d.attribute}: ${d.note}`);
      });
    }

    if (c.growth_signals?.subscriber_velocity) {
      const sv = c.growth_signals.subscriber_velocity;
      lines.push(`\nGrowth Trend: ${sv.trend} (${sv.recent_30d.toLocaleString()} subs last 30d, ${sv.ratio}x vs prior period)`);
    }
  }

  // Content gaps
  const gaps = computedSignals?.content_gaps || bcAudience?.content_gaps || [];
  if (gaps.length > 0) {
    lines.push('');
    lines.push('Content Gaps:');
    gaps.forEach(g => {
      lines.push(`- ${g.observation}${g.youtube_opportunity ? ' → ' + g.youtube_opportunity : ''}`);
    });
  }

  // Manual audience demographics
  if (bcAudience?.audience_demographics_observed?.interest_clusters?.length) {
    lines.push(`\nAudience Interests: ${bcAudience.audience_demographics_observed.interest_clusters.join(', ')}`);
  }

  return lines.join('\n').trim();
}

/** Competitor Benchmarks — readable text version of getCompetitorBenchmarks */
async function fetchCompetitorText(clientId) {
  if (!supabase || !clientId) return '';

  const { data: competitors, error: compError } = await supabase
    .from('channels')
    .select('id, name')
    .eq('client_id', clientId)
    .eq('is_competitor', true);

  if (compError || !competitors?.length) return '';

  const channelIds = competitors.map(c => c.id);
  const channelNames = Object.fromEntries(competitors.map(c => [c.id, c.name]));

  const { data: videos, error: vidError } = await supabase
    .from('videos')
    .select('title, view_count, channel_id, duration_seconds, published_at')
    .in('channel_id', channelIds)
    .order('view_count', { ascending: false })
    .limit(20);

  if (vidError || !videos?.length) return '';

  const lines = ['Top Competitor Videos:'];
  videos.forEach(v => {
    const channel = channelNames[v.channel_id] || 'Unknown';
    const views = (v.view_count || 0).toLocaleString();
    const dur = v.duration_seconds ? (v.duration_seconds < 62 ? 'Short' : `${Math.round(v.duration_seconds / 60)}min`) : '';
    lines.push(`- "${v.title}" (${channel}) | ${views} views${dur ? ' | ' + dur : ''}`);
  });

  return lines.join('\n').trim();
}

// ============================================
// PERFORMANCE CONTEXT (prompt block for injection)
// ============================================

/**
 * Fetch top performer data from the latest intelligence brief.
 * Returns a formatted prompt block for injection into the system prompt.
 */
export async function getClientPerformanceContext(clientId) {
  if (!supabase || !clientId) return '';

  try {
    const { data: brief, error } = await supabase
      .from('intelligence_briefs')
      .select('top_performers, metrics_snapshot')
      .eq('client_id', clientId)
      .order('brief_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !brief) return '';

    const performers = brief.top_performers;
    if (!Array.isArray(performers) || performers.length === 0) return '';

    const lines = performers.slice(0, 10).map(v => {
      const parts = [`"${v.title}"`];
      if (v.views) parts.push(`${Number(v.views).toLocaleString()} views`);
      if (v.ctr) parts.push(`${(Number(v.ctr) * 100).toFixed(1)}% CTR`);
      if (v.retention) parts.push(`${(Number(v.retention) * 100).toFixed(0)}% retention`);
      return `- ${parts.join(' | ')}`;
    });

    let block = `<client_performance_context>\n## This Channel's Top Performers\n${lines.join('\n')}`;

    const ms = brief.metrics_snapshot;
    if (ms) {
      const avgParts = [];
      if (ms.avgCTR) avgParts.push(`Avg CTR: ${(Number(ms.avgCTR) * 100).toFixed(1)}%`);
      if (ms.avgRetention) avgParts.push(`Avg Retention: ${(Number(ms.avgRetention) * 100).toFixed(0)}%`);
      if (ms.totalVideos) avgParts.push(`Videos analyzed: ${ms.totalVideos}`);
      if (avgParts.length) block += `\n\n## Channel Averages\n${avgParts.join(' | ')}`;
    }

    block += '\n\nUse these top performers as calibration for your title style, hook approach, and virality scoring. Reference specific patterns you notice.';
    block += '\n</client_performance_context>';
    return block;
  } catch (e) {
    console.warn('[atomizer] Performance context fetch failed:', e.message);
    return '';
  }
}

// ============================================
// TRANSCRIPT ANALYSIS
// ============================================

/**
 * Legacy V1 analysis (clips/shorts/quotes).
 */
async function analyzeTranscriptLegacy(text, title, channelId) {
  const wordCount = text.trim().split(/\s+/).length;

  let systemPrompt = ATOMIZER_LEGACY_PROMPT;
  if (channelId) {
    try {
      const brandBlock = await getBrandContextWithSignals(channelId, 'atomizer');
      if (brandBlock) systemPrompt += '\n\n' + brandBlock;
    } catch (e) {
      console.warn('[atomizer] Brand context fetch failed, proceeding without:', e.message);
    }
  }

  const prompt = `Analyze this transcript and extract the best clips, shorts, and quotes:

Title: ${title}
Word Count: ${wordCount}

--- TRANSCRIPT ---
${text}
--- END TRANSCRIPT ---`;

  const result = await claudeAPI.call(prompt, systemPrompt, 'atomizer', 4096);
  const parsed = parseClaudeJSON(result.text);

  return { ...parsed, usage: result.usage, cost: result.cost };
}

/**
 * Analyze a transcript to extract edit directions (V2) or legacy clips/shorts/quotes.
 *
 * @param {string} text - The transcript text
 * @param {string} title - Title for the transcript
 * @param {string|null} channelId - Client ID for brand/performance context
 * @param {Object} [options]
 * @param {boolean} [options.v2=true] - Use V2 edit directions prompt
 * @param {Object} [options.contextInputs] - Manual context inputs { strategyBrief, performanceData, audiencePersona, competitorBenchmarks }
 * @returns {Promise<Object>} Parsed atomizer results
 */
export async function analyzeTranscript(text, title = 'Untitled', channelId = null, { v2 = true, contextInputs } = {}) {
  if (!v2) return analyzeTranscriptLegacy(text, title, channelId);

  const wordCount = text.trim().split(/\s+/).length;

  let systemPrompt = ATOMIZER_V2_SYSTEM_PROMPT;

  if (channelId) {
    // Inject brand context (brand voice + content boundaries — foundational context)
    try {
      const brandBlock = await getBrandContextWithSignals(channelId, 'atomizer');
      if (brandBlock) systemPrompt += '\n\n' + brandBlock;
    } catch (e) {
      console.warn('[atomizer] Brand context fetch failed, proceeding without:', e.message);
    }
  }

  // Inject context from visible fields (auto-populated + user-edited)
  // Performance data, competitor benchmarks, strategy, and audience now come through here
  const manualBlock = buildManualContext(contextInputs);
  if (manualBlock) systemPrompt += '\n\n' + manualBlock;

  const prompt = `Analyze this transcript and propose editor-ready edit directions for both long-form and short-form content. Include full EDL, B-roll directions, and motion graphics notes for each direction.

Title: ${title}
Word Count: ${wordCount}

--- TRANSCRIPT ---
${text}
--- END TRANSCRIPT ---`;

  const result = await claudeAPI.call(prompt, systemPrompt, 'atomizer_v2', 16384);
  const parsed = parseClaudeJSON(result.text);

  return { ...parsed, usage: result.usage, cost: result.cost };
}

// ============================================
// REMIX
// ============================================

/**
 * Remix selected elements from multiple directions into a single cohesive brief.
 *
 * @param {Array<Object>} selectedElements - Array of { directionId, direction, elements: string[] }
 *   element keys: 'hook', 'arc', 'title_0', 'title_1', 'title_2', 'thumbnail', 'description'
 * @param {string} userFeedback - Free-text instructions from the user
 * @param {string|null} channelId - For brand context injection
 * @returns {Promise<Object>} Synthesized brief data
 */
export async function remixDirections(selectedElements, userFeedback = '', channelId = null) {
  const elementsBlock = selectedElements.map((sel, i) => {
    const d = sel.direction;
    const lines = [`Direction ${i + 1}: "${d.title}" (${d.content_type || 'edit direction'})`];

    if (sel.elements.includes('hook')) {
      lines.push(`  HOOK: "${d.hook}"`);
    }
    if (sel.elements.includes('arc')) {
      lines.push(`  ARC: ${d.arc_summary}`);
    }
    const titleVars = d.title_variations || [];
    sel.elements.filter(e => e.startsWith('title_')).forEach(e => {
      const idx = parseInt(e.split('_')[1]);
      if (titleVars[idx]) {
        lines.push(`  TITLE (${titleVars[idx].style}): "${titleVars[idx].text}"`);
      }
    });
    if (sel.elements.includes('thumbnail')) {
      const t = d.thumbnail_suggestion || {};
      lines.push(`  THUMBNAIL: ${t.concept || 'N/A'} (ref: ${t.transcript_reference || 'N/A'})`);
    }
    if (sel.elements.includes('description')) {
      lines.push(`  DESCRIPTION: ${d.description_text || d.description || 'N/A'}`);
    }

    return lines.join('\n');
  }).join('\n\n');

  let systemPrompt = REMIX_SYSTEM_PROMPT;
  if (channelId) {
    try {
      const brandBlock = await getBrandContextWithSignals(channelId, 'atomizer');
      if (brandBlock) systemPrompt += '\n\n' + brandBlock;
    } catch (e) {
      console.warn('[atomizer] Brand context for remix failed:', e.message);
    }
  }

  const prompt = `Synthesize the following selected elements into one cohesive edit brief:

--- SELECTED ELEMENTS ---
${elementsBlock}
--- END SELECTED ELEMENTS ---

${userFeedback ? `--- USER FEEDBACK ---\n${userFeedback}\n--- END FEEDBACK ---` : ''}

Create a single, production-ready brief that combines the best of these selections.`;

  const result = await claudeAPI.call(prompt, systemPrompt, 'atomizer_remix', 4096);
  const parsed = parseClaudeJSON(result.text);

  return { ...parsed, usage: result.usage, cost: result.cost };
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Save a transcript to Supabase.
 */
export async function saveTranscript({ title, text, sourceType = 'paste', sourceUrl, clientId, channelId, contextSnapshot, analysisSummary }) {
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
      channel_id: channelId || null,
      context_snapshot: contextSnapshot || null,
      analysis_summary: analysisSummary || null,
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
 * Handles both V2 (long_form_direction/short_form_direction) and legacy (clip/short/quote).
 */
export async function saveAtomizedContent(transcriptId, analysisResults, clientId, channelId) {
  if (!supabase) throw new Error('Supabase not configured');

  const items = [];

  // V2: Long-form directions
  (analysisResults.long_form_directions || []).forEach(dir => {
    items.push({
      transcript_id: transcriptId,
      client_id: clientId || null,
      channel_id: channelId || null,
      content_type: 'long_form_direction',
      title: dir.title,
      timecode_start: dir.hook_timecode || null,
      hook: dir.hook,
      virality_score: dir.virality_score ?? dir.viralityScore,
      rationale: dir.rationale,
      arc_summary: dir.arc_summary,
      title_variations: dir.title_variations,
      thumbnail_suggestion: dir.thumbnail_suggestion,
      description_text: dir.description,
      direction_metadata: {
        estimated_duration: dir.estimated_duration,
        format_type: dir.format_type || 'long-form re-edit',
        timestamps: dir.timestamps || [],
        edl: dir.edl || [],
        b_roll: dir.b_roll || [],
        motion_graphics: dir.motion_graphics || [],
      },
      status: 'suggested',
    });
  });

  // V2: Short-form directions
  (analysisResults.short_form_directions || []).forEach(dir => {
    items.push({
      transcript_id: transcriptId,
      client_id: clientId || null,
      channel_id: channelId || null,
      content_type: 'short_form_direction',
      title: dir.title,
      timecode_start: dir.hook_timecode || null,
      hook: dir.hook,
      virality_score: dir.virality_score ?? dir.viralityScore,
      rationale: dir.rationale,
      arc_summary: dir.arc_summary,
      title_variations: dir.title_variations,
      thumbnail_suggestion: dir.thumbnail_suggestion,
      description_text: dir.description,
      direction_metadata: {
        estimated_duration: dir.estimated_duration,
        cta: dir.cta,
        format_type: dir.format_type || 'YouTube Short',
        timestamps: dir.timestamps || [],
        edl: dir.edl || [],
        b_roll: dir.b_roll || [],
        motion_graphics: dir.motion_graphics || [],
      },
      suggested_cta: dir.cta,
      status: 'suggested',
    });
  });

  // Legacy: clips
  (analysisResults.clips || []).forEach(clip => {
    items.push({
      transcript_id: transcriptId,
      client_id: clientId || null,
      channel_id: channelId || null,
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

  // Legacy: shorts
  (analysisResults.shorts || []).forEach(short => {
    items.push({
      transcript_id: transcriptId,
      client_id: clientId || null,
      channel_id: channelId || null,
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

  // Legacy: quotes
  (analysisResults.quotes || []).forEach(quote => {
    items.push({
      transcript_id: transcriptId,
      client_id: clientId || null,
      channel_id: channelId || null,
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
 * Works for both V2 directions and legacy clips/shorts/quotes.
 */
export async function createBriefFromAtomized(atomizedContentId, clientId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: { user } } = await supabase.auth.getUser();

  const { data: item, error: fetchError } = await supabase
    .from('atomized_content')
    .select('*')
    .eq('id', atomizedContentId)
    .single();

  if (fetchError) throw fetchError;

  const briefData = {
    content_type: item.content_type,
    hook: item.hook,
    transcript_excerpt: item.transcript_excerpt,
    timecode_start: item.timecode_start,
    timecode_end: item.timecode_end,
    virality_score: item.virality_score,
    rationale: item.rationale,
    suggested_cta: item.suggested_cta,
    suggested_visual: item.suggested_visual,
  };

  // V2 fields
  if (item.title_variations) briefData.title_variations = item.title_variations;
  if (item.thumbnail_suggestion) briefData.thumbnail_suggestion = item.thumbnail_suggestion;
  if (item.description_text) briefData.description = item.description_text;
  if (item.arc_summary) briefData.arc_summary = item.arc_summary;
  if (item.direction_metadata) briefData.direction_metadata = item.direction_metadata;

  const { data: brief, error: briefError } = await supabase
    .from('briefs')
    .insert({
      client_id: clientId || item.client_id,
      title: item.title || item.transcript_excerpt?.slice(0, 60) || 'Untitled Brief',
      status: 'draft',
      source_type: 'atomizer',
      source_id: atomizedContentId,
      brief_data: briefData,
      created_by: user?.id || null,
    })
    .select()
    .single();

  if (briefError) throw briefError;

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
 * Save a remix result as a brief.
 */
export async function saveRemixAsBrief(remixResult, selectedElements, clientId) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: { user } } = await supabase.auth.getUser();

  const remixSources = selectedElements.map(sel => ({
    atomized_content_id: sel.directionId,
    selected_elements: sel.elements,
  }));

  const { data, error } = await supabase
    .from('briefs')
    .insert({
      client_id: clientId,
      title: remixResult.title || 'Remixed Edit Direction',
      status: 'draft',
      source_type: 'remix',
      brief_data: {
        hook: remixResult.hook,
        arc: remixResult.arc,
        description: remixResult.description,
        thumbnail: remixResult.thumbnail,
        cta: remixResult.cta,
        format: remixResult.format,
        editor_notes: remixResult.editor_notes,
        rationale: remixResult.rationale,
      },
      remix_sources: remixSources,
      created_by: user?.id || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get transcripts for a client, ordered by most recent.
 */
export async function getTranscripts(clientId, { limit = 50, channelId } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  let query = supabase
    .from('transcripts')
    .select('id, title, channel_id, created_at, word_count, analysis_summary, context_snapshot, transcript_text, channels(name, thumbnail_url), atomized_content(id, status)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (clientId) query = query.eq('client_id', clientId);
  if (channelId) query = query.eq('channel_id', channelId);

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
  remixDirections,
  saveTranscript,
  markTranscriptAnalyzed,
  saveAtomizedContent,
  createBriefFromAtomized,
  saveRemixAsBrief,
  fetchAtomizerContext,
  getClientPerformanceContext,
  getCompetitorBenchmarks,
  buildManualContext,
  getTranscripts,
  getAtomizedContent,
};
