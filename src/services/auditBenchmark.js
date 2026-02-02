/**
 * Audit Benchmark Service
 * Tier-stratified competitive benchmarking using existing competitor database.
 */

import { supabase } from './supabaseClient';
import { classifySizeTier } from './auditIngestion';
import { updateAuditProgress, updateAuditSection } from './auditDatabase';

export const TIER_BOUNDARIES = {
  emerging:    { min: 0,       max: 10000    },
  growing:     { min: 10000,   max: 100000   },
  established: { min: 100000,  max: 500000   },
  major:       { min: 500000,  max: 1000000  },
  elite:       { min: 1000000, max: Infinity },
};

/**
 * Get adjacent tiers for expanded peer matching.
 */
function getAdjacentTiers(tier) {
  const tiers = ['emerging', 'growing', 'established', 'major', 'elite'];
  const idx = tiers.indexOf(tier);
  const adjacent = [tier];
  if (idx > 0) adjacent.push(tiers[idx - 1]);
  if (idx < tiers.length - 1) adjacent.push(tiers[idx + 1]);
  return adjacent;
}

/**
 * Find peer channels in the same or adjacent size tier.
 */
export async function findPeerChannels(channelId, sizeTier, { category, limit = 20 } = {}) {
  const boundaries = TIER_BOUNDARIES[sizeTier];
  if (!boundaries) return [];

  // Also include adjacent tiers for broader matching
  const adjacentTiers = getAdjacentTiers(sizeTier);
  const minSub = TIER_BOUNDARIES[adjacentTiers[adjacentTiers.length - 1]]?.min || 0;
  const maxSub = adjacentTiers.includes('elite')
    ? 100000000  // 100M upper bound for elite
    : TIER_BOUNDARIES[adjacentTiers[0]]?.max || 10000000;

  let query = supabase
    .from('channels')
    .select('*')
    .neq('id', channelId)
    .gte('subscriber_count', minSub)
    .lte('subscriber_count', maxSub)
    .eq('sync_enabled', true)
    .order('subscriber_count', { ascending: false })
    .limit(limit);

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('Failed to find peer channels:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Compute percentiles from a sorted array of numbers.
 */
function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(idx, sortedArr.length - 1))];
}

/**
 * Compute benchmark metrics from peer channel videos.
 */
export async function computeBenchmarks(peerChannelIds, days = 90) {
  if (peerChannelIds.length === 0) {
    return null;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data: peerVideos, error } = await supabase
    .from('videos')
    .select('channel_id, view_count, like_count, comment_count, duration_seconds, video_type, published_at')
    .in('channel_id', peerChannelIds)
    .gte('published_at', cutoff.toISOString())
    .order('published_at', { ascending: false });

  if (error || !peerVideos || peerVideos.length === 0) {
    return null;
  }

  // Split by type
  const longFormVideos = peerVideos.filter(v => v.video_type === 'long' || (v.duration_seconds && v.duration_seconds > 180));
  const shortFormVideos = peerVideos.filter(v => v.video_type === 'short' || (v.duration_seconds && v.duration_seconds <= 180));

  // View stats
  const longViews = longFormVideos.map(v => v.view_count || 0).sort((a, b) => a - b);
  const shortViews = shortFormVideos.map(v => v.view_count || 0).sort((a, b) => a - b);
  const allViews = peerVideos.map(v => v.view_count || 0).sort((a, b) => a - b);

  // Engagement rates
  const engagementRates = peerVideos.map(v => {
    const views = Math.max(v.view_count || 1, 1);
    return ((v.like_count || 0) + (v.comment_count || 0)) / views;
  }).sort((a, b) => a - b);

  // Upload frequency per channel
  const channelVideoCount = {};
  for (const v of peerVideos) {
    channelVideoCount[v.channel_id] = (channelVideoCount[v.channel_id] || 0) + 1;
  }
  const weeksInPeriod = days / 7;
  const uploadFrequencies = Object.values(channelVideoCount)
    .map(count => count / weeksInPeriod)
    .sort((a, b) => a - b);

  // Content mix
  const shortsRatio = peerVideos.length > 0 ? shortFormVideos.length / peerVideos.length : 0;

  return {
    peer_count: peerChannelIds.length,
    videos_analyzed: peerVideos.length,
    period_days: days,
    all: {
      median: percentile(allViews, 50),
      p25: percentile(allViews, 25),
      p75: percentile(allViews, 75),
      count: allViews.length,
    },
    longForm: {
      median: percentile(longViews, 50),
      p25: percentile(longViews, 25),
      p75: percentile(longViews, 75),
      count: longViews.length,
    },
    shortForm: {
      median: percentile(shortViews, 50),
      p25: percentile(shortViews, 25),
      p75: percentile(shortViews, 75),
      count: shortViews.length,
    },
    engagementRate: {
      median: percentile(engagementRates, 50),
      p25: percentile(engagementRates, 25),
      p75: percentile(engagementRates, 75),
    },
    uploadFrequency: {
      avg: uploadFrequencies.length > 0
        ? uploadFrequencies.reduce((a, b) => a + b, 0) / uploadFrequencies.length
        : 0,
      median: percentile(uploadFrequencies, 50),
    },
    contentMix: {
      shortsRatio: Math.round(shortsRatio * 100),
      longsRatio: Math.round((1 - shortsRatio) * 100),
    },
  };
}

/**
 * Compare channel metrics against benchmarks.
 */
export function compareAgainstBenchmarks(channelMetrics, benchmarks) {
  if (!benchmarks) {
    return { metrics: [], overallScore: null, hasBenchmarks: false };
  }

  const metrics = [];

  // Views comparison
  if (channelMetrics.avgViews != null && benchmarks.all.median > 0) {
    const ratio = channelMetrics.avgViews / benchmarks.all.median;
    metrics.push({
      name: 'Average Views per Video',
      value: channelMetrics.avgViews,
      benchmark: benchmarks.all.median,
      ratio: Math.round(ratio * 100) / 100,
      status: ratio >= 1.2 ? 'above' : ratio >= 0.8 ? 'at' : 'below',
    });
  }

  // Engagement comparison
  if (channelMetrics.avgEngagement != null && benchmarks.engagementRate.median > 0) {
    const ratio = channelMetrics.avgEngagement / benchmarks.engagementRate.median;
    metrics.push({
      name: 'Engagement Rate',
      value: channelMetrics.avgEngagement,
      benchmark: benchmarks.engagementRate.median,
      ratio: Math.round(ratio * 100) / 100,
      status: ratio >= 1.2 ? 'above' : ratio >= 0.8 ? 'at' : 'below',
    });
  }

  // Upload frequency comparison
  if (channelMetrics.uploadFrequency != null && benchmarks.uploadFrequency.median > 0) {
    const ratio = channelMetrics.uploadFrequency / benchmarks.uploadFrequency.median;
    metrics.push({
      name: 'Upload Frequency (per week)',
      value: channelMetrics.uploadFrequency,
      benchmark: benchmarks.uploadFrequency.median,
      ratio: Math.round(ratio * 100) / 100,
      status: ratio >= 1.2 ? 'above' : ratio >= 0.8 ? 'at' : 'below',
    });
  }

  // Overall score: average of ratios
  const ratios = metrics.map(m => m.ratio).filter(Boolean);
  const overallScore = ratios.length > 0
    ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) / 100
    : null;

  return { metrics, overallScore, hasBenchmarks: true };
}

/**
 * Full benchmark pipeline for an audit.
 */
export async function runBenchmarking(auditId, channel, sizeTier) {
  await updateAuditSection(auditId, 'competitor_matching', { status: 'running' });
  await updateAuditProgress(auditId, { step: 'competitor_matching', pct: 32, message: 'Finding peer channels...' });

  try {
    // Find peers
    const peers = await findPeerChannels(channel.id, sizeTier, { category: channel.category });

    await updateAuditSection(auditId, 'competitor_matching', {
      status: 'completed',
      result_data: { peer_count: peers.length, peer_names: peers.map(p => p.name) },
    });

    await updateAuditSection(auditId, 'benchmarking', { status: 'running' });
    await updateAuditProgress(auditId, {
      step: 'benchmarking',
      pct: 42,
      message: `Computing benchmarks from ${peers.length} peer channels...`,
    });

    if (peers.length === 0) {
      const benchmarkData = {
        hasBenchmarks: false,
        reason: 'No peer channels found in database. Add competitors to improve benchmarking.',
        peer_count: 0,
      };

      await updateAuditProgress(auditId, { step: 'benchmarking', pct: 55, message: 'No peers found for benchmarking' });
      await updateAuditSection(auditId, 'benchmarking', {
        status: 'completed',
        result_data: benchmarkData,
      });

      return benchmarkData;
    }

    // Compute benchmarks
    const peerIds = peers.map(p => p.id);
    const benchmarks = await computeBenchmarks(peerIds, 90);

    // Get channel's own recent metrics for comparison
    const cutoff90 = new Date();
    cutoff90.setDate(cutoff90.getDate() - 90);

    const { data: channelVideos } = await supabase
      .from('videos')
      .select('view_count, like_count, comment_count, published_at')
      .eq('channel_id', channel.id)
      .gte('published_at', cutoff90.toISOString());

    const recentVideos = channelVideos || [];
    const avgViews = recentVideos.length > 0
      ? recentVideos.reduce((s, v) => s + (v.view_count || 0), 0) / recentVideos.length
      : 0;
    const avgEngagement = recentVideos.length > 0
      ? recentVideos.reduce((s, v) => {
          const views = Math.max(v.view_count || 1, 1);
          return s + ((v.like_count || 0) + (v.comment_count || 0)) / views;
        }, 0) / recentVideos.length
      : 0;
    const uploadFrequency = recentVideos.length / (90 / 7);

    const comparison = compareAgainstBenchmarks(
      { avgViews: Math.round(avgViews), avgEngagement, uploadFrequency },
      benchmarks
    );

    const benchmarkData = {
      hasBenchmarks: true,
      peer_count: peers.length,
      peer_names: peers.slice(0, 10).map(p => p.name),
      tier: sizeTier,
      benchmarks,
      comparison,
      channel_metrics: {
        avgViews: Math.round(avgViews),
        avgEngagement,
        uploadFrequency: Math.round(uploadFrequency * 10) / 10,
        videosAnalyzed: recentVideos.length,
      },
    };

    await updateAuditProgress(auditId, { step: 'benchmarking', pct: 55, message: 'Benchmarking complete' });
    await updateAuditSection(auditId, 'benchmarking', {
      status: 'completed',
      result_data: benchmarkData,
    });

    return benchmarkData;

  } catch (err) {
    await updateAuditSection(auditId, 'benchmarking', {
      status: 'failed',
      error_message: err.message,
    });
    throw err;
  }
}
