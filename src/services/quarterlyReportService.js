/**
 * Quarterly Report Service
 * Full View Analytics - Crux Media
 *
 * Generates quarterly comparison data for client channels.
 * Compares current quarter vs previous quarter metrics.
 */

import { supabase } from './supabaseClient';

/**
 * Get quarter date boundaries
 */
export function getQuarterDates(year, quarter) {
  const starts = { 1: '01-01', 2: '04-01', 3: '07-01', 4: '10-01' };
  const ends = { 1: '03-31', 2: '06-30', 3: '09-30', 4: '12-31' };
  return {
    year,
    quarter,
    start: `${year}-${starts[quarter]}`,
    end: `${year}-${ends[quarter]}`,
    label: `Q${quarter} ${year}`,
  };
}

/**
 * Get the previous quarter
 */
export function getPreviousQuarter(year, quarter) {
  if (quarter === 1) return { year: year - 1, quarter: 4 };
  return { year, quarter: quarter - 1 };
}

/**
 * Get current quarter info
 */
export function getCurrentQuarter() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const quarter = Math.floor(month / 3) + 1;
  return { year: now.getFullYear(), quarter };
}

/**
 * Fetch video performance data for a date range
 */
async function fetchVideoDataForPeriod(channelId, startDate, endDate) {
  if (!supabase) throw new Error('Supabase not configured');

  // Get videos published in this period.
  // Exclude non-public videos so scheduled/private/unlisted uploads don't
  // pollute "underperforming" calls in the AI narrative. NULL privacy_status
  // is treated as public (not yet synced after migration 060).
  const { data: videos, error } = await supabase
    .from('videos')
    .select('*')
    .eq('channel_id', channelId)
    .gte('published_at', `${startDate}T00:00:00`)
    .lte('published_at', `${endDate}T23:59:59`)
    .or('privacy_status.eq.public,privacy_status.is.null')
    .order('published_at', { ascending: false });

  if (error) throw error;

  // Belt-and-suspenders: also drop any video with 0 views AND 0 impressions.
  // These are effectively private even if privacy_status says otherwise.
  return (videos || []).filter(v => (v.view_count || 0) > 0 || (v.impressions || 0) > 0);
}

/**
 * Fetch aggregate snapshots for a period (daily analytics)
 */
async function fetchSnapshotsForPeriod(channelId, startDate, endDate) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: snapshots, error } = await supabase
    .from('video_snapshots')
    .select('video_id, snapshot_date, view_count, watch_hours, avg_view_percentage, subscribers_gained, impressions, ctr')
    .eq('channel_id', channelId)
    .gte('snapshot_date', startDate)
    .lte('snapshot_date', endDate);

  // Snapshots may not have channel_id — get via video join
  if (error || !snapshots?.length) {
    // Try joining through videos table
    const { data: videoIds } = await supabase
      .from('videos')
      .select('id')
      .eq('channel_id', channelId);

    if (videoIds?.length) {
      const ids = videoIds.map(v => v.id);
      const { data: snaps2 } = await supabase
        .from('video_snapshots')
        .select('video_id, snapshot_date, view_count, watch_hours, avg_view_percentage, subscribers_gained, impressions, ctr')
        .in('video_id', ids)
        .gte('snapshot_date', startDate)
        .lte('snapshot_date', endDate);
      return snaps2 || [];
    }
  }

  return snapshots || [];
}

/**
 * Fetch channel-level deltas for a period from channel_snapshots.
 * Returns subscriber delta, view delta, and snapshot count.
 * This is the most reliable source — it comes directly from the
 * YouTube Data API's channel statistics, tracked daily.
 */
async function fetchChannelDeltas(channelIds, startDate, endDate) {
  if (!supabase) return null;
  let totalSubsDelta = 0;
  let totalViewDelta = 0;
  let hasData = false;

  for (const channelId of channelIds) {
    const [{ data: earliest }, { data: latest }] = await Promise.all([
      supabase
        .from('channel_snapshots')
        .select('subscriber_count, total_view_count')
        .eq('channel_id', channelId)
        .gte('snapshot_date', startDate)
        .lte('snapshot_date', endDate)
        .order('snapshot_date', { ascending: true })
        .limit(1)
        .single(),
      supabase
        .from('channel_snapshots')
        .select('subscriber_count, total_view_count')
        .eq('channel_id', channelId)
        .gte('snapshot_date', startDate)
        .lte('snapshot_date', endDate)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single(),
    ]);

    if (earliest?.subscriber_count != null && latest?.subscriber_count != null) {
      totalSubsDelta += latest.subscriber_count - earliest.subscriber_count;
      hasData = true;
    }
    if (earliest?.total_view_count != null && latest?.total_view_count != null) {
      totalViewDelta += latest.total_view_count - earliest.total_view_count;
    }
  }

  return hasData ? { subsDelta: totalSubsDelta, viewDelta: totalViewDelta } : null;
}

/**
 * Compute quarter metrics from video data
 */
function computeQuarterMetrics(videos, snapshots, channelCount = 1) {
  const totalVideos = videos.length;
  const shorts = videos.filter(v => v.video_type === 'short' || (v.duration_seconds && v.duration_seconds <= 60));
  const longs = videos.filter(v => v.video_type === 'long' || (!v.video_type && (!v.duration_seconds || v.duration_seconds > 60)));

  // Cumulative views from video records
  const totalViews = videos.reduce((s, v) => s + (v.view_count || 0), 0);
  const totalLikes = videos.reduce((s, v) => s + (v.like_count || 0), 0);
  const totalComments = videos.reduce((s, v) => s + (v.comment_count || 0), 0);
  const avgViews = totalVideos > 0 ? totalViews / totalVideos : 0;
  const engagementRate = totalViews > 0 ? (totalLikes + totalComments) / totalViews : 0;

  // Format-split avg views
  const shortsViews = shorts.reduce((s, v) => s + (v.view_count || 0), 0);
  const longsViews = longs.reduce((s, v) => s + (v.view_count || 0), 0);
  const shortsAvgViews = shorts.length > 0 ? shortsViews / shorts.length : 0;
  const longsAvgViews = longs.length > 0 ? longsViews / longs.length : 0;

  // From snapshots (daily analytics), with video-table fallback if snapshots are sparse
  const snapshotWatchHours = snapshots.reduce((s, snap) => s + (snap.watch_hours || 0), 0);
  const videoWatchHours = videos.reduce((s, v) => s + (v.watch_hours || 0), 0);
  const totalWatchHours = snapshotWatchHours > 0 ? snapshotWatchHours : videoWatchHours;

  // Impressions from snapshots, with videos table fallback when snapshots are sparse
  const snapshotImpressions = snapshots.reduce((s, snap) => s + (snap.impressions || 0), 0);
  const videoImpressions = videos.reduce((s, v) => s + (v.impressions || 0), 0);
  const totalImpressions = snapshotImpressions > 0 ? snapshotImpressions : videoImpressions;

  // Subscribers: prefer snapshot sum (accurate per-day data).
  // Check if any snapshots have subscriber data at all before falling back,
  // since net subs can legitimately be zero or negative.
  const subsSnapshots = snapshots.filter(s => s.subscribers_gained != null);
  const snapshotSubsGained = subsSnapshots.reduce((s, snap) => s + (snap.subscribers_gained || 0), 0);
  const videoSubsGained = videos.reduce((s, v) => s + (v.subscribers_gained || 0), 0);
  const totalSubsGained = subsSnapshots.length > 0 ? snapshotSubsGained : videoSubsGained;

  // Build video ID sets for format-split retention
  const shortVideoIds = new Set(shorts.map(v => v.id));
  const longVideoIds = new Set(longs.map(v => v.id));

  // Average retention from snapshots (blended)
  // Normalize: Analytics API stores as decimal (0.45 for 45%), but some older data
  // or CSV imports may store as percentage (45.0). Values > 1 are treated as percentages.
  const normalizeRetention = (v) => v > 1 ? v / 100 : v;
  let retentionVals = snapshots.filter(s => s.avg_view_percentage > 0).map(s => normalizeRetention(s.avg_view_percentage));
  // Fallback: if snapshots have no retention data, use videos table
  if (retentionVals.length === 0) {
    retentionVals = videos.filter(v => v.avg_view_percentage > 0).map(v => normalizeRetention(v.avg_view_percentage));
  }
  const avgRetention = retentionVals.length > 0 ? retentionVals.reduce((s, v) => s + v, 0) / retentionVals.length : 0;

  // Format-split retention
  const shortsRetentionVals = snapshots.filter(s => s.avg_view_percentage > 0 && shortVideoIds.has(s.video_id)).map(s => normalizeRetention(s.avg_view_percentage));
  const longsRetentionVals = snapshots.filter(s => s.avg_view_percentage > 0 && longVideoIds.has(s.video_id)).map(s => normalizeRetention(s.avg_view_percentage));
  const shortsAvgRetention = shortsRetentionVals.length > 0 ? shortsRetentionVals.reduce((s, v) => s + v, 0) / shortsRetentionVals.length : 0;
  const longsAvgRetention = longsRetentionVals.length > 0 ? longsRetentionVals.reduce((s, v) => s + v, 0) / longsRetentionVals.length : 0;

  // Impression-weighted CTR from snapshots (simple average overweights low-impression days)
  // Falls back to impression-weighted average from videos table if snapshots lack CTR
  const ctrRows = snapshots.filter(s => s.ctr > 0 && s.impressions > 0);
  const ctrImpressionTotal = ctrRows.reduce((s, r) => s + r.impressions, 0);
  let avgCTR = 0;
  if (ctrImpressionTotal > 0) {
    avgCTR = ctrRows.reduce((s, r) => s + r.ctr * r.impressions, 0) / ctrImpressionTotal;
  } else {
    // Fallback: impression-weighted CTR from videos table
    const videoCtrRows = videos.filter(v => v.ctr > 0 && v.impressions > 0);
    const videoImpTotal = videoCtrRows.reduce((s, v) => s + v.impressions, 0);
    avgCTR = videoImpTotal > 0
      ? videoCtrRows.reduce((s, v) => s + v.ctr * v.impressions, 0) / videoImpTotal
      : 0;
  }

  // Upload frequency (videos per week)
  const uploadFrequency = totalVideos / 13; // 13 weeks in a quarter
  const uploadsPerChannel = channelCount > 0 ? totalVideos / channelCount / 13 : uploadFrequency;

  // Subscriber conversion rate
  const subConversionRate = totalViews > 0 ? totalSubsGained / totalViews : 0;

  // Top videos
  const topByViews = [...videos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 10);
  const topByEngagement = [...videos]
    .map(v => ({
      ...v,
      engRate: v.view_count > 0 ? ((v.like_count || 0) + (v.comment_count || 0)) / v.view_count : 0,
    }))
    .sort((a, b) => b.engRate - a.engRate)
    .slice(0, 10);

  return {
    totalVideos,
    shortsCount: shorts.length,
    longsCount: longs.length,
    totalViews,
    avgViews,
    shortsAvgViews,
    longsAvgViews,
    totalLikes,
    totalComments,
    engagementRate,
    totalWatchHours,
    totalImpressions,
    totalSubsGained,
    avgRetention,
    shortsAvgRetention,
    longsAvgRetention,
    avgCTR,
    uploadFrequency,
    uploadsPerChannel,
    subConversionRate,
    topByViews,
    topByEngagement,
  };
}

/**
 * Compute delta between two quarters
 */
function computeDeltas(current, previous) {
  const delta = (curr, prev) => {
    if (!prev || prev === 0) return { value: curr, change: null, pct: null };
    const change = curr - prev;
    const pct = (change / prev) * 100;
    return { value: curr, change, pct };
  };

  return {
    totalVideos: delta(current.totalVideos, previous.totalVideos),
    totalViews: delta(current.totalViews, previous.totalViews),
    avgViews: delta(current.avgViews, previous.avgViews),
    shortsAvgViews: delta(current.shortsAvgViews, previous.shortsAvgViews),
    longsAvgViews: delta(current.longsAvgViews, previous.longsAvgViews),
    engagementRate: delta(current.engagementRate, previous.engagementRate),
    totalWatchHours: delta(current.totalWatchHours, previous.totalWatchHours),
    totalImpressions: delta(current.totalImpressions, previous.totalImpressions),
    totalSubsGained: delta(current.totalSubsGained, previous.totalSubsGained),
    avgRetention: delta(current.avgRetention, previous.avgRetention),
    shortsAvgRetention: delta(current.shortsAvgRetention, previous.shortsAvgRetention),
    longsAvgRetention: delta(current.longsAvgRetention, previous.longsAvgRetention),
    avgCTR: delta(current.avgCTR, previous.avgCTR),
    uploadFrequency: delta(current.uploadFrequency, previous.uploadFrequency),
    uploadsPerChannel: delta(current.uploadsPerChannel, previous.uploadsPerChannel),
    subConversionRate: delta(current.subConversionRate, previous.subConversionRate),
  };
}

/**
 * Get all channel IDs for a client (including network members)
 */
async function getAllChannelIds(channelId) {
  if (!supabase) return [channelId];

  // Check if this channel has network members
  const { data: members } = await supabase
    .from('channels')
    .select('id')
    .eq('network_id', channelId);

  const ids = [channelId];
  if (members?.length > 0) {
    ids.push(...members.map(m => m.id));
  }
  return ids;
}

/**
 * Generate full quarterly report data
 * @param {string} channelId - Primary channel ID
 * @param {number} year
 * @param {number} quarter
 * @param {string[]} [explicitChannelIds] - If provided, use these IDs instead of auto-detecting network members
 */
export async function generateQuarterlyReport(channelId, year, quarter, explicitChannelIds) {
  const current = getQuarterDates(year, quarter);
  const prev = getPreviousQuarter(year, quarter);
  const previous = getQuarterDates(prev.year, prev.quarter);

  // Use explicit channel IDs if provided (from activeClient.networkMembers), otherwise auto-detect
  const allChannelIds = explicitChannelIds?.length > 0 ? explicitChannelIds : await getAllChannelIds(channelId);

  // Fetch data for both quarters across ALL channels
  const [currentVideos, previousVideos, currentSnapshots, previousSnapshots] = await Promise.all([
    Promise.all(allChannelIds.map(id => fetchVideoDataForPeriod(id, current.start, current.end))).then(a => a.flat()),
    Promise.all(allChannelIds.map(id => fetchVideoDataForPeriod(id, previous.start, previous.end))).then(a => a.flat()),
    Promise.all(allChannelIds.map(id => fetchSnapshotsForPeriod(id, current.start, current.end))).then(a => a.flat()),
    Promise.all(allChannelIds.map(id => fetchSnapshotsForPeriod(id, previous.start, previous.end))).then(a => a.flat()),
  ]);

  const currentMetrics = computeQuarterMetrics(currentVideos, currentSnapshots, allChannelIds.length);
  const previousMetrics = computeQuarterMetrics(previousVideos, previousSnapshots, allChannelIds.length);

  // Channel-level delta fallback from channel_snapshots (Data API subscriber_count
  // and total_view_count). This is the most reliable source — it works for ALL
  // channels regardless of whether Analytics or Reporting APIs are available.
  // Used when per-video snapshot/video table data is empty.
  const [currentChannelDeltas, previousChannelDeltas] = await Promise.all([
    fetchChannelDeltas(allChannelIds, current.start, current.end),
    fetchChannelDeltas(allChannelIds, previous.start, previous.end),
  ]);

  if (currentMetrics.totalSubsGained === 0 && currentChannelDeltas?.subsDelta != null) {
    currentMetrics.totalSubsGained = currentChannelDeltas.subsDelta;
    currentMetrics._subsSource = 'channel_snapshots';
  }
  if (previousMetrics.totalSubsGained === 0 && previousChannelDeltas?.subsDelta != null) {
    previousMetrics.totalSubsGained = previousChannelDeltas.subsDelta;
    previousMetrics._subsSource = 'channel_snapshots';
  }

  const deltas = computeDeltas(currentMetrics, previousMetrics);

  // Get channel info
  const { data: channelData } = await supabase
    .from('channels')
    .select('id, name, thumbnail_url, subscriber_count, youtube_channel_id')
    .eq('id', channelId)
    .single();

  // Fetch audience intelligence data (demographics, traffic, geography, devices)
  let audienceData = null;
  try {
    const mergedAudience = { gender: {}, age: {}, country: {}, province: {}, trafficSources: {}, deviceTypes: {} };
    for (const chId of allChannelIds) {
      const { data: snap } = await supabase
        .from('channel_audience_snapshots')
        .select('gender_distribution, age_distribution, country_data, province_data, traffic_sources, device_types')
        .eq('channel_id', chId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();
      if (!snap) continue;
      if (snap.gender_distribution) for (const [k, v] of Object.entries(snap.gender_distribution)) mergedAudience.gender[k] = (mergedAudience.gender[k] || 0) + v;
      if (snap.age_distribution) for (const [k, v] of Object.entries(snap.age_distribution)) mergedAudience.age[k] = (mergedAudience.age[k] || 0) + v;
      if (snap.country_data) for (const [k, v] of Object.entries(snap.country_data)) {
        if (!mergedAudience.country[k]) mergedAudience.country[k] = { views: 0 };
        mergedAudience.country[k].views += v.views || 0;
      }
      if (snap.province_data) for (const [k, v] of Object.entries(snap.province_data)) {
        if (!mergedAudience.province[k]) mergedAudience.province[k] = { views: 0 };
        mergedAudience.province[k].views += v.views || 0;
      }
      if (snap.traffic_sources) for (const [k, v] of Object.entries(snap.traffic_sources)) {
        if (!mergedAudience.trafficSources[k]) mergedAudience.trafficSources[k] = { views: 0 };
        mergedAudience.trafficSources[k].views += v.views || 0;
      }
      if (snap.device_types) for (const [k, v] of Object.entries(snap.device_types)) {
        if (!mergedAudience.deviceTypes[k]) mergedAudience.deviceTypes[k] = { views: 0 };
        mergedAudience.deviceTypes[k].views += v.views || 0;
      }
    }
    const chCount = allChannelIds.length;
    if (chCount > 1) {
      for (const k of Object.keys(mergedAudience.gender)) mergedAudience.gender[k] /= chCount;
      for (const k of Object.keys(mergedAudience.age)) mergedAudience.age[k] /= chCount;
    }
    if (Object.keys(mergedAudience.gender).length > 0) audienceData = mergedAudience;
  } catch (err) {
    console.warn('[QuarterlyReport] Audience data fetch failed:', err);
  }

  return {
    channel: channelData,
    channelCount: allChannelIds.length,
    currentQuarter: { ...current, metrics: currentMetrics },
    previousQuarter: { ...previous, metrics: previousMetrics },
    deltas,
    audienceData,
    hasSnapshotData: currentSnapshots.length > 0,
    hasPreviousData: previousVideos.length > 0,
    hasImpressions: currentMetrics.totalImpressions > 0,
    subsSource: currentMetrics._subsSource || (currentSnapshots.some(s => s.subscribers_gained != null) ? 'video_snapshots' : 'videos_table'),
    generatedAt: new Date().toISOString(),
  };
}

// Voice block — verbatim from the prompt spec
const VOICE_BLOCK = `VOICE

Write like a thought leader on a TED stage, not a consultant in a boardroom.
Reference voices: James Clear, Simon Sinek, Tim Ferriss.

Rules:
- Open each recommendation with the claim or reframe, not the data. Data is evidence; lead with the point it proves.
- Use one concrete example as the argument, not as support. The example IS the insight.
- Short sentences. Vary rhythm. No three-clause consulting sentences with semicolons.
- No setup phrases: "Imagine if," "Consider that," "It's worth noting," "In today's landscape."
- No forced aphorisms. If a line doesn't earn being quotable, don't try.

Banned phrases (rewrite with a concrete number or outcome if one of these feels necessary):
"meaningful incremental," "high-leverage," "repeatable model," "strong fundamentals,"
"proven efficiency," "activate potential," "sustained growth," "at scale," "optimize,"
"streamline," "excited to help," "full potential," "strategic opportunity,"
"unlock value," "drive results," "level up," "game-changer."

Agent-neutral framing: Recommendations are options the client evaluates, not work plans.
- Banned: "we can," "we'd recommend," "we'll handle," "happy to draft," "we're excited to."
- Use instead: "One path is," "An alternative is," "The tradeoff is."
- End each rec with the decision the client faces, not the task Crux would execute.

Every claim must be falsifiable. If it can't be wrong, it isn't an insight — rewrite with a testable prediction.`;

const STRUCTURE_BLOCK = `STRUCTURE

Produce 3-5 recommendations total. Five is a ceiling, not a target. If you can only justify
three strong recs, write three.

Per recommendation, required elements (order flexible, format flexible):
  1. LEADING CLAIM — one sentence. The insight or reframe, not the data.
  2. EVIDENCE — the minimum data needed to support the claim. Do not restate every metric.
  3. TWO OPTIONS — two distinct paths the client could take, with different tradeoffs.
     Not two versions of the same thing. Genuinely different bets.
     Example: "Option A: invest in X (faster payoff, higher risk). Option B: invest in Y
     (slower payoff, compounds over time)."
  4. THE RECOMMENDATION — which option you'd pick and why, in one or two sentences.
  5. ASSUMPTION & INVALIDATION — what has to be true for this rec to work, and what would
     prove it wrong.
  6. DECISION FRAME — the specific decision the client needs to make, phrased as a question.

Do NOT force every rec into the same length or shape. A high-confidence rec can be 80 words.
A rec that requires explaining context can be 250. Vary.

Priority rank: Number recs 1-5 by impact × feasibility. The #1 rec is the one the client
should act on first. Explain the ranking criteria in one sentence at the top of the section.

Cross-rec tension check: Before finalizing, scan all recs for contradictions. If two recs
depend on opposite premises, reconcile in text or drop the weaker one.

Subtractive recs allowed: Not every rec must be additive. "Stop doing X" is a valid rec
when evidence supports it.

Executive summary: Open with a 2-3 sentence synthesis that a director-tier reader could act
on without reading the recs below. Lead with the most important implication of the quarter,
not a restatement of top-line metrics.

Banned rec formats:
- Insight / Opportunity / 3 Actions (the prior template — do not reproduce).
- "Here are some ideas to consider" laundry lists.
- Recs that end with "we'll track and report back" — that's a process note, not a decision.`;

const NUMERIC_BLOCK = `NUMERIC DISCIPLINE

Realistic lift ranges (do not exceed without explicit data justification):
- Title/thumbnail test: 10-30% CTR change typical. 50%+ is rare and requires a specific
  comparable in the same channel.
- End-screen click-through: 1-3%. Never project 5%+.
- Hook-based retention improvement: 3-8 percentage points.
- Cross-channel traffic redistribution: 0.5-2% of source channel views, not 5%+.

Framing rules:
- Never use "even X%" to imply a conservative floor. State the realistic range.
- Never project lifts for recs that depend on unobserved variables (e.g., "if Elder X
  publishes 4 videos next quarter" — you don't know if that will happen).
- When stating a projected outcome, include the baseline, the realistic range, and what
  would constitute a win. Example: "Current CTR 5.0%. Realistic range after title test:
  5.5-6.5%. Win condition: sustained 6%+ across next 3 uploads."

Math sanity check (run before finalizing every rec):
- Do the numbers in this rec cross-check? If you say "half of X's average," is X the total
  or the average?
- Do percentages add up to the claim? If you say "37.8% of network total," does the raw
  number match?
- Is the denominator explicit? "14,270 subscribers" — of what base? Cite it.
- If any number fails the cross-check, rewrite the claim.

Delta framing:
- Frame current-vs-prior quarter deltas as directional signals, not proof. A single quarter
  of movement is weak evidence. Say so when it matters.
- Prior narratives (if provided) are read-only history. Reference them only when directly
  relevant — e.g., "last quarter's recommendation to X played out as Y." Do not force
  continuity where none exists.`;

function buildAudienceBlock({ clientName, honorificsBlock, audienceData, channelCount }) {
  const isLDS = /(lds|leadership|church of jesus christ|apostle)/i.test(clientName || '');

  const audienceLines = [];
  if (audienceData) {
    if (audienceData.gender && Object.keys(audienceData.gender).length) {
      const gender = Object.entries(audienceData.gender).sort(([,a],[,b]) => b - a)
        .map(([g, p]) => `${g === 'user_specified' ? 'Other' : g.charAt(0).toUpperCase() + g.slice(1)} ${p.toFixed(1)}%`).join(', ');
      audienceLines.push(`  Gender: ${gender}`);
    }
    if (audienceData.age && Object.keys(audienceData.age).length) {
      const ages = Object.entries(audienceData.age).sort(([,a],[,b]) => b - a).slice(0, 3)
        .map(([k, p]) => `${k.replace('age','')} (${p.toFixed(1)}%)`).join(', ');
      audienceLines.push(`  Top age groups: ${ages}`);
    }
    if (audienceData.country && Object.keys(audienceData.country).length) {
      const countries = Object.entries(audienceData.country).sort(([,a],[,b]) => b.views - a.views)
        .slice(0, 5).map(([code]) => code).join(', ');
      audienceLines.push(`  Top countries: ${countries}`);
    }
    if (audienceData.province && Object.keys(audienceData.province).length) {
      const states = Object.entries(audienceData.province).sort(([,a],[,b]) => b.views - a.views)
        .slice(0, 5).map(([code]) => code.replace('US-', '')).join(', ');
      audienceLines.push(`  Top US states: ${states}`);
    }
    if (audienceData.trafficSources && Object.keys(audienceData.trafficSources).length) {
      const labels = {YT_SEARCH:'Search',SUBSCRIBER:'Subscribers',SUGGESTED:'Suggested',BROWSE:'Browse',EXT_URL:'External',SHORTS:'Shorts Feed',NOTIFICATION:'Notifications',YT_CHANNEL:'Channel Page'};
      const totalV = Object.values(audienceData.trafficSources).reduce((s,t) => s + t.views, 0);
      const traffic = Object.entries(audienceData.trafficSources).sort(([,a],[,b]) => b.views - a.views).slice(0, 5)
        .map(([k, v]) => `${labels[k] || k} ${totalV > 0 ? ((v.views/totalV)*100).toFixed(0) : 0}%`).join(', ');
      audienceLines.push(`  Traffic sources: ${traffic}`);
    }
    if (audienceData.deviceTypes && Object.keys(audienceData.deviceTypes).length) {
      const totalD = Object.values(audienceData.deviceTypes).reduce((s,d) => s + d.views, 0);
      const devices = Object.entries(audienceData.deviceTypes).sort(([,a],[,b]) => b.views - a.views)
        .map(([k, v]) => `${k.charAt(0) + k.slice(1).toLowerCase()} ${totalD > 0 ? ((v.views/totalD)*100).toFixed(0) : 0}%`).join(', ');
      audienceLines.push(`  Device split: ${devices}`);
    }
  }

  const domainLines = isLDS ? [
    '  - Apostle speaking appearances are NOT infinitely scalable, but content production around',
    '    existing appearances IS scalable. Valid growth paths: new series, conference recuts,',
    '    devotional clip extraction, archival content, topical compilations, Shorts from long-form.',
    '    Invalid frames: asking an apostle to "upload more" or "increase cadence" as if they are',
    '    a solo creator.',
  ] : [
    '  - Content production scales via repurposing, series structure, and format-specific variants',
    '    more than raw upload velocity.',
  ];

  return `AUDIENCE

Client: ${clientName || 'this channel'}${channelCount > 1 ? ` (${channelCount}-channel network).` : '.'}

Primary readers (mixed — same report serves all three):
  1. Producer/strategist tier: wants tactical specificity, exact numbers, executable next steps.
  2. Director/executive tier: wants implication, tradeoffs, and the decision they need to make.
  3. Crux internal team: uses the report to align on monthly priorities.

The report's job, ranked:
  1. Drive client decisions (primary).
  2. Demonstrate ongoing strategic partnership (retainer justification).
  3. Track network health over time (scorecard).

${isLDS ? `LDS honorifics (current active roster):
${honorificsBlock}

Honorific rules:
- First reference: full title + full name ("Elder David A. Bednar," "President Henry B. Eyring").
- Subsequent references: title + last name ("Elder Bednar," "President Eyring").
- Never use bare last names. Never use "Mr." or no title at all.
- If a channel name in the data doesn't match an honorifics entry, use the channel name as
  shown and flag the line for manual review in the output.

` : ''}Domain context you must know:
${domainLines.join('\n')}
  - Reader is YouTube-fluent. Skip algorithm 101 ("YouTube favors consistent cadence" — they know).
  - Lead with implication before evidence.

Audience profile this quarter:
${audienceLines.length ? audienceLines.join('\n') : '  (No audience data available — do not speculate about demographics.)'}

Device mentions: Only call out device data if something is notably unusual (TV viewership
above 15%, or mobile below 50%). Do not dedicate a section to devices.

Private/unlisted/scheduled video safety net:
Any video with zero impressions AND zero views is already excluded from the data you see.
Do not cite any video as "underperforming" without a non-zero view count.`;
}

/**
 * Generate Claude narrative for quarterly report — four-block prompt architecture.
 */
export async function generateQuarterlyNarrative(reportData, opts = {}) {
  try {
    const claudeAPI = (await import('./claudeAPI')).default;
    const { channel, currentQuarter, previousQuarter, deltas, audienceData, channelCount } = reportData;
    const channelId = opts.channelId || channel?.id;
    const clientName = opts.clientName || channel?.name;

    // Pass 1.1: Load honorifics
    const { fetchActiveHonorifics, formatHonorificsBlock } = await import('./honorificsService');
    const honorifics = await fetchActiveHonorifics();
    const honorificsBlock = formatHonorificsBlock(honorifics);

    // Pass 4: Load prior narratives (cross-period memory)
    let priorNarrativesBlock = '';
    if (channelId && currentQuarter.year && currentQuarter.quarter) {
      const { fetchPriorNarratives, formatPriorNarrativesBlock } = await import('./narrativeArchiveService');
      const prior = await fetchPriorNarratives(channelId, currentQuarter.year, currentQuarter.quarter, 2);
      if (prior.length > 0) {
        priorNarrativesBlock = `\n\nPRIOR NARRATIVES (read-only history)\n\n${formatPriorNarrativesBlock(prior)}`;
      }
    }

    const fmt = (n) => {
      if (!n || isNaN(n)) return '0';
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
      return Math.round(n).toLocaleString();
    };

    const audienceBlock = buildAudienceBlock({
      clientName,
      honorificsBlock,
      audienceData,
      channelCount: channelCount || 1,
    });

    // Data payload — unchanged format, comes after the instruction blocks
    const dataPayload = `DATA PAYLOAD

## ${currentQuarter.label} Performance
- Videos published: ${currentQuarter.metrics.totalVideos} (${currentQuarter.metrics.shortsCount} shorts, ${currentQuarter.metrics.longsCount} long-form)
- Total views: ${fmt(currentQuarter.metrics.totalViews)}
- Average views per video: ${fmt(currentQuarter.metrics.avgViews)}
- Watch hours: ${fmt(currentQuarter.metrics.totalWatchHours)}
- Subscribers gained: ${fmt(currentQuarter.metrics.totalSubsGained)}
- Engagement rate: ${(currentQuarter.metrics.engagementRate * 100).toFixed(2)}%
- Upload frequency: ${currentQuarter.metrics.uploadFrequency.toFixed(1)} videos/week

## ${previousQuarter.label} Comparison
- Videos: ${previousQuarter.metrics.totalVideos} → ${currentQuarter.metrics.totalVideos} (${deltas.totalVideos.pct?.toFixed(0) || 'N/A'}%)
- Views: ${fmt(previousQuarter.metrics.totalViews)} → ${fmt(currentQuarter.metrics.totalViews)} (${deltas.totalViews.pct?.toFixed(0) || 'N/A'}%)
- Avg views: ${fmt(previousQuarter.metrics.avgViews)} → ${fmt(currentQuarter.metrics.avgViews)} (${deltas.avgViews.pct?.toFixed(0) || 'N/A'}%)
- Watch hours: ${fmt(previousQuarter.metrics.totalWatchHours)} → ${fmt(currentQuarter.metrics.totalWatchHours)}

## Top Videos This Quarter
${currentQuarter.metrics.topByViews.slice(0, 5).map((v, i) => `${i + 1}. "${v.title}" — ${fmt(v.view_count)} views`).join('\n')}${priorNarrativesBlock}

OUTPUT CONTRACT

Return ONLY valid JSON with this shape:
{
  "executive_summary": "2-3 sentence director-actionable synthesis. Lead with the most important implication of the quarter.",
  "wins": ["2-3 specific wins with data — short, scannable"],
  "challenges": ["1-2 areas that underperformed or need attention"],
  "content_insights": "2-3 sentences on what content types/topics performed best",
  "priority_rationale": "One sentence explaining how the recommendations below are ranked (e.g., 'ranked by impact × feasibility over the next 90 days').",
  "q2_recommendations": [
    {
      "rank": 1,
      "title": "Short title — the leading claim or reframe in 8-12 words",
      "claim": "The insight or reframe — one sentence, no data yet",
      "evidence": "The minimum data needed to support the claim",
      "option_a": "Option A description with its tradeoff",
      "option_b": "Option B description with its tradeoff (genuinely different bet, not a variant of A)",
      "recommendation": "Which option you'd pick and why — one or two sentences",
      "assumption": "What has to be true for this to work",
      "invalidation": "What would prove this wrong",
      "decision": "The specific decision the client needs to make, as a question"
    }
  ],
  "trend_narrative": "2-3 sentences describing the trajectory — directional, not definitive"
}

Return 3-5 recommendations. Vary their length based on how much context each needs.`;

    const systemPrompt = [VOICE_BLOCK, audienceBlock, STRUCTURE_BLOCK, NUMERIC_BLOCK].join('\n\n');

    const result = await claudeAPI.call(
      dataPayload,
      systemPrompt,
      'quarterly_report',
      3500
    );

    const { parseClaudeJSON } = await import('../lib/parseClaudeJSON');
    const parsed = parseClaudeJSON(result.text, {});

    // Post-generation validation — log only, do not auto-retry
    try {
      const validation = validateNarrative(parsed, { honorifics, channelNames: currentQuarter.metrics.topByViews?.map(v => v.channel).filter(Boolean) });
      if (validation.flags.length > 0) {
        console.warn('[QuarterlyReport] Validation flags:', validation.flags);
        parsed._validationFlags = validation.flags;
      }
    } catch (vErr) {
      console.warn('[QuarterlyReport] Validation error:', vErr);
    }

    // Pass 4: Save to narrative archive for future cross-period reference
    if (channelId && currentQuarter.year && currentQuarter.quarter && parsed && !parsed._error) {
      try {
        const { saveNarrative } = await import('./narrativeArchiveService');
        await saveNarrative({
          channelId,
          quarterYear: currentQuarter.year,
          quarterNumber: currentQuarter.quarter,
          narrative: parsed,
          metricsSnapshot: {
            totalViews: currentQuarter.metrics.totalViews,
            totalVideos: currentQuarter.metrics.totalVideos,
            totalSubsGained: currentQuarter.metrics.totalSubsGained,
            avgCTR: currentQuarter.metrics.avgCTR,
            avgRetention: currentQuarter.metrics.avgRetention,
          },
        });
      } catch (saveErr) {
        console.warn('[QuarterlyReport] Archive save failed:', saveErr);
      }
    }

    return parsed;
  } catch (err) {
    console.error('[QuarterlyReport] Narrative generation failed:', err);
    return null;
  }
}

/**
 * Validate generated narrative for the things the prompt asked for.
 * Logs flags but does not retry — this is a review signal, not a gate.
 */
function validateNarrative(narrative, { honorifics = [], channelNames = [] } = {}) {
  const flags = [];
  if (!narrative || typeof narrative !== 'object') {
    return { flags: ['narrative missing or not an object'] };
  }

  // 1. Banned Voice phrases
  const BANNED = [
    'meaningful incremental', 'high-leverage', 'repeatable model', 'strong fundamentals',
    'proven efficiency', 'activate potential', 'sustained growth', 'at scale',
    'excited to help', 'full potential', 'strategic opportunity', 'unlock value',
    'drive results', 'level up', 'game-changer',
    "we can", "we'd recommend", "we'll handle", "happy to draft", "we're excited",
  ];
  const allText = JSON.stringify(narrative).toLowerCase();
  for (const phrase of BANNED) {
    if (allText.includes(phrase.toLowerCase())) {
      flags.push(`banned phrase: "${phrase}"`);
    }
  }

  // 2. Structure: 3-5 recs with required fields
  const recs = narrative.q2_recommendations || narrative.recommendations || [];
  if (!Array.isArray(recs) || recs.length < 3 || recs.length > 5) {
    flags.push(`rec count out of range (got ${Array.isArray(recs) ? recs.length : 'non-array'}, expected 3-5)`);
  }
  recs.forEach((rec, i) => {
    if (typeof rec === 'string') {
      flags.push(`rec ${i + 1} is a string, expected structured object`);
      return;
    }
    const required = ['claim', 'option_a', 'option_b', 'recommendation', 'assumption', 'invalidation', 'decision'];
    const missing = required.filter(k => !rec?.[k] || String(rec[k]).trim().length < 5);
    if (missing.length) flags.push(`rec ${i + 1} missing/empty fields: ${missing.join(', ')}`);
  });

  // 3. Honorifics: if any channel name appears in text without its title, flag it
  if (honorifics.length) {
    for (const h of honorifics) {
      const lastName = h.full_name.split(/\s+/).pop();
      if (!lastName || lastName.length < 4) continue;
      const lastRe = new RegExp(`\\b${lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = allText.match(lastRe);
      if (!matches) continue;
      // For each mention, check that a title appears nearby (within 40 chars before)
      const textStr = allText;
      let idx = 0;
      while ((idx = textStr.indexOf(lastName.toLowerCase(), idx)) !== -1) {
        const before = textStr.slice(Math.max(0, idx - 40), idx);
        const hasTitle = /(president|elder|sister|bishop|elder['']?s)\s*$/i.test(before) ||
                         before.includes(h.full_name.toLowerCase());
        if (!hasTitle) {
          flags.push(`possible missing honorific before "${lastName}"`);
          break; // one flag per person is enough
        }
        idx += lastName.length;
      }
    }
  }

  return { flags };
}

export default {
  getQuarterDates,
  getPreviousQuarter,
  getCurrentQuarter,
  generateQuarterlyReport,
  generateQuarterlyNarrative,
};
