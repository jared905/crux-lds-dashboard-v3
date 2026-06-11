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

/**
 * Look up client meta — name, pre-launch flag, video count — so every
 * tool can give honest pre-launch answers instead of silently returning
 * zeros. Pre-launch clients have is_prelaunch=true and (usually) no
 * videos; that's by design, not a missing-data bug.
 */
export async function getClientMeta(clientId) {
  if (!clientId) return null;
  const { data: ch } = await supabase
    .from('channels')
    .select('id, name, is_prelaunch, prelaunch_intended_launch_at, youtube_channel_id, subscriber_count')
    .eq('id', clientId)
    .maybeSingle();
  if (!ch) return null;
  const { count: videoCount } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', clientId);
  return {
    id:              ch.id,
    name:            ch.name,
    isPrelaunch:     !!ch.is_prelaunch,
    intendedLaunchAt: ch.prelaunch_intended_launch_at || null,
    youtubeChannelId: ch.youtube_channel_id || null,
    subscriberCount: ch.subscriber_count || 0,
    videoCount:      videoCount || 0,
  };
}

/**
 * Render the standard "this client is pre-launch — here's why empty
 * channel-side queries are expected" callout. Returned by tools that
 * read channel/video data when there's no own-channel history yet.
 */
export function prelaunchExplainer(meta) {
  const days = meta.intendedLaunchAt
    ? Math.round((new Date(meta.intendedLaunchAt).getTime() - Date.now()) / 86_400_000)
    : null;
  const launchPart = days != null
    ? (days > 0 ? `Intended launch in ${days} day${days === 1 ? '' : 's'}.`
       : days === 0 ? 'Launching today.'
       : `${-days} day${days === -1 ? '' : 's'} past intended launch.`)
    : 'No intended launch date set.';
  return `[PRE-LAUNCH] ${meta.name} has no own-channel data yet — by design. ${launchPart}\n\nFor pre-launch analyses use:\n  • get_competitors — cohort medians serve as the baseline\n  • get_brand_context — positioning, voice, audience persona, pillars (all populated)\n  • get_competitor_comment_signals (if available) — for content-gap detection\n\nChannel-side metrics will populate after the channel launches and the daily sync runs.`;
}

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
    .select('id, name, youtube_channel_id, subscriber_count, size_tier, thumbnail_url, network_id, network_name, custom_url, is_prelaunch')
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
  // 1) Load client channel — need category as a fallback AND is_prelaunch
  //    so we can return a sensible "pre-launch" mode label.
  const { data: ch } = await supabase
    .from('channels')
    .select('id, name, category, is_prelaunch')
    .eq('id', channelId)
    .single();

  if (!ch) return { error: 'Client channel not found' };

  // 2) Modern resolution: client_channels.cohort_role tagging.
  //    The dashboard's cohort system writes peer / aspirational / reference
  //    here; this is the authoritative competitor assignment going forward.
  //    Used for both live and pre-launch clients.
  const { data: cohortRows } = await supabase
    .from('client_channels')
    .select('channel_id, cohort_role')
    .eq('client_id', channelId)
    .in('cohort_role', ['peer', 'aspirational', 'reference']);

  let resolvedVia    = null;     // 'cohort' | 'category' | null
  let resolvedLabel  = null;     // human label for the response header
  let competitorIds  = [];
  let roleByChannel  = new Map();

  if (cohortRows?.length) {
    resolvedVia = 'cohort';
    for (const row of cohortRows) {
      competitorIds.push(row.channel_id);
      roleByChannel.set(row.channel_id, row.cohort_role);
    }
    const counts = cohortRows.reduce((m, r) => { m[r.cohort_role] = (m[r.cohort_role] || 0) + 1; return m; }, {});
    const parts = [];
    if (counts.peer)         parts.push(`${counts.peer} peer`);
    if (counts.aspirational) parts.push(`${counts.aspirational} aspirational`);
    if (counts.reference)    parts.push(`${counts.reference} reference`);
    resolvedLabel = `Cohort assignments (${parts.join(', ')})`;
  } else if (ch.category) {
    // 3) Legacy fallback: shared category. Only used when no cohort
    //    assignments exist — kept for backwards compat with channels
    //    onboarded before the cohort_role system.
    resolvedVia   = 'category';
    resolvedLabel = `Category: ${ch.category} (legacy)`;
    const { data: catCompetitors } = await supabase
      .from('channels')
      .select('id')
      .eq('category', ch.category)
      .eq('is_competitor', true)
      .neq('id', channelId);
    competitorIds = (catCompetitors || []).map(c => c.id);
  }

  if (competitorIds.length === 0) {
    return {
      error: ch.is_prelaunch
        ? `Pre-launch client "${ch.name}" has no cohort competitors tagged. Add peer / aspirational / reference channels at Strategy → Cohort Roles before running competitor analyses.`
        : `Client "${ch.name}" has no competitors assigned. Tag cohort channels at Strategy → Cohort Roles (preferred) or set channels.category as a legacy fallback.`,
      isPrelaunch: ch.is_prelaunch || false,
      resolvedVia: null,
    };
  }

  // 4) Fetch competitor channel rows. Order by subs desc, cap at limit.
  const { data: competitors } = await supabase
    .from('channels')
    .select('id, name, subscriber_count, size_tier, youtube_channel_id')
    .in('id', competitorIds)
    .order('subscriber_count', { ascending: false })
    .limit(limit);

  if (!competitors?.length) {
    return { resolvedVia, label: resolvedLabel, competitors: [], isPrelaunch: ch.is_prelaunch || false };
  }

  // 5) Compute per-competitor recent-video stats over the requested window.
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
      cohortRole: roleByChannel.get(comp.id) || null,
      recentVideos: v.length,
      avgViews: v.length ? Math.round(v.reduce((s, x) => s + (x.view_count || 0), 0) / v.length) : 0,
      avgEngagement: v.length ? Math.round(v.reduce((s, x) => s + (x.engagement_rate || 0), 0) / v.length * 10000) / 100 : 0,
    });
  }

  return {
    resolvedVia,
    label: resolvedLabel,
    competitors: result,
    isPrelaunch: ch.is_prelaunch || false,
    // Keep `category` populated for backwards-compat with callers that
    // still read it; matches what the legacy path used to return.
    category: ch.category || null,
  };
}

/**
 * Compose brand context from the MODERN data model:
 *   - client_strategy_spine: positioning, voice, editorial POV, audience
 *     persona (the rich JSONB persona with pain_points / questions_asked
 *     / voice_patterns / etc.), competitive posture, guardrails
 *   - client_pillars: active pillars (topics) with creative descriptions
 *   - client_business_context: business goals, value prop, target audience
 *   - client_recurring_formats: active recurring creative-execution patterns
 *   - brand_context: LEGACY fallback, kept for backwards compat with
 *     channels onboarded before the Strategy Spine system
 *
 * Returns a composite object. Each section is independently optional —
 * missing pieces become null rather than failing the whole call. This is
 * the right shape for pre-launch clients where the Spine is rich but
 * channel-side data doesn't exist yet.
 */
export async function getBrandContext(channelId) {
  if (!channelId) return null;

  // Modern Strategy Spine + persona (the rich source of truth)
  const { data: spine } = await supabase
    .from('client_strategy_spine')
    .select('positioning_oneliner, positioning_hypothesis, audience_read, editorial_pov, voice_tone, competitive_posture, guardrails, host_archetype, audience_persona, audience_persona_synthesized_at')
    .eq('client_id', channelId)
    .maybeSingle();

  // Active pillars (topics)
  const { data: pillars } = await supabase
    .from('client_pillars')
    .select('title, creative_description, intended_audience, format, sort_order')
    .eq('client_id', channelId)
    .eq('status', 'active')
    .order('sort_order');

  // Active recurring creative-execution formats
  const { data: formats } = await supabase
    .from('client_recurring_formats')
    .select('name, creative_execution, creative_execution_label, cadence, pillar_label, persona_rationale, counter_argument, production_complexity, status')
    .eq('client_id', channelId)
    .in('status', ['piloting', 'active'])
    .is('archived_at', null)
    .order('format_position');

  // Business context
  const { data: business } = await supabase
    .from('client_business_context')
    .select('*')
    .eq('client_id', channelId)
    .maybeSingle();

  // Legacy brand_context (still kept for backwards compat — read but
  // never relied on as the primary source)
  const { data: legacy } = await supabase
    .from('brand_context')
    .select('brand_voice, messaging_priorities, audience_signals, content_themes, strategic_goals, resource_constraints, content_boundaries')
    .eq('channel_id', channelId)
    .eq('is_current', true)
    .maybeSingle();

  // If literally nothing exists, return null so the caller can render
  // "no brand context found" rather than an empty-skeleton object.
  if (!spine && !pillars?.length && !formats?.length && !business && !legacy) {
    return null;
  }

  return {
    spine:    spine || null,
    pillars:  pillars || [],
    recurringFormats: formats || [],
    businessContext:  business || null,
    legacy:   legacy || null,
    sources: {
      spine:    !!spine,
      pillars:  !!(pillars && pillars.length),
      formats:  !!(formats && formats.length),
      business: !!business,
      legacy:   !!legacy,
    },
  };
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
