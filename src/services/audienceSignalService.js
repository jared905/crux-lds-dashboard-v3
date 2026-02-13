/**
 * Audience Signal Service
 * Auto-computes audience engagement signals from actual YouTube data.
 * All compute functions are pure (no DB calls) — the orchestrator handles Supabase queries.
 */

// ─── Duration Buckets ──────────────────────────────────────────────────────────

const DURATION_BUCKETS = [
  { label: '0-60s (Shorts)', min: 0, max: 60 },
  { label: '1-5 min', min: 61, max: 300 },
  { label: '5-10 min', min: 301, max: 600 },
  { label: '10-20 min', min: 601, max: 1200 },
  { label: '20-30 min', min: 1201, max: 1800 },
  { label: '30+ min', min: 1801, max: Infinity },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function getDurationBucket(seconds) {
  if (seconds == null) return null;
  return DURATION_BUCKETS.find(b => seconds >= b.min && seconds <= b.max) || null;
}

// ─── 1. Format Performance ─────────────────────────────────────────────────────

/**
 * Groups videos by detected_format and video_type, computes engagement metrics per group.
 * Returns high_engagement_formats[] compatible with brand_context.audience_signals shape.
 */
export function computeFormatPerformance(videos) {
  if (!videos?.length) return [];

  // Channel-wide averages
  const channelAvgViews = mean(videos.map(v => v.view_count || 0));
  const channelAvgCtr = mean(videos.filter(v => v.ctr != null).map(v => v.ctr));
  const channelAvgRet = mean(videos.filter(v => v.avg_view_percentage != null).map(v => v.avg_view_percentage));

  if (channelAvgViews === 0) return [];

  // Group by detected_format, then also by video_type
  const groups = {};
  for (const v of videos) {
    const fmt = v.detected_format || (v.video_type === 'short' ? 'shorts' : 'unclassified');
    if (!groups[fmt]) groups[fmt] = [];
    groups[fmt].push(v);
  }

  // Also add video_type groupings (short vs long) as top-level entries
  const shorts = videos.filter(v => v.video_type === 'short');
  const longs = videos.filter(v => v.video_type === 'long');
  if (shorts.length >= 2) groups['Shorts (all)'] = shorts;
  if (longs.length >= 2) groups['Long-form (all)'] = longs;

  const results = [];
  for (const [fmt, vids] of Object.entries(groups)) {
    if (vids.length < 2) continue; // Need minimum sample

    const avgViews = mean(vids.map(v => v.view_count || 0));
    const avgCtr = mean(vids.filter(v => v.ctr != null).map(v => v.ctr));
    const avgRet = mean(vids.filter(v => v.avg_view_percentage != null).map(v => v.avg_view_percentage));
    const totalSubs = vids.reduce((s, v) => s + (v.subscribers_gained || 0), 0);
    const totalViews = vids.reduce((s, v) => s + (v.view_count || 0), 0);
    const subEfficiency = totalViews > 0 ? totalSubs / totalViews : 0;

    const vsAvg = channelAvgViews > 0 ? avgViews / channelAvgViews : 0;

    // Composite score: views (40%) + CTR (30%) + retention (30%)
    const relViews = channelAvgViews > 0 ? avgViews / channelAvgViews : 1;
    const relCtr = channelAvgCtr > 0 ? avgCtr / channelAvgCtr : 1;
    const relRet = channelAvgRet > 0 ? avgRet / channelAvgRet : 1;
    const compositeScore = relViews * 0.4 + relCtr * 0.3 + relRet * 0.3;

    const signalStrength = compositeScore > 1.5 ? 'strong' : compositeScore > 1.0 ? 'moderate' : 'weak';

    const ctrStr = avgCtr > 0 ? `, ${(avgCtr * 100).toFixed(1)}% CTR` : '';
    const retStr = avgRet > 0 ? `, ${(avgRet * 100).toFixed(0)}% retention` : '';

    results.push({
      format: fmt,
      platform: 'YouTube',
      signal_strength: signalStrength,
      notes: `${vids.length} videos avg ${Math.round(avgViews).toLocaleString()} views (${vsAvg.toFixed(1)}x channel avg)${ctrStr}${retStr}`,
      _computed: {
        count: vids.length,
        avg_views: Math.round(avgViews),
        avg_ctr: avgCtr,
        avg_retention: avgRet,
        subscriber_efficiency: subEfficiency,
        vs_channel_avg: parseFloat(vsAvg.toFixed(2)),
        composite_score: parseFloat(compositeScore.toFixed(2)),
      },
    });
  }

  return results.sort((a, b) => b._computed.composite_score - a._computed.composite_score);
}

// ─── 2. Optimal Duration ───────────────────────────────────────────────────────

/**
 * Buckets videos by duration, identifies sweet spots and underperformers.
 */
export function computeOptimalDuration(videos) {
  if (!videos?.length) return null;

  const channelAvgViews = mean(videos.map(v => v.view_count || 0));
  const buckets = [];

  for (const bucket of DURATION_BUCKETS) {
    const vids = videos.filter(v =>
      v.duration_seconds != null &&
      v.duration_seconds >= bucket.min &&
      v.duration_seconds <= bucket.max
    );
    if (vids.length < 2) continue;

    const avgViews = mean(vids.map(v => v.view_count || 0));
    const avgRet = mean(vids.filter(v => v.avg_view_percentage != null).map(v => v.avg_view_percentage));
    const vsAvg = channelAvgViews > 0 ? avgViews / channelAvgViews : 1;

    buckets.push({
      range: bucket.label,
      avg_views: Math.round(avgViews),
      avg_retention: avgRet,
      count: vids.length,
      vs_channel_avg: parseFloat(vsAvg.toFixed(2)),
    });
  }

  if (buckets.length === 0) return null;

  // Sort by performance
  const sorted = [...buckets].sort((a, b) => b.vs_channel_avg - a.vs_channel_avg);
  const sweet_spots = sorted.filter(b => b.vs_channel_avg >= 1.0).slice(0, 3);
  const underperforming = sorted.filter(b => b.vs_channel_avg < 0.8);

  return { sweet_spots, underperforming };
}

// ─── 3. Posting Patterns ───────────────────────────────────────────────────────

/**
 * Analyzes publishing day-of-week performance and frequency.
 */
export function computePostingPatterns(videos) {
  if (!videos?.length) return null;

  const withDates = videos.filter(v => v.published_at);
  if (withDates.length < 5) return null;

  // Day-of-week performance
  const dayGroups = {};
  for (const v of withDates) {
    const day = new Date(v.published_at).getDay();
    if (!dayGroups[day]) dayGroups[day] = [];
    dayGroups[day].push(v.view_count || 0);
  }

  const dayPerformance = Object.entries(dayGroups)
    .map(([day, views]) => ({ day: DAY_NAMES[parseInt(day)], avgViews: mean(views), count: views.length }))
    .filter(d => d.count >= 2)
    .sort((a, b) => b.avgViews - a.avgViews);

  const best_days = dayPerformance.slice(0, 2).map(d => d.day);
  const worst_days = dayPerformance.slice(-1).map(d => d.day);

  // Publishing frequency
  const dates = withDates.map(v => new Date(v.published_at)).sort((a, b) => a - b);
  const spanWeeks = Math.max(1, (dates[dates.length - 1] - dates[0]) / (7 * 24 * 60 * 60 * 1000));
  const avg_uploads_per_week = parseFloat((withDates.length / spanWeeks).toFixed(1));

  // Frequency insight: compare weeks with higher upload counts
  let frequency_insight = null;
  if (withDates.length >= 10) {
    const weekMap = {};
    for (const v of withDates) {
      const d = new Date(v.published_at);
      const weekKey = `${d.getFullYear()}-W${Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7)}`;
      if (!weekMap[weekKey]) weekMap[weekKey] = [];
      weekMap[weekKey].push(v.view_count || 0);
    }
    const weeks = Object.values(weekMap);
    const highFreqWeeks = weeks.filter(w => w.length >= Math.ceil(avg_uploads_per_week * 1.3));
    const lowFreqWeeks = weeks.filter(w => w.length <= Math.floor(avg_uploads_per_week * 0.7));

    if (highFreqWeeks.length >= 2 && lowFreqWeeks.length >= 2) {
      const highAvg = mean(highFreqWeeks.map(w => mean(w)));
      const lowAvg = mean(lowFreqWeeks.map(w => mean(w)));
      if (lowAvg > 0) {
        const diff = Math.round(((highAvg - lowAvg) / lowAvg) * 100);
        if (Math.abs(diff) > 10) {
          frequency_insight = diff > 0
            ? `Weeks with more uploads show ${diff}% higher per-video views`
            : `Weeks with more uploads show ${Math.abs(diff)}% lower per-video views (potential audience fatigue)`;
        }
      }
    }
  }

  return { best_days, worst_days, avg_uploads_per_week, frequency_insight };
}

// ─── 4. Growth Signals ─────────────────────────────────────────────────────────

/**
 * Computes subscriber velocity trends from channel snapshots.
 */
export function computeGrowthSignals(channelSnapshots) {
  if (!channelSnapshots?.length || channelSnapshots.length < 7) return null;

  // Sort by date
  const sorted = [...channelSnapshots].sort((a, b) =>
    new Date(a.snapshot_date) - new Date(b.snapshot_date)
  );

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const recent = sorted.filter(s => new Date(s.snapshot_date) >= thirtyDaysAgo);
  const prior = sorted.filter(s => {
    const d = new Date(s.snapshot_date);
    return d >= sixtyDaysAgo && d < thirtyDaysAgo;
  });

  const recent30d = recent.reduce((s, r) => s + (r.subscriber_change || 0), 0);
  const prior30d = prior.reduce((s, r) => s + (r.subscriber_change || 0), 0);

  const ratio = prior30d > 0 ? parseFloat((recent30d / prior30d).toFixed(2)) : (recent30d > 0 ? 2.0 : 1.0);
  const trend = ratio > 1.2 ? 'accelerating' : ratio < 0.8 ? 'decelerating' : 'stable';

  return {
    subscriber_velocity: { trend, recent_30d: recent30d, prior_30d: prior30d, ratio },
  };
}

// ─── 5. Subscriber Drivers ─────────────────────────────────────────────────────

/**
 * Identifies which content attributes correlate with subscriber gains.
 */
export function computeSubscriberDrivers(videos) {
  if (!videos?.length) return null;

  const withSubs = videos.filter(v => v.subscribers_gained > 0 && v.view_count > 0);
  if (withSubs.length < 3) return null;

  const drivers = [];

  // By format
  const formatGroups = {};
  for (const v of withSubs) {
    const fmt = v.detected_format || 'unclassified';
    if (!formatGroups[fmt]) formatGroups[fmt] = { subs: 0, views: 0, count: 0 };
    formatGroups[fmt].subs += v.subscribers_gained;
    formatGroups[fmt].views += v.view_count;
    formatGroups[fmt].count++;
  }

  for (const [fmt, data] of Object.entries(formatGroups)) {
    if (data.count < 2) continue;
    const efficiency = data.views > 0 ? data.subs / data.views : 0;
    drivers.push({
      attribute: `${fmt} format`,
      sub_efficiency: parseFloat(efficiency.toFixed(5)),
      note: `${Math.round(efficiency * 1000)} subs per 1K views`,
      count: data.count,
    });
  }

  // By duration bucket
  const bucketGroups = {};
  for (const v of withSubs) {
    const bucket = getDurationBucket(v.duration_seconds);
    if (!bucket) continue;
    const key = bucket.label;
    if (!bucketGroups[key]) bucketGroups[key] = { subs: 0, views: 0, count: 0 };
    bucketGroups[key].subs += v.subscribers_gained;
    bucketGroups[key].views += v.view_count;
    bucketGroups[key].count++;
  }

  for (const [bucket, data] of Object.entries(bucketGroups)) {
    if (data.count < 2) continue;
    const efficiency = data.views > 0 ? data.subs / data.views : 0;
    drivers.push({
      attribute: `${bucket} duration`,
      sub_efficiency: parseFloat(efficiency.toFixed(5)),
      note: `${Math.round(efficiency * 1000)} subs per 1K views`,
      count: data.count,
    });
  }

  // By video_type
  for (const vType of ['short', 'long']) {
    const typed = withSubs.filter(v => v.video_type === vType);
    if (typed.length < 2) continue;
    const subs = typed.reduce((s, v) => s + v.subscribers_gained, 0);
    const views = typed.reduce((s, v) => s + v.view_count, 0);
    const efficiency = views > 0 ? subs / views : 0;
    drivers.push({
      attribute: vType === 'short' ? 'Shorts' : 'Long-form',
      sub_efficiency: parseFloat(efficiency.toFixed(5)),
      note: `${Math.round(efficiency * 1000)} subs per 1K views`,
      count: typed.length,
    });
  }

  return drivers.sort((a, b) => b.sub_efficiency - a.sub_efficiency).slice(0, 5);
}

// ─── 6. Content Gaps ───────────────────────────────────────────────────────────

/**
 * Identifies formats where client has high engagement but low production volume.
 */
export function computeContentGaps(videos) {
  if (!videos?.length) return [];

  const channelAvgViews = mean(videos.map(v => v.view_count || 0));
  if (channelAvgViews === 0) return [];

  // Group by detected_format
  const formatGroups = {};
  for (const v of videos) {
    const fmt = v.detected_format;
    if (!fmt) continue;
    if (!formatGroups[fmt]) formatGroups[fmt] = [];
    formatGroups[fmt].push(v);
  }

  const totalVideos = videos.length;
  const gaps = [];

  for (const [fmt, vids] of Object.entries(formatGroups)) {
    if (vids.length < 2) continue;

    const avgViews = mean(vids.map(v => v.view_count || 0));
    const vsAvg = channelAvgViews > 0 ? avgViews / channelAvgViews : 1;
    const volumePct = Math.round((vids.length / totalVideos) * 100);

    // High engagement but low volume = gap
    if (vsAvg >= 1.3 && volumePct <= 20) {
      gaps.push({
        observation: `${fmt} videos get ${vsAvg.toFixed(1)}x channel avg views but only ${volumePct}% of uploads (${vids.length} of ${totalVideos})`,
        youtube_opportunity: `Increase ${fmt} output — high engagement signals audience demand for this format`,
      });
    }
  }

  // Check shorts vs longs imbalance
  const shorts = videos.filter(v => v.video_type === 'short');
  const longs = videos.filter(v => v.video_type === 'long');
  if (shorts.length >= 2 && longs.length >= 2) {
    const shortsAvg = mean(shorts.map(v => v.view_count || 0));
    const longsAvg = mean(longs.map(v => v.view_count || 0));
    const shortsPct = Math.round((shorts.length / totalVideos) * 100);
    const longsPct = Math.round((longs.length / totalVideos) * 100);

    if (shortsAvg > longsAvg * 1.5 && shortsPct < 30) {
      gaps.push({
        observation: `Shorts get ${(shortsAvg / longsAvg).toFixed(1)}x more views than long-form but only ${shortsPct}% of uploads`,
        youtube_opportunity: 'Increase Shorts production to capitalize on higher per-video reach',
      });
    } else if (longsAvg > shortsAvg * 1.5 && longsPct < 30) {
      gaps.push({
        observation: `Long-form gets ${(longsAvg / shortsAvg).toFixed(1)}x more views than Shorts but only ${longsPct}% of uploads`,
        youtube_opportunity: 'Increase long-form production — audience prefers deeper content',
      });
    }
  }

  return gaps;
}

// ─── 7. Assembler ──────────────────────────────────────────────────────────────

/**
 * Combines all computed signals into a single object compatible with
 * brand_context.audience_signals JSONB shape + extended _computed data.
 */
export function assembleAudienceSignals(
  formatPerf, optimalDuration, postingPatterns, growthSignals, subDrivers, contentGaps, videoCount
) {
  return {
    // Compatible with existing audience_signals JSONB shape
    high_engagement_formats: formatPerf || [],
    content_gaps: contentGaps || [],
    audience_demographics_observed: {
      notes: 'Auto-computed from YouTube performance data',
    },
    // Extended computed data
    _computed: {
      generated_at: new Date().toISOString(),
      video_count: videoCount || 0,
      optimal_duration: optimalDuration,
      posting_patterns: postingPatterns,
      growth_signals: growthSignals,
      subscriber_drivers: subDrivers,
    },
  };
}

// ─── 8. Orchestrator ───────────────────────────────────────────────────────────

/**
 * Main entry point. Fetches data from Supabase, delegates to pure compute functions.
 * @param {string} channelId - Client UUID (activeClient.id)
 * @param {Object} options - { days: 90 }
 * @returns {Object|null} - computed audience signals, or null if insufficient data
 */
export async function computeAudienceSignals(channelId, { days = 90 } = {}) {
  if (!channelId) return null;

  const { supabase } = await import('./supabaseClient');
  if (!supabase) return null;

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Get client's channel IDs (client_id is TEXT, id is UUID)
  const { data: channels } = await supabase
    .from('channels')
    .select('id')
    .or(`client_id.eq.${channelId},id.eq.${channelId}`)
    .eq('is_client', true);

  const channelIds = (channels || []).map(c => c.id);
  if (channelIds.length === 0) return null;

  // Parallel queries
  const [videosRes, snapshotsRes] = await Promise.all([
    supabase
      .from('videos')
      .select('id, title, video_type, detected_format, view_count, like_count, comment_count, engagement_rate, duration_seconds, published_at, impressions, ctr, avg_view_percentage, subscribers_gained, watch_hours')
      .in('channel_id', channelIds)
      .gte('published_at', cutoff)
      .order('published_at', { ascending: false }),
    supabase
      .from('channel_snapshots')
      .select('snapshot_date, subscriber_count, subscriber_change')
      .in('channel_id', channelIds)
      .gte('snapshot_date', cutoff.slice(0, 10))
      .order('snapshot_date', { ascending: true }),
  ]);

  const videos = videosRes.data || [];
  const snapshots = snapshotsRes.data || [];

  // Sparse data guard
  if (videos.length < 5) return null;

  // Compute all signals
  const formatPerf = computeFormatPerformance(videos);
  const optimalDuration = computeOptimalDuration(videos);
  const postingPatterns = computePostingPatterns(videos);
  const growthSignals = computeGrowthSignals(snapshots);
  const subDrivers = computeSubscriberDrivers(videos);
  const contentGaps = computeContentGaps(videos);

  return assembleAudienceSignals(
    formatPerf, optimalDuration, postingPatterns, growthSignals, subDrivers, contentGaps, videos.length
  );
}
