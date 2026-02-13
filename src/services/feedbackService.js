/**
 * Feedback Service
 * Computes outcome metrics for the Performance Feedback Loop.
 * All functions are pure (no DB calls) — they operate on data passed in.
 */

const fmtInt = (n) => (!n || isNaN(n)) ? '0' : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? '0%' : `${(n * 100).toFixed(1)}%`;

// ─── Title Similarity (Jaccard on word tokens) ─────────────────────────────

function tokenize(text) {
  if (!text) return new Set();
  return new Set(
    text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2)
  );
}

function jaccardSimilarity(a, b) {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── 1. Suggest Video Matches ───────────────────────────────────────────────

/**
 * Given a brief and the client's video rows, suggest top 5 matching videos.
 * Ranks by: title similarity + content type match + publish date proximity.
 */
export function suggestVideoMatches(brief, clientVideos) {
  if (!brief || !clientVideos || clientVideos.length === 0) return [];

  const briefTitle = brief.title || '';
  const briefType = brief.brief_data?.content_type || brief.brief_data?.format || null;
  const briefCreated = brief.created_at ? new Date(brief.created_at) : new Date();

  return clientVideos
    .filter(v => {
      // Only consider videos published after the brief was created (or within 7 days before)
      if (!v.publishDate) return false;
      const pubDate = new Date(v.publishDate);
      const sevenDaysBefore = new Date(briefCreated.getTime() - 7 * 24 * 60 * 60 * 1000);
      const sixtyDaysAfter = new Date(briefCreated.getTime() + 60 * 24 * 60 * 60 * 1000);
      return pubDate >= sevenDaysBefore && pubDate <= sixtyDaysAfter;
    })
    .map(video => {
      // Title similarity (0-1)
      const titleScore = jaccardSimilarity(briefTitle, video.title);

      // Type match bonus (0 or 0.2)
      const typeMatch = (briefType && video.type === briefType) ? 0.2 : 0;

      // Date proximity score (closer = higher, 0-0.3)
      const pubDate = new Date(video.publishDate);
      const daysDiff = Math.abs((pubDate - briefCreated) / (1000 * 60 * 60 * 24));
      const dateScore = Math.max(0, 0.3 * (1 - daysDiff / 60));

      const confidence = Math.min(1, titleScore * 0.5 + typeMatch + dateScore);

      return {
        videoId: video.youtubeVideoId,
        title: video.title,
        views: video.views,
        ctr: video.ctr,
        retention: video.retention,
        type: video.type,
        publishDate: video.publishDate,
        confidence,
        titleScore,
      };
    })
    .filter(m => m.confidence > 0.05)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

// ─── 2. Compute Brief Outcome ───────────────────────────────────────────────

/**
 * Given a brief, its linked video, and all client videos,
 * compute the outcome: baseline vs actual vs predicted.
 */
export function computeBriefOutcome(brief, linkedVideo, clientVideos) {
  if (!brief || !linkedVideo) return null;

  const briefCreated = brief.created_at ? new Date(brief.created_at) : null;
  const videoType = linkedVideo.type || null;

  // Baseline: avg metrics of same-type videos published 30 days before the brief
  let baseline = { views: 0, ctr: 0, retention: 0, count: 0 };
  if (briefCreated) {
    const thirtyDaysBefore = new Date(briefCreated.getTime() - 30 * 24 * 60 * 60 * 1000);
    const baselineVideos = clientVideos.filter(v => {
      if (!v.publishDate) return false;
      const pd = new Date(v.publishDate);
      if (videoType && v.type !== videoType) return false;
      return pd >= thirtyDaysBefore && pd < briefCreated;
    });

    if (baselineVideos.length > 0) {
      baseline.count = baselineVideos.length;
      baseline.views = baselineVideos.reduce((s, v) => s + (v.views || 0), 0) / baselineVideos.length;
      baseline.ctr = baselineVideos.reduce((s, v) => s + (v.ctr || 0), 0) / baselineVideos.length;
      baseline.retention = baselineVideos.reduce((s, v) => s + (v.retention || 0), 0) / baselineVideos.length;
    }
  }

  // Actual: the linked video's performance
  const actual = {
    views: linkedVideo.views || 0,
    ctr: linkedVideo.ctr || 0,
    retention: linkedVideo.retention || 0,
    title: linkedVideo.title,
  };

  // Predicted: from brief_data.impact (if available)
  const predicted = brief.brief_data?.impact || null;

  // Delta calculations
  const viewsDelta = baseline.views > 0 ? ((actual.views - baseline.views) / baseline.views) : null;
  const ctrDelta = baseline.ctr > 0 ? ((actual.ctr - baseline.ctr) / baseline.ctr) : null;
  const retentionDelta = baseline.retention > 0 ? ((actual.retention - baseline.retention) / baseline.retention) : null;

  const outperformed = baseline.views > 0 && actual.views > baseline.views;

  let exceededPrediction = null;
  if (predicted?.viewsPerMonth && baseline.views > 0) {
    const actualGain = actual.views - baseline.views;
    exceededPrediction = actualGain >= predicted.viewsPerMonth;
  }

  return {
    baseline,
    actual,
    predicted,
    delta: {
      views: viewsDelta,
      ctr: ctrDelta,
      retention: retentionDelta,
    },
    outperformed,
    exceededPrediction,
    computedAt: new Date().toISOString(),
  };
}

// ─── 3. Aggregate Feedback ──────────────────────────────────────────────────

/**
 * Compute channel-level before/after metrics + recommendation accuracy.
 */
export function computeAggregateFeedback(briefs, clientVideos) {
  if (!clientVideos || clientVideos.length === 0) {
    return { channelBefore: null, channelAfter: null, accuracy: null, bySourceType: {} };
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Find earliest non-draft brief to determine "before" period
  const activeBriefs = (briefs || []).filter(b => b.status !== 'draft' && b.created_at);
  const earliestBrief = activeBriefs.length > 0
    ? new Date(Math.min(...activeBriefs.map(b => new Date(b.created_at).getTime())))
    : null;

  // Channel "before" period: 30 days before earliest active brief
  let channelBefore = null;
  if (earliestBrief) {
    const beforeStart = new Date(earliestBrief.getTime() - 30 * 24 * 60 * 60 * 1000);
    const beforeVideos = clientVideos.filter(v => {
      if (!v.publishDate) return false;
      const pd = new Date(v.publishDate);
      return pd >= beforeStart && pd < earliestBrief;
    });

    if (beforeVideos.length > 0) {
      channelBefore = {
        period: `${beforeStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${earliestBrief.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        videoCount: beforeVideos.length,
        avgViews: beforeVideos.reduce((s, v) => s + (v.views || 0), 0) / beforeVideos.length,
        avgCtr: beforeVideos.reduce((s, v) => s + (v.ctr || 0), 0) / beforeVideos.length,
        avgRetention: beforeVideos.reduce((s, v) => s + (v.retention || 0), 0) / beforeVideos.length,
        avgSubscribers: beforeVideos.reduce((s, v) => s + (v.subscribers || 0), 0) / beforeVideos.length,
      };
    }
  }

  // Channel "after" period: most recent 30 days
  const afterVideos = clientVideos.filter(v => {
    if (!v.publishDate) return false;
    return new Date(v.publishDate) >= thirtyDaysAgo;
  });

  let channelAfter = null;
  if (afterVideos.length > 0) {
    channelAfter = {
      period: `${thirtyDaysAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – Now`,
      videoCount: afterVideos.length,
      avgViews: afterVideos.reduce((s, v) => s + (v.views || 0), 0) / afterVideos.length,
      avgCtr: afterVideos.reduce((s, v) => s + (v.ctr || 0), 0) / afterVideos.length,
      avgRetention: afterVideos.reduce((s, v) => s + (v.retention || 0), 0) / afterVideos.length,
      avgSubscribers: afterVideos.reduce((s, v) => s + (v.subscribers || 0), 0) / afterVideos.length,
    };
  }

  // Recommendation accuracy from linked briefs
  const linkedBriefs = (briefs || []).filter(b => b.linked_video_id && b.outcome_data);
  let accuracy = null;

  if (linkedBriefs.length > 0) {
    const outperformed = linkedBriefs.filter(b => b.outcome_data.outperformed).length;
    const exceededPrediction = linkedBriefs.filter(b => b.outcome_data.exceededPrediction === true).length;
    const withPrediction = linkedBriefs.filter(b => b.outcome_data.exceededPrediction !== null).length;

    accuracy = {
      total: linkedBriefs.length,
      outperformed,
      outperformedPct: Math.round((outperformed / linkedBriefs.length) * 100),
      exceededPrediction,
      exceededPredictionPct: withPrediction > 0 ? Math.round((exceededPrediction / withPrediction) * 100) : null,
    };
  }

  // Breakdown by source type
  const bySourceType = {};
  linkedBriefs.forEach(b => {
    const src = b.source_type || 'manual';
    if (!bySourceType[src]) {
      bySourceType[src] = { total: 0, outperformed: 0 };
    }
    bySourceType[src].total++;
    if (b.outcome_data.outperformed) bySourceType[src].outperformed++;
  });

  return { channelBefore, channelAfter, accuracy, bySourceType };
}
