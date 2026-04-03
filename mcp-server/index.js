#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  listClients,
  getClientChannels,
  getChannelVideos,
  getChannelMetrics,
  getCompetitorLandscape,
  getBrandContext,
  getAuditSummary,
  getQuarterlyData,
  searchVideos,
} from './supabase.js';

const server = new McpServer({
  name: 'fullview-analytics',
  version: '1.0.0',
});

// ── Tool: list_clients ──
server.tool(
  'list_clients',
  'List all clients in Full View Analytics with their channel info',
  {},
  async () => {
    const clients = await listClients();
    if (!clients.length) return { content: [{ type: 'text', text: 'No clients found.' }] };
    const summary = clients.map(c =>
      `${c.name} (${(c.subscriber_count || 0).toLocaleString()} subs, ${c.size_tier || 'unknown'} tier) — ID: ${c.id}`
    ).join('\n');
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
    const channels = await getClientChannels(client_id);
    if (!channels.length) {
      // Might be a single channel ID
      const metrics = await getChannelMetrics([client_id], days);
      return { content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }] };
    }
    const ids = channels.map(c => c.id);
    const metrics = await getChannelMetrics(ids, days);
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
    const channels = await getClientChannels(client_id);
    const ids = channels.length ? channels.map(c => c.id) : [client_id];

    let allVideos = [];
    for (const id of ids) {
      const videos = await getChannelVideos(id, {
        limit,
        sort,
        type: type === 'all' ? undefined : type,
        days,
      });
      allVideos = allVideos.concat(videos);
    }

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
    const channels = await getClientChannels(client_id);
    const ids = channels.length ? channels.map(c => c.id) : [client_id];
    const results = await searchVideos(ids, query, { limit });

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
    const channels = await getClientChannels(client_id);
    const ids = channels.length ? channels.map(c => c.id) : [client_id];
    const report = await getQuarterlyData(ids, year, quarter);

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
  'Get competitive landscape for a client — shows how they stack up against peers in their category',
  {
    client_id: z.string().describe('Client channel ID (UUID)'),
    days: z.number().default(90).describe('Lookback period in days'),
    limit: z.number().default(10).describe('Number of competitors to include'),
  },
  async ({ client_id, days, limit }) => {
    const result = await getCompetitorLandscape(client_id, { days, limit });
    if (result.error) return { content: [{ type: 'text', text: result.error }] };

    const header = `Category: ${result.category} (${result.competitors.length} competitors, last ${days} days)\n`;
    const rows = result.competitors.map((c, i) =>
      `${i + 1}. ${c.name} — ${(c.subscribers || 0).toLocaleString()} subs · ${c.recentVideos} videos · ${c.avgViews.toLocaleString()} avg views · ${c.avgEngagement}% eng`
    );
    return { content: [{ type: 'text', text: header + rows.join('\n') }] };
  }
);

// ── Tool: get_brand_context ──
server.tool(
  'get_brand_context',
  'Get the brand intelligence profile for a client — voice, audience, themes, goals, and constraints',
  {
    client_id: z.string().describe('Client channel ID (UUID)'),
  },
  async ({ client_id }) => {
    const ctx = await getBrandContext(client_id);
    if (!ctx) return { content: [{ type: 'text', text: 'No brand context found for this client. It may not have been set up yet.' }] };
    return { content: [{ type: 'text', text: JSON.stringify(ctx, null, 2) }] };
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
    const audit = await getAuditSummary(client_id);
    if (!audit) return { content: [{ type: 'text', text: 'No completed audit found for this channel.' }] };

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
