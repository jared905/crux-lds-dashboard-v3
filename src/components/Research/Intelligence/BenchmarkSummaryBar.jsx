import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

function MetricPill({ label, yours, avg, gap }) {
  const ahead = gap >= 0;
  const gapColor = ahead ? '#10b981' : '#ef4444';
  const gapText = gap !== null && !isNaN(gap)
    ? `${ahead ? '+' : ''}${Math.round(gap * 100)}%`
    : '—';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      background: '#252525', borderRadius: '6px', padding: '6px 10px',
      border: '1px solid #333', flex: '1 1 0', minWidth: '140px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>{fmtInt(yours)}</span>
          <span style={{ fontSize: '10px', color: '#666' }}>vs {fmtInt(avg)}</span>
        </div>
      </div>
      <div style={{
        fontSize: '11px', fontWeight: '700', color: gapColor,
        display: 'flex', alignItems: 'center', gap: '2px',
      }}>
        {ahead
          ? <TrendingUp size={12} color={gapColor} />
          : <TrendingDown size={12} color={gapColor} />
        }
        {gapText}
      </div>
    </div>
  );
}

export default function BenchmarkSummaryBar({ yourStats, benchmarks }) {
  if (!yourStats || !benchmarks) return null;

  return (
    <div style={{
      display: 'flex', gap: '6px', marginBottom: '14px',
      overflowX: 'auto', paddingBottom: '4px',
    }}>
      <MetricPill
        label="Subscribers"
        yours={yourStats.totalSubscribers}
        avg={benchmarks.avgCompetitorSubs}
        gap={benchmarks.subscriberGap}
      />
      <MetricPill
        label="Avg Views"
        yours={yourStats.avgViewsPerVideo}
        avg={benchmarks.avgCompetitorViews}
        gap={benchmarks.viewsGap}
      />
      <MetricPill
        label="Uploads/30d"
        yours={yourStats.videosLast30Days}
        avg={benchmarks.avgCompetitorFrequency}
        gap={benchmarks.frequencyGap}
      />
      <MetricPill
        label="Shorts/30d"
        yours={yourStats.shortsCount}
        avg={benchmarks.avgCompetitorShorts}
        gap={benchmarks.shortsGap}
      />
      <MetricPill
        label="Long-form/30d"
        yours={yourStats.longsCount}
        avg={benchmarks.avgCompetitorLongs}
        gap={benchmarks.longsGap}
      />
    </div>
  );
}
