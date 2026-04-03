/**
 * buildDeltaTable.js
 * Pre-computes competitive gap analysis before any prompt is constructed.
 * Removes math from the LLM — its only job is rhetoric.
 *
 * Called once in the orchestrator after benchmarkData and competitorData
 * are both available. Output strings are injected directly into prompts.
 */

/**
 * @param {Object} channelMetrics - Merged from channelSnapshot + benchmarkData.channel_metrics
 * @param {Array}  competitors    - competitorData.competitors array (from auditCompetitorFetch)
 * @param {Object} [trendData]    - Optional 90-day trend baseline
 * @returns {{ deltaTable: string, formatMixTable: string, hasCompetitors: boolean }}
 */
export function buildDeltaTable(channelMetrics, competitors, trendData = null) {
  // Sort by avgViews descending, take top 3
  const top3 = [...(competitors || [])]
    .sort((a, b) => (b.metrics?.avgViews || 0) - (a.metrics?.avgViews || 0))
    .slice(0, 3);

  const hasCompetitors = top3.length > 0;

  // --- HELPERS ---

  function formatNum(v) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toLocaleString();
  }

  function formatDelta(channelVal, compVal, isRate = false) {
    if (compVal == null || channelVal == null) return '—';
    if (channelVal === 0 && compVal === 0) return '—';

    const diff = compVal - channelVal;
    const direction = diff > 0 ? 'you behind' : 'you ahead';

    if (isRate) {
      const pts = Math.abs((diff * 100)).toFixed(2);
      return `${(compVal * 100).toFixed(2)}% (${diff > 0 ? '+' : '-'}${pts}pts — ${direction})`;
    }

    const pct = channelVal !== 0
      ? Math.abs(Math.round((diff / channelVal) * 100))
      : '∞';
    return `${formatNum(compVal)} (${diff > 0 ? '+' : '-'}${pct}% — ${direction})`;
  }

  function avgGapSummary(channelVal, compVals) {
    const valid = compVals.filter(v => v != null && !isNaN(v));
    if (!valid.length || channelVal == null || channelVal === 0) return '—';
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    const diff = avg - channelVal;
    const pct = Math.abs(Math.round((diff / channelVal) * 100));
    return diff > 0 ? `-${pct}% avg (you behind)` : `+${pct}% avg (you ahead)`;
  }

  // --- PERFORMANCE DELTA TABLE ---

  const metrics = [
    {
      label: 'Avg Views/Video',
      channelVal: channelMetrics.avgViews,
      getVal: c => c.metrics?.avgViews,
      isRate: false,
    },
    {
      label: 'Engagement Rate',
      channelVal: channelMetrics.avgEngagement,
      getVal: c => c.metrics?.avgEngagement,
      isRate: true,
    },
    {
      label: 'Upload Frequency (/wk)',
      channelVal: channelMetrics.uploadFrequency,
      getVal: c => c.metrics?.uploadFrequency,
      isRate: false,
    },
  ];

  const compHeaders = hasCompetitors
    ? top3.map(c => {
        const subs = c.channel?.subscriber_count || 0;
        const label = subs >= 1_000_000
          ? `${(subs / 1_000_000).toFixed(1)}M subs`
          : `${(subs / 1_000).toFixed(0)}K subs`;
        return `${c.channel?.name || 'Competitor'} (${label})`;
      })
    : ['No named competitors'];

  const headerRow = ['Metric', 'You', ...compHeaders, 'Your Gap (avg)'].join(' | ');
  const divider = headerRow.split('|').map(s => '-'.repeat(s.trim().length + 2)).join('|');

  const dataRows = metrics.map(m => {
    const compVals = hasCompetitors ? top3.map(c => m.getVal(c)) : [];
    const compCols = hasCompetitors
      ? compVals.map(v => formatDelta(m.channelVal, v, m.isRate))
      : ['Use peer benchmarks'];
    const gapCol = hasCompetitors
      ? avgGapSummary(m.channelVal, compVals)
      : '—';
    const channelFormatted = m.isRate
      ? `${((m.channelVal || 0) * 100).toFixed(2)}%`
      : formatNum(m.channelVal);
    return [m.label, channelFormatted, ...compCols, gapCol].join(' | ');
  });

  // Trend rows if available
  const trendRows = trendData ? [
    '',
    `TREND (90-day): Subscribers ${formatNum(trendData.subsStart)} → ${formatNum(channelMetrics.subscriberCount)} (${trendData.subsDeltaPct > 0 ? '+' : ''}${trendData.subsDeltaPct.toFixed(1)}%)`,
    `TREND (90-day): Avg Views ${formatNum(trendData.avgViewsStart)} → ${formatNum(channelMetrics.avgViews)} (${trendData.viewsDeltaPct > 0 ? '+' : ''}${trendData.viewsDeltaPct.toFixed(1)}%)`,
  ] : [];

  const deltaTable = [headerRow, divider, ...dataRows, ...trendRows].join('\n');

  // --- FORMAT MIX TABLE ---

  // Collect all format keys across channel + competitors
  const channelFormats = channelMetrics.contentFormats || {};
  const allFormats = new Set([
    ...Object.keys(channelFormats),
    ...(hasCompetitors ? top3.flatMap(c => Object.keys(c.metrics?.contentFormats || {})) : []),
  ]);
  // Remove 'unclassified' — not useful for strategic analysis
  allFormats.delete('unclassified');

  // Sort by channel's highest-usage first
  const sortedFormats = [...allFormats].sort((a, b) => {
    const pctA = channelFormats[a]?.pct || 0;
    const pctB = channelFormats[b]?.pct || 0;
    return pctB - pctA;
  });

  let formatMixTable = '';
  if (sortedFormats.length > 0) {
    const fmtHeader = ['Format', 'You', ...compHeaders].join(' | ');
    const fmtDivider = fmtHeader.split('|').map(s => '-'.repeat(s.trim().length + 2)).join('|');

    const fmtRows = sortedFormats.map(fmt => {
      const chanPct = channelFormats[fmt]?.pct ?? 0;
      const compPcts = hasCompetitors
        ? top3.map(c => {
            const pct = c.metrics?.contentFormats?.[fmt]?.pct ?? 0;
            return `${pct}%`;
          })
        : ['—'];
      return [fmt, `${chanPct}%`, ...compPcts].join(' | ');
    });

    formatMixTable = [fmtHeader, fmtDivider, ...fmtRows].join('\n');
  } else {
    formatMixTable = 'No content format data available.';
  }

  return { deltaTable, formatMixTable, hasCompetitors };
}
