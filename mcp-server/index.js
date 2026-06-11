#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  listClients,
  getChannelVideos,
  getChannelMetrics,
  getCompetitorLandscape,
  getBrandContext,
  getAuditSummary,
  getQuarterlyData,
  searchVideos,
  getClientMeta,
  prelaunchExplainer,
} from './supabase.js';

const server = new McpServer({
  name: 'fullview-analytics',
  version: '1.0.0',
});

// ── Tool: list_clients ──
server.tool(
  'list_clients',
  'List all clients in Full View Analytics with their channel info. Pre-launch clients are tagged so the difference between "no data yet because pre-launch" and "no data because something\'s broken" is obvious.',
  {},
  async () => {
    const clients = await listClients();
    if (!clients.length) return { content: [{ type: 'text', text: 'No clients found.' }] };
    const summary = clients.map(c => {
      const tag = c.is_prelaunch ? ' [PRE-LAUNCH]' : '';
      const subs = c.is_prelaunch ? '— pre-launch' : `${(c.subscriber_count || 0).toLocaleString()} subs`;
      return `${c.name}${tag} (${subs}, ${c.size_tier || 'unknown'} tier) — ID: ${c.id}`;
    }).join('\n');
    return { content: [{ type: 'text', text: `${clients.length} clients:\n\n${summary}` }] };
  }
);

// ── Tool: get_channel_performance ──
server.tool(
  'get_channel_performance',
  'Get performance metrics for a client\'s channels over a time period',
  {
    client_id: z.string().describe('Client channel ID (UUID from list_clients)'),
    days: z.number().default(90).describe('Lookback period in days (default 90)'),
  },
  async ({ client_id, days }) => {
    // client_id IS the channel UUID for the client's own row. Don't route
    // through getClientChannels — that helper queries the competitor
    // assignment junction and contaminates the result with non-client data.
    const meta = await getClientMeta(client_id);
    if (meta?.isPrelaunch) {
      return { content: [{ type: 'text', text: prelaunchExplainer(meta) }] };
    }
    const metrics = await getChannelMetrics([client_id], days);
    return { content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }] };
  }
);

// ── Tool: get_top_videos ──
server.tool(
  'get_top_videos',
  'Get top-performing videos for a channel, sorted by a chosen metric',
  {
    client_id: z.string().describe('Client channel ID (UUID)'),
    limit: z.number().default(10).describe('Number of videos to return (default 10)'),
    sort: z.enum(['views', 'engagement', 'ctr', 'retention', 'recent']).default('views').describe('Sort metric'),
    type: z.enum(['all', 'short', 'long']).default('all').describe('Filter by video type'),
    days: z.number().optional().describe('Only include videos published within this many days'),
  },
  async ({ client_id, limit, sort, type, days }) => {
    // client_id IS the channel UUID. Query the client's own videos
    // directly — don't go through getClientChannels (it routes through
    // the competitor-assignment junction and returns the wrong videos).
    const meta = await getClientMeta(client_id);
    if (meta?.isPrelaunch) {
      return { content: [{ type: 'text', text: prelaunchExplainer(meta) }] };
    }
    const videos = await getChannelVideos(client_id, {
      limit,
      sort,
      type: type === 'all' ? undefined : type,
      days,
    });
    let allVideos = videos;

    // Re-sort combined results
    const sortKey = sort === 'engagement' ? 'engagement_rate'
      : sort === 'ctr' ? 'ctr'
      : sort === 'retention' ? 'avg_view_percentage'
      : sort === 'recent' ? 'published_at'
      : 'view_count';

    allVideos.sort((a, b) => {
      if (sort === 'recent') return new Date(b[sortKey]) - new Date(a[sortKey]);
      return (b[sortKey] || 0) - (a[sortKey] || 0);
    });

    const results = allVideos.slice(0, limit).map((v, i) => {
      const date = v.published_at ? new Date(v.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
      return `${i + 1}. "${v.title}" (${date})\n   ${(v.view_count || 0).toLocaleString()} views · ${((v.engagement_rate || 0) * 100).toFixed(2)}% engagement · ${((v.ctr || 0) * 100).toFixed(1)}% CTR · ${((v.avg_view_percentage || 0) * 100).toFixed(1)}% retention · ${(v.watch_hours || 0).toFixed(1)} watch hrs · ${v.is_short ? 'Short' : 'Long-form'}`;
    });

    return { content: [{ type: 'text', text: results.join('\n\n') || 'No videos found.' }] };
  }
);

// ── Tool: search_videos ──
server.tool(
  'search_videos',
  'Search video titles across a client\'s channels',
  {
    client_id: z.string().describe('Client channel ID (UUID)'),
    query: z.string().describe('Search term to match against video titles'),
    limit: z.number().default(20).describe('Max results (default 20)'),
  },
  async ({ client_id, query, limit }) => {
    // Query the client's own videos directly. getClientChannels would
    // return competitor channels (assigned via the client_channels
    // junction) and contaminate the search results.
    const meta = await getClientMeta(client_id);
    if (meta?.isPrelaunch) {
      return { content: [{ type: 'text', text: prelaunchExplainer(meta) }] };
    }
    const results = await searchVideos([client_id], query, { limit });

    if (!results.length) return { content: [{ type: 'text', text: `No videos matching "${query}".` }] };

    const lines = results.map((v, i) =>
      `${i + 1}. "${v.title}" — ${(v.view_count || 0).toLocaleString()} views · ${((v.engagement_rate || 0) * 100).toFixed(2)}% eng · ${v.is_short ? 'Short' : 'Long-form'}`
    );
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool: get_quarterly_report ──
server.tool(
  'get_quarterly_report',
  'Generate a quarter-over-quarter performance comparison for a client',
  {
    client_id: z.string().describe('Client channel ID (UUID)'),
    year: z.number().describe('Year (e.g. 2025)'),
    quarter: z.number().min(1).max(4).describe('Quarter number (1-4)'),
  },
  async ({ client_id, year, quarter }) => {
    // Query the client's own channel directly. Routing through
    // getClientChannels would pull in competitor assignments and produce
    // a quarterly report against the wrong data.
    const meta = await getClientMeta(client_id);
    if (meta?.isPrelaunch) {
      return { content: [{ type: 'text', text: prelaunchExplainer(meta) }] };
    }
    const report = await getQuarterlyData([client_id], year, quarter);

    const c = report.currentQuarter;
    const p = report.previousQuarter;
    const d = report.deltas;
    const arrow = (v) => v === null ? '' : v >= 0 ? ` (+${v}%)` : ` (${v}%)`;

    const text = `QUARTERLY REPORT: ${c.label} vs ${p.label}

CURRENT QUARTER (${c.label})
  Videos: ${c.totalVideos}
  Views: ${c.views.toLocaleString()}${arrow(d.views)}
  Watch Hours: ${c.watchHours.toLocaleString()}${arrow(d.watchHours)}
  Impressions: ${c.impressions.toLocaleString()}
  Subscribers Gained: ${c.subsGained.toLocaleString()}
  Avg Engagement: ${c.avgEngagement}%${arrow(d.engagement)}
  Avg CTR: ${c.avgCtr}%
  Avg Retention: ${c.avgRetention}%

PREVIOUS QUARTER (${p.label})
  Videos: ${p.totalVideos}
  Views: ${p.views.toLocaleString()}
  Watch Hours: ${p.watchHours.toLocaleString()}
  Avg Engagement: ${p.avgEngagement}%
  Avg CTR: ${p.avgCtr}%
  Avg Retention: ${p.avgRetention}%`;

    return { content: [{ type: 'text', text }] };
  }
);

// ── Tool: get_competitors ──
server.tool(
  'get_competitors',
  'Get competitive landscape for a client — shows how they stack up against tracked peer / aspirational / reference cohort channels. Works for both live and pre-launch clients (pre-launch clients use cohort medians as the baseline since they have no own-channel history yet).',
  {
    client_id: z.string().describe('Client channel ID (UUID)'),
    days: z.number().default(90).describe('Lookback period in days'),
    limit: z.number().default(10).describe('Number of competitors to include'),
  },
  async ({ client_id, days, limit }) => {
    const result = await getCompetitorLandscape(client_id, { days, limit });
    if (result.error) return { content: [{ type: 'text', text: result.error }] };

    const prelaunchTag = result.isPrelaunch
      ? ' [PRE-LAUNCH: client has no own-channel data yet — cohort is the baseline]'
      : '';
    const header = `${result.label || 'Competitors'} (${result.competitors.length} channels, last ${days} days)${prelaunchTag}\n`;
    const rows = result.competitors.map((c, i) => {
      const role = c.cohortRole ? ` [${c.cohortRole}]` : '';
      return `${i + 1}. ${c.name}${role} — ${(c.subscribers || 0).toLocaleString()} subs · ${c.recentVideos} videos · ${c.avgViews.toLocaleString()} avg views · ${c.avgEngagement}% eng`;
    });
    return { content: [{ type: 'text', text: header + rows.join('\n') }] };
  }
);

// ── Tool: get_brand_context ──
server.tool(
  'get_brand_context',
  'Get the brand intelligence profile for a client — Strategy Spine positioning + voice + editorial POV, audience persona (pain points / questions / motivations), pillars (recurring topics), recurring formats (creative-execution patterns), and business context. Composite read from the modern Strategy Spine system with a legacy brand_context fallback. Works for pre-launch clients (Spine is rich even before a channel exists).',
  {
    client_id: z.string().describe('Client channel ID (UUID)'),
  },
  async ({ client_id }) => {
    const [meta, ctx] = await Promise.all([
      getClientMeta(client_id),
      getBrandContext(client_id),
    ]);

    if (!ctx) {
      const note = meta?.isPrelaunch
        ? `No brand context found for pre-launch client "${meta.name}". Synthesize the Strategy Spine at Strategy → Spine and the audience persona at Strategy → Audience first — those are the inputs the MCP reads.`
        : 'No brand context found for this client. Populate the Strategy Spine at Strategy → Spine to make this tool useful.';
      return { content: [{ type: 'text', text: note }] };
    }

    const lines = [];
    if (meta?.isPrelaunch) {
      lines.push(`[PRE-LAUNCH] ${meta.name} — channel-side data won't exist yet, but Strategy Spine + persona below ARE populated and are the source of truth for positioning work.\n`);
    }

    // Sources summary up front so Claude knows what's solid vs missing
    const present = Object.entries(ctx.sources).filter(([, v]) => v).map(([k]) => k);
    const missing = Object.entries(ctx.sources).filter(([, v]) => !v).map(([k]) => k);
    lines.push(`Sources populated: ${present.join(', ') || 'none'}${missing.length ? ` · missing: ${missing.join(', ')}` : ''}`);

    if (ctx.spine) {
      lines.push(`\nSTRATEGY SPINE`);
      if (ctx.spine.positioning_oneliner)   lines.push(`Positioning: ${ctx.spine.positioning_oneliner}`);
      if (ctx.spine.positioning_hypothesis) lines.push(`Positioning hypothesis: ${ctx.spine.positioning_hypothesis}`);
      if (ctx.spine.audience_read)          lines.push(`Audience read: ${ctx.spine.audience_read}`);
      if (ctx.spine.editorial_pov)          lines.push(`Editorial POV: ${ctx.spine.editorial_pov}`);
      if (ctx.spine.voice_tone)             lines.push(`Voice + tone: ${ctx.spine.voice_tone}`);
      if (ctx.spine.competitive_posture)    lines.push(`Competitive posture: ${ctx.spine.competitive_posture}`);
      if (ctx.spine.guardrails)             lines.push(`Guardrails: ${ctx.spine.guardrails}`);
      if (ctx.spine.host_archetype)         lines.push(`Host archetype: ${ctx.spine.host_archetype}`);
    }

    if (ctx.spine?.audience_persona) {
      const p = ctx.spine.audience_persona;
      lines.push(`\nAUDIENCE PERSONA (synthesized ${ctx.spine.audience_persona_synthesized_at ? new Date(ctx.spine.audience_persona_synthesized_at).toLocaleDateString() : 'unknown'})`);
      if (p.pain_points?.length)        lines.push(`Pain points:\n  - ${p.pain_points.join('\n  - ')}`);
      if (p.motivations?.length)        lines.push(`Motivations:\n  - ${p.motivations.join('\n  - ')}`);
      if (p.questions_asked?.length)    lines.push(`Questions audience asks:\n  - "${p.questions_asked.join('"\n  - "')}"`);
      if (p.voice_patterns?.length)     lines.push(`Voice patterns:\n  - ${p.voice_patterns.join('\n  - ')}`);
      if (p.trust_signals?.length)      lines.push(`Trust signals:\n  - ${p.trust_signals.join('\n  - ')}`);
      if (p.adjacent_interests?.length) lines.push(`Adjacent interests:\n  - ${p.adjacent_interests.join('\n  - ')}`);
    }

    if (ctx.pillars?.length) {
      lines.push(`\nPILLARS (${ctx.pillars.length} active)`);
      for (const p of ctx.pillars) {
        lines.push(`• ${p.title}${p.format ? ` [${p.format}]` : ''}${p.creative_description ? ` — ${p.creative_description}` : ''}`);
      }
    }

    if (ctx.recurringFormats?.length) {
      lines.push(`\nRECURRING FORMATS (${ctx.recurringFormats.length} active)`);
      for (const f of ctx.recurringFormats) {
        const exec = f.creative_execution === 'other' ? (f.creative_execution_label || 'other') : f.creative_execution;
        lines.push(`• "${f.name}" [${exec} · ${f.cadence}${f.pillar_label ? ` · pillar: ${f.pillar_label}` : ''} · ${f.production_complexity} complexity · ${f.status}]`);
        if (f.persona_rationale)  lines.push(`    Why: ${f.persona_rationale}`);
        if (f.counter_argument)   lines.push(`    Counter: ${f.counter_argument}`);
      }
    }

    if (ctx.businessContext) {
      lines.push(`\nBUSINESS CONTEXT`);
      lines.push(JSON.stringify(ctx.businessContext, null, 2));
    }

    if (ctx.legacy && !ctx.spine) {
      lines.push(`\nLEGACY BRAND CONTEXT (no Strategy Spine — read from legacy brand_context table)`);
      lines.push(JSON.stringify(ctx.legacy, null, 2));
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool: get_audit_summary ──
server.tool(
  'get_audit_summary',
  'Get the most recent completed audit for a channel — includes executive summary, benchmarks, opportunities, and recommendations',
  {
    client_id: z.string().describe('Client channel ID (UUID)'),
  },
  async ({ client_id }) => {
    const [meta, audit] = await Promise.all([
      getClientMeta(client_id),
      getAuditSummary(client_id),
    ]);
    if (!audit) {
      if (meta?.isPrelaunch) {
        return { content: [{ type: 'text', text: `[PRE-LAUNCH] "${meta.name}" has no audits because there are no videos to audit yet — by design, not a missing-data bug. The repositioning audit machinery runs once a channel launches and accumulates ~10+ videos. For pre-launch strategic positioning, use get_brand_context (Strategy Spine + persona + pillars are populated).` }] };
      }
      return { content: [{ type: 'text', text: `No completed audit found for "${meta?.name || 'this channel'}". Run a repositioning audit at Strategy → Repositioning when the channel has ~10+ recent videos.` }] };
    }

    const parts = [];
    parts.push(`AUDIT: ${audit.audit_type} (completed ${new Date(audit.created_at).toLocaleDateString()})`);

    if (audit.executive_summary) {
      const summary = typeof audit.executive_summary === 'string' ? audit.executive_summary : audit.executive_summary?.summary || '';
      if (summary) parts.push(`\nEXECUTIVE SUMMARY\n${summary}`);
    }

    if (audit.channel_snapshot) {
      const s = audit.channel_snapshot;
      parts.push(`\nCHANNEL SNAPSHOT\nSubscribers: ${(s.subscriber_count || 0).toLocaleString()}\nSize Tier: ${s.size_tier || '—'}\nTotal Videos Analyzed: ${s.total_videos_analyzed || 0}\nRecent Videos (90d): ${s.recent_videos_90d || 0}\nAvg Views (90d): ${(s.avg_views_recent || 0).toLocaleString()}\nAvg Engagement: ${((s.avg_engagement_recent || 0) * 100).toFixed(2)}%`);
    }

    if (audit.benchmark_data?.comparison?.overallScore) {
      parts.push(`\nBENCHMARK SCORE: ${audit.benchmark_data.comparison.overallScore}x peer median`);
    }

    if (audit.opportunities) {
      const gaps = audit.opportunities.content_gaps || [];
      const levers = audit.opportunities.growth_levers || [];
      if (gaps.length) parts.push(`\nCONTENT GAPS\n${gaps.map(g => `• ${g.gap} (${g.potential_impact} impact)`).join('\n')}`);
      if (levers.length) parts.push(`\nGROWTH LEVERS\n${levers.map(l => `• ${l.lever} (${l.priority} priority)`).join('\n')}`);
    }

    if (audit.recommendations) {
      const r = audit.recommendations;
      const sections = [
        { label: 'STOP', items: r.stop || [] },
        { label: 'START', items: r.start || [] },
        { label: 'OPTIMIZE', items: r.optimize || [] },
      ].filter(s => s.items.length);
      if (sections.length) {
        parts.push('\nRECOMMENDATIONS');
        for (const sec of sections) {
          parts.push(`${sec.label}:\n${sec.items.map(i => `• ${i.action} — ${i.rationale || ''}`).join('\n')}`);
        }
      }
    }

    return { content: [{ type: 'text', text: parts.join('\n') }] };
  }
);

// ── Start ──
const transport = new StdioServerTransport();
await server.connect(transport);
