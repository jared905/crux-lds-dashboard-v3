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
  CheckCircle, AlertTriangle, MousePointerClick, UserPlus, ChevronDown, ChevronUp,
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

function MetricCard({ label, value, prevValue, delta, color, icon: Icon }) {
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
      {prevValue !== undefined && prevValue !== null && (
        <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>prev: {prevValue}</div>
      )}
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
  const [showAllVideos, setShowAllVideos] = useState(false);

  // Load report data — use all network member IDs for multi-channel clients
  const loadReport = useCallback(async () => {
    if (!activeClient?.id) return;
    setLoading(true);
    setNarrative(null);
    setShowAllVideos(false);
    try {
      const { generateQuarterlyReport } = await import('../../services/quarterlyReportService');
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

  // PDF Export — light-themed, matching main PDF report style
  const handleExport = useCallback(async () => {
    if (!reportData) return;
    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      const { currentQuarter: cqd, previousQuarter: pqd, deltas: d, channel: ch } = reportData;
      const m = cqd.metrics;
      const pm = pqd.metrics;
      const clientName = activeClient?.name || ch?.name || 'Channel';
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const f = (n) => { if (!n || isNaN(n)) return '0'; if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(n >= 1e4 ? 0 : 1)+'K'; return Math.round(n).toLocaleString(); };
      const dp = (delta) => {
        if (!delta || delta.pct === null) return '';
        const color = delta.pct >= 0 ? '#16a34a' : '#dc2626';
        const arrow = delta.pct >= 0 ? '↑' : '↓';
        return `<span style="font-size: 12px; color: ${color}; font-weight: 600;">${arrow} ${Math.abs(delta.pct).toFixed(1)}%</span>`;
      };
      const metricBox = (label, value, delta, color, prev) =>
        `<div style="background: #f8fafc; padding: 18px; border-radius: 12px; border-left: 5px solid ${color};">
          <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 8px; letter-spacing: 0.5px;">${label}</div>
          <div style="font-size: 30px; font-weight: 700; color: #1e293b; line-height: 1.25;">${value}</div>
          <div style="margin-top: 8px;">${dp(delta)}</div>
          ${prev ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">prev: ${prev}</div>` : ''}
        </div>`;

      // Build top videos HTML
      const topVideosHtml = m.topByViews.slice(0, 10).map((v, i) =>
        `<tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 14px; font-size: 13px; color: #1e293b; font-weight: ${i < 3 ? '600' : '400'}; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">#${i+1} ${esc(v.title)}</td>
          <td style="padding: 10px 14px; font-size: 13px; color: #64748b; text-align: right;">${f(v.view_count)}</td>
          <td style="padding: 10px 14px; font-size: 13px; color: #64748b; text-align: right;">${f(v.like_count)}</td>
          <td style="padding: 10px 14px; font-size: 13px; color: #64748b; text-align: right;">${v.published_at ? new Date(v.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
        </tr>`
      ).join('');

      // Build narrative HTML if available
      const narrativeHtml = narrative ? `
        <div data-pdf-section style="margin-top: 32px;">
          <h2 style="font-size: 26px; font-weight: 700; color: #1e293b; margin-bottom: 20px; letter-spacing: 1px;">AI ANALYSIS</h2>
          ${narrative.executive_summary ? `<div style="background: #f8fafc; padding: 20px; border-radius: 12px; border-left: 5px solid #8b5cf6; margin-bottom: 20px; font-size: 15px; color: #334155; line-height: 1.7;">${esc(narrative.executive_summary)}</div>` : ''}
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            ${narrative.wins?.length > 0 ? `<div>
              <div style="font-size: 14px; font-weight: 700; color: #16a34a; margin-bottom: 12px;">WINS</div>
              ${narrative.wins.map(w => `<div style="padding: 10px 14px; background: #f0fdf4; border-radius: 8px; border-left: 3px solid #16a34a; margin-bottom: 8px; font-size: 13px; color: #334155; line-height: 1.6;">${esc(w)}</div>`).join('')}
            </div>` : ''}
            ${narrative.challenges?.length > 0 ? `<div>
              <div style="font-size: 14px; font-weight: 700; color: #d97706; margin-bottom: 12px;">AREAS TO WATCH</div>
              ${narrative.challenges.map(c => `<div style="padding: 10px 14px; background: #fffbeb; border-radius: 8px; border-left: 3px solid #d97706; margin-bottom: 8px; font-size: 13px; color: #334155; line-height: 1.6;">${esc(c)}</div>`).join('')}
            </div>` : ''}
          </div>
          ${narrative.q2_recommendations?.length > 0 ? `
            <div style="font-size: 14px; font-weight: 700; color: #2563eb; margin-bottom: 12px;">NEXT QUARTER RECOMMENDATIONS</div>
            ${narrative.q2_recommendations.map(r => `<div style="padding: 10px 14px; background: #eff6ff; border-radius: 8px; border-left: 3px solid #2563eb; margin-bottom: 8px; font-size: 13px; color: #334155; line-height: 1.6;">${esc(r)}</div>`).join('')}
          ` : ''}
        </div>
      ` : '';

      // Build the full PDF HTML
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.width = '1200px';
      container.style.backgroundColor = '#ffffff';
      container.style.padding = '50px 35px 35px 35px';
      container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      document.body.appendChild(container);

      container.innerHTML = `
        <div style="max-width: 1080px; margin: 0 auto;">
          <!-- Header -->
          <div data-pdf-section style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #2563eb;">
            <div style="display: flex; align-items: center; gap: 22px;">
              <div style="background: #1a1a1a; padding: 14px 18px; border-radius: 10px;">
                <img src="/Full_View_Logo.png" alt="Full View Analytics" style="height: 72px; object-fit: contain; display: block;" crossorigin="anonymous" />
              </div>
              <div style="border-left: 2px solid #cbd5e1; padding-left: 22px;">
                <div style="font-size: 20px; font-weight: 700; color: #2563eb; margin-bottom: 6px;">${esc(clientName)}</div>
                <h1 style="margin: 0; font-size: 34px; font-weight: 700; color: #1e293b; line-height: 1.3;">Quarterly Performance Report</h1>
                <p style="margin: 10px 0 0 0; font-size: 16px; color: #64748b; font-weight: 500;">${cqd.label} vs ${pqd.label} • ${dateStr}</p>
              </div>
            </div>
          </div>

          <!-- Summary Bar -->
          <div data-pdf-section style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 24px 28px; border-radius: 12px; margin-bottom: 28px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 18px; text-align: center;">
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px;">VIDEOS</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff;">${m.totalVideos}</div>
              </div>
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px;">TOTAL VIEWS</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff;">${f(m.totalViews)}</div>
              </div>
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px;">WATCH HOURS</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff;">${f(m.totalWatchHours)}</div>
              </div>
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px;">SUBS GAINED</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff;">${f(m.totalSubsGained)}</div>
              </div>
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px;">UPLOAD FREQ</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff;">${m.uploadFrequency.toFixed(1)}/wk</div>
              </div>
            </div>
          </div>

          <!-- KPI Grid -->
          <div data-pdf-section style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px;">
            ${metricBox('AVG VIEWS / VIDEO', f(m.avgViews), d.avgViews, '#f59e0b', pm.avgViews > 0 ? f(pm.avgViews) : null)}
            ${metricBox('ENGAGEMENT RATE', (m.engagementRate * 100).toFixed(2) + '%', d.engagementRate, '#06b6d4', pm.engagementRate > 0 ? (pm.engagementRate * 100).toFixed(2) + '%' : null)}
            ${metricBox('AVG RETENTION', m.avgRetention > 0 ? (m.avgRetention * 100).toFixed(1) + '%' : '—', d.avgRetention, '#14b8a6', pm.avgRetention > 0 ? (pm.avgRetention * 100).toFixed(1) + '%' : null)}
            ${metricBox('AVG CTR', m.avgCTR > 0 ? (m.avgCTR * 100).toFixed(1) + '%' : '—', d.avgCTR, '#f97316', pm.avgCTR > 0 ? (pm.avgCTR * 100).toFixed(1) + '%' : null)}
          </div>

          <!-- Format Performance -->
          <div data-pdf-section style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px;">
            <div style="background: #fff7ed; padding: 22px; border-radius: 12px; border: 3px solid #f97316;">
              <div style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 16px;">Shorts Performance</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                  <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px;">Videos</div>
                  <div style="font-size: 28px; font-weight: 700; color: #f97316;">${m.shortsCount}</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px;">Avg Views</div>
                  <div style="font-size: 28px; font-weight: 700; color: #f97316;">${f(m.shortsAvgViews)}</div>
                  ${dp(d.shortsAvgViews)}
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px;">Avg Retention</div>
                  <div style="font-size: 24px; font-weight: 600; color: #1e293b;">${m.shortsAvgRetention > 0 ? (m.shortsAvgRetention * 100).toFixed(1) + '%' : '—'}</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px;">Sub Conversion</div>
                  <div style="font-size: 24px; font-weight: 600; color: #1e293b;">${m.subConversionRate > 0 ? (m.subConversionRate * 100).toFixed(2) + '%' : '—'}</div>
                </div>
              </div>
            </div>
            <div style="background: #eff6ff; padding: 22px; border-radius: 12px; border: 3px solid #0ea5e9;">
              <div style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 16px;">Long-form Performance</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                  <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px;">Videos</div>
                  <div style="font-size: 28px; font-weight: 700; color: #0ea5e9;">${m.longsCount}</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px;">Avg Views</div>
                  <div style="font-size: 28px; font-weight: 700; color: #0ea5e9;">${f(m.longsAvgViews)}</div>
                  ${dp(d.longsAvgViews)}
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px;">Avg Retention</div>
                  <div style="font-size: 24px; font-weight: 600; color: #1e293b;">${m.longsAvgRetention > 0 ? (m.longsAvgRetention * 100).toFixed(1) + '%' : '—'}</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px;">Upload Cadence</div>
                  <div style="font-size: 24px; font-weight: 600; color: #1e293b;">${m.uploadFrequency.toFixed(1)}/wk</div>
                  ${reportData.channelCount > 1 ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">${m.uploadsPerChannel.toFixed(1)}/wk per channel</div>` : ''}
                </div>
              </div>
            </div>
          </div>

          <!-- Top Videos -->
          <div data-pdf-section style="margin-bottom: 32px;">
            <h2 style="font-size: 26px; font-weight: 700; color: #1e293b; margin-bottom: 20px; letter-spacing: 1px;">TOP PERFORMING VIDEOS</h2>
            <div style="background: #f8fafc; border-radius: 12px; overflow: hidden; border: 2px solid #e2e8f0;">
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background: #e2e8f0;">
                    <th style="text-align: left; padding: 12px 14px; font-size: 13px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">TITLE</th>
                    <th style="text-align: right; padding: 12px 14px; font-size: 13px; color: #64748b; font-weight: 600;">VIEWS</th>
                    <th style="text-align: right; padding: 12px 14px; font-size: 13px; color: #64748b; font-weight: 600;">LIKES</th>
                    <th style="text-align: right; padding: 12px 14px; font-size: 13px; color: #64748b; font-weight: 600;">DATE</th>
                  </tr>
                </thead>
                <tbody>${topVideosHtml}</tbody>
              </table>
            </div>
          </div>

          ${narrativeHtml}

          <!-- Footer -->
          <div data-pdf-footer style="padding-top: 18px; border-top: 1px solid #e2e8f0; text-align: center; margin-top: 40px;">
            <div style="display: flex; justify-content: center; align-items: center; gap: 12px; margin-bottom: 10px;">
              <span style="color: #64748b; font-size: 14px; font-weight: 500;">Generated by Full View Analytics</span>
              <span style="color: #cbd5e1; font-size: 14px;">•</span>
              <span style="color: #94a3b8; font-size: 14px; font-weight: 500;">Powered by</span>
              <img src="/crux-logo.png" alt="CRUX" style="height: 32px; object-fit: contain; vertical-align: middle;" crossorigin="anonymous" />
            </div>
            <div style="color: #cbd5e1; font-size: 13px;">${dateStr} • This report contains confidential information</div>
          </div>
        </div>
      `;

      // Render to canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
      });

      document.body.removeChild(container);

      // Multi-page PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const safeName = clientName.replace(/[^a-zA-Z0-9]/g, '_');
      pdf.save(`Quarterly_Report_${safeName}_Q${selectedQuarter}_${selectedYear}.pdf`);
    } catch (err) {
      console.error('[QuarterlyReport] Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [reportData, narrative, selectedYear, selectedQuarter, activeClient]);

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

  const visibleVideos = showAllVideos ? cq.metrics.topByViews.slice(0, 10) : cq.metrics.topByViews.slice(0, 5);
  const hasMoreVideos = cq.metrics.topByViews.length > 5;
  const subCount = activeClient?.subscriberCount || channel?.subscriber_count || 0;
  const viewsPerSub = subCount > 0 ? cq.metrics.totalViews / subCount : 0;

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
          <MetricCard label="Videos Published" value={String(cq.metrics.totalVideos)} prevValue={pq.metrics.totalVideos > 0 ? String(pq.metrics.totalVideos) : null} delta={deltas.totalVideos} color="#3b82f6" icon={Video} />
          <MetricCard label="Total Views" value={fmt(cq.metrics.totalViews)} prevValue={pq.metrics.totalViews > 0 ? fmt(pq.metrics.totalViews) : null} delta={deltas.totalViews} color="#10b981" icon={Eye} />
          <MetricCard label="Avg Views/Video" value={fmt(cq.metrics.avgViews)} prevValue={pq.metrics.avgViews > 0 ? fmt(pq.metrics.avgViews) : null} delta={deltas.avgViews} color="#f59e0b" icon={Play} />
          <MetricCard label="Watch Hours" value={fmt(cq.metrics.totalWatchHours)} prevValue={pq.metrics.totalWatchHours > 0 ? fmt(pq.metrics.totalWatchHours) : null} delta={deltas.totalWatchHours} color="#8b5cf6" icon={Clock} />
          <MetricCard label="Subs Gained" value={fmt(cq.metrics.totalSubsGained)} prevValue={pq.metrics.totalSubsGained > 0 ? fmt(pq.metrics.totalSubsGained) : null} delta={deltas.totalSubsGained} color="#ec4899" icon={Users} />
        </div>

        {/* KPI Grid - Row 2 (4 columns — retention lives in Format Performance section) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          <MetricCard label="Engagement Rate" value={`${(cq.metrics.engagementRate * 100).toFixed(2)}%`} prevValue={pq.metrics.engagementRate > 0 ? `${(pq.metrics.engagementRate * 100).toFixed(2)}%` : null} delta={deltas.engagementRate} color="#06b6d4" icon={Target} />
          <MetricCard label="Avg Retention" value={cq.metrics.avgRetention > 0 ? `${(cq.metrics.avgRetention * 100).toFixed(1)}%` : '—'} prevValue={pq.metrics.avgRetention > 0 ? `${(pq.metrics.avgRetention * 100).toFixed(1)}%` : null} delta={deltas.avgRetention} color="#14b8a6" icon={BarChart3} />
          <MetricCard label="Avg CTR" value={cq.metrics.avgCTR > 0 ? `${(cq.metrics.avgCTR * 100).toFixed(1)}%` : '—'} prevValue={pq.metrics.avgCTR > 0 ? `${(pq.metrics.avgCTR * 100).toFixed(1)}%` : null} delta={deltas.avgCTR} color="#f97316" icon={MousePointerClick} />
          <MetricCard label="Upload Freq" value={`${cq.metrics.uploadFrequency.toFixed(1)}/wk`} prevValue={pq.metrics.uploadFrequency > 0 ? `${pq.metrics.uploadFrequency.toFixed(1)}/wk` : null} delta={deltas.uploadFrequency} color="#a855f7" icon={Video} />
        </div>

        {/* Format Performance Comparison */}
        {(cq.metrics.longsCount > 0 || cq.metrics.shortsCount > 0) && (
          <div style={{ background: '#1E1E1E', borderRadius: '10px', border: '1px solid #333', padding: '24px', marginBottom: '20px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>Format Performance</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Long-form */}
              <div style={{ background: '#252525', borderRadius: '10px', padding: '22px', borderTop: '3px solid #3b82f6' }}>
                <div style={{ fontSize: '15px', color: '#ccc', textTransform: 'uppercase', fontWeight: '700', marginBottom: '16px', letterSpacing: '0.5px' }}>Long-form</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px', fontWeight: '600' }}>Avg Views</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '24px', fontWeight: '800', color: '#3b82f6', fontFamily: "'Barlow Condensed', sans-serif" }}>{fmt(cq.metrics.longsAvgViews)}</span>
                      <DeltaBadge delta={deltas.longsAvgViews} />
                    </div>
                    {pq.metrics.longsAvgViews > 0 && <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>prev: {fmt(pq.metrics.longsAvgViews)}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px', fontWeight: '600' }}>Avg Retention</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '22px', fontWeight: '700', color: '#14b8a6', fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {cq.metrics.longsAvgRetention > 0 ? `${(cq.metrics.longsAvgRetention * 100).toFixed(1)}%` : '—'}
                      </span>
                      <DeltaBadge delta={deltas.longsAvgRetention} />
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', color: '#888', fontWeight: '600' }}>{cq.metrics.longsCount} videos</div>
                </div>
              </div>
              {/* Shorts */}
              <div style={{ background: '#252525', borderRadius: '10px', padding: '22px', borderTop: '3px solid #f97316' }}>
                <div style={{ fontSize: '15px', color: '#ccc', textTransform: 'uppercase', fontWeight: '700', marginBottom: '16px', letterSpacing: '0.5px' }}>Shorts</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px', fontWeight: '600' }}>Avg Views</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '24px', fontWeight: '800', color: '#f97316', fontFamily: "'Barlow Condensed', sans-serif" }}>{fmt(cq.metrics.shortsAvgViews)}</span>
                      <DeltaBadge delta={deltas.shortsAvgViews} />
                    </div>
                    {pq.metrics.shortsAvgViews > 0 && <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>prev: {fmt(pq.metrics.shortsAvgViews)}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px', fontWeight: '600' }}>Avg Retention</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '22px', fontWeight: '700', color: '#22d3ee', fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {cq.metrics.shortsAvgRetention > 0 ? `${(cq.metrics.shortsAvgRetention * 100).toFixed(1)}%` : '—'}
                      </span>
                      <DeltaBadge delta={deltas.shortsAvgRetention} />
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', color: '#888', fontWeight: '600' }}>{cq.metrics.shortsCount} videos</div>
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
              <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: '#333', marginBottom: '16px' }}>
                {cq.metrics.shortsCount > 0 && <div style={{ width: `${(cq.metrics.shortsCount / cq.metrics.totalVideos) * 100}%`, background: '#f97316' }} />}
                {cq.metrics.longsCount > 0 && <div style={{ flex: 1, background: '#3b82f6' }} />}
              </div>
            )}
            {/* Upload frequency — prominent display */}
            <div style={{ background: '#252525', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: '#888', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Upload Cadence</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#a855f7', fontFamily: "'Barlow Condensed', sans-serif" }}>
                {cq.metrics.uploadFrequency.toFixed(1)}<span style={{ fontSize: '14px', color: '#888', fontWeight: '600' }}>/wk</span>
              </div>
              {reportData.channelCount > 1 && (
                <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>
                  {cq.metrics.uploadsPerChannel.toFixed(1)}/wk per channel ({reportData.channelCount} channels)
                </div>
              )}
            </div>
            {pq.metrics.totalVideos > 0 && (
              <div style={{ fontSize: '11px', color: '#666' }}>
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
              <>
                {visibleVideos.map((v, i) => (
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
                ))}
                {hasMoreVideos && (
                  <button
                    onClick={() => setShowAllVideos(!showAllVideos)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      width: '100%', padding: '8px', marginTop: '6px',
                      background: 'transparent', border: '1px solid #333', borderRadius: '6px',
                      color: '#888', fontSize: '12px', cursor: 'pointer', fontWeight: '600',
                    }}
                  >
                    {showAllVideos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showAllVideos ? 'Show less' : `Show all ${Math.min(cq.metrics.topByViews.length, 10)}`}
                  </button>
                )}
              </>
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

            {/* Views per Subscriber */}
            <div style={{ background: '#252525', borderRadius: '10px', padding: '18px', borderTop: '3px solid #06b6d4' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Users size={16} style={{ color: '#555' }} />
                <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Views per Sub</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#06b6d4', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: '4px' }}>
                {viewsPerSub > 0 ? viewsPerSub.toFixed(1) : '—'}
              </div>
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>
                {subCount > 0 ? `${fmt(cq.metrics.totalViews)} views / ${fmt(subCount)} subs` : 'subscriber count unavailable'}
              </div>
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
