/**
 * Generate competitor alerts (Research v2 — Movement lens feed).
 *
 * Scans recent competitor data and writes one row per detected event to
 * the `competitor_alerts` table. Idempotent: won't duplicate a (channel,
 * type) within the last 24h, or duplicate a breakout for the same video.
 *
 * Alert types:
 *   - breakout      → video.views_at_48h >= 2× channel's median (n>=5)
 *   - format_shift  → dominant length bucket flipped last 14d vs prior 75d
 *   - rank_change   → channel's 14d view velocity changed >=50% vs prior 14d
 *   - new_entrant   → channel added in last 7 days
 *
 * Trigger:
 *   - Manually via UI Refresh button (chained after sync)
 *   - Scheduled in vercel.json (after daily competitor sync)
 *
 * Usage:
 *   POST /api/generate-competitor-alerts        (cron, with CRON_SECRET)
 *   POST /api/generate-competitor-alerts?manual=true   (UI button)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const SHORTS_MAX = 180;
const LENGTH_BUCKETS = [
  { id: 'shorts',   min: 0,    max: SHORTS_MAX },
  { id: 'lf_3_8',   min: 181,  max: 480 },
  { id: 'lf_8_15',  min: 481,  max: 900 },
  { id: 'lf_15_25', min: 901,  max: 1500 },
  { id: 'doc_25p',  min: 1501, max: Infinity },
];

function bucketFor(durationSeconds) {
  const d = durationSeconds || 0;
  return LENGTH_BUCKETS.find(b => d >= b.min && d <= b.max)?.id || 'unknown';
}

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function recentAlertExists({ channel_id, alert_type, video_id, hours = 24 }) {
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
  let q = supabase
    .from('competitor_alerts')
    .select('id')
    .eq('channel_id', channel_id)
    .eq('alert_type', alert_type)
    .gte('generated_at', cutoff)
    .limit(1);
  if (video_id) q = q.eq('video_id', video_id);
  const { data } = await q;
  return (data?.length || 0) > 0;
}

// ──────────────────────────────────────────────────
// Breakouts
// ──────────────────────────────────────────────────
async function detectBreakouts() {
  const created = [];

  const { data: channels } = await supabase
    .from('channels')
    .select('id, name, tier, thumbnail_url, youtube_channel_id')
    .neq('tier', 'archive')
    .eq('is_client', false)
    .limit(500);

  if (!channels?.length) return created;

  // Cutoff for "new" breakouts — only consider videos published in last 14 days
  const recentCutoff = new Date(Date.now() - 14 * 86400000).toISOString();

  for (const ch of channels) {
    // History pool: prior videos with views_at_48h, last 90 days
    const { data: history } = await supabase
      .from('videos')
      .select('id, views_at_48h, published_at')
      .eq('channel_id', ch.id)
      .not('views_at_48h', 'is', null)
      .gte('published_at', new Date(Date.now() - 90 * 86400000).toISOString())
      .order('published_at', { ascending: false })
      .limit(30);

    if (!history || history.length < 5) continue;

    const med = median(history.map(v => Number(v.views_at_48h) || 0));
    if (!med || med < 100) continue;

    const { data: candidates } = await supabase
      .from('videos')
      .select('id, title, youtube_video_id, thumbnail_url, views_at_48h, view_count, published_at')
      .eq('channel_id', ch.id)
      .not('views_at_48h', 'is', null)
      .gte('published_at', recentCutoff)
      .order('published_at', { ascending: false })
      .limit(10);

    for (const v of (candidates || [])) {
      const v48 = Number(v.views_at_48h) || 0;
      if (v48 < med * 2) continue;
      if (await recentAlertExists({ channel_id: ch.id, alert_type: 'breakout', video_id: v.id, hours: 24 * 14 })) continue;

      const multiplier = +(v48 / med).toFixed(2);
      const payload = {
        channel_name: ch.name,
        channel_id: ch.id,
        channel_tier: ch.tier,
        channel_thumbnail_url: ch.thumbnail_url,
      channel_youtube_id: ch.youtube_channel_id,
        channel_youtube_id: ch.youtube_channel_id,
        video_id: v.id,
        youtube_video_id: v.youtube_video_id,
        video_title: v.title,
        video_thumbnail_url: v.thumbnail_url,
        views_at_48h: v48,
        channel_median: Math.round(med),
        multiplier,
        published_at: v.published_at,
      };

      const { data: inserted } = await supabase
        .from('competitor_alerts')
        .insert({ channel_id: ch.id, video_id: v.id, alert_type: 'breakout', payload })
        .select()
        .single();
      if (inserted) created.push(inserted);
    }
  }

  return created;
}

// ──────────────────────────────────────────────────
// Format shifts
// ──────────────────────────────────────────────────
async function detectFormatShifts() {
  const created = [];

  const { data: channels } = await supabase
    .from('channels')
    .select('id, name, tier, thumbnail_url, youtube_channel_id')
    .neq('tier', 'archive')
    .eq('is_client', false)
    .limit(500);

  if (!channels?.length) return created;

  const now = Date.now();
  const recentStart = new Date(now - 14 * 86400000).toISOString();
  const priorStart  = new Date(now - 89 * 86400000).toISOString();
  const priorEnd    = recentStart;

  for (const ch of channels) {
    if (await recentAlertExists({ channel_id: ch.id, alert_type: 'format_shift', hours: 24 * 7 })) continue;

    const { data: vids } = await supabase
      .from('videos')
      .select('duration_seconds, published_at')
      .eq('channel_id', ch.id)
      .gte('published_at', priorStart)
      .limit(500);

    if (!vids || vids.length < 10) continue;

    const recent = vids.filter(v => v.published_at >= recentStart);
    const prior  = vids.filter(v => v.published_at >= priorStart && v.published_at < priorEnd);
    if (recent.length < 3 || prior.length < 5) continue;

    const countByBucket = list => {
      const c = {};
      for (const v of list) {
        const b = bucketFor(v.duration_seconds);
        c[b] = (c[b] || 0) + 1;
      }
      return c;
    };
    const dominant = (counts, total) => {
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (!sorted.length) return null;
      const [bucket, count] = sorted[0];
      return { bucket, pct: count / total };
    };

    const rDom = dominant(countByBucket(recent), recent.length);
    const pDom = dominant(countByBucket(prior),  prior.length);
    if (!rDom || !pDom) continue;
    if (rDom.bucket === pDom.bucket) continue;
    if (rDom.pct < 0.5 || pDom.pct < 0.4) continue;

    const payload = {
      channel_name: ch.name,
      channel_id: ch.id,
      channel_tier: ch.tier,
      channel_thumbnail_url: ch.thumbnail_url,
      channel_youtube_id: ch.youtube_channel_id,
      prev_format: pDom.bucket,
      prev_pct: +(pDom.pct * 100).toFixed(1),
      curr_format: rDom.bucket,
      curr_pct: +(rDom.pct * 100).toFixed(1),
      recent_count: recent.length,
      prior_count: prior.length,
    };

    const { data: inserted } = await supabase
      .from('competitor_alerts')
      .insert({ channel_id: ch.id, alert_type: 'format_shift', payload })
      .select()
      .single();
    if (inserted) created.push(inserted);
  }

  return created;
}

// ──────────────────────────────────────────────────
// Rank changes — view velocity week-over-week
// ──────────────────────────────────────────────────
async function detectRankChanges() {
  const created = [];

  const { data: channels } = await supabase
    .from('channels')
    .select('id, name, tier, thumbnail_url, youtube_channel_id')
    .neq('tier', 'archive')
    .eq('is_client', false)
    .limit(500);

  if (!channels?.length) return created;

  const now = Date.now();
  const recentStart = new Date(now - 14 * 86400000).toISOString();
  const priorStart  = new Date(now - 28 * 86400000).toISOString();
  const priorEnd    = recentStart;

  for (const ch of channels) {
    if (await recentAlertExists({ channel_id: ch.id, alert_type: 'rank_change', hours: 24 * 7 })) continue;

    const { data: vids } = await supabase
      .from('videos')
      .select('view_count, published_at')
      .eq('channel_id', ch.id)
      .gte('published_at', priorStart)
      .limit(300);

    if (!vids || vids.length < 6) continue;

    const recent = vids.filter(v => v.published_at >= recentStart);
    const prior  = vids.filter(v => v.published_at >= priorStart && v.published_at < priorEnd);
    // Volatility filter: require ≥5 videos on each side. With <5 a single
    // breakout video creates a phantom "+2893%" rank-change that's
    // actually one outlier, not a trend.
    if (recent.length < 5 || prior.length < 5) continue;

    // Trimmed average: drop top + bottom video on each side before
    // averaging so a single inflated-views or bought-views video can't
    // dominate the result.
    const trimmedAvg = (arr) => {
      const sorted = [...arr].map(v => Number(v.view_count) || 0).sort((a, b) => a - b);
      const trimmed = sorted.slice(1, sorted.length - 1);
      if (!trimmed.length) return 0;
      return trimmed.reduce((s, n) => s + n, 0) / trimmed.length;
    };
    const recentAvg = trimmedAvg(recent);
    const priorAvg  = trimmedAvg(prior);
    if (priorAvg < 100) continue;

    const pctChange = (recentAvg - priorAvg) / priorAvg;
    if (Math.abs(pctChange) < 0.5) continue;

    // Secondary volatility check: the change has to also hold on the
    // medians (trimming caught the headline; median catches "the bulk
    // is unchanged but the long tail moved").
    const median = (arr) => {
      const s = [...arr].map(v => Number(v.view_count) || 0).sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
    };
    const recentMed = median(recent);
    const priorMed  = median(prior);
    if (priorMed > 0) {
      const medChange = (recentMed - priorMed) / priorMed;
      // Require directional agreement: if trimmed mean says +X% but
      // median is flat, the move was driven by one or two videos. Skip.
      if (Math.sign(medChange) !== Math.sign(pctChange) || Math.abs(medChange) < 0.2) continue;
    }

    // Hard cap on implausibly extreme moves. Anything claiming >500%
    // change needs the median to have moved >100% in the same direction;
    // otherwise it's almost certainly one big video, not a trend. The
    // Arlo +2893% case was getting through despite the median check
    // because Arlo has very low baseline views (any new video reads as
    // a huge percentage change).
    if (Math.abs(pctChange) > 5.0) {
      if (priorMed <= 0 || Math.abs((recentMed - priorMed) / priorMed) < 1.0) continue;
    }

    const payload = {
      channel_name: ch.name,
      channel_id: ch.id,
      channel_tier: ch.tier,
      channel_thumbnail_url: ch.thumbnail_url,
      channel_youtube_id: ch.youtube_channel_id,
      direction: pctChange > 0 ? 'up' : 'down',
      prev_velocity: Math.round(priorAvg),
      curr_velocity: Math.round(recentAvg),
      pct_change: +(pctChange * 100).toFixed(1),
      recent_count: recent.length,
      prior_count: prior.length,
    };

    const { data: inserted } = await supabase
      .from('competitor_alerts')
      .insert({ channel_id: ch.id, alert_type: 'rank_change', payload })
      .select()
      .single();
    if (inserted) created.push(inserted);
  }

  return created;
}

// ──────────────────────────────────────────────────
// New entrants
// ──────────────────────────────────────────────────
async function detectNewEntrants() {
  const created = [];
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: channels } = await supabase
    .from('channels')
    .select('id, name, tier, created_at, category_id, subscriber_count, thumbnail_url, youtube_channel_id')
    .neq('tier', 'archive')
    .eq('is_client', false)
    .gte('created_at', cutoff)
    .limit(200);

  if (!channels?.length) return created;

  for (const ch of channels) {
    if (await recentAlertExists({ channel_id: ch.id, alert_type: 'new_entrant', hours: 24 * 14 })) continue;

    const payload = {
      channel_name: ch.name,
      channel_id: ch.id,
      channel_tier: ch.tier,
      channel_thumbnail_url: ch.thumbnail_url,
      channel_youtube_id: ch.youtube_channel_id,
      category_id: ch.category_id,
      subscriber_count: ch.subscriber_count,
      added_at: ch.created_at,
    };

    const { data: inserted } = await supabase
      .from('competitor_alerts')
      .insert({ channel_id: ch.id, alert_type: 'new_entrant', payload })
      .select()
      .single();
    if (inserted) created.push(inserted);
  }

  return created;
}

// ──────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────
export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const manual = req.query?.manual === 'true';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !manual) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const startTime = Date.now();
  const summary = { breakouts: 0, format_shifts: 0, rank_changes: 0, new_entrants: 0, errors: [] };

  try {
    const types = (req.query?.types || 'breakout,format_shift,rank_change,new_entrant').split(',');
    if (types.includes('breakout'))     summary.breakouts     = (await detectBreakouts()).length;
    if (types.includes('format_shift')) summary.format_shifts = (await detectFormatShifts()).length;
    if (types.includes('rank_change'))  summary.rank_changes  = (await detectRankChanges()).length;
    if (types.includes('new_entrant'))  summary.new_entrants  = (await detectNewEntrants()).length;

    summary.total = summary.breakouts + summary.format_shifts + summary.rank_changes + summary.new_entrants;
    summary.duration_ms = Date.now() - startTime;

    return res.status(200).json({ success: true, ...summary });
  } catch (err) {
    console.error('[generate-competitor-alerts] error:', err);
    return res.status(500).json({ success: false, error: err.message, summary });
  }
}
