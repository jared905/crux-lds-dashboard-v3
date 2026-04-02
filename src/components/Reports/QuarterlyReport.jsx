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
  CheckCircle, AlertTriangle, MousePointerClick, UserPlus,
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
  if (!delta || delta.pct === null) return <span style={{ fontSize: '11px', color: '#555' }}>No prior data</span>;
  const isUp = delta.pct > 0;
  const isFlat = Math.abs(delta.pct) < 1;
  const color = isFlat ? '#888' : isUp ? '#10b981' : '#ef4444';
  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600', color }}>
      <Icon size={14} /> {fmtPct(delta.pct)}
    </span>
  );
}

function MetricCard({ label, value, delta, color, icon: Icon }) {
  return (
    <div style={{ background: '#1E1E1E', borderRadius: '10px', border: '1px solid #333', padding: '18px 20px', borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>{label}</span>
        {Icon && <Icon size={16} style={{ color: '#555' }} />}
      </div>
      <div style={{ fontSize: '28px', fontWeight: '800', color, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: '6px', lineHeight: 1 }}>
        {value}
      </div>
      <DeltaBadge delta={delta} />
    </div>
  );
}

export default function QuarterlyReport({ activeClient, selectedChannel }) {
  const [reportData, setReportData] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatingNarrative, setGeneratingNarrative] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [exporting, setExporting] = useState(false);

  // Load report data — use all network member IDs for multi-channel clients
  const loadReport = useCallback(async () => {
    if (!activeClient?.id) return;
    setLoading(true);
    setNarrative(null);
    try {
      const { generateQuarterlyReport } = await import('../../services/quarterlyReportService');
      // Determine channel IDs based on selected channel filter
      let allChannelIds;
      if (selectedChannel && selectedChannel !== "all" && activeClient.networkMembers) {
        const match = activeClient.networkMembers.find(m => m.name === selectedChannel);
        allChannelIds = match ? [match.id] : [activeClient.id];
      } else if (activeClient.isNetwork && activeClient.networkMembers) {
        allChannelIds = activeClient.networkMembers.map(m => m.id);
      } else {
        allChannelIds = [activeClient.id];
      }
      const data = await generateQuarterlyReport(activeClient.id, selectedYear, selectedQuarter, allChannelIds);
      setReportData(data);
    } catch (err) {
      console.error('[QuarterlyReport] Failed:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClient?.id, activeClient?.isNetwork, selectedChannel, selectedYear, selectedQuarter]);

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

      const clientName = (activeClient?.name || reportData.channel?.name || 'Channel').replace(/[^a-zA-Z0-9]/g, '_');
      pdf.save(`Quarterly_Report_${clientName}_Q${selectedQuarter}_${selectedYear}.pdf`);
    } catch (err) {
      console.error('[QuarterlyReport] Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [reportData, selectedYear, selectedQuarter, activeClient?.name]);

  if (loading) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: '#888' }}>
        <Loader size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
        <div style={{ fontSize: '15px' }}>Loading quarterly report...</div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: '#666' }}>
        <BarChart3 size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
        <div style={{ fontSize: '16px', marginBottom: '8px' }}>No quarterly data available</div>
        <div style={{ fontSize: '13px' }}>Connect a YouTube channel to generate quarterly reports.</div>
      </div>
    );
  }

  const { currentQuarter: cq, previousQuarter: pq, deltas, channel } = reportData;
  const isFiltered = selectedChannel && selectedChannel !== "all";
  const subtitle = isFiltered
    ? `${activeClient?.name || ''} · ${selectedChannel}`
    : reportData.channelCount > 1
      ? `${activeClient?.name || channel?.name || ''} · ${reportData.channelCount} channels`
      : activeClient?.name || channel?.name || 'Channel';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BarChart3 size={26} style={{ color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#fff' }}>Quarterly Report</div>
            <div style={{ fontSize: '13px', color: '#888' }}>{subtitle}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={`${selectedYear}-${selectedQuarter}`}
            onChange={(e) => {
              const [y, q] = e.target.value.split('-');
              setSelectedYear(parseInt(y));
              setSelectedQuarter(parseInt(q));
            }}
            style={{
              padding: '10px 14px', background: '#252525', border: '1px solid #444',
              borderRadius: '8px', color: '#fff', fontSize: '13px',
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
              padding: '10px 16px', background: 'rgba(139,92,246,0.15)',
              border: '1px solid #8b5cf6', borderRadius: '8px',
              color: '#a78bfa', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              opacity: generatingNarrative ? 0.5 : 1,
            }}
          >
            {generatingNarrative ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
            {generatingNarrative ? 'Generating...' : 'AI Insights'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', background: 'rgba(59,130,246,0.15)',
              border: '1px solid #3b82f6', borderRadius: '8px',
              color: '#60a5fa', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              opacity: exporting ? 0.5 : 1,
            }}
          >
            {exporting ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
            Export PDF
          </button>
        </div>
      </div>

      <div id="quarterly-report-content">
        {/* Quarter comparison header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
          padding: '18px', marginBottom: '20px', background: '#1E1E1E', borderRadius: '10px', border: '1px solid #333',
        }}>
          <span style={{ fontSize: '15px', color: '#888' }}>{pq.label}</span>
          <ArrowRight size={18} style={{ color: '#555' }} />
          <span style={{ fontSize: '17px', fontWeight: '700', color: '#3b82f6' }}>{cq.label}</span>
          {!reportData.hasPreviousData && (
            <span style={{ fontSize: '11px', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '3px 10px', borderRadius: '4px' }}>
              Limited comparison data
            </span>
          )}
        </div>

        {/* KPI Grid - Row 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '12px' }}>
          <MetricCard label="Videos Published" value={String(cq.metrics.totalVideos)} delta={deltas.totalVideos} color="#3b82f6" icon={Video} />
          <MetricCard label="Total Views" value={fmt(cq.metrics.totalViews)} delta={deltas.totalViews} color="#10b981" icon={Eye} />
          <MetricCard label="Avg Views/Video" value={fmt(cq.metrics.avgViews)} delta={deltas.avgViews} color="#f59e0b" icon={Play} />
          <MetricCard label="Watch Hours" value={fmt(cq.metrics.totalWatchHours)} delta={deltas.totalWatchHours} color="#8b5cf6" icon={Clock} />
          <MetricCard label="Subs Gained" value={fmt(cq.metrics.totalSubsGained)} delta={deltas.totalSubsGained} color="#ec4899" icon={Users} />
        </div>

        {/* KPI Grid - Row 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
          <MetricCard label="Engagement Rate" value={`${(cq.metrics.engagementRate * 100).toFixed(2)}%`} delta={deltas.engagementRate} color="#06b6d4" icon={Target} />
          <MetricCard label="Long-form Retention" value={cq.metrics.longsAvgRetention > 0 ? `${(cq.metrics.longsAvgRetention * 100).toFixed(1)}%` : '—'} delta={deltas.longsAvgRetention} color="#14b8a6" icon={BarChart3} />
          <MetricCard label="Shorts Retention" value={cq.metrics.shortsAvgRetention > 0 ? `${(cq.metrics.shortsAvgRetention * 100).toFixed(1)}%` : '—'} delta={deltas.shortsAvgRetention} color="#22d3ee" icon={BarChart3} />
          <MetricCard label="Avg CTR" value={cq.metrics.avgCTR > 0 ? `${(cq.metrics.avgCTR * 100).toFixed(1)}%` : '—'} delta={deltas.avgCTR} color="#f97316" icon={MousePointerClick} />
          <MetricCard label="Upload Freq" value={`${cq.metrics.uploadFrequency.toFixed(1)}/wk`} delta={deltas.uploadFrequency} color="#a855f7" icon={Video} />
        </div>

        {/* Format Performance Comparison */}
        {(cq.metrics.longsCount > 0 || cq.metrics.shortsCount > 0) && (
          <div style={{ background: '#1E1E1E', borderRadius: '10px', border: '1px solid #333', padding: '24px', marginBottom: '20px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>Format Performance</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Long-form */}
              <div style={{ background: '#252525', borderRadius: '10px', padding: '20px', borderTop: '3px solid #3b82f6' }}>
                <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: '600', marginBottom: '12px' }}>Long-form</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>Avg Views</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '22px', fontWeight: '800', color: '#3b82f6', fontFamily: "'Barlow Condensed', sans-serif" }}>{fmt(cq.metrics.longsAvgViews)}</span>
                      <DeltaBadge delta={deltas.longsAvgViews} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>Avg Retention</div>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: '#14b8a6', fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {cq.metrics.longsAvgRetention > 0 ? `${(cq.metrics.longsAvgRetention * 100).toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#888' }}>{cq.metrics.longsCount} videos</div>
                </div>
              </div>
              {/* Shorts */}
              <div style={{ background: '#252525', borderRadius: '10px', padding: '20px', borderTop: '3px solid #f97316' }}>
                <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: '600', marginBottom: '12px' }}>Shorts</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>Avg Views</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '22px', fontWeight: '800', color: '#f97316', fontFamily: "'Barlow Condensed', sans-serif" }}>{fmt(cq.metrics.shortsAvgViews)}</span>
                      <DeltaBadge delta={deltas.shortsAvgViews} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>Avg Retention</div>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: '#22d3ee', fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {cq.metrics.shortsAvgRetention > 0 ? `${(cq.metrics.shortsAvgRetention * 100).toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#888' }}>{cq.metrics.shortsCount} videos</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content Mix + Top Videos */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '20px' }}>
          {/* Content Mix */}
          <div style={{ background: '#1E1E1E', borderRadius: '10px', border: '1px solid #333', padding: '24px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '14px' }}>Content Mix</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#252525', borderRadius: '8px', padding: '12px', borderTop: '3px solid #f97316' }}>
                <div style={{ fontSize: '10px', color: '#888', fontWeight: '600' }}>SHORTS</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#f97316', fontFamily: "'Barlow Condensed', sans-serif" }}>{cq.metrics.shortsCount}</div>
              </div>
              <div style={{ background: '#252525', borderRadius: '8px', padding: '12px', borderTop: '3px solid #3b82f6' }}>
                <div style={{ fontSize: '10px', color: '#888', fontWeight: '600' }}>LONG-FORM</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6', fontFamily: "'Barlow Condensed', sans-serif" }}>{cq.metrics.longsCount}</div>
              </div>
            </div>
            {cq.metrics.totalVideos > 0 && (
              <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: '#333', marginBottom: '12px' }}>
                {cq.metrics.shortsCount > 0 && <div style={{ width: `${(cq.metrics.shortsCount / cq.metrics.totalVideos) * 100}%`, background: '#f97316' }} />}
                {cq.metrics.longsCount > 0 && <div style={{ flex: 1, background: '#3b82f6' }} />}
              </div>
            )}
            {/* Upload frequency */}
            <div style={{ fontSize: '13px', color: '#ccc', marginBottom: '4px' }}>
              {cq.metrics.uploadFrequency.toFixed(1)}/wk total
              {reportData.channelCount > 1 && (
                <span style={{ color: '#888' }}> · {cq.metrics.uploadsPerChannel.toFixed(1)}/wk per channel</span>
              )}
            </div>
            {pq.metrics.totalVideos > 0 && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
                {pq.label}: {pq.metrics.shortsCount} shorts / {pq.metrics.longsCount} long-form
              </div>
            )}
          </div>

          {/* Top Videos */}
          <div style={{ background: '#1E1E1E', borderRadius: '10px', border: '1px solid #333', padding: '24px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '14px' }}>Top Videos This Quarter</div>
            {cq.metrics.topByViews.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#555', fontStyle: 'italic' }}>No videos this quarter</div>
            ) : (
              cq.metrics.topByViews.slice(0, 5).map((v, i) => (
                <a key={v.youtube_video_id || i}
                  href={`https://www.youtube.com/watch?v=${v.youtube_video_id}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', gap: '12px', padding: '10px', marginBottom: '6px',
                    background: '#252525', borderRadius: '8px', textDecoration: 'none',
                    alignItems: 'center', borderLeft: `3px solid ${i === 0 ? '#f59e0b' : i === 1 ? '#e5e7eb' : '#555'}`,
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: '700', color: i === 0 ? '#f59e0b' : i === 1 ? '#e5e7eb' : '#555', minWidth: '24px' }}>#{i + 1}</span>
                  {v.thumbnail_url && <img src={v.thumbnail_url} alt="" style={{ width: 80, height: 45, borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#e0e0e0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>
                      {fmt(v.view_count)} views · {fmt(v.like_count)} likes
                      {v.published_at && ` · ${new Date(v.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>

        {/* Efficiency Metrics */}
        <div style={{ background: '#1E1E1E', borderRadius: '10px', border: '1px solid #333', padding: '24px', marginBottom: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>Channel Efficiency</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            {/* Sub Conversion Rate */}
            <div style={{ background: '#252525', borderRadius: '10px', padding: '18px', borderTop: '3px solid #ec4899' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <UserPlus size={16} style={{ color: '#555' }} />
                <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Sub Conversion</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#ec4899', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: '4px' }}>
                {cq.metrics.subConversionRate > 0 ? `${(cq.metrics.subConversionRate * 100).toFixed(2)}%` : '—'}
              </div>
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>subscribers gained / total views</div>
              <DeltaBadge delta={deltas.subConversionRate} />
            </div>

            {/* Top by Engagement */}
            <div style={{ background: '#252525', borderRadius: '10px', padding: '18px', borderTop: '3px solid #f59e0b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Target size={16} style={{ color: '#555' }} />
                <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Top by Engagement</span>
              </div>
              {cq.metrics.topByEngagement.length > 0 ? (
                <>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#e0e0e0', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cq.metrics.topByEngagement[0].title}
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#f59e0b', fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {(cq.metrics.topByEngagement[0].engRate * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '11px', color: '#666' }}>engagement rate · {fmt(cq.metrics.topByEngagement[0].view_count)} views</div>
                </>
              ) : (
                <div style={{ fontSize: '13px', color: '#555' }}>—</div>
              )}
            </div>

            {/* Views per Sub */}
            <div style={{ background: '#252525', borderRadius: '10px', padding: '18px', borderTop: '3px solid #06b6d4' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Eye size={16} style={{ color: '#555' }} />
                <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Views per Video</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#06b6d4', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: '4px' }}>
                {fmt(cq.metrics.avgViews)}
              </div>
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>average across all formats</div>
              <DeltaBadge delta={deltas.avgViews} />
            </div>
          </div>
        </div>

        {/* AI Narrative */}
        {narrative && (
          <div style={{ background: '#1E1E1E', borderRadius: '10px', border: '1px solid #8b5cf633', padding: '28px', marginBottom: '20px' }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} style={{ color: '#a78bfa' }} /> AI Analysis
            </div>

            {narrative.executive_summary && (
              <div style={{ fontSize: '15px', color: '#ccc', lineHeight: '1.7', marginBottom: '24px', padding: '18px', background: '#252525', borderRadius: '10px' }}>
                {narrative.executive_summary}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
              {narrative.wins?.length > 0 && (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#10b981', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle size={16} /> Wins
                  </div>
                  {narrative.wins.map((w, i) => (
                    <div key={i} style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.6', padding: '10px 12px', background: 'rgba(16,185,129,0.05)', borderRadius: '8px', marginBottom: '6px', borderLeft: '3px solid #10b981' }}>
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {narrative.challenges?.length > 0 && (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#f59e0b', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={16} /> Areas to Watch
                  </div>
                  {narrative.challenges.map((c, i) => (
                    <div key={i} style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.6', padding: '10px 12px', background: 'rgba(245,158,11,0.05)', borderRadius: '8px', marginBottom: '6px', borderLeft: '3px solid #f59e0b' }}>
                      {c}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {narrative.content_insights && (
              <div style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.6', marginBottom: '18px' }}>
                <span style={{ fontWeight: '600', color: '#fff' }}>Content Insights: </span>{narrative.content_insights}
              </div>
            )}

            {narrative.q2_recommendations?.length > 0 && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#3b82f6', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Target size={16} /> Next Quarter Recommendations
                </div>
                {narrative.q2_recommendations.map((r, i) => (
                  <div key={i} style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.6', padding: '10px 12px', background: 'rgba(59,130,246,0.05)', borderRadius: '8px', marginBottom: '6px', borderLeft: '3px solid #3b82f6' }}>
                    {r}
                  </div>
                ))}
              </div>
            )}

            {narrative.trend_narrative && (
              <div style={{ fontSize: '13px', color: '#888', lineHeight: '1.6', marginTop: '18px', fontStyle: 'italic' }}>
                {narrative.trend_narrative}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
