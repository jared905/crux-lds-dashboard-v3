/**
 * QuarterlyReport — Q-over-Q performance report for client channels
 *
 * Shows current quarter metrics with comparison to previous quarter.
 * Claude generates narrative insights and recommendations.
 * Exportable to PDF.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Minus, ArrowRight, Loader, Sparkles,
  Download, BarChart3, Eye, Users, Clock, Video, Play, Target,
  CheckCircle, AlertTriangle, ChevronDown,
} from 'lucide-react';

const fmt = (n) => {
  if (!n || isNaN(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return Math.round(n).toLocaleString();
};

const fmtPct = (n) => {
  if (n === null || n === undefined) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
};

function DeltaBadge({ delta }) {
  if (!delta || delta.pct === null) return <span style={{ fontSize: '10px', color: '#555' }}>No prior data</span>;
  const isUp = delta.pct > 0;
  const isFlat = Math.abs(delta.pct) < 1;
  const color = isFlat ? '#888' : isUp ? '#10b981' : '#ef4444';
  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: '600', color }}>
      <Icon size={12} /> {fmtPct(delta.pct)}
    </span>
  );
}

export default function QuarterlyReport({ activeClient, channelId }) {
  const [reportData, setReportData] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatingNarrative, setGeneratingNarrative] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [exporting, setExporting] = useState(false);

  // Load report data
  const loadReport = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    setNarrative(null);
    try {
      const { generateQuarterlyReport } = await import('../../services/quarterlyReportService');
      const data = await generateQuarterlyReport(channelId, selectedYear, selectedQuarter);
      setReportData(data);
    } catch (err) {
      console.error('[QuarterlyReport] Failed:', err);
    } finally {
      setLoading(false);
    }
  }, [channelId, selectedYear, selectedQuarter]);

  useEffect(() => { loadReport(); }, [loadReport]);

  // Generate narrative with Claude
  const handleGenerateNarrative = useCallback(async () => {
    if (!reportData) return;
    setGeneratingNarrative(true);
    try {
      const { generateQuarterlyNarrative } = await import('../../services/quarterlyReportService');
      const result = await generateQuarterlyNarrative(reportData);
      setNarrative(result);
    } catch (err) {
      console.error('[QuarterlyReport] Narrative failed:', err);
    } finally {
      setGeneratingNarrative(false);
    }
  }, [reportData]);

  // PDF Export
  const handleExport = useCallback(async () => {
    if (!reportData) return;
    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      const el = document.getElementById('quarterly-report-content');
      if (!el) return;

      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#1a1a1a' });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, Math.min(imgHeight, 297));

      const channelName = (reportData.channel?.name || 'Channel').replace(/[^a-zA-Z0-9]/g, '_');
      pdf.save(`Quarterly_Report_${channelName}_Q${selectedQuarter}_${selectedYear}.pdf`);
    } catch (err) {
      console.error('[QuarterlyReport] Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [reportData, selectedYear, selectedQuarter]);

  if (loading) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: '#888' }}>
        <Loader size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
        <div style={{ fontSize: '14px' }}>Loading quarterly report...</div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: '#666' }}>
        <BarChart3 size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
        <div style={{ fontSize: '16px', marginBottom: '8px' }}>No quarterly data available</div>
        <div style={{ fontSize: '12px' }}>Connect a YouTube channel to generate quarterly reports.</div>
      </div>
    );
  }

  const { currentQuarter: cq, previousQuarter: pq, deltas, channel } = reportData;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BarChart3 size={24} style={{ color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#fff' }}>Quarterly Report</div>
            <div style={{ fontSize: '12px', color: '#888' }}>{channel?.name || activeClient?.name || 'Channel'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Quarter selector */}
          <select
            value={`${selectedYear}-${selectedQuarter}`}
            onChange={(e) => {
              const [y, q] = e.target.value.split('-');
              setSelectedYear(parseInt(y));
              setSelectedQuarter(parseInt(q));
            }}
            style={{
              padding: '8px 12px', background: '#252525', border: '1px solid #444',
              borderRadius: '6px', color: '#fff', fontSize: '12px',
            }}
          >
            {[2026, 2025].map(y => [4, 3, 2, 1].map(q => (
              <option key={`${y}-${q}`} value={`${y}-${q}`}>Q{q} {y}</option>
            )))}
          </select>
          <button
            onClick={handleGenerateNarrative}
            disabled={generatingNarrative}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', background: 'rgba(139,92,246,0.15)',
              border: '1px solid #8b5cf6', borderRadius: '6px',
              color: '#a78bfa', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              opacity: generatingNarrative ? 0.5 : 1,
            }}
          >
            {generatingNarrative ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
            {generatingNarrative ? 'Generating...' : 'AI Insights'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', background: 'rgba(59,130,246,0.15)',
              border: '1px solid #3b82f6', borderRadius: '6px',
              color: '#60a5fa', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              opacity: exporting ? 0.5 : 1,
            }}
          >
            {exporting ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={12} />}
            Export PDF
          </button>
        </div>
      </div>

      <div id="quarterly-report-content">
        {/* Quarter comparison header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
          padding: '16px', marginBottom: '16px', background: '#1E1E1E', borderRadius: '8px', border: '1px solid #333',
        }}>
          <span style={{ fontSize: '14px', color: '#888' }}>{pq.label}</span>
          <ArrowRight size={16} style={{ color: '#555' }} />
          <span style={{ fontSize: '16px', fontWeight: '700', color: '#3b82f6' }}>{cq.label}</span>
          {!reportData.hasPreviousData && (
            <span style={{ fontSize: '10px', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
              Limited comparison data
            </span>
          )}
        </div>

        {/* KPI Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '16px' }}>
          <MetricCard label="Videos Published" value={String(cq.metrics.totalVideos)} delta={deltas.totalVideos} color="#3b82f6" icon={Video} />
          <MetricCard label="Total Views" value={fmt(cq.metrics.totalViews)} delta={deltas.totalViews} color="#10b981" icon={Eye} />
          <MetricCard label="Avg Views/Video" value={fmt(cq.metrics.avgViews)} delta={deltas.avgViews} color="#f59e0b" icon={Play} />
          <MetricCard label="Watch Hours" value={fmt(cq.metrics.totalWatchHours)} delta={deltas.totalWatchHours} color="#8b5cf6" icon={Clock} />
          <MetricCard label="Subs Gained" value={fmt(cq.metrics.totalSubsGained)} delta={deltas.totalSubsGained} color="#ec4899" icon={Users} />
        </div>

        {/* Second row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
          <MetricCard label="Engagement Rate" value={`${(cq.metrics.engagementRate * 100).toFixed(2)}%`} delta={deltas.engagementRate} color="#06b6d4" />
          <MetricCard label="Avg Retention" value={cq.metrics.avgRetention > 0 ? `${(cq.metrics.avgRetention * 100).toFixed(1)}%` : '—'} delta={deltas.avgRetention} color="#14b8a6" />
          <MetricCard label="Avg CTR" value={cq.metrics.avgCTR > 0 ? `${(cq.metrics.avgCTR * 100).toFixed(1)}%` : '—'} delta={deltas.avgCTR} color="#f97316" />
          <MetricCard label="Upload Freq" value={`${cq.metrics.uploadFrequency.toFixed(1)}/wk`} delta={deltas.uploadFrequency} color="#a855f7" />
        </div>

        {/* Content Mix + Top Videos */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '16px' }}>
          {/* Content Mix */}
          <div style={{ background: '#1E1E1E', borderRadius: '8px', border: '1px solid #333', padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>Content Mix</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <div style={{ background: '#252525', borderRadius: '6px', padding: '10px', borderTop: '3px solid #f97316' }}>
                <div style={{ fontSize: '9px', color: '#888' }}>SHORTS</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#f97316', fontFamily: "'Barlow Condensed', sans-serif" }}>{cq.metrics.shortsCount}</div>
              </div>
              <div style={{ background: '#252525', borderRadius: '6px', padding: '10px', borderTop: '3px solid #3b82f6' }}>
                <div style={{ fontSize: '9px', color: '#888' }}>LONG-FORM</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#3b82f6', fontFamily: "'Barlow Condensed', sans-serif" }}>{cq.metrics.longsCount}</div>
              </div>
            </div>
            {cq.metrics.totalVideos > 0 && (
              <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: '#333' }}>
                {cq.metrics.shortsCount > 0 && <div style={{ width: `${(cq.metrics.shortsCount / cq.metrics.totalVideos) * 100}%`, background: '#f97316' }} />}
                {cq.metrics.longsCount > 0 && <div style={{ flex: 1, background: '#3b82f6' }} />}
              </div>
            )}
            {/* Previous quarter comparison */}
            {pq.metrics.totalVideos > 0 && (
              <div style={{ marginTop: '12px', fontSize: '10px', color: '#666' }}>
                {pq.label}: {pq.metrics.shortsCount} shorts / {pq.metrics.longsCount} long-form
              </div>
            )}
          </div>

          {/* Top Videos */}
          <div style={{ background: '#1E1E1E', borderRadius: '8px', border: '1px solid #333', padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>Top Videos This Quarter</div>
            {cq.metrics.topByViews.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#555', fontStyle: 'italic' }}>No videos this quarter</div>
            ) : (
              cq.metrics.topByViews.slice(0, 5).map((v, i) => (
                <a key={v.youtube_video_id || i}
                  href={`https://www.youtube.com/watch?v=${v.youtube_video_id}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', gap: '10px', padding: '8px', marginBottom: '4px',
                    background: '#252525', borderRadius: '6px', textDecoration: 'none',
                    alignItems: 'center', borderLeft: `3px solid ${i === 0 ? '#f59e0b' : i === 1 ? '#e5e7eb' : '#555'}`,
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: '700', color: i === 0 ? '#f59e0b' : i === 1 ? '#e5e7eb' : '#555', minWidth: '20px' }}>#{i + 1}</span>
                  {v.thumbnail_url && <img src={v.thumbnail_url} alt="" style={{ width: 64, height: 36, borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#e0e0e0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
                    <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                      {fmt(v.view_count)} views · {fmt(v.like_count)} likes
                      {v.published_at && ` · ${new Date(v.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>

        {/* AI Narrative */}
        {narrative && (
          <div style={{ background: '#1E1E1E', borderRadius: '8px', border: '1px solid #8b5cf633', padding: '24px', marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} style={{ color: '#a78bfa' }} /> AI Analysis
            </div>

            {narrative.executive_summary && (
              <div style={{ fontSize: '14px', color: '#ccc', lineHeight: '1.7', marginBottom: '20px', padding: '16px', background: '#252525', borderRadius: '8px' }}>
                {narrative.executive_summary}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              {/* Wins */}
              {narrative.wins?.length > 0 && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#10b981', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle size={14} /> Wins
                  </div>
                  {narrative.wins.map((w, i) => (
                    <div key={i} style={{ fontSize: '12px', color: '#ccc', lineHeight: '1.6', padding: '8px 10px', background: 'rgba(16,185,129,0.05)', borderRadius: '6px', marginBottom: '4px', borderLeft: '3px solid #10b981' }}>
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Challenges */}
              {narrative.challenges?.length > 0 && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#f59e0b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={14} /> Areas to Watch
                  </div>
                  {narrative.challenges.map((c, i) => (
                    <div key={i} style={{ fontSize: '12px', color: '#ccc', lineHeight: '1.6', padding: '8px 10px', background: 'rgba(245,158,11,0.05)', borderRadius: '6px', marginBottom: '4px', borderLeft: '3px solid #f59e0b' }}>
                      {c}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {narrative.content_insights && (
              <div style={{ fontSize: '12px', color: '#ccc', lineHeight: '1.6', marginBottom: '16px' }}>
                <span style={{ fontWeight: '600', color: '#fff' }}>Content Insights: </span>{narrative.content_insights}
              </div>
            )}

            {/* Q2 Recommendations */}
            {narrative.q2_recommendations?.length > 0 && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#3b82f6', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Target size={14} /> Next Quarter Recommendations
                </div>
                {narrative.q2_recommendations.map((r, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#ccc', lineHeight: '1.6', padding: '8px 10px', background: 'rgba(59,130,246,0.05)', borderRadius: '6px', marginBottom: '4px', borderLeft: '3px solid #3b82f6' }}>
                    {r}
                  </div>
                ))}
              </div>
            )}

            {narrative.trend_narrative && (
              <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.6', marginTop: '16px', fontStyle: 'italic' }}>
                {narrative.trend_narrative}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, delta, color, icon: Icon }) {
  return (
    <div style={{ background: '#1E1E1E', borderRadius: '8px', border: '1px solid #333', padding: '14px', borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
        {Icon && <Icon size={12} style={{ color: '#555' }} />}
      </div>
      <div style={{ fontSize: '22px', fontWeight: '800', color, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: '4px' }}>
        {value}
      </div>
      <DeltaBadge delta={delta} />
    </div>
  );
}
