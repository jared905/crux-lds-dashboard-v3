/**
 * Pre-computes competitive gap analysis before any LLM prompt runs.
 * Output strings are injected directly into prompts — the model's job is rhetoric, not math.
 */

// --- Formatting helpers (pure, no closures) ---

function fmtNum(v) {
  return (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString();
}

function fmtRate(v) {
  return (v == null || isNaN(v)) ? '—' : `${(v * 100).toFixed(2)}%`;
}

function fmtSubs(n) {
  if (!n) return '0';
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M subs` : `${(n / 1_000).toFixed(0)}K subs`;
}

function delta(mine, theirs) {
  if (mine == null || theirs == null || (mine === 0 && theirs === 0)) return null;
  const diff = theirs - mine;
  const pct = mine !== 0 ? Math.abs(Math.round((diff / mine) * 100)) : Infinity;
  const dir = diff > 0 ? 'you behind' : 'you ahead';
  return { diff, pct, dir, ahead: diff <= 0 };
}

function fmtDeltaNum(mine, theirs) {
  const d = delta(mine, theirs);
  if (!d) return '—';
  const sign = d.diff > 0 ? '+' : '-';
  const pctStr = d.pct === Infinity ? '∞' : d.pct;
  return `${fmtNum(theirs)} (${sign}${pctStr}% — ${d.dir})`;
}

function fmtDeltaRate(mine, theirs) {
  const d = delta(mine, theirs);
  if (!d) return '—';
  const pts = Math.abs(d.diff * 100).toFixed(2);
  const sign = d.diff > 0 ? '+' : '-';
  return `${fmtRate(theirs)} (${sign}${pts}pts — ${d.dir})`;
}

function avgGap(mine, compVals) {
  const valid = compVals.filter(v => v != null && !isNaN(v));
  if (!valid.length || mine == null || mine === 0) return '—';
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  const d = delta(mine, avg);
  if (!d) return '—';
  return d.ahead ? `+${d.pct}% avg (you ahead)` : `-${d.pct}% avg (you behind)`;
}

function tableDivider(header) {
  return header.split('|').map(s => '-'.repeat(s.trim().length + 2)).join('|');
}

// --- Main export ---

/**
 * @param {Object} channelMetrics - { avgViews, avgEngagement, uploadFrequency, subscriberCount, contentFormats }
 * @param {Array}  competitors    - competitorData.competitors array
 * @param {Object} [trendData]    - Optional 90-day trend { subsStart, avgViewsStart, subsDeltaPct, viewsDeltaPct }
 */
export function buildDeltaTable(channelMetrics, competitors, trendData = null) {
  const top3 = [...(competitors || [])]
    .sort((a, b) => (b.metrics?.avgViews || 0) - (a.metrics?.avgViews || 0))
    .slice(0, 3);

  const hasCompetitors = top3.length > 0;

  const compHeaders = hasCompetitors
    ? top3.map(c => `${c.channel?.name || 'Competitor'} (${fmtSubs(c.channel?.subscriber_count)})`)
    : ['No named competitors'];

  // Performance table
  const METRICS = [
    { label: 'Avg Views/Video',      get: c => c.metrics?.avgViews,       mine: channelMetrics.avgViews,       fmtMine: fmtNum,  fmtDelta: fmtDeltaNum },
    { label: 'Engagement Rate',       get: c => c.metrics?.avgEngagement,  mine: channelMetrics.avgEngagement,  fmtMine: fmtRate, fmtDelta: fmtDeltaRate },
    { label: 'Upload Frequency (/wk)',get: c => c.metrics?.uploadFrequency,mine: channelMetrics.uploadFrequency,fmtMine: fmtNum,  fmtDelta: fmtDeltaNum },
  ];

  const header = ['Metric', 'You', ...compHeaders, 'Your Gap (avg)'].join(' | ');
  const rows = METRICS.map(m => {
    const vals = hasCompetitors ? top3.map(m.get) : [];
    const cols = hasCompetitors ? vals.map(v => m.fmtDelta(m.mine, v)) : ['Use peer benchmarks'];
    return [m.label, m.fmtMine(m.mine), ...cols, hasCompetitors ? avgGap(m.mine, vals) : '—'].join(' | ');
  });

  const trends = trendData ? [
    '',
    `TREND (90-day): Subscribers ${fmtNum(trendData.subsStart)} → ${fmtNum(channelMetrics.subscriberCount)} (${trendData.subsDeltaPct > 0 ? '+' : ''}${trendData.subsDeltaPct.toFixed(1)}%)`,
    `TREND (90-day): Avg Views ${fmtNum(trendData.avgViewsStart)} → ${fmtNum(channelMetrics.avgViews)} (${trendData.viewsDeltaPct > 0 ? '+' : ''}${trendData.viewsDeltaPct.toFixed(1)}%)`,
  ] : [];

  const deltaTable = [header, tableDivider(header), ...rows, ...trends].join('\n');

  // Format mix table
  const channelFmts = channelMetrics.contentFormats || {};
  const allKeys = new Set([
    ...Object.keys(channelFmts),
    ...(hasCompetitors ? top3.flatMap(c => Object.keys(c.metrics?.contentFormats || {})) : []),
  ]);
  allKeys.delete('unclassified');

  const sorted = [...allKeys].sort((a, b) => (channelFmts[b]?.pct || 0) - (channelFmts[a]?.pct || 0));

  let formatMixTable;
  if (sorted.length > 0) {
    const fh = ['Format', 'You', ...compHeaders].join(' | ');
    const fRows = sorted.map(key => {
      const mine = `${channelFmts[key]?.pct ?? 0}%`;
      const theirs = hasCompetitors
        ? top3.map(c => `${c.metrics?.contentFormats?.[key]?.pct ?? 0}%`)
        : ['—'];
      return [key, mine, ...theirs].join(' | ');
    });
    formatMixTable = [fh, tableDivider(fh), ...fRows].join('\n');
  } else {
    formatMixTable = 'No content format data available.';
  }

  return { deltaTable, formatMixTable, hasCompetitors };
}
