/**
 * QuarterlyReport — Q-over-Q performance report for client channels
 *
 * Shows current quarter metrics with comparison to previous quarter.
 * Claude generates narrative insights and recommendations.
 * Exportable to PDF.
 */
import {useState, useEffect, useCallback} from 'react';
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
  if (!delta || delta.pct === null) return <span style={{ fontSize: '11px', color: 'var(--outline)' }}>No prior data</span>;
  const isUp = delta.pct > 0;
  const isFlat = Math.abs(delta.pct) < 1;
  const color = isFlat ? 'var(--muted)' : isUp ? 'var(--pos-text)' : 'var(--neg)';
  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600', color }}>
      <Icon size={14} /> {fmtPct(delta.pct)}
    </span>
  );
}

function MetricCard({ label, value, prevValue, delta, color, icon: Icon }) {
  // Identity comes from the tinted icon tile (site tile recipe, scaled down);
  // the number stays the hero — big, white, condensed.
  return (
    <div style={{ background: "var(--card)", borderRadius: "24px", border: '1px solid var(--border)', padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        {Icon && (
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={15} style={{ color }} />
          </div>
        )}
        <span style={{ fontFamily: 'var(--font-label)', fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>{label}</span>
      </div>
      <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--ink)', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: '6px', lineHeight: 1 }}>
        {value}
      </div>
      <DeltaBadge delta={delta} />
      {prevValue !== undefined && prevValue !== null && (
        <div style={{ fontSize: '11px', color: 'var(--outline)', marginTop: '4px' }}>prev: {prevValue}</div>
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
  }, [activeClient?.id, activeClient?.isNetwork, activeClient?.networkMembers, selectedChannel, selectedYear, selectedQuarter]);

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

  // PDF Export — dark editorial document in the ship-audit style: near-black
  // ground, condensed uppercase display, eyebrow section labels, stat band,
  // delta chips. Rendered offscreen in-app so the brand fonts apply.
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
      const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const f = (n) => { if (!n || isNaN(n)) return '0'; if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(n >= 1e4 ? 0 : 1)+'K'; return Math.round(n).toLocaleString(); };

      // Document palette — the app's tokens, inlined for the offscreen render
      const INK = '#f4f8fa', TEXT = '#dde3e7', MUTED = '#a9b8be', FAINT = '#67747b';
      const CARD = '#11181b', LINE = 'rgba(255,255,255,0.08)';
      const BLUE = '#00D1FF', BLUE_SOFT = '#4cd6ff', LIME = '#CDF200', RED = '#ff8a7a', AMBER = '#f5b040';
      const EYEBROW = "font-family: 'Space Grotesk', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;";
      const DISPLAY = "font-family: 'Barlow Condensed', 'Inter', sans-serif; text-transform: uppercase;";

      const chip = (delta) => {
        if (!delta || delta.pct === null) return '<span style="font-size: 11px; color: ' + FAINT + ';">no prior data</span>';
        const up = delta.pct >= 0;
        const col = up ? LIME : RED;
        const bg = up ? 'rgba(205,242,0,0.10)' : 'rgba(255,85,64,0.12)';
        const bd = up ? 'rgba(205,242,0,0.35)' : 'rgba(255,85,64,0.35)';
        return '<span style="display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; color: ' + col + '; background: ' + bg + '; border: 1px solid ' + bd + ';">' + (up ? '&#8599;' : '&#8600;') + ' ' + Math.abs(delta.pct).toFixed(1) + '%</span>';
      };

      const sectionHead = (eyebrow, title, sub) => `
        <div style="margin: 44px 0 18px;">
          <div style="${EYEBROW} color: ${BLUE}; margin-bottom: 8px;">${eyebrow}</div>
          <div style="font-size: 25px; font-weight: 700; color: ${INK}; letter-spacing: -0.01em;">${title}</div>
          ${sub ? `<div style="font-size: 14px; color: ${MUTED}; margin-top: 6px; line-height: 1.6;">${sub}</div>` : ''}
        </div>`;

      const kpiCard = (label, value, delta, prev) => `
        <div style="background: ${CARD}; border: 1px solid ${LINE}; border-radius: 16px; padding: 18px 20px;">
          <div style="${EYEBROW} color: ${MUTED}; margin-bottom: 12px;">${label}</div>
          <div style="${DISPLAY} font-size: 36px; font-weight: 700; color: ${INK}; line-height: 1; margin-bottom: 12px;">${value}</div>
          <div>${chip(delta)}</div>
          ${prev ? `<div style="font-size: 11px; color: ${FAINT}; margin-top: 10px;">prev: ${prev}</div>` : ''}
        </div>`;

      const statCell = (label, value, caption, i) => `
        <div style="padding: 22px 20px; ${i > 0 ? 'border-left: 1px solid ' + LINE + ';' : ''}">
          <div style="${EYEBROW} color: ${MUTED}; margin-bottom: 12px;">${label}</div>
          <div style="${DISPLAY} font-size: 40px; font-weight: 700; color: ${INK}; line-height: 1;">${value}</div>
          ${caption ? `<div style="font-size: 12px; color: ${FAINT}; margin-top: 10px;">${caption}</div>` : ''}
        </div>`;

      const typeBadge = (isShort) => isShort
        ? '<span style="font-size: 10px; padding: 2px 9px; border-radius: 999px; font-weight: 700; letter-spacing: 0.06em; background: rgba(205,242,0,0.10); color: ' + LIME + '; border: 1px solid rgba(205,242,0,0.3);">SHORT</span>'
        : '<span style="font-size: 10px; padding: 2px 9px; border-radius: 999px; font-weight: 700; letter-spacing: 0.06em; background: rgba(0,209,255,0.10); color: ' + BLUE_SOFT + '; border: 1px solid rgba(0,209,255,0.3);">LONG</span>';

      const topVideosHtml = m.topByViews.slice(0, 10).map((v, i) => {
        const ytId = v.youtube_video_id || '';
        const thumb = ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : '';
        const isShort = v.video_type === 'short' || (v.duration_seconds && v.duration_seconds <= 60);
        const date = v.published_at ? new Date(v.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '&mdash;';
        const ctr = v.ctr ? (v.ctr * 100).toFixed(1) + '%' : '&mdash;';
        const ret = v.avg_view_percentage ? (v.avg_view_percentage > 1 ? v.avg_view_percentage.toFixed(1) : (v.avg_view_percentage * 100).toFixed(1)) + '%' : '&mdash;';
        return `<tr style="border-bottom: 1px solid ${LINE};">
          <td style="padding: 12px 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="${DISPLAY} font-size: 15px; font-weight: 700; color: ${i < 3 ? INK : FAINT}; min-width: 22px;">${i + 1}</span>
              ${thumb ? `<img src="${thumb}" style="width: 64px; height: 36px; border-radius: 6px; object-fit: cover; flex-shrink: 0;" crossorigin="anonymous" />` : ''}
              <div style="overflow: hidden;">
                <div style="font-size: 13px; color: ${i < 3 ? INK : TEXT}; font-weight: ${i < 3 ? '600' : '400'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px;">${esc(v.title)}</div>
                <div style="margin-top: 4px;">${typeBadge(isShort)}</div>
              </div>
            </div>
          </td>
          <td style="padding: 12px 16px; font-size: 14px; color: ${INK}; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">${f(v.view_count)}</td>
          <td style="padding: 12px 16px; font-size: 13px; color: ${MUTED}; text-align: right; font-variant-numeric: tabular-nums;">${ctr}</td>
          <td style="padding: 12px 16px; font-size: 13px; color: ${MUTED}; text-align: right; font-variant-numeric: tabular-nums;">${ret}</td>
          <td style="padding: 12px 16px; font-size: 13px; color: ${FAINT}; text-align: right; white-space: nowrap;">${date}</td>
        </tr>`;
      }).join('');

      const th = (label, align) => `<th style="${EYEBROW} color: ${FAINT}; text-align: ${align}; padding: 12px 16px; font-weight: 600;">${label}</th>`;

      // Audience section (only when the data exists)
      let audienceHtml = '';
      if (reportData.audienceData) {
        const ad = reportData.audienceData;
        const genderEntries = Object.entries(ad.gender || {}).sort(([,a],[,b]) => b - a);
        const totalGender = genderEntries.reduce((s, [,v]) => s + v, 0);
        const ageOrder = ['age13-17','age18-24','age25-34','age35-44','age45-54','age55-64','age65-'];
        const ageLabels = {'age13-17':'13-17','age18-24':'18-24','age25-34':'25-34','age35-44':'35-44','age45-54':'45-54','age55-64':'55-64','age65-':'65+'};
        const ageEntries = ageOrder.filter(k => ad.age?.[k] != null).map(k => [ageLabels[k], ad.age[k]]);
        const maxAge = Math.max(...ageEntries.map(([,v]) => v), 1);
        const trafficLabels = {YT_SEARCH:'YouTube Search',SUBSCRIBER:'Subscribers',SUGGESTED:'Suggested',BROWSE:'Browse',EXT_URL:'External',SHORTS:'Shorts Feed',NOTIFICATION:'Notifications',YT_CHANNEL:'Channel Page',END_SCREEN:'End Screens',NO_LINK_OTHER:'Direct',PLAYLIST:'Playlists'};
        const totalTV = Object.values(ad.trafficSources || {}).reduce((s,t) => s + t.views, 0);
        const trafficEntries = Object.entries(ad.trafficSources || {}).sort(([,a],[,b]) => b.views - a.views).filter(([,v]) => totalTV > 0 && (v.views/totalTV)*100 >= 1);
        const maxTPct = trafficEntries.length > 0 && totalTV > 0 ? (trafficEntries[0][1].views / totalTV) * 100 : 1;
        const topCountries = Object.entries(ad.country || {}).sort(([,a],[,b]) => b.views - a.views).slice(0, 8);
        const totalCV = Object.values(ad.country || {}).reduce((s,c) => s + c.views, 0);
        const topStates = Object.entries(ad.province || {}).sort(([,a],[,b]) => b.views - a.views).slice(0, 8);
        const totalPV = Object.values(ad.province || {}).reduce((s,p) => s + p.views, 0);

        const bar = (pctW, color) => `<div style="height: 8px; background: rgba(255,255,255,0.07); border-radius: 4px; overflow: hidden;"><div style="width: ${Math.max(pctW, 2)}%; height: 100%; background: ${color}; border-radius: 4px;"></div></div>`;
        const geoChip = (label, first) => `<span style="font-size: 10px; padding: 3px 9px; border-radius: 999px; background: ${first ? 'rgba(0,209,255,0.12)' : 'rgba(255,255,255,0.05)'}; border: 1px solid ${first ? 'rgba(0,209,255,0.35)' : LINE}; color: ${first ? BLUE_SOFT : MUTED}; font-weight: ${first ? '700' : '600'};">${label}</span>`;

        audienceHtml = `
          ${sectionHead('AUDIENCE', 'Who watched this quarter', 'Demographics and discovery paths, averaged across the synced channels.')}
          <div data-pdf-section style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div style="background: ${CARD}; border: 1px solid ${LINE}; border-radius: 16px; padding: 22px;">
              <div style="${EYEBROW} color: ${MUTED}; margin-bottom: 14px;">Gender</div>
              ${genderEntries.map(([g, pct]) => {
                const label = g === 'user_specified' ? 'Other' : g.charAt(0).toUpperCase() + g.slice(1);
                const color = g === 'male' ? BLUE : g === 'female' ? '#ffab9d' : MUTED;
                const barW = totalGender > 0 ? (pct / totalGender) * 100 : 0;
                return `<div style="margin-bottom: 8px;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                    <span style="font-size: 13px; color: ${TEXT}; font-weight: 500;">${label}</span>
                    <span style="font-size: 13px; color: ${INK}; font-weight: 700; font-variant-numeric: tabular-nums;">${pct.toFixed(1)}%</span>
                  </div>
                  ${bar(barW, color)}
                </div>`;
              }).join('')}
              <div style="${EYEBROW} color: ${MUTED}; margin: 18px 0 12px;">Age</div>
              ${ageEntries.map(([label, val]) => `<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                <div style="min-width: 44px; width: 44px; flex-shrink: 0; font-size: 12px; color: ${MUTED}; text-align: right; font-weight: 600;">${label}</div>
                <div style="flex: 1;">${bar((val / maxAge) * 100, AMBER)}</div>
                <div style="min-width: 44px; width: 44px; flex-shrink: 0; font-size: 12px; color: ${INK}; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums;">${val.toFixed(1)}%</div>
              </div>`).join('')}
            </div>
            <div style="background: ${CARD}; border: 1px solid ${LINE}; border-radius: 16px; padding: 22px;">
              <div style="${EYEBROW} color: ${MUTED}; margin-bottom: 14px;">Traffic sources</div>
              ${trafficEntries.map(([key, val]) => {
                const label = trafficLabels[key] || key.replace(/_/g, ' ');
                const pct = totalTV > 0 ? (val.views / totalTV) * 100 : 0;
                return `<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 7px;">
                  <span style="width: 108px; flex-shrink: 0; font-size: 12px; color: ${TEXT}; font-weight: 500;">${label}</span>
                  <div style="flex: 1;">${bar((pct / maxTPct) * 100, BLUE)}</div>
                  <span style="width: 44px; flex-shrink: 0; font-size: 12px; color: ${INK}; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums;">${pct.toFixed(1)}%</span>
                </div>`;
              }).join('')}
              ${topCountries.length > 0 ? `
                <div style="${EYEBROW} color: ${MUTED}; margin: 18px 0 10px;">Top countries</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                  ${topCountries.map(([code, val], i) => geoChip(`${code} ${totalCV > 0 ? ((val.views/totalCV)*100).toFixed(1) : 0}%`, i === 0)).join('')}
                </div>` : ''}
              ${topStates.length > 0 ? `
                <div style="${EYEBROW} color: ${MUTED}; margin: 14px 0 10px;">Top US states</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                  ${topStates.map(([code, val], i) => geoChip(`${code.replace('US-','')} ${totalPV > 0 ? ((val.views/totalPV)*100).toFixed(1) : 0}%`, i === 0)).join('')}
                </div>` : ''}
            </div>
          </div>`;
      }

      // AI analysis section (only when a narrative was generated)
      let narrativeHtml = '';
      if (narrative) {
        const listCard = (text, color, bg, bd) => `<div style="padding: 12px 16px; background: ${bg}; border: 1px solid ${bd}; border-radius: 10px; margin-bottom: 8px; font-size: 13px; color: ${TEXT}; line-height: 1.65;">${esc(text)}</div>`;
        const recs = (narrative.q2_recommendations || []).map((r, i) => {
          if (typeof r === 'string') return listCard(r, BLUE_SOFT, 'rgba(0,209,255,0.05)', 'rgba(0,209,255,0.2)');
          const rank = r.rank || (i + 1);
          const title = r.title || r.claim || 'Recommendation';
          const parts = [];
          if (r.claim && r.claim !== title) parts.push(`<div style="font-size: 13px; color: ${TEXT}; line-height: 1.6; margin-bottom: 8px;">${esc(r.claim)}</div>`);
          if (r.evidence) parts.push(`<div style="font-size: 13px; color: ${MUTED}; line-height: 1.65; margin-bottom: 8px;"><strong style="color: ${BLUE_SOFT};">Evidence:</strong> ${esc(r.evidence)}</div>`);
          if (r.option_a || r.option_b) {
            parts.push(`<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0;">
              ${r.option_a ? `<div style="background: rgba(255,255,255,0.04); padding: 10px 12px; border-radius: 8px; font-size: 12px; color: ${TEXT}; line-height: 1.55;"><strong style="color: ${INK};">Option A:</strong> ${esc(r.option_a)}</div>` : ''}
              ${r.option_b ? `<div style="background: rgba(255,255,255,0.04); padding: 10px 12px; border-radius: 8px; font-size: 12px; color: ${TEXT}; line-height: 1.55;"><strong style="color: ${INK};">Option B:</strong> ${esc(r.option_b)}</div>` : ''}
            </div>`);
          }
          if (r.recommendation) parts.push(`<div style="font-size: 13px; color: ${TEXT}; line-height: 1.65; margin-bottom: 8px;"><strong style="color: ${LIME};">Pick:</strong> ${esc(r.recommendation)}</div>`);
          if (r.assumption || r.invalidation) {
            parts.push(`<div style="font-size: 12px; color: ${MUTED}; line-height: 1.55; margin-bottom: 8px; padding: 8px 12px; background: rgba(0,0,0,0.3); border-radius: 8px;">
              ${r.assumption ? `<div><strong>Assumes:</strong> ${esc(r.assumption)}</div>` : ''}
              ${r.invalidation ? `<div><strong>Disproved if:</strong> ${esc(r.invalidation)}</div>` : ''}
            </div>`);
          }
          if (r.decision) parts.push(`<div style="font-size: 13px; color: ${BLUE_SOFT}; font-weight: 600; line-height: 1.55;">&rarr; ${esc(r.decision)}</div>`);
          return `<div data-pdf-section style="padding: 18px 20px; background: ${CARD}; border: 1px solid ${LINE}; border-radius: 16px; margin-bottom: 12px;">
            <div style="display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px;">
              <span style="${DISPLAY} font-size: 22px; font-weight: 700; color: ${BLUE}; line-height: 1;">${rank}</span>
              <span style="font-size: 15px; font-weight: 700; color: ${INK}; line-height: 1.4;">${esc(title)}</span>
            </div>
            ${parts.join('')}
          </div>`;
        }).join('');

        narrativeHtml = `
          ${sectionHead('ANALYSIS', 'The quarter, read closely', 'What worked, what to watch, and where next quarter&rsquo;s leverage sits.')}
          ${narrative.executive_summary ? `<div data-pdf-section style="background: ${CARD}; border: 1px solid ${LINE}; border-radius: 16px; padding: 22px 24px; margin-bottom: 18px; font-size: 14px; color: ${TEXT}; line-height: 1.75;">${esc(narrative.executive_summary)}</div>` : ''}
          <div data-pdf-section style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px;">
            ${narrative.wins?.length > 0 ? `<div>
              <div style="${EYEBROW} color: ${LIME}; margin-bottom: 10px;">Wins</div>
              ${narrative.wins.map(w => listCard(w, LIME, 'rgba(205,242,0,0.05)', 'rgba(205,242,0,0.2)')).join('')}
            </div>` : ''}
            ${narrative.challenges?.length > 0 ? `<div>
              <div style="${EYEBROW} color: ${AMBER}; margin-bottom: 10px;">Areas to watch</div>
              ${narrative.challenges.map(c => listCard(c, AMBER, 'rgba(245,158,11,0.05)', 'rgba(245,158,11,0.2)')).join('')}
            </div>` : ''}
          </div>
          ${recs ? `
            <div style="${EYEBROW} color: ${BLUE}; margin-bottom: 6px;">Next quarter</div>
            ${narrative.priority_rationale ? `<div style="font-size: 12px; color: ${FAINT}; margin-bottom: 14px; font-style: italic;">${esc(narrative.priority_rationale)}</div>` : ''}
            ${recs}` : ''}`;
      }

      // Build the page
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.width = '1200px';
      container.style.backgroundColor = '#0a0e10';
      container.style.padding = '56px 48px 40px';
      container.style.fontFamily = "'Inter', 'Helvetica Neue', Arial, sans-serif";
      container.style.wordSpacing = 'normal';
      document.body.appendChild(container);

      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      container.innerHTML = `
        <div style="max-width: 1104px; margin: 0 auto; color: ${TEXT};">
          <!-- Masthead -->
          <div data-pdf-section>
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div style="${EYEBROW} color: ${FAINT};">Full View Analytics &middot; Crux Media &middot; ${dateStr}</div>
              <img src="/Full_View_Logo.png" alt="Full View Analytics" style="height: 44px; object-fit: contain;" crossorigin="anonymous" />
            </div>
            <h1 style="${DISPLAY} margin: 18px 0 16px; font-size: 72px; font-weight: 800; color: ${INK}; line-height: 0.95; letter-spacing: 0.01em;">Quarterly Report</h1>
            <div style="font-size: 17px; color: ${MUTED}; max-width: 72ch; line-height: 1.65;">
              ${esc(clientName)} &mdash; how ${cqd.label} performed against ${pqd.label}: output, reach, engagement, and where the leverage sits going into next quarter.
            </div>
            <div style="display: inline-flex; align-items: center; gap: 10px; margin-top: 22px; padding: 9px 20px; border: 1.5px solid ${LIME}; border-radius: 999px;">
              <span style="width: 9px; height: 9px; border-radius: 50%; background: ${LIME}; display: inline-block;"></span>
              <span style="${EYEBROW} color: ${LIME}; letter-spacing: 0.08em; font-size: 14px;">${cqd.label} &middot; ${m.totalVideos} uploads &middot; ${f(m.totalViews)} views</span>
            </div>
            ${reportData.channelCount > 1 ? `<div style="font-size: 13px; color: ${FAINT}; margin-top: 14px;">Aggregated across ${reportData.channelCount} channels.</div>` : ''}
            ${!reportData.hasPreviousData ? `<div style="font-size: 13px; color: ${AMBER}; margin-top: 14px;">Limited comparison data &mdash; ${pqd.label} is only partially synced, so quarter-over-quarter deltas read low.</div>` : ''}
          </div>

          <!-- Stat band -->
          <div data-pdf-section style="display: grid; grid-template-columns: repeat(5, 1fr); background: ${CARD}; border: 1px solid ${LINE}; border-radius: 16px; overflow: hidden; margin-top: 32px;">
            ${statCell('Videos', String(m.totalVideos), pm.totalVideos > 0 ? 'prev: ' + pm.totalVideos : '', 0)}
            ${statCell('Total views', f(m.totalViews), pm.totalViews > 0 ? 'prev: ' + f(pm.totalViews) : '', 1)}
            ${statCell('Watch hours', f(m.totalWatchHours), pm.totalWatchHours > 0 ? 'prev: ' + f(pm.totalWatchHours) : '', 2)}
            ${statCell('Subs gained', f(m.totalSubsGained), pm.totalSubsGained > 0 ? 'prev: ' + f(pm.totalSubsGained) : '', 3)}
            ${statCell('Upload freq', m.uploadFrequency.toFixed(1) + '/wk', pm.uploadFrequency > 0 ? 'prev: ' + pm.uploadFrequency.toFixed(1) + '/wk' : '', 4)}
          </div>

          <!-- Quarter over quarter -->
          ${sectionHead('PERFORMANCE', 'Quarter over quarter', 'Rate metrics compared against ' + pqd.label + ' &mdash; green means the quarter improved on the one before it.')}
          <div data-pdf-section style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
            ${kpiCard('Avg views / video', f(m.avgViews), d.avgViews, pm.avgViews > 0 ? f(pm.avgViews) : null)}
            ${kpiCard('Engagement rate', (m.engagementRate * 100).toFixed(2) + '%', d.engagementRate, pm.engagementRate > 0 ? (pm.engagementRate * 100).toFixed(2) + '%' : null)}
            ${kpiCard('Avg retention', m.avgRetention > 0 ? (m.avgRetention * 100).toFixed(1) + '%' : '&mdash;', d.avgRetention, pm.avgRetention > 0 ? (pm.avgRetention * 100).toFixed(1) + '%' : null)}
            ${kpiCard('Avg CTR', m.avgCTR > 0 ? (m.avgCTR * 100).toFixed(1) + '%' : '&mdash;', d.avgCTR, pm.avgCTR > 0 ? (pm.avgCTR * 100).toFixed(1) + '%' : null)}
          </div>

          <!-- Format split -->
          ${sectionHead('FORMAT', 'Long-form vs Shorts', 'The two formats travel different algorithm paths &mdash; read them separately.')}
          <div data-pdf-section style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div style="background: ${CARD}; border: 1px solid ${LINE}; border-radius: 16px; padding: 22px;">
              <div style="${EYEBROW} color: ${BLUE_SOFT}; margin-bottom: 16px;">Long-form &middot; ${m.longsCount} videos</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                  <div style="font-size: 12px; color: ${MUTED}; font-weight: 600; margin-bottom: 6px;">Avg views</div>
                  <div style="${DISPLAY} font-size: 30px; font-weight: 700; color: ${BLUE_SOFT}; line-height: 1; margin-bottom: 8px;">${f(m.longsAvgViews)}</div>
                  ${chip(d.longsAvgViews)}
                </div>
                <div>
                  <div style="font-size: 12px; color: ${MUTED}; font-weight: 600; margin-bottom: 6px;">Avg retention</div>
                  <div style="${DISPLAY} font-size: 30px; font-weight: 700; color: ${INK}; line-height: 1; margin-bottom: 8px;">${m.longsAvgRetention > 0 ? (m.longsAvgRetention * 100).toFixed(1) + '%' : '&mdash;'}</div>
                  ${chip(d.longsAvgRetention)}
                </div>
              </div>
            </div>
            <div style="background: ${CARD}; border: 1px solid ${LINE}; border-radius: 16px; padding: 22px;">
              <div style="${EYEBROW} color: ${LIME}; margin-bottom: 16px;">Shorts &middot; ${m.shortsCount} videos</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                  <div style="font-size: 12px; color: ${MUTED}; font-weight: 600; margin-bottom: 6px;">Avg views</div>
                  <div style="${DISPLAY} font-size: 30px; font-weight: 700; color: ${LIME}; line-height: 1; margin-bottom: 8px;">${f(m.shortsAvgViews)}</div>
                  ${chip(d.shortsAvgViews)}
                </div>
                <div>
                  <div style="font-size: 12px; color: ${MUTED}; font-weight: 600; margin-bottom: 6px;">Avg retention</div>
                  <div style="${DISPLAY} font-size: 30px; font-weight: 700; color: ${INK}; line-height: 1; margin-bottom: 8px;">${m.shortsAvgRetention > 0 ? (m.shortsAvgRetention * 100).toFixed(1) + '%' : '&mdash;'}</div>
                  ${chip(d.shortsAvgRetention)}
                </div>
              </div>
            </div>
          </div>

          <!-- Top videos -->
          ${sectionHead('CONTENT', 'Top videos this quarter', '')}
          <div data-pdf-section style="background: ${CARD}; border: 1px solid ${LINE}; border-radius: 16px; overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 1px solid ${LINE};">
                  ${th('Title', 'left')}${th('Views', 'right')}${th('CTR', 'right')}${th('Retention', 'right')}${th('Date', 'right')}
                </tr>
              </thead>
              <tbody>${topVideosHtml}</tbody>
            </table>
          </div>

          ${audienceHtml}

          ${narrativeHtml}

          <!-- Footer -->
          <div data-pdf-footer style="margin-top: 48px; padding-top: 20px; border-top: 1px solid ${LINE};">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
              <div style="font-size: 12px; color: ${FAINT};">Generated by Full View Analytics &middot; Powered by CRUX</div>
              <img src="/crux-logo.png" alt="CRUX" style="height: 26px; object-fit: contain;" crossorigin="anonymous" />
            </div>
            <div style="font-size: 11px; color: ${FAINT}; margin-top: 12px; line-height: 1.6; max-width: 90ch;">
              Metrics cover the stated quarter. CTR and retention appear only where YouTube Studio access is connected &mdash; a blank cell means the data is unavailable, not zero. This report contains confidential information.
            </div>
          </div>
        </div>
      `;

      // Render to canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        backgroundColor: '#0a0e10',
        logging: false,
        useCORS: true,
      });

      document.body.removeChild(container);

      // Multi-page PDF — fill each page with the document ground first so
      // the uncovered tail of the last page stays dark, not printer-white.
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.setFillColor(10, 14, 16);
      pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.setFillColor(10, 14, 16);
        pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');
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
      <div style={{ padding: '64px', textAlign: 'center', color: 'var(--muted)' }}>
        <Loader size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
        <div style={{ fontSize: '15px' }}>Loading quarterly report...</div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: 'var(--muted)' }}>
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
            background: 'rgba(0, 209, 255, 0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BarChart3 size={26} style={{ color: "#4cd6ff" }} />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: "var(--ink)" }}>Quarterly Report</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{subtitle}</div>
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
              padding: '10px 14px', background: "var(--input-bg)", border: '1px solid var(--outline-variant)',
              borderRadius: '8px', color: "var(--ink)", fontSize: '13px',
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
              padding: '10px 16px', background: 'rgba(205,242,0,0.10)',
              border: '1px solid rgba(205,242,0,0.45)', borderRadius: '8px',
              color: 'var(--pos-text)', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
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
              padding: '10px 16px', background: 'rgba(0,209,255,0.12)',
              border: '1px solid var(--blue)', borderRadius: '8px',
              color: 'var(--accent-text)', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
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
          padding: '18px', marginBottom: '20px', background: "var(--card)", borderRadius: "24px", border: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: '15px', color: 'var(--muted)' }}>{pq.label}</span>
          <ArrowRight size={18} style={{ color: 'var(--outline)' }} />
          <span style={{ fontSize: '17px', fontWeight: '700', color: 'var(--blue)' }}>{cq.label}</span>
          {!reportData.hasPreviousData && (
            <span style={{ fontSize: '11px', color: "var(--warn)", background: 'rgba(245,158,11,0.1)', padding: '3px 10px', borderRadius: '4px' }}>
              Limited comparison data
            </span>
          )}
        </div>

        {/* KPI Grid - Row 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '12px' }}>
          <MetricCard label="Videos Published" value={String(cq.metrics.totalVideos)} prevValue={pq.metrics.totalVideos > 0 ? String(pq.metrics.totalVideos) : null} delta={deltas.totalVideos} color="var(--blue)" icon={Video} />
          <MetricCard label="Total Views" value={fmt(cq.metrics.totalViews)} prevValue={pq.metrics.totalViews > 0 ? fmt(pq.metrics.totalViews) : null} delta={deltas.totalViews} color="var(--pos)" icon={Eye} />
          <MetricCard label="Avg Views/Video" value={fmt(cq.metrics.avgViews)} prevValue={pq.metrics.avgViews > 0 ? fmt(pq.metrics.avgViews) : null} delta={deltas.avgViews} color="var(--warn)" icon={Play} />
          <MetricCard label="Watch Hours" value={fmt(cq.metrics.totalWatchHours)} prevValue={pq.metrics.totalWatchHours > 0 ? fmt(pq.metrics.totalWatchHours) : null} delta={deltas.totalWatchHours} color="#4cd6ff" icon={Clock} />
          <MetricCard label="Subs Gained" value={fmt(cq.metrics.totalSubsGained)} prevValue={pq.metrics.totalSubsGained > 0 ? fmt(pq.metrics.totalSubsGained) : null} delta={deltas.totalSubsGained} color="var(--tert)" icon={Users} />
        </div>

        {/* KPI Grid - Row 2 (4 columns — retention lives in Format Performance section) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          <MetricCard label="Engagement Rate" value={`${(cq.metrics.engagementRate * 100).toFixed(2)}%`} prevValue={pq.metrics.engagementRate > 0 ? `${(pq.metrics.engagementRate * 100).toFixed(2)}%` : null} delta={deltas.engagementRate} color="#4cd6ff" icon={Target} />
          <MetricCard label="Avg Retention" value={cq.metrics.avgRetention > 0 ? `${(cq.metrics.avgRetention * 100).toFixed(1)}%` : '—'} prevValue={pq.metrics.avgRetention > 0 ? `${(pq.metrics.avgRetention * 100).toFixed(1)}%` : null} delta={deltas.avgRetention} color="var(--pos)" icon={BarChart3} />
          <MetricCard label="Avg CTR" value={cq.metrics.avgCTR > 0 ? `${(cq.metrics.avgCTR * 100).toFixed(1)}%` : '—'} prevValue={pq.metrics.avgCTR > 0 ? `${(pq.metrics.avgCTR * 100).toFixed(1)}%` : null} delta={deltas.avgCTR} color="var(--tert)" icon={MousePointerClick} />
          <MetricCard label="Upload Freq" value={`${cq.metrics.uploadFrequency.toFixed(1)}/wk`} prevValue={pq.metrics.uploadFrequency > 0 ? `${pq.metrics.uploadFrequency.toFixed(1)}/wk` : null} delta={deltas.uploadFrequency} color="var(--blue)" icon={Video} />
        </div>

        {/* Format Performance Comparison */}
        {(cq.metrics.longsCount > 0 || cq.metrics.shortsCount > 0) && (
          <div style={{ background: "var(--card)", borderRadius: "24px", border: '1px solid var(--border)', padding: '24px', marginBottom: '20px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: "var(--ink)", marginBottom: '16px' }}>Format Performance</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Long-form */}
              <div style={{ background: "var(--input-bg)", borderRadius: "24px", padding: '22px' }}>
                <div style={{ fontSize: '15px', color: 'var(--text)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '16px', letterSpacing: '0.5px' }}>Long-form</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px', fontWeight: '600' }}>Avg Views</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '24px', fontWeight: '800', color: 'var(--blue)', fontFamily: "'Barlow Condensed', sans-serif" }}>{fmt(cq.metrics.longsAvgViews)}</span>
                      <DeltaBadge delta={deltas.longsAvgViews} />
                    </div>
                    {pq.metrics.longsAvgViews > 0 && <div style={{ fontSize: '11px', color: 'var(--outline)', marginTop: '2px' }}>prev: {fmt(pq.metrics.longsAvgViews)}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px', fontWeight: '600' }}>Avg Retention</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '22px', fontWeight: '700', color: 'var(--pos-text)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {cq.metrics.longsAvgRetention > 0 ? `${(cq.metrics.longsAvgRetention * 100).toFixed(1)}%` : '—'}
                      </span>
                      <DeltaBadge delta={deltas.longsAvgRetention} />
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--muted)', fontWeight: '600' }}>{cq.metrics.longsCount} videos</div>
                </div>
              </div>
              {/* Shorts */}
              <div style={{ background: "var(--input-bg)", borderRadius: '10px', padding: '22px' }}>
                <div style={{ fontSize: '15px', color: 'var(--text)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '16px', letterSpacing: '0.5px' }}>Shorts</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px', fontWeight: '600' }}>Avg Views</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '24px', fontWeight: '800', color: "var(--fmt-shorts)", fontFamily: "'Barlow Condensed', sans-serif" }}>{fmt(cq.metrics.shortsAvgViews)}</span>
                      <DeltaBadge delta={deltas.shortsAvgViews} />
                    </div>
                    {pq.metrics.shortsAvgViews > 0 && <div style={{ fontSize: '11px', color: 'var(--outline)', marginTop: '2px' }}>prev: {fmt(pq.metrics.shortsAvgViews)}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px', fontWeight: '600' }}>Avg Retention</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '22px', fontWeight: '700', color: 'var(--pos-text)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {cq.metrics.shortsAvgRetention > 0 ? `${(cq.metrics.shortsAvgRetention * 100).toFixed(1)}%` : '—'}
                      </span>
                      <DeltaBadge delta={deltas.shortsAvgRetention} />
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--muted)', fontWeight: '600' }}>{cq.metrics.shortsCount} videos</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content Mix + Top Videos */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '20px' }}>
          {/* Content Mix */}
          <div style={{ background: "var(--card)", borderRadius: "24px", border: '1px solid var(--border)', padding: '24px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: "var(--ink)", marginBottom: '14px' }}>Content Mix</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: "var(--input-bg)", borderRadius: "24px", padding: '12px' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '600' }}>SHORTS</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: "var(--fmt-shorts)", fontFamily: "'Barlow Condensed', sans-serif" }}>{cq.metrics.shortsCount}</div>
              </div>
              <div style={{ background: "var(--input-bg)", borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '600' }}>LONG-FORM</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--blue)', fontFamily: "'Barlow Condensed', sans-serif" }}>{cq.metrics.longsCount}</div>
              </div>
            </div>
            {cq.metrics.totalVideos > 0 && (
              <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'var(--surface-high)', marginBottom: '16px' }}>
                {cq.metrics.shortsCount > 0 && <div style={{ width: `${(cq.metrics.shortsCount / cq.metrics.totalVideos) * 100}%`, background: "var(--fmt-shorts)" }} />}
                {cq.metrics.longsCount > 0 && <div style={{ flex: 1, background: 'var(--blue)' }} />}
              </div>
            )}
            {/* Upload frequency — prominent display */}
            <div style={{ background: "var(--input-bg)", borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Upload Cadence</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--ink)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                {cq.metrics.uploadFrequency.toFixed(1)}<span style={{ fontSize: '14px', color: 'var(--muted)', fontWeight: '600' }}>/wk</span>
              </div>
              {reportData.channelCount > 1 && (
                <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                  {cq.metrics.uploadsPerChannel.toFixed(1)}/wk per channel ({reportData.channelCount} channels)
                </div>
              )}
            </div>
            {pq.metrics.totalVideos > 0 && (
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {pq.label}: {pq.metrics.shortsCount} shorts / {pq.metrics.longsCount} long-form
              </div>
            )}
          </div>

          {/* Top Videos */}
          <div style={{ background: "var(--card)", borderRadius: "24px", border: '1px solid var(--border)', padding: '24px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: "var(--ink)", marginBottom: '14px' }}>Top Videos This Quarter</div>
            {cq.metrics.topByViews.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--outline)', fontStyle: 'italic' }}>No videos this quarter</div>
            ) : (
              <>
                {visibleVideos.map((v, i) => (
                  <a key={v.youtube_video_id || i}
                    href={`https://www.youtube.com/watch?v=${v.youtube_video_id}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      display: 'flex', gap: '12px', padding: '10px', marginBottom: '6px',
                      background: "var(--input-bg)", borderRadius: '8px', textDecoration: 'none',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: '700', color: i === 0 ? "var(--warn)" : i === 1 ? 'var(--text)' : 'var(--outline)', minWidth: '24px' }}>#{i + 1}</span>
                    {v.thumbnail_url && <img src={v.thumbnail_url} alt="" style={{ width: 80, height: 45, borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: "var(--text)", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px' }}>
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
                      background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px',
                      color: 'var(--muted)', fontSize: '12px', cursor: 'pointer', fontWeight: '600',
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
        <div style={{ background: "var(--card)", borderRadius: "24px", border: '1px solid var(--border)', padding: '24px', marginBottom: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: "var(--ink)", marginBottom: '16px' }}>Channel Efficiency</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            {/* Sub Conversion Rate */}
            <div style={{ background: "var(--input-bg)", borderRadius: "24px", padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <UserPlus size={16} style={{ color: 'var(--outline)' }} />
                <span style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: '600' }}>Sub Conversion</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--tert)', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: '4px' }}>
                {cq.metrics.subConversionRate > 0 ? `${(cq.metrics.subConversionRate * 100).toFixed(2)}%` : '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>subscribers gained / total views</div>
              <DeltaBadge delta={deltas.subConversionRate} />
            </div>

            {/* Top by Engagement */}
            <div style={{ background: "var(--input-bg)", borderRadius: '10px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Target size={16} style={{ color: 'var(--outline)' }} />
                <span style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: '600' }}>Top by Engagement</span>
              </div>
              {cq.metrics.topByEngagement.length > 0 ? (
                <>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: "var(--text)", marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cq.metrics.topByEngagement[0].title}
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: "var(--warn)", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {(cq.metrics.topByEngagement[0].engRate * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>engagement rate · {fmt(cq.metrics.topByEngagement[0].view_count)} views</div>
                </>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--outline)' }}>—</div>
              )}
            </div>

            {/* Views per Subscriber */}
            <div style={{ background: "var(--input-bg)", borderRadius: '10px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Users size={16} style={{ color: 'var(--outline)' }} />
                <span style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: '600' }}>Views per Sub</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#4cd6ff', fontFamily: "'Barlow Condensed', sans-serif", marginBottom: '4px' }}>
                {viewsPerSub > 0 ? viewsPerSub.toFixed(1) : '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>
                {subCount > 0 ? `${fmt(cq.metrics.totalViews)} views / ${fmt(subCount)} subs` : 'subscriber count unavailable'}
              </div>
            </div>
          </div>
        </div>

        {/* AI Narrative */}
        {narrative && (
          <div style={{ background: "var(--card)", borderRadius: "24px", border: '1px solid var(--border)', padding: '28px', marginBottom: '20px' }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: "var(--ink)", marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} style={{ color: '#4cd6ff' }} /> AI Analysis
            </div>

            {narrative.executive_summary && (
              <div style={{ fontSize: '15px', color: 'var(--text)', lineHeight: '1.7', marginBottom: '24px', padding: '18px', background: "var(--input-bg)", borderRadius: "24px" }}>
                {narrative.executive_summary}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
              {narrative.wins?.length > 0 && (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: "var(--pos)", marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle size={16} /> Wins
                  </div>
                  {narrative.wins.map((w, i) => (
                    <div key={i} style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.6', padding: '10px 12px', background: 'rgba(205,242,0,0.05)', borderRadius: '8px', marginBottom: '6px' }}>
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {narrative.challenges?.length > 0 && (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: "var(--warn)", marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={16} /> Areas to Watch
                  </div>
                  {narrative.challenges.map((c, i) => (
                    <div key={i} style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.6', padding: '10px 12px', background: 'rgba(245,158,11,0.05)', borderRadius: '8px', marginBottom: '6px' }}>
                      {c}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {narrative.content_insights && (
              <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.6', marginBottom: '18px' }}>
                <span style={{ fontWeight: '600', color: "var(--ink)" }}>Content Insights: </span>{narrative.content_insights}
              </div>
            )}

            {narrative.q2_recommendations?.length > 0 && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--blue)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Target size={16} /> Next Quarter Recommendations
                </div>
                {narrative.priority_rationale && (
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', marginBottom: '12px' }}>
                    {narrative.priority_rationale}
                  </div>
                )}
                {narrative.q2_recommendations.map((r, i) => {
                  if (typeof r === 'string') {
                    return (
                      <div key={i} style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.6', padding: '10px 12px', background: 'rgba(0,209,255,0.05)', borderRadius: '8px', marginBottom: '6px' }}>
                        {r}
                      </div>
                    );
                  }
                  const rank = r.rank || (i + 1);
                  return (
                    <div key={i} style={{ padding: '14px 16px', background: 'rgba(0,209,255,0.05)', borderRadius: '10px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--blue)' }}>{rank}.</span>
                        <span style={{ fontSize: '14px', fontWeight: '700', color: "var(--ink)", lineHeight: 1.4 }}>{r.title || r.claim}</span>
                      </div>
                      {r.claim && r.claim !== r.title && (
                        <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.55, marginBottom: '8px' }}>{r.claim}</div>
                      )}
                      {r.evidence && (
                        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.55, marginBottom: '8px' }}>
                          <strong style={{ color: 'var(--accent-text)' }}>Evidence: </strong>{r.evidence}
                        </div>
                      )}
                      {(r.option_a || r.option_b) && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '8px 0' }}>
                          {r.option_a && (
                            <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '12px', color: 'var(--text)', lineHeight: 1.5 }}>
                              <strong style={{ color: "var(--ink)" }}>Option A:</strong> {r.option_a}
                            </div>
                          )}
                          {r.option_b && (
                            <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '12px', color: 'var(--text)', lineHeight: 1.5 }}>
                              <strong style={{ color: "var(--ink)" }}>Option B:</strong> {r.option_b}
                            </div>
                          )}
                        </div>
                      )}
                      {r.recommendation && (
                        <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.55, marginBottom: '6px' }}>
                          <strong style={{ color: "var(--pos-text)" }}>Pick: </strong>{r.recommendation}
                        </div>
                      )}
                      {(r.assumption || r.invalidation) && (
                        <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.5, padding: '8px 10px', background: 'rgba(0,0,0,0.25)', borderRadius: '5px', marginBottom: '6px' }}>
                          {r.assumption && <div><strong>Assumes:</strong> {r.assumption}</div>}
                          {r.invalidation && <div><strong>Disproved if:</strong> {r.invalidation}</div>}
                        </div>
                      )}
                      {r.decision && (
                        <div style={{ fontSize: '12px', color: 'var(--accent-text)', fontWeight: '600', lineHeight: 1.5 }}>
                          → {r.decision}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {narrative.trend_narrative && (
              <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6', marginTop: '18px', fontStyle: 'italic' }}>
                {narrative.trend_narrative}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
