import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.FULLVIEW_SUPABASE_URL;
const supabaseKey = process.env.FULLVIEW_SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing FULLVIEW_SUPABASE_URL or FULLVIEW_SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ── Query helpers ──

export async function getClientChannels(clientId) {
  // Try junction table first (modern), fall back to legacy client_id
  const { data: junctions } = await supabase
    .from('client_channels')
    .select('channel_id')
    .eq('client_id', clientId);

  if (junctions && junctions.length > 0) {
    const ids = junctions.map(j => j.channel_id);
    const { data } = await supabase.from('channels').select('*').in('id', ids);
    return data || [];
  }

  const { data } = await supabase
    .from('channels')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_client', true);
  return data || [];
}

export async function listClients() {
  const { data } = await supabase
    .from('channels')
    .select('id, name, youtube_channel_id, subscriber_count, size_tier, thumbnail_url, network_id, network_name, custom_url')
    .eq('is_client', true)
    .order('name');
  return data || [];
}

export async function getChannelVideos(channelId, { limit = 25, type, sort = 'views', days } = {}) {
  let query = supabase
    .from('videos')
    .select('youtube_video_id, title, published_at, view_count, like_count, comment_count, engagement_rate, duration_seconds, video_type, is_short, impressions, ctr, avg_view_percentage, subscribers_gained, watch_hours, thumbnail_url')
    .eq('channel_id', channelId);

  if (type === 'short') query = query.eq('is_short', true);
  else if (type === 'long') query = query.eq('is_short', false);

  if (days) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    query = query.gte('published_at', since);
  }

  const sortCol = sort === 'engagement' ? 'engagement_rate'
    : sort === 'ctr' ? 'ctr'
    : sort === 'retention' ? 'avg_view_percentage'
    : sort === 'recent' ? 'published_at'
    : 'view_count';
  query = query.order(sortCol, { ascending: false }).limit(limit);

  const { data } = await query;
  return data || [];
}

export async function getChannelMetrics(channelIds, days = 90) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const results = {};

  for (const channelId of channelIds) {
    const { data: channel } = await supabase
      .from('channels')
      .select('id, name, subscriber_count, size_tier')
      .eq('id', channelId)
      .single();

    const { data: videos } = await supabase
      .from('videos')
      .select('view_count, like_count, comment_count, engagement_rate, watch_hours, impressions, ctr, avg_view_percentage, subscribers_gained, is_short')
      .eq('channel_id', channelId)
      .gte('published_at', since);

    const vids = videos || [];
    const shorts = vids.filter(v => v.is_short);
    const longs = vids.filter(v => !v.is_short);
    const sum = (arr, k) => arr.reduce((s, v) => s + (v[k] || 0), 0);
    const avg = (arr, k) => arr.length ? sum(arr, k) / arr.length : 0;

    results[channel?.name || channelId] = {
      subscribers: channel?.subscriber_count || 0,
      sizeTier: channel?.size_tier || null,
      period: `${days}d`,
      totalVideos: vids.length,
      shortsCount: shorts.length,
      longFormCount: longs.length,
      totalViews: sum(vids, 'view_count'),
      totalWatchHours: Math.round(sum(vids, 'watch_hours') * 10) / 10,
      totalImpressions: sum(vids, 'impressions'),
      subscribersGained: sum(vids, 'subscribers_gained'),
      avgViews: Math.round(avg(vids, 'view_count')),
      avgEngagement: Math.round(avg(vids, 'engagement_rate') * 10000) / 100,
      avgCtr: Math.round(avg(vids, 'ctr') * 1000) / 10,
      avgRetention: Math.round(avg(vids, 'avg_view_percentage') * 1000) / 10,
    };
  }
  return results;
}

export async function getCompetitorLandscape(channelId, { days = 90, limit = 10 } = {}) {
  // Get channel's category
  const { data: ch } = await supabase
    .from('channels')
    .select('category')
    .eq('id', channelId)
    .single();

  if (!ch?.category) return { error: 'Channel has no category assigned' };

  const { data: competitors } = await supabase
    .from('channels')
    .select('id, name, subscriber_count, size_tier, youtube_channel_id')
    .eq('category', ch.category)
    .eq('is_competitor', true)
    .order('subscriber_count', { ascending: false })
    .limit(limit);

  if (!competitors?.length) return { category: ch.category, competitors: [] };

  const since = new Date(Date.now() - days * 86400000).toISOString();
  const result = [];

  for (const comp of competitors) {
    const { data: vids } = await supabase
      .from('videos')
      .select('view_count, engagement_rate')
      .eq('channel_id', comp.id)
      .gte('published_at', since);

    const v = vids || [];
    result.push({
      name: comp.name,
      subscribers: comp.subscriber_count,
      sizeTier: comp.size_tier,
      recentVideos: v.length,
      avgViews: v.length ? Math.round(v.reduce((s, x) => s + (x.view_count || 0), 0) / v.length) : 0,
      avgEngagement: v.length ? Math.round(v.reduce((s, x) => s + (x.engagement_rate || 0), 0) / v.length * 10000) / 100 : 0,
    });
  }

  return { category: ch.category, competitors: result };
}

export async function getBrandContext(channelId) {
  const { data } = await supabase
    .from('brand_context')
    .select('brand_voice, messaging_priorities, audience_signals, content_themes, strategic_goals, resource_constraints, content_boundaries')
    .eq('channel_id', channelId)
    .eq('is_current', true)
    .single();
  return data;
}

export async function getAuditSummary(channelId) {
  const { data: audit } = await supabase
    .from('audits')
    .select('id, audit_type, status, created_at, channel_snapshot, executive_summary, benchmark_data, opportunities, recommendations, series_summary')
    .eq('channel_id', channelId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return audit;
}

export async function getQuarterlyData(channelIds, year, quarter) {
  const qStart = new Date(year, (quarter - 1) * 3, 1).toISOString();
  const qEnd = new Date(year, quarter * 3, 0, 23, 59, 59).toISOString();

  const prevQ = quarter === 1 ? 4 : quarter - 1;
  const prevY = quarter === 1 ? year - 1 : year;
  const pStart = new Date(prevY, (prevQ - 1) * 3, 1).toISOString();
  const pEnd = new Date(prevY, prevQ * 3, 0, 23, 59, 59).toISOString();

  const fetchPeriod = async (start, end) => {
    let allVids = [];
    for (const cid of channelIds) {
      const { data } = await supabase
        .from('videos')
        .select('view_count, like_count, comment_count, engagement_rate, watch_hours, impressions, ctr, avg_view_percentage, subscribers_gained, is_short')
        .eq('channel_id', cid)
        .gte('published_at', start)
        .lte('published_at', end);
      allVids = allVids.concat(data || []);
    }
    const sum = (k) => allVids.reduce((s, v) => s + (v[k] || 0), 0);
    const avg = (k) => allVids.length ? sum(k) / allVids.length : 0;
    return {
      totalVideos: allVids.length,
      views: sum('view_count'),
      watchHours: Math.round(sum('watch_hours') * 10) / 10,
      impressions: sum('impressions'),
      subsGained: sum('subscribers_gained'),
      avgEngagement: Math.round(avg('engagement_rate') * 10000) / 100,
      avgCtr: Math.round(avg('ctr') * 1000) / 10,
      avgRetention: Math.round(avg('avg_view_percentage') * 1000) / 10,
    };
  };

  const [current, previous] = await Promise.all([
    fetchPeriod(qStart, qEnd),
    fetchPeriod(pStart, pEnd),
  ]);

  const delta = (curr, prev) => prev ? Math.round((curr - prev) / prev * 1000) / 10 : null;

  return {
    currentQuarter: { label: `Q${quarter} ${year}`, ...current },
    previousQuarter: { label: `Q${prevQ} ${prevY}`, ...previous },
    deltas: {
      views: delta(current.views, previous.views),
      watchHours: delta(current.watchHours, previous.watchHours),
      engagement: delta(current.avgEngagement, previous.avgEngagement),
      videos: delta(current.totalVideos, previous.totalVideos),
    }
  };
}

export async function searchVideos(channelIds, query, { limit = 20 } = {}) {
  let allResults = [];
  for (const cid of channelIds) {
    const { data } = await supabase
      .from('videos')
      .select('youtube_video_id, title, published_at, view_count, engagement_rate, is_short, ctr, avg_view_percentage, watch_hours')
      .eq('channel_id', cid)
      .ilike('title', `%${query}%`)
      .order('view_count', { ascending: false })
      .limit(limit);
    allResults = allResults.concat(data || []);
  }
  return allResults.sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, limit);
}
