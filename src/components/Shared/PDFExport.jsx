import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { FileDown, X, Check, RotateCcw, Plus, Trash2, Save } from "lucide-react";

/**
 * PDF Export Component
 * Creates a clean, presentation-ready PDF with key executive metrics
 * Can optionally include AI-generated summary and video ideas
 */
export default function PDFExport({ kpis, top, filtered, rows, dateRange, customDateRange, clientName, selectedChannel, allTimeKpis, channelStats, activeClient, pendingDraftToLoad, setPendingDraftToLoad, onDraftSaved }) {
  const [exporting, setExporting] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [pendingOpportunities, setPendingOpportunities] = useState([]);
  const [pendingComments, setPendingComments] = useState([]);
  const [pendingPublishedHtml, setPendingPublishedHtml] = useState('');
  const [rendering, setRendering] = useState(false);
  const [recError, setRecError] = useState(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedFlash, setDraftSavedFlash] = useState(false);
  const [pendingAudienceData, setPendingAudienceData] = useState(null);

  // Load AI content from localStorage if it should be included
  const getAIContent = () => {
    try {
      const summary = localStorage.getItem('ai_executive_summary');
      const ideas = localStorage.getItem('ai_video_ideas');

      const summaryData = summary ? JSON.parse(summary) : null;
      const ideasData = ideas ? JSON.parse(ideas) : null;

      return {
        summary: summaryData?.includeInPDF ? summaryData.narrative : null,
        ideas: ideasData?.includeInPDF ? ideasData.ideas : null
      };
    } catch (err) {
      console.error('Error loading AI content:', err);
      return { summary: null, ideas: null };
    }
  };

  const getDateRangeLabel = () => {
    switch(dateRange) {
      case '7d': return 'Last 7 Days';
      case '28d': return 'Last 28 Days';
      case '90d': return 'Last 90 Days';
      case 'ytd': return 'Year to Date';
      case 'all': return 'All Time';
      case 'custom': {
        if (customDateRange?.start && customDateRange?.end) {
          // Parse date string as local time by appending T00:00:00 (avoids UTC interpretation)
          const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          return `${fmt(customDateRange.start)} – ${fmt(customDateRange.end)}`;
        }
        return 'Custom Range';
      }
      default: return 'Last 28 Days';
    }
  };

  // Save current modal state as a draft
  const saveDraftNow = useCallback(async (silent = false) => {
    if (!activeClient?.id) return;
    const hasContent = pendingOpportunities.length > 0 || pendingComments.length > 0;
    if (!hasContent) return;

    setSavingDraft(true);
    try {
      const { saveDraft } = await import('../../services/reportDraftService');
      const autoName = draftName || `${clientName || 'Report'} — ${getDateRangeLabel()} — ${new Date().toLocaleDateString()}`;
      const oppsData = pendingOpportunities.map(o => ({ title: o.title, insight: o.insight, opportunity: o.opportunity, steps: o.steps, included: o.included }));

      const saved = await saveDraft({
        id: currentDraftId || undefined,
        clientId: activeClient.id,
        name: autoName,
        dateRange,
        customDateRange: customDateRange || null,
        selectedChannel: selectedChannel || 'all',
        clientName: clientName || '',
        opportunities: oppsData,
        openingText: pendingOpportunities._opening || '',
        closingText: pendingOpportunities._closing || '',
        topComments: pendingComments,
        publishedHtml: pendingPublishedHtml,
      });

      setCurrentDraftId(saved.id);
      setDraftName(saved.name);
      if (onDraftSaved) onDraftSaved();

      if (!silent) {
        setDraftSavedFlash(true);
        setTimeout(() => setDraftSavedFlash(false), 2000);
      }
    } catch (e) {
      console.error('Failed to save draft:', e);
      if (!silent) alert('Failed to save draft.');
    } finally {
      setSavingDraft(false);
    }
  }, [activeClient?.id, currentDraftId, draftName, clientName, dateRange, customDateRange, selectedChannel, pendingOpportunities, pendingComments, pendingPublishedHtml, onDraftSaved]);

  // Load a draft into the modal
  const loadDraftIntoModal = useCallback((draft) => {
    const opps = (draft.opportunities || []).map(o => ({
      title: o.title || '',
      insight: o.insight || '',
      opportunity: o.opportunity || '',
      steps: o.steps || [],
      included: o.included !== false,
    }));
    opps._opening = draft.openingText || '';
    opps._closing = draft.closingText || '';

    setPendingOpportunities(opps);
    setPendingComments(draft.topComments || []);
    setPendingPublishedHtml(draft.publishedHtml || '');
    setCurrentDraftId(draft.id);
    setDraftName(draft.name || '');
    setRecError(null);
    setShowReviewModal(true);
  }, []);

  // When a draft is passed from Saved Reports, load it
  useEffect(() => {
    if (pendingDraftToLoad) {
      loadDraftIntoModal(pendingDraftToLoad);
      if (setPendingDraftToLoad) setPendingDraftToLoad(null);
    }
  }, [pendingDraftToLoad, setPendingDraftToLoad, loadDraftIntoModal]);

  // Phase 1: Collect data (comments, AI opportunities, published section) then open review modal
  const handleExportClick = async () => {
    setExporting(true);
    setCurrentDraftId(null);
    setDraftName('');

    try {
      // Fetch top comments from top videos via server proxy (sorted by likes)
      let topComments = [];
      try {
        const videosWithIds = top.filter(v => v.youtubeVideoId).slice(0, 8);
        const titleMap = {};
        const channelMap = {};
        videosWithIds.forEach(v => {
          titleMap[v.youtubeVideoId] = v.title || 'Untitled';
          channelMap[v.youtubeVideoId] = v.channel || '';
        });

        if (videosWithIds.length > 0) {
          const videoIds = videosWithIds.map(v => v.youtubeVideoId);
          const resp = await fetch('/api/youtube-comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoIds, maxPerVideo: 20 }),
          });

          if (resp.ok) {
            const { results } = await resp.json();
            const allComments = Object.entries(results)
              .flatMap(([videoId, data]) =>
                (data.comments || []).map(c => ({ ...c, videoId }))
              );

            topComments = allComments
              .sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0))
              .slice(0, 10)
              .map(c => ({
                text: c.text,
                author: c.author,
                likes: c.likeCount || 0,
                videoTitle: titleMap[c.videoId] || 'Unknown Video',
                channel: channelMap[c.videoId] || ''
              }));
          }
        }
      } catch (err) {
        console.warn('Could not fetch comments for PDF:', err);
      }

      // Build "Content Published This Period" section
      let publishedSectionHtml = '';
      {
        let periodStart = null;
        const now = new Date();
        if (dateRange === 'custom' && customDateRange?.start) {
          periodStart = new Date(customDateRange.start + 'T00:00:00');
        } else if (dateRange === '7d') {
          periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (dateRange === '28d') {
          periodStart = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
        } else if (dateRange === '90d') {
          periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        } else if (dateRange === 'ytd') {
          periodStart = new Date(now.getFullYear(), 0, 1);
        }

        const publishedVideos = periodStart
          ? filtered.filter(r => r.publishDate && new Date(r.publishDate) >= periodStart)
              .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate))
          : [];

        if (publishedVideos.length > 0) {
          const pubShorts = publishedVideos.filter(r => r.type === 'short');
          const pubLongs = publishedVideos.filter(r => r.type !== 'short');

          const calcMetrics = (vids) => {
            const views = vids.reduce((s, r) => s + (r.views || 0), 0);
            const imps = vids.reduce((s, r) => s + (r.impressions || 0), 0);
            const avgCtr = imps > 0 ? vids.reduce((s, r) => s + (r.ctr || 0) * (r.impressions || 0), 0) / imps : 0;
            const avgRet = views > 0 ? vids.reduce((s, r) => s + (r.retention || 0) * (r.views || 0), 0) / views : 0;
            return { count: vids.length, views, avgCtr, avgRet };
          };

          const sm = calcMetrics(pubShorts);
          const lm = calcMetrics(pubLongs);

          const videoRows = publishedVideos.map(video => {
            const typeBg = video.type === 'short' ? '#fff7ed' : '#eff6ff';
            const typeColor = video.type === 'short' ? '#f97316' : '#0ea5e9';
            const typeLabel = video.type === 'short' ? 'SHORT' : 'LONG';
            const pubDate = video.publishDate ? new Date(video.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
            const channelLine = video.channel ? '<div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">' + video.channel + '</div>' : '';
            return '<tr style="border-bottom: 1px solid #e2e8f0;">'
              + '<td style="padding: 8px 14px; font-size: 13px; color: #1e293b; max-width: 400px; font-weight: 500;">'
              + '<div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + (video.title || 'Untitled') + '</div>'
              + channelLine
              + '</td>'
              + '<td style="padding: 8px 14px; text-align: center;"><span style="display: inline-block; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; background: ' + typeBg + '; color: ' + typeColor + ';">' + typeLabel + '</span></td>'
              + '<td style="padding: 8px 14px; text-align: center; font-size: 12px; color: #64748b; white-space: nowrap;">' + pubDate + '</td>'
              + '<td style="padding: 8px 14px; text-align: right; font-size: 14px; font-weight: 600; color: #1e293b;">' + (video.views || 0).toLocaleString() + '</td>'
              + '<td style="padding: 8px 14px; text-align: right; font-size: 13px; color: #64748b;">' + ((video.ctr || 0) * 100).toFixed(1) + '%</td>'
              + '<td style="padding: 8px 14px; text-align: right; font-size: 13px; color: #64748b;">' + ((video.retention || 0) * 100).toFixed(1) + '%</td>'
              + '</tr>';
          }).join('');

          publishedSectionHtml = '<div data-pdf-section style="margin-bottom: 28px;">'
            + '<h2 style="font-size: 26px; font-weight: 700; color: #1e293b; margin-bottom: 20px; line-height: 1.3; word-spacing: -1px; letter-spacing: 1px;">CONTENT PUBLISHED THIS PERIOD</h2>'
            + '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 16px;">'
            + '<div style="background: #fff7ed; padding: 18px; border-radius: 12px; border: 2px solid #fed7aa;">'
            + '<div style="font-size: 18px; font-weight: 700; color: #ea580c; margin-bottom: 12px; line-height: 1.3;">📱 Shorts Published</div>'
            + '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 6px; line-height: 1.3;">Count</div><div style="font-size: 26px; font-weight: 700; color: #f97316; line-height: 1.25;">' + sm.count + '</div></div>'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 6px; line-height: 1.3;">Total Views</div><div style="font-size: 26px; font-weight: 700; color: #f97316; line-height: 1.25;">' + sm.views.toLocaleString() + '</div></div>'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 6px; line-height: 1.3;">Avg CTR</div><div style="font-size: 20px; font-weight: 600; color: #1e293b; line-height: 1.25;">' + (sm.avgCtr * 100).toFixed(1) + '%</div></div>'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 6px; line-height: 1.3;">Avg Retention</div><div style="font-size: 20px; font-weight: 600; color: #1e293b; line-height: 1.25;">' + (sm.avgRet * 100).toFixed(1) + '%</div></div>'
            + '</div></div>'
            + '<div style="background: #eff6ff; padding: 18px; border-radius: 12px; border: 2px solid #bfdbfe;">'
            + '<div style="font-size: 18px; font-weight: 700; color: #0284c7; margin-bottom: 12px; line-height: 1.3;">🎥 Long-form Published</div>'
            + '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 6px; line-height: 1.3;">Count</div><div style="font-size: 26px; font-weight: 700; color: #0ea5e9; line-height: 1.25;">' + lm.count + '</div></div>'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 6px; line-height: 1.3;">Total Views</div><div style="font-size: 26px; font-weight: 700; color: #0ea5e9; line-height: 1.25;">' + lm.views.toLocaleString() + '</div></div>'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 6px; line-height: 1.3;">Avg CTR</div><div style="font-size: 20px; font-weight: 600; color: #1e293b; line-height: 1.25;">' + (lm.avgCtr * 100).toFixed(1) + '%</div></div>'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 6px; line-height: 1.3;">Avg Retention</div><div style="font-size: 20px; font-weight: 600; color: #1e293b; line-height: 1.25;">' + (lm.avgRet * 100).toFixed(1) + '%</div></div>'
            + '</div></div>'
            + '</div>'
            + '<div style="background: #f8fafc; border-radius: 12px; overflow: hidden; border: 2px solid #e2e8f0;">'
            + '<table style="width: 100%; border-collapse: collapse;"><thead><tr style="background: #e2e8f0;">'
            + '<th style="text-align: left; padding: 10px 14px; font-size: 13px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">TITLE</th>'
            + '<th style="text-align: center; padding: 10px 14px; font-size: 13px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">TYPE</th>'
            + '<th style="text-align: center; padding: 10px 14px; font-size: 13px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">PUBLISHED</th>'
            + '<th style="text-align: right; padding: 10px 14px; font-size: 13px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">VIEWS</th>'
            + '<th style="text-align: right; padding: 10px 14px; font-size: 13px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">CTR</th>'
            + '<th style="text-align: right; padding: 10px 14px; font-size: 13px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">RETENTION</th>'
            + '</tr></thead><tbody>' + videoRows + '</tbody></table></div>'
            + '</div>';
        }
      }

      // Store collected data and open review modal with empty recommendations
      setPendingComments(topComments);
      const emptyOpps = [];
      emptyOpps._opening = '';
      emptyOpps._closing = '';
      setPendingOpportunities(emptyOpps);
      setRecError(null);
      // Fetch audience intelligence data for the PDF
      let audienceData = null;
      try {
        const { supabase } = await import('../../services/supabaseClient');
        const channelIds = selectedChannel && selectedChannel !== 'all' && activeClient?.networkMembers
          ? [activeClient.networkMembers.find(m => m.name === selectedChannel)?.id].filter(Boolean)
          : activeClient?.isNetwork && activeClient?.networkMembers
            ? activeClient.networkMembers.map(m => m.id)
            : [activeClient?.id].filter(Boolean);

        const mergedAudience = { gender: {}, age: {}, country: {}, province: {}, trafficSources: {} };
        for (const chId of channelIds) {
          const { data: snap } = await supabase
            .from('channel_audience_snapshots')
            .select('gender_distribution, age_distribution, country_data, province_data, traffic_sources')
            .eq('channel_id', chId)
            .order('snapshot_date', { ascending: false })
            .limit(1)
            .single();
          if (!snap) continue;
          if (snap.gender_distribution) for (const [k, v] of Object.entries(snap.gender_distribution)) mergedAudience.gender[k] = (mergedAudience.gender[k] || 0) + v;
          if (snap.age_distribution) for (const [k, v] of Object.entries(snap.age_distribution)) mergedAudience.age[k] = (mergedAudience.age[k] || 0) + v;
          if (snap.country_data) for (const [k, v] of Object.entries(snap.country_data)) {
            if (!mergedAudience.country[k]) mergedAudience.country[k] = { views: 0, pct: 0 };
            mergedAudience.country[k].views += v.views || 0;
          }
          if (snap.province_data) for (const [k, v] of Object.entries(snap.province_data)) {
            if (!mergedAudience.province[k]) mergedAudience.province[k] = { views: 0, pct: 0 };
            mergedAudience.province[k].views += v.views || 0;
          }
          if (snap.traffic_sources) for (const [k, v] of Object.entries(snap.traffic_sources)) {
            if (!mergedAudience.trafficSources[k]) mergedAudience.trafficSources[k] = { views: 0, pct: 0 };
            mergedAudience.trafficSources[k].views += v.views || 0;
          }
        }
        // Normalize demographics by channel count
        const chCount = channelIds.length;
        if (chCount > 1) {
          for (const k of Object.keys(mergedAudience.gender)) mergedAudience.gender[k] /= chCount;
          for (const k of Object.keys(mergedAudience.age)) mergedAudience.age[k] /= chCount;
        }
        // Recalculate percentages
        const totalTV = Object.values(mergedAudience.trafficSources).reduce((s, t) => s + t.views, 0);
        for (const t of Object.values(mergedAudience.trafficSources)) t.pct = totalTV > 0 ? (t.views / totalTV) * 100 : 0;
        const totalCV = Object.values(mergedAudience.country).reduce((s, c) => s + c.views, 0);
        for (const c of Object.values(mergedAudience.country)) c.pct = totalCV > 0 ? (c.views / totalCV) * 100 : 0;
        const totalPV = Object.values(mergedAudience.province).reduce((s, p) => s + p.views, 0);
        for (const p of Object.values(mergedAudience.province)) p.pct = totalPV > 0 ? (p.views / totalPV) * 100 : 0;

        if (Object.keys(mergedAudience.gender).length > 0) audienceData = mergedAudience;
      } catch (err) {
        console.warn('Could not fetch audience data for PDF:', err);
      }

      setPendingPublishedHtml(publishedSectionHtml);
      setPendingAudienceData(audienceData);
      setShowReviewModal(true);

    } catch (error) {
      console.error('PDF data collection failed:', error);
      alert('Failed to prepare PDF data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Phase 2: Render PDF with reviewed/edited opportunities
  const confirmAndExport = async () => {
    setRendering(true);
    setShowReviewModal(false);

    try {
      const opportunities = pendingOpportunities.filter(o => o.included);
      opportunities._opening = pendingOpportunities._opening || '';
      opportunities._closing = pendingOpportunities._closing || '';
      const topComments = pendingComments;
      const publishedSectionHtml = pendingPublishedHtml;
      const audienceData = pendingAudienceData;

      // Capture map images from the live DOM using data-map attributes
      let usMapImage = null;
      let worldMapImage = null;
      try {
        const captureMap = async (selector) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          // Scroll into view to ensure it's rendered (lazy-loaded)
          el.scrollIntoView({ block: 'center' });
          await new Promise(r => setTimeout(r, 500)); // Wait for render
          const canvas = await html2canvas(el, {
            backgroundColor: '#0c1222',
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: true,
          });
          return canvas.toDataURL('image/png');
        };
        usMapImage = await captureMap('[data-map="us-states"]');
        worldMapImage = await captureMap('[data-map="world"]');
      } catch (err) {
        console.warn('Could not capture map images for PDF:', err);
      }

      // Create a temporary container for the PDF content
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.width = '1200px';
      container.style.backgroundColor = '#ffffff';
      container.style.padding = '50px 35px 35px 35px';
      container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      document.body.appendChild(container);

      const dateLabel = getDateRangeLabel();
      const dateStr = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Get AI content
      const aiContent = getAIContent();

      // Determine channel display name
      const uniqueChannels = [...new Set(filtered.map(r => r.channel).filter(Boolean))];
      const displayName = selectedChannel && selectedChannel !== 'all'
        ? selectedChannel
        : clientName || uniqueChannels[0] || '';

      // Count videos published in the selected period — uses ALL rows (not filtered/snapshot)
      // to match dashboard's uploadCounts which also uses rows, not filtered
      const allRows = rows || filtered;
      const periodPublished = allRows.filter(r => {
        if (r.isTotal || !r.publishDate) return false;
        const pub = new Date(r.publishDate);
        if (dateRange === 'all') return true;
        if (dateRange === 'custom') {
          if (customDateRange?.start && pub < new Date(customDateRange.start)) return false;
          if (customDateRange?.end) {
            const end = new Date(customDateRange.end);
            end.setHours(23, 59, 59, 999);
            if (pub > end) return false;
          }
          return true;
        }
        const now = new Date();
        let start;
        if (dateRange === '7d') start = new Date(now.getTime() - 7 * 86400000);
        else if (dateRange === '28d') start = new Date(now.getTime() - 28 * 86400000);
        else if (dateRange === '90d') start = new Date(now.getTime() - 90 * 86400000);
        else if (dateRange === 'ytd') start = new Date(now.getFullYear(), 0, 1);
        return start ? pub >= start : true;
      });
      const shorts = periodPublished.filter(r => r.type === 'short');
      const longs = periodPublished.filter(r => r.type !== 'short');
      // Use kpis views (from all active videos in period) to match dashboard Format Breakdown
      const shortsViews = kpis.shortsMetrics?.views || shorts.reduce((s, r) => s + (r.views || 0), 0);
      const longsViews = kpis.longsMetrics?.views || longs.reduce((s, r) => s + (r.views || 0), 0);

      // Build the PDF content
      container.innerHTML = `
        <div style="max-width: 1080px; margin: 0 auto;">
          <!-- Header -->
          <div data-pdf-section style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #2563eb;">
            <div style="display: flex; align-items: center; gap: 22px;">
              <div style="background: #1a1a1a; padding: 14px 18px; border-radius: 10px;">
                <img src="/Full_View_Logo.png" alt="Full View Analytics" style="height: 72px; object-fit: contain; display: block;" />
              </div>
              <div style="border-left: 2px solid #cbd5e1; padding-left: 22px;">
                ${displayName ? `<div style="font-size: 20px; font-weight: 700; color: #2563eb; margin-bottom: 6px;">${displayName}</div>` : ''}
                <h1 style="margin: 0; font-size: 34px; font-weight: 700; color: #1e293b; line-height: 1.3; word-spacing: -1px;">Strategic YouTube Insights</h1>
                <p style="margin: 10px 0 0 0; font-size: 16px; color: #64748b; font-weight: 500;">${dateLabel}</p>
              </div>
            </div>
          </div>

          <!-- Key Metrics Grid -->
          <div data-pdf-section style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px;">
            <div style="background: #f8fafc; padding: 18px; border-radius: 12px; border-left: 5px solid #818cf8;">
              <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 8px; letter-spacing: 0.5px;">VIEWS</div>
              <div style="font-size: 30px; font-weight: 700; color: #1e293b; line-height: 1.25;">${(kpis.views || 0).toLocaleString()}</div>
              ${kpis.viewsChange !== undefined ? `<div style="font-size: 12px; color: ${kpis.viewsChange >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 8px; font-weight: 600; line-height: 1.4;">${kpis.viewsChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.viewsChange).toFixed(1)}% vs previous period</div>` : ''}
              <div style="border-top: 1px solid #e2e8f0; margin-top: 10px; padding-top: 8px;">
                <div style="font-size: 11px; color: #94a3b8; font-weight: 500;">Lifetime: <span style="color: #64748b; font-weight: 600;">${channelStats?.viewCount ? Number(channelStats.viewCount).toLocaleString() : allTimeKpis ? allTimeKpis.views.toLocaleString() : '—'}</span></div>
              </div>
            </div>

            <div style="background: #f8fafc; padding: 18px; border-radius: 12px; border-left: 5px solid #16a34a;">
              <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 8px; letter-spacing: 0.5px;">WATCH HOURS</div>
              <div style="font-size: 30px; font-weight: 700; color: #1e293b; line-height: 1.25;">${Number(kpis.watchHours.toFixed(1)).toLocaleString()}</div>
              ${kpis.watchHoursChange !== undefined ? `<div style="font-size: 12px; color: ${kpis.watchHoursChange >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 8px; font-weight: 600; line-height: 1.4;">${kpis.watchHoursChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.watchHoursChange).toFixed(1)}% vs previous period</div>` : ''}
              ${allTimeKpis ? `<div style="border-top: 1px solid #e2e8f0; margin-top: 10px; padding-top: 8px;">
                <div style="font-size: 11px; color: #94a3b8; font-weight: 500;">Lifetime: <span style="color: #64748b; font-weight: 600;">${Number(allTimeKpis.watchHours.toFixed(1)).toLocaleString()}</span></div>
              </div>` : ''}
            </div>

            <div style="background: #f8fafc; padding: 18px; border-radius: 12px; border-left: 5px solid #f59e0b;">
              <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 8px; letter-spacing: 0.5px;">SUBSCRIBERS</div>
              <div style="font-size: 30px; font-weight: 700; color: #1e293b; line-height: 1.25;">${channelStats?.subscriberCount ? Number(channelStats.subscriberCount).toLocaleString() : allTimeKpis ? allTimeKpis.subs.toLocaleString() : '—'}</div>
              <div style="font-size: 13px; color: #64748b; margin-top: 8px; font-weight: 500; line-height: 1.4;">Subscribers Gained: <span style="color: ${kpis.subs >= 0 ? '#16a34a' : '#dc2626'}; font-weight: 600;">${kpis.subs >= 0 ? '+' : ''}${kpis.subs.toLocaleString()}</span></div>
              ${kpis.subsChange !== undefined ? `<div style="font-size: 12px; color: ${kpis.subsChange >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 6px; font-weight: 600; line-height: 1.4;">${kpis.subsChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.subsChange).toFixed(1)}% vs previous period</div>` : ''}
            </div>
          </div>

          <!-- Summary Stats -->
          <div data-pdf-section style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 24px 28px; border-radius: 12px; margin-bottom: 28px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 18px; text-align: center;">
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px; line-height: 1.3;">VIDEOS PUBLISHED</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff; line-height: 1.25;">${periodPublished.length}</div>
              </div>
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px; line-height: 1.3;">AVG VIEWS/VIDEO</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff; line-height: 1.25;">${filtered.length > 0 ? Math.round(kpis.views / filtered.length).toLocaleString() : '0'}</div>
                ${kpis.avgViewsPerVideoChange !== undefined ? `<div style="font-size: 12px; color: ${kpis.avgViewsPerVideoChange >= 0 ? '#86efac' : '#fca5a5'}; margin-top: 8px; font-weight: 600; line-height: 1.4;">${kpis.avgViewsPerVideoChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.avgViewsPerVideoChange).toFixed(1)}%</div>` : ''}
              </div>
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px; line-height: 1.3;">IMPRESSIONS</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff; line-height: 1.25;">${(kpis.impressions || 0).toLocaleString()}</div>
              </div>
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px; line-height: 1.3;">AVG CTR</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff; line-height: 1.25;">${(kpis.avgCtr * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px; line-height: 1.3;">AVG RETENTION</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff; line-height: 1.25;">${(kpis.avgRet * 100).toFixed(1)}%</div>
              </div>
            </div>
          </div>

          <!-- Content Performance -->
          <div data-pdf-section style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px;">
            <div style="background: #fff7ed; padding: 20px; border-radius: 12px; border: 3px solid #f97316;">
              <div style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 14px; line-height: 1.3;">📱 Shorts Performance</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 8px; font-weight: 600; line-height: 1.3;">Videos</div>
                  <div style="font-size: 28px; font-weight: 700; color: #f97316; line-height: 1.25;">${shorts.length}</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 8px; font-weight: 600; line-height: 1.3;">Views</div>
                  <div style="font-size: 28px; font-weight: 700; color: #f97316; line-height: 1.25;">${(shortsViews / 1000).toFixed(1)}K</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 8px; font-weight: 600; line-height: 1.3;">Avg CTR</div>
                  <div style="font-size: 24px; font-weight: 600; color: #1e293b; line-height: 1.25;">${(kpis.shortsMetrics.avgCtr * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 8px; font-weight: 600; line-height: 1.3;">Avg Retention</div>
                  <div style="font-size: 24px; font-weight: 600; color: #1e293b; line-height: 1.25;">${(kpis.shortsMetrics.avgRet * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>

            <div style="background: #eff6ff; padding: 20px; border-radius: 12px; border: 3px solid #0ea5e9;">
              <div style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 14px; line-height: 1.3;">🎥 Long-form Performance</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 8px; font-weight: 600; line-height: 1.3;">Videos</div>
                  <div style="font-size: 28px; font-weight: 700; color: #0ea5e9; line-height: 1.25;">${longs.length}</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 8px; font-weight: 600; line-height: 1.3;">Views</div>
                  <div style="font-size: 28px; font-weight: 700; color: #0ea5e9; line-height: 1.25;">${(longsViews / 1000).toFixed(1)}K</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 8px; font-weight: 600; line-height: 1.3;">Avg CTR</div>
                  <div style="font-size: 24px; font-weight: 600; color: #1e293b; line-height: 1.25;">${(kpis.longsMetrics.avgCtr * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 8px; font-weight: 600; line-height: 1.3;">Avg Retention</div>
                  <div style="font-size: 24px; font-weight: 600; color: #1e293b; line-height: 1.25;">${(kpis.longsMetrics.avgRet * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Metric Definitions -->
          <div data-pdf-section style="display: flex; gap: 22px; margin-bottom: 28px; padding: 16px 18px; background: #f1f5f9; border-radius: 10px; border-left: 4px solid #94a3b8;">
            <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.6;"><strong style="color: #475569;">CTR (Click-Through Rate):</strong> The percentage of people who saw your thumbnail and clicked to watch.</p>
            <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.6;"><strong style="color: #475569;">AVD (Avg View Duration):</strong> The average percentage of your video that viewers watched before leaving.</p>
          </div>

          <!-- Top Performers -->
          <div data-pdf-section style="margin-bottom: 32px;">
            <h2 style="font-size: 26px; font-weight: 700; color: #1e293b; margin-bottom: 20px; line-height: 1.3; word-spacing: -1px; letter-spacing: 1px;">TOP PERFORMING VIDEOS</h2>
            <div style="background: #f8fafc; border-radius: 12px; overflow: hidden; border: 2px solid #e2e8f0;">
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background: #e2e8f0;">
                    <th style="text-align: left; padding: 12px 14px; font-size: 13px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">TITLE</th>
                    <th style="text-align: center; padding: 12px 14px; font-size: 13px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">TYPE</th>
                    <th style="text-align: center; padding: 12px 14px; font-size: 13px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">UPLOADED</th>
                    <th style="text-align: right; padding: 12px 14px; font-size: 13px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">VIEWS</th>
                    <th style="text-align: right; padding: 12px 14px; font-size: 13px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">CTR</th>
                    <th style="text-align: right; padding: 12px 14px; font-size: 13px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">RETENTION</th>
                  </tr>
                </thead>
                <tbody>
                  ${top.slice(0, 10).map((video, idx) => `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 10px 14px; font-size: 14px; color: #1e293b; max-width: 420px; font-weight: 500;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                          ${video.thumbnailUrl || video.youtubeVideoId ? `<img src="${video.thumbnailUrl || `https://img.youtube.com/vi/${video.youtubeVideoId}/mqdefault.jpg`}" style="width: 64px; height: 36px; object-fit: cover; border-radius: 4px; flex-shrink: 0;" crossorigin="anonymous" />` : ''}
                          <div style="min-width: 0;">
                            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.4;">${video.title || 'Untitled'}</div>
                            ${video.channel ? `<div style="font-size: 12px; color: #94a3b8; font-weight: 400; margin-top: 4px; line-height: 1.3;">${video.channel}</div>` : ''}
                          </div>
                        </div>
                      </td>
                      <td style="padding: 14px; text-align: center;">
                        <span style="display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; background: ${video.type === 'short' ? '#fff7ed' : '#eff6ff'}; color: ${video.type === 'short' ? '#f97316' : '#0ea5e9'};">
                          ${video.type === 'short' ? 'SHORT' : 'LONG'}
                        </span>
                      </td>
                      <td style="padding: 14px; text-align: center; font-size: 13px; color: #64748b; font-weight: 500; white-space: nowrap;">${video.publishDate ? new Date(video.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                      <td style="padding: 14px; text-align: right; font-size: 15px; font-weight: 600; color: #1e293b;">${(video.views || 0).toLocaleString()}</td>
                      <td style="padding: 14px; text-align: right; font-size: 14px; color: #64748b; font-weight: 500;">${((video.ctr || 0) * 100).toFixed(1)}%</td>
                      <td style="padding: 14px; text-align: right; font-size: 14px; color: #64748b; font-weight: 500;">${((video.retention || 0) * 100).toFixed(1)}%</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div data-pdf-pagebreak></div>

          <!-- Content Published This Period -->
          ${publishedSectionHtml}

          ${topComments.length > 0 ? `
          <!-- Top Comments -->
          <div data-pdf-section style="margin-bottom: 32px;">
            <h2 style="font-size: 26px; font-weight: 700; color: #1e293b; margin-bottom: 22px; line-height: 1.3; word-spacing: -1px; letter-spacing: 1px;">TOP AUDIENCE COMMENTS</h2>
            ${topComments.map(c => `
              <div style="background: #f8fafc; padding: 18px 22px; border-radius: 12px; margin-bottom: 14px; border-left: 4px solid #2563eb;">
                <div style="font-size: 15px; color: #1e293b; line-height: 1.7; margin-bottom: 12px;">"${c.text}"</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 13px; color: #64748b; font-weight: 500; line-height: 1.4;">— ${c.author}</span>
                  <div style="display: flex; align-items: center; gap: 16px;">
                    <span style="font-size: 12px; color: #94a3b8; max-width: 350px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.4;">${c.channel ? c.channel + ' · ' : ''}${c.videoTitle}</span>
                    <span style="font-size: 13px; color: #2563eb; font-weight: 600; line-height: 1.4;">👍 ${c.likes.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          ` : ''}

          ${audienceData ? `
          <!-- Audience Intelligence -->
          <div data-pdf-section style="margin-bottom: 32px;">
            <h2 style="font-size: 26px; font-weight: 700; color: #1e293b; margin-bottom: 22px; line-height: 1.3; letter-spacing: 1px;">AUDIENCE INTELLIGENCE</h2>

            ${(usMapImage || worldMapImage) ? `
            <!-- Maps -->
            <div style="display: grid; grid-template-columns: ${usMapImage && worldMapImage ? '1fr 1fr' : '1fr'}; gap: 12px; margin-bottom: 20px;">
              ${usMapImage ? `
              <div style="border-radius: 10px; overflow: hidden; border: 2px solid #e2e8f0;">
                <div style="padding: 8px 14px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
                  <span style="font-size: 12px; font-weight: 600; color: #64748b;">United States</span>
                </div>
                <img src="${usMapImage}" style="width: 100%; display: block;" />
              </div>
              ` : ''}
              ${worldMapImage ? `
              <div style="border-radius: 10px; overflow: hidden; border: 2px solid #e2e8f0;">
                <div style="padding: 8px 14px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
                  <span style="font-size: 12px; font-weight: 600; color: #64748b;">Global</span>
                </div>
                <img src="${worldMapImage}" style="width: 100%; display: block;" />
              </div>
              ` : ''}
            </div>
            ` : ''}

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
              ${/* Demographics */ ''}
              <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 2px solid #e2e8f0;">
                <div style="font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 14px;">Demographics</div>
                ${/* Gender */ ''}
                <div style="margin-bottom: 14px;">
                  <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Gender</div>
                  ${Object.entries(audienceData.gender || {}).sort(([,a],[,b]) => b - a).map(([g, pct]) => {
                    const label = g === 'user_specified' ? 'Other' : g.charAt(0).toUpperCase() + g.slice(1);
                    const color = g === 'male' ? '#2563eb' : g === 'female' ? '#db2777' : '#7c3aed';
                    const totalG = Object.values(audienceData.gender).reduce((s,v) => s+v, 0);
                    const barW = totalG > 0 ? (pct / totalG) * 100 : 0;
                    return `<div style="margin-bottom: 6px;">
                      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                        <span style="font-size: 13px; color: #374151; font-weight: 500;">${label}</span>
                        <span style="font-size: 13px; color: #1e293b; font-weight: 700;">${pct.toFixed(1)}%</span>
                      </div>
                      <div style="height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                        <div style="width: ${barW}%; height: 100%; background: ${color}; border-radius: 4px;"></div>
                      </div>
                    </div>`;
                  }).join('')}
                </div>
                ${/* Age */ ''}
                <div>
                  <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Age Distribution</div>
                  ${['age13-17','age18-24','age25-34','age35-44','age45-54','age55-64','age65-']
                    .filter(k => audienceData.age?.[k] != null)
                    .map(k => {
                      const label = {'age13-17':'13-17','age18-24':'18-24','age25-34':'25-34','age35-44':'35-44','age45-54':'45-54','age55-64':'55-64','age65-':'65+'}[k] || k;
                      const val = audienceData.age[k];
                      const maxAge = Math.max(...Object.values(audienceData.age));
                      const barW = maxAge > 0 ? (val / maxAge) * 100 : 0;
                      return `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                        <div style="min-width: 44px; width: 44px; flex-shrink: 0; font-size: 12px; color: #64748b; text-align: right; font-weight: 600;">${label}</div>
                        <div style="flex: 1; height: 14px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                          <div style="width: ${Math.max(barW, 2)}%; height: 100%; background: linear-gradient(90deg, #f59e0b, #fbbf24); border-radius: 4px;"></div>
                        </div>
                        <div style="min-width: 42px; width: 42px; flex-shrink: 0; font-size: 12px; color: #1e293b; font-weight: 700; text-align: right;">${val.toFixed(1)}%</div>
                      </div>`;
                    }).join('')}
                </div>
              </div>

              ${/* Traffic Sources + Geography */ ''}
              <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 2px solid #e2e8f0;">
                <div style="font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 14px;">Traffic Sources</div>
                ${Object.entries(audienceData.trafficSources || {})
                  .sort(([,a],[,b]) => b.views - a.views)
                  .filter(([,v]) => v.pct >= 1)
                  .map(([key, val]) => {
                    const labels = {YT_SEARCH:'YouTube Search',SUBSCRIBER:'Subscribers',SUGGESTED:'Suggested',BROWSE:'Browse',EXT_URL:'External',NOTIFICATION:'Notifications',PLAYLIST:'Playlists',SHORTS:'Shorts Feed',YT_CHANNEL:'Channel Page',END_SCREEN:'End Screens',NO_LINK_OTHER:'Direct'};
                    const label = labels[key] || key.replace(/_/g, ' ');
                    const maxPct = Math.max(...Object.values(audienceData.trafficSources).map(t => t.pct));
                    const barW = maxPct > 0 ? (val.pct / maxPct) * 100 : 0;
                    return `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                      <span style="width: 100px; font-size: 12px; color: #374151; font-weight: 500;">${label}</span>
                      <div style="flex: 1; height: 10px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                        <div style="width: ${Math.max(barW, 2)}%; height: 100%; background: linear-gradient(90deg, #2563eb, #60a5fa); border-radius: 3px;"></div>
                      </div>
                      <span style="width: 40px; font-size: 12px; color: #1e293b; font-weight: 700; text-align: right;">${val.pct.toFixed(1)}%</span>
                    </div>`;
                  }).join('')}

                <div style="font-size: 14px; font-weight: 700; color: #1e293b; margin-top: 18px; margin-bottom: 10px;">Top Regions</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                  ${Object.entries(audienceData.country || {})
                    .sort(([,a],[,b]) => b.views - a.views)
                    .slice(0, 8)
                    .map(([code, val]) => `<span style="font-size: 11px; padding: 4px 10px; background: #e0e7ff; border-radius: 6px; color: #3730a3; font-weight: 600;">${code} ${val.pct.toFixed(1)}%</span>`)
                    .join('')}
                </div>
                ${Object.keys(audienceData.province || {}).length > 0 ? `
                <div style="font-size: 14px; font-weight: 700; color: #1e293b; margin-top: 14px; margin-bottom: 10px;">Top US States</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                  ${Object.entries(audienceData.province || {})
                    .sort(([,a],[,b]) => b.views - a.views)
                    .slice(0, 8)
                    .map(([code, val]) => `<span style="font-size: 11px; padding: 4px 10px; background: #dbeafe; border-radius: 6px; color: #1e40af; font-weight: 600;">${code.replace('US-','')} ${val.pct.toFixed(1)}%</span>`)
                    .join('')}
                </div>
                ` : ''}
              </div>
            </div>
          </div>
          ` : ''}

          <div data-pdf-pagebreak></div>

          ${opportunities.length > 0 ? `
          <!-- Strategic Recommendations -->
          <div data-pdf-section style="margin-bottom: 32px;">
            <h2 style="font-size: 26px; font-weight: 700; color: #1e293b; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 3px solid #10b981; line-height: 1.3; word-spacing: -1px; letter-spacing: 1px;">STRATEGIC RECOMMENDATIONS</h2>
            ${opportunities._opening ? `<p style="font-size: 15px; color: #374151; line-height: 1.75; margin-bottom: 22px;">${opportunities._opening}</p>` : ''}
            ${opportunities.map((opp, idx) => `
              <div style="display: flex; gap: 16px; margin-bottom: 18px; background: linear-gradient(135deg, #f0fdf4, #dcfce7); padding: 22px; border-radius: 14px; border: 2px solid #86efac;">
                <div style="width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #10b981, #059669); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; color: white; flex-shrink: 0; box-shadow: 0 4px 8px rgba(16, 185, 129, 0.3);">
                  ${idx + 1}
                </div>
                <div style="flex: 1;">
                  <div style="font-size: 18px; font-weight: 700; color: #065f46; margin-bottom: 10px; line-height: 1.35;">${opp.title}</div>
                  ${opp.insight ? `<div style="font-size: 14px; color: #1e293b; line-height: 1.65; margin-bottom: 8px;"><strong style="color: #1d4ed8;">The Insight:</strong> ${opp.insight}</div>` : ''}
                  ${opp.opportunity ? `<div style="font-size: 14px; color: #1e293b; line-height: 1.65; margin-bottom: 10px;"><strong style="color: #b45309;">The Opportunity:</strong> ${opp.opportunity}</div>` : ''}
                  ${opp.steps && opp.steps.length > 0 ? `
                    <div style="margin-top: 6px; padding-left: 2px;">
                      ${opp.steps.map((step, si) => `<div style="font-size: 13px; color: #374151; line-height: 1.6; margin-bottom: 4px; padding-left: 16px; text-indent: -16px;">${si + 1}. ${step}</div>`).join('')}
                    </div>
                  ` : ''}
                  ${opp.recommendation ? `<div style="font-size: 15px; color: #374151; line-height: 1.75;">${opp.recommendation}</div>` : ''}
                </div>
              </div>
            `).join('')}
            ${opportunities._closing ? `<p style="font-size: 15px; color: #374151; line-height: 1.75; margin-top: 16px; padding: 16px 20px; background: #f0fdf4; border-radius: 10px; border-left: 4px solid #10b981;">${opportunities._closing}</p>` : ''}
          </div>
          ` : ''}

          ${aiContent.summary ? `
          <!-- AI Executive Summary -->
          <div data-pdf-section style="margin-top: 36px;">
            <h2 style="font-size: 32px; font-weight: 700; color: #1e293b; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 3px solid #2563eb; background: linear-gradient(90deg, #2563eb, #7c3aed); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
              AI EXECUTIVE SUMMARY
            </h2>
            <div style="background: linear-gradient(135deg, #f8fafc, #e0e7ff); padding: 28px; border-radius: 14px; border: 2px solid #818cf8;">
              ${aiContent.summary.split('\n').map(line => {
                if (line.startsWith('# ')) {
                  return `<h3 style="font-size: 26px; font-weight: 700; color: #1e3a8a; margin: 22px 0 14px 0; line-height: 1.35;">${line.substring(2)}</h3>`;
                }
                if (line.startsWith('## ')) {
                  return `<h4 style="font-size: 22px; font-weight: 600; color: #312e81; margin: 20px 0 12px 0; padding-left: 12px; border-left: 4px solid #6366f1; line-height: 1.35;">${line.substring(3)}</h4>`;
                }
                if (line.startsWith('### ')) {
                  return `<h5 style="font-size: 18px; font-weight: 600; color: #4338ca; margin: 16px 0 10px 0; line-height: 1.35;">${line.substring(4)}</h5>`;
                }
                if (line.startsWith('- ') || line.startsWith('• ')) {
                  return `<li style="margin-left: 24px; margin-bottom: 10px; color: #374151; font-size: 15px; line-height: 1.7;">${line.substring(2)}</li>`;
                }
                if (line.trim() === '') {
                  return '<div style="height: 14px;"></div>';
                }
                const boldText = line.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #1d4ed8; font-weight: 600;">$1</strong>');
                return `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin-bottom: 14px;">${boldText}</p>`;
              }).join('')}
            </div>
          </div>
          ` : ''}

          ${aiContent.ideas && aiContent.ideas.length > 0 ? `
          <!-- AI Video Ideas -->
          <div data-pdf-section style="margin-top: 36px;">
            <h2 style="font-size: 32px; font-weight: 700; color: #1e293b; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 3px solid #7c3aed; background: linear-gradient(90deg, #7c3aed, #2563eb); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
              AI-GENERATED VIDEO IDEAS
            </h2>
            ${aiContent.ideas.map((idea, idx) => `
              <div style="background: linear-gradient(135deg, #faf5ff, #ede9fe); padding: 24px; border-radius: 14px; margin-bottom: 20px; border: 2px solid #a78bfa;">
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 18px;">
                  <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #7c3aed, #2563eb); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; color: white; box-shadow: 0 4px 8px rgba(124, 58, 237, 0.3);">
                    ${idx + 1}
                  </div>
                  <div>
                    <div style="display: inline-block; padding: 6px 14px; border-radius: 8px; background: #e0e7ff; color: #4338ca; font-size: 13px; font-weight: 600; margin-right: 8px; line-height: 1.4;">
                      ${idea.topic}
                    </div>
                    <div style="display: inline-block; padding: 6px 14px; border-radius: 8px; border: 2px solid #10b981; background: #d1fae5; color: #065f46; font-size: 13px; font-weight: 600; line-height: 1.4;">
                      ${idea.confidence} confidence
                    </div>
                  </div>
                </div>
                <h3 style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 16px; line-height: 1.35;">
                  ${idea.title}
                </h3>
                <div style="background: linear-gradient(135deg, #dbeafe, #bfdbfe); padding: 16px; border-radius: 10px; margin-bottom: 14px; border-left: 4px solid #2563eb;">
                  <div style="font-size: 12px; font-weight: 700; color: #1e3a8a; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.5px; line-height: 1.3;">Opening Hook</div>
                  <div style="font-size: 14px; color: #1e40af; line-height: 1.7;">${idea.hook}</div>
                </div>
                <div style="background: linear-gradient(135deg, #f3e8ff, #e9d5ff); padding: 16px; border-radius: 10px; margin-bottom: 14px; border-left: 4px solid #7c3aed;">
                  <div style="font-size: 12px; font-weight: 700; color: #5b21b6; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.5px; line-height: 1.3;">Thumbnail Concept</div>
                  <div style="font-size: 14px; color: #6b21a8; line-height: 1.7;">${idea.thumbnailConcept}</div>
                </div>
                <div style="background: linear-gradient(135deg, #d1fae5, #a7f3d0); padding: 16px; border-radius: 10px; border-left: 4px solid #10b981;">
                  <div style="font-size: 12px; font-weight: 700; color: #065f46; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.5px; line-height: 1.3;">Why This Works</div>
                  <div style="font-size: 14px; color: #047857; line-height: 1.7;">${idea.whyItWorks}</div>
                </div>
              </div>
            `).join('')}
          </div>
          ` : ''}

          <!-- Footer -->
          <div data-pdf-footer style="padding-top: 18px; border-top: 1px solid #e2e8f0; text-align: center;">
            <div style="display: flex; justify-content: center; align-items: center; gap: 12px; margin-bottom: 10px;">
              <span style="color: #64748b; font-size: 14px; font-weight: 500; line-height: 1.4;">Generated by Full View Analytics</span>
              <span style="color: #cbd5e1; font-size: 14px;">•</span>
              <span style="color: #94a3b8; font-size: 14px; font-weight: 500; line-height: 1.4;">Powered by</span>
              <img src="/crux-logo.png" alt="CRUX" style="height: 32px; object-fit: contain; vertical-align: middle;" />
            </div>
            <div style="color: #cbd5e1; font-size: 13px;">This report contains confidential information</div>
          </div>
        </div>
      `;

      // Wait for any images to load
      await new Promise(resolve => setTimeout(resolve, 500));

      // Calculate effective page height based on container width and A4 aspect ratio
      const pageHeightPx = (297 / 210) * container.offsetWidth;

      // Force page breaks at marked positions
      const pageBreaks = container.querySelectorAll('[data-pdf-pagebreak]');
      pageBreaks.forEach(pb => {
        const pbTop = pb.offsetTop;
        const currentPage = Math.floor(pbTop / pageHeightPx);
        const nextPageStart = (currentPage + 1) * pageHeightPx;
        const spacer = nextPageStart - pbTop;
        if (spacer > 0 && spacer < pageHeightPx) {
          pb.style.height = `${spacer}px`;
        }
      });

      // Prevent page breaks from splitting sections
      const sections = container.querySelectorAll('[data-pdf-section]');
      sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        const sectionBottom = sectionTop + sectionHeight;

        // Find which page boundary this section crosses
        const startPage = Math.floor(sectionTop / pageHeightPx);
        const endPage = Math.floor((sectionBottom - 1) / pageHeightPx);

        // If section spans two pages and fits on a single page, push it to the next page
        if (endPage > startPage && sectionHeight < pageHeightPx * 0.85) {
          const nextPageStart = (startPage + 1) * pageHeightPx;
          const spacer = nextPageStart - sectionTop + 65;
          section.style.marginTop = `${spacer}px`;
        }
      });

      // Push footer to the bottom of the last page
      const footer = container.querySelector('[data-pdf-footer]');
      if (footer) {
        const footerTop = footer.offsetTop;
        const footerHeight = footer.offsetHeight;
        const footerBottom = footerTop + footerHeight;
        const lastPage = Math.floor(footerTop / pageHeightPx);
        const lastPageBottom = (lastPage + 1) * pageHeightPx;
        const padding = 35; // bottom padding from page edge
        const neededTop = lastPageBottom - footerHeight - padding;
        if (neededTop > footerTop) {
          footer.style.marginTop = `${neededTop - footerTop}px`;
        }
      }

      // Capture the content as canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
      });

      // Remove temporary container
      document.body.removeChild(container);

      // Create PDF with multi-page support
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Add additional pages if content is longer than one page
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      // Save the PDF
      const filename = `YouTube_Report_${dateLabel.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(filename);

      // Mark draft as exported
      if (currentDraftId) {
        try {
          const { updateDraftStatus } = await import('../../services/reportDraftService');
          await updateDraftStatus(currentDraftId, 'exported', new Date().toISOString());
          if (onDraftSaved) onDraftSaved();
        } catch (e) {
          console.warn('Failed to update draft status:', e);
        }
      }

    } catch (error) {
      console.error('PDF export failed:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setRendering(false);
    }
  };

  const handleCancelModal = async () => {
    // Auto-save if there's content
    const hasContent = pendingOpportunities.length > 0 || pendingComments.length > 0;
    if (hasContent && activeClient?.id) {
      await saveDraftNow(true);
    }
    setShowReviewModal(false);
    setPendingOpportunities([]);
    setPendingComments([]);
    setPendingPublishedHtml('');
    setCurrentDraftId(null);
    setDraftName('');
  };

  // Generate AI recommendations (called from inside the modal)
  const generateAIRecommendations = async () => {
    setGeneratingAI(true);
    setRecError(null);
    try {
      const { default: claudeAPI } = await import('../../services/claudeAPI');
      if (!claudeAPI.apiKey) claudeAPI.apiKey = claudeAPI.loadAPIKey();
      if (!claudeAPI.apiKey) {
        setRecError('No Claude API key configured. Go to Settings to add your API key.');
        return;
      }
      if (!filtered || filtered.length === 0) {
        setRecError('No video data available for the selected period.');
        return;
      }

      const uniqueChannels = [...new Set(filtered.map(r => r.channel).filter(Boolean))];
      const isMultiChannel = uniqueChannels.length > 1;
      const daysLive = (v) => {
        if (!v.publishDate) return null;
        return Math.max(1, Math.round((Date.now() - new Date(v.publishDate).getTime()) / (1000 * 60 * 60 * 24)));
      };
      const formatVid = (v) => {
        const d = daysLive(v);
        const pubStr = v.publishDate ? new Date(v.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        return `"${v.title}"${isMultiChannel && v.channel ? ` [${v.channel}]` : ''} (${(v.views||0).toLocaleString()} views${d ? ` in ${d}d` : ''}, ${((v.ctr||0)*100).toFixed(1)}% CTR, ${((v.retention||0)*100).toFixed(1)}% retention, ${(v.subscribers||0)} subs gained, ${Number((v.watchHours||0).toFixed(1))} watch hrs${v.likes ? `, ${v.likes} likes` : ''}${v.comments ? `, ${v.comments} comments` : ''}${pubStr ? `, pub ${pubStr}` : ''})`;
      };

      // Compute periodPublished, shorts, longs, shortsViews, longsViews for AI prompt
      const allRows = rows || filtered;
      const periodPublished = allRows.filter(r => {
        if (r.isTotal || !r.publishDate) return false;
        const pub = new Date(r.publishDate);
        if (dateRange === 'all') return true;
        if (dateRange === 'custom') {
          if (customDateRange?.start && pub < new Date(customDateRange.start)) return false;
          if (customDateRange?.end) {
            const end = new Date(customDateRange.end);
            end.setHours(23, 59, 59, 999);
            if (pub > end) return false;
          }
          return true;
        }
        const now = new Date();
        let start;
        if (dateRange === '7d') start = new Date(now.getTime() - 7 * 86400000);
        else if (dateRange === '28d') start = new Date(now.getTime() - 28 * 86400000);
        else if (dateRange === '90d') start = new Date(now.getTime() - 90 * 86400000);
        else if (dateRange === 'ytd') start = new Date(now.getFullYear(), 0, 1);
        return start ? pub >= start : true;
      });
      const shorts = periodPublished.filter(r => r.type === 'short');
      const longs = periodPublished.filter(r => r.type !== 'short');
      const shortsViews = kpis.shortsMetrics?.views || shorts.reduce((s, r) => s + (r.views || 0), 0);
      const longsViews = kpis.longsMetrics?.views || longs.reduce((s, r) => s + (r.views || 0), 0);

      let channelBreakdownBlock = '';
      if (isMultiChannel) {
        const channelRows = uniqueChannels.map(ch => {
          const chRows = periodPublished.filter(r => r.channel === ch);
          const chViews = chRows.reduce((s, r) => s + (r.views || 0), 0);
          const chShorts = chRows.filter(r => r.type === 'short').length;
          const chLongs = chRows.filter(r => r.type !== 'short').length;
          return `* ${ch}: ${chRows.length} uploads (${chLongs} long-form, ${chShorts} Shorts), ${chViews.toLocaleString()} views`;
        }).join('\n');
        channelBreakdownBlock = `\nNETWORK OVERVIEW\nThis is a multichannel network with ${uniqueChannels.length} channels. Recommendations should be channel-specific where possible — what works for one channel may not apply to another.\n${channelRows}\n`;
      }

      const longsByCtr = [...longs].sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
      const longsByRet = [...longs].sort((a, b) => (b.retention || 0) - (a.retention || 0));
      const shortsByCtr = [...shorts].sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
      const shortsByRet = [...shorts].sort((a, b) => (b.retention || 0) - (a.retention || 0));

      let brandContextBlock = '';
      try {
        if (activeClient?.id) {
          const { getBrandContextWithSignals } = await import('../../services/brandContextService');
          brandContextBlock = await getBrandContextWithSignals(activeClient.id, 'audit_recommendations');
        }
      } catch (e) {
        console.warn('Could not load brand context for PDF:', e);
      }

      // Series detection removed from PDF prompt — pattern matching is too aggressive
      // for this context (groups unrelated videos by shared 2-word prefixes) and was
      // causing recommendations to over-index on false series groupings.

      const periodLabel = getDateRangeLabel();
      const periodFraming = dateRange === '7d' ? 'weekly performance snapshot'
        : dateRange === '28d' ? 'monthly performance review'
        : dateRange === '90d' ? 'quarterly performance review'
        : dateRange === 'ytd' ? 'year-to-date performance review'
        : 'performance review';

      const dataPrompt = `You are generating the Strategic Recommendations section for ${clientName || 'this channel'}'s ${periodFraming}.

---
${channelBreakdownBlock}
CHANNEL OVERVIEW
${isMultiChannel ? `Network: ${clientName || 'Unknown'} (${uniqueChannels.length} channels)` : `Channel: ${clientName || 'Unknown'}`}
Reporting Period: ${periodLabel}
Total Subscribers: ${channelStats?.subscriberCount ? Number(channelStats.subscriberCount).toLocaleString() : 'N/A'}${kpis.subsChange !== undefined ? ` (${kpis.subsChange >= 0 ? '+' : ''}${kpis.subsChange.toFixed(1)}% change this period)` : ''}
Total Views (period): ${(kpis.views || 0).toLocaleString()}${kpis.viewsChange !== undefined ? ` (${kpis.viewsChange >= 0 ? '+' : ''}${kpis.viewsChange.toFixed(1)}% vs previous period)` : ''}
Watch Hours (period): ${Number((kpis.watchHours || 0).toFixed(1)).toLocaleString()}${kpis.watchHoursChange !== undefined ? ` (${kpis.watchHoursChange >= 0 ? '+' : ''}${kpis.watchHoursChange.toFixed(1)}%)` : ''}
Subscribers Gained: ${(kpis.subs || 0) >= 0 ? '+' : ''}${(kpis.subs || 0).toLocaleString()}
Avg CTR: ${((kpis.avgCtr || 0) * 100).toFixed(1)}%
Avg Retention: ${((kpis.avgRet || 0) * 100).toFixed(1)}%

UPLOADS THIS PERIOD
Shorts uploaded: ${shorts.length} videos, ${shortsViews.toLocaleString()} period views, ${((kpis.shortsMetrics?.avgCtr || 0) * 100).toFixed(1)}% avg CTR, ${((kpis.shortsMetrics?.avgRet || 0) * 100).toFixed(1)}% avg retention
Long-form uploaded: ${longs.length} videos, ${longsViews.toLocaleString()} period views, ${((kpis.longsMetrics?.avgCtr || 0) * 100).toFixed(1)}% avg CTR, ${((kpis.longsMetrics?.avgRet || 0) * 100).toFixed(1)}% avg retention

---

TOP PERFORMING LONG-FORM (by views):
${longsByCtr.slice(0, 5).map(formatVid).join('\n')}

BOTTOM PERFORMING LONG-FORM (by views):
${[...longs].sort((a, b) => (a.views || 0) - (b.views || 0)).slice(0, 5).map(formatVid).join('\n')}

TOP LONG-FORM BY RETENTION:
${longsByRet.slice(0, 5).map(formatVid).join('\n')}

BOTTOM LONG-FORM BY RETENTION:
${[...longsByRet].reverse().slice(0, 5).map(formatVid).join('\n')}

TOP PERFORMING SHORTS (by views):
${shortsByCtr.slice(0, 5).map(formatVid).join('\n')}

BOTTOM PERFORMING SHORTS (by views):
${[...shorts].sort((a, b) => (a.views || 0) - (b.views || 0)).slice(0, 5).map(formatVid).join('\n')}

${brandContextBlock ? `---\n\n${brandContextBlock}` : ''}

---

VIEW COUNT CONTEXT:
* Each video includes "Xd" indicating how many days it has been live. A video with 5,000 views in 3 days is dramatically outperforming one with 8,000 views in 60 days.
* When comparing view counts across videos, ALWAYS account for days live. Never call a recently published video "underperforming" solely because its raw view count is lower than older videos.
* CTR and retention are rate-based metrics and ARE directly comparable regardless of publish date.
* When citing view counts in recommendations, include the time context (e.g. "12,000 views in just 5 days" or "only 3,000 views after 45 days").

CRITICAL: Your entire response must be valid, complete JSON. Do NOT let it get truncated. Provide 6-8 recommendations — cover every meaningful signal in the data. Each recommendation should address a distinct issue or opportunity.

Respond with ONLY a JSON object (no markdown fences) matching this exact structure:
{
  "opening": "2-3 sentence state-of-the-channel paragraph. Lead with what's working well, then note the most interesting signal or pattern. Reference actual numbers. Tone: encouraging and grounded.",
  "recommendations": [
    {
      "title": "Concise opportunity statement with a data point. Example: 'Apply [Channel]'s [X]-view format to other channels' or 'Explore title adjustments on [Channel] to lift CTR from 0.5% closer to network average'",
      "insight": "2-4 sentences. What's happening in the data and what it tells us. Name specific video titles with their metrics (views, CTR%, retention%). Compare against averages to show where the opportunity sits. Keep it observational, not alarmist.",
      "opportunity": "2-4 sentences. Why this matters for the business and what the upside looks like. Reference videos from the data that show the format or approach CAN work. Quantify the potential where possible in plain terms (e.g. 'videos in this format are averaging 3x the views, suggesting there's appetite for more').",
      "steps": [
        "2-3 sentences. A quick, low-effort action CRUX can handle right away (e.g. 'We can draft a few alternative titles for these 3 videos and share options for review — a small tweak here could open up more impressions.'). Frame as an offer, not an assignment.",
        "2-3 sentences. A strategic suggestion that folds into upcoming content work CRUX is already doing (e.g. 'For the next batch of uploads, we could test a shorter hook format based on what's working on [video]. Happy to build that into the content plan.'). No hard timelines.",
        "2-3 sentences. What we'll keep an eye on — the ongoing signal CRUX will monitor (e.g. 'We'll be watching CTR on these videos over the next few weeks. If it moves above 5%, that confirms the new approach is landing and we can apply it more broadly.')."
      ]
    }
  ],
  "closing": "2-3 sentence forward-looking statement. Highlight momentum and the most promising opportunity ahead. End with encouragement — the client should feel good about where things are headed."
}

QUALITY FILTER: Apply these tests to every recommendation before including it:
1. Does it cite a specific video title, metric, or pattern from THIS channel's data? If not, cut it.
2. Could this recommendation apply to any YouTube channel without modification? If yes, cut it.
3. Does the "opportunity" explain why this matters for the business in concrete terms? If it's just "this could improve performance," make it specific or cut it.
4. Do the steps position CRUX as the one doing the work? Each step should be something CRUX can realistically deliver — not homework for the client. Frame as offers ("we can," "happy to," "we'll keep an eye on"), never as assignments.`;

      const systemPrompt = `You are the top YouTube strategist in the world, with deep expertise in platform algorithm behavior, audience psychology, retention mechanics, and content packaging across every vertical and channel size. You understand how YouTube's recommendation engine weighs watch time, session depth, click-through rate, and audience satisfaction signals at a granular level.

You work as a senior strategist at CRUX Media, a video strategy and production agency with 15 years of experience and over 3 billion views managed across enterprise clients. You combine world-class analytical depth with a trusted advisor's voice, speaking directly to the client's team as a partner invested in their growth.

ANALYTICAL LENS:
* Read the data like an advisor. When a metric stands out, explain what's likely driving it (pacing, hook structure, topic selection, content density) and what adjustment could help.
* Think in systems. Every metric connects to others: CTR affects how many people see the content, retention influences how widely YouTube recommends it, and upload consistency builds subscriber trust over time.
* Contextualize by format. A 45% retention on an 18-minute video is a strong signal. A 45% retention on a 90-second Short suggests there may be room to tighten the opening. Adjust your read based on format benchmarks.
* Separate signal from noise. A single underperforming video is not a trend. A consistent pattern across 3+ videos is worth noting.

YOUR VOICE:
* Informative and grounded. Frame everything as opportunities and signals — not problems or failures. Never use dramatic or alarming language (no "catastrophic," "destroying," "critical failure," "hemorrhaging," etc.). Even underperformance is just a signal pointing toward an adjustment.
* Always use "we" language — CRUX and the client are a team. In the insight and opportunity sections, "we" means the partnership. In the steps, CRUX is the actor: "we can," "we'll," "happy to." The client should read the steps and think "great, they've got this" — not "great, more homework." The client is running a business with many priorities; the steps should feel like CRUX is taking things off their plate, not adding to it.
* Warm and collaborative. This is a trusted partner offering perspective, not a consultant issuing directives. Use qualifiers naturally: "it may be worth testing," "if bandwidth allows," "a good next step could be."
* Specific. Reference actual video titles, percentages, and patterns from this channel's data. If we cannot cite the data, do not make the recommendation.
* Forward-looking. Connect observations to growth opportunities with clear reasoning.
* Plain language. The client may not be a YouTube expert. Write so a marketing director or business owner understands every sentence without Googling. When referencing a platform concept (CTR, retention, impressions), briefly explain it in plain terms on first use. The insight should feel smart, not intimidating.

FORMAT RULES:
* Respond ONLY in English. Do not include any non-English characters, Unicode symbols, or characters from other scripts. If a video title contains non-English text, transliterate or paraphrase it in English.
* Shorts and long-form are fundamentally different formats with different algorithm pathways. Never conflate them. When recommending title or thumbnail strategies, only reference long-form videos (Shorts do not have clickable thumbnails or browse impressions in the same way).
* Order recommendations using this tier framework (the PDF should read as a narrative: celebrate → optimize → grow):
  TIER 1 — Protect what's working (1-2 recs): Things that are succeeding and worth reinforcing. Lead with these to build confidence before suggesting changes.
  TIER 2 — Quick wins CRUX can act on now (2-3 recs): Low-effort, high-signal opportunities — title tweaks, thumbnail adjustments, format tests backed by data. Things we can handle this week.
  TIER 3 — Strategic bets for upcoming content (2-3 recs): Bigger moves for the content calendar — new formats to test, audience signals to lean into, gaps worth exploring. Higher ceiling, more lead time.
* Never use dashes or hyphens (-) as bullet points in any text fields.
* Return ONLY valid JSON, no markdown fences.
${isMultiChannel ? `
MULTICHANNEL NETWORK:
* This data spans multiple YouTube channels under one client. Each channel has its own audience, content strategy, and algorithm profile.
* Make recommendations channel-specific. Name which channel each recommendation applies to. Do NOT give blanket advice that assumes all channels share the same audience or content strategy.
* When comparing performance across channels, note that differences may reflect intentional strategic choices (e.g. a clips channel will naturally have different metrics than a flagship long-form channel).
* Cross-channel recommendations (e.g. cross-promotion, content repurposing between channels) are valuable when supported by the data.` : ''}`;

      console.log('[PDFExport] Calling Claude for recommendations...');
      const result = await claudeAPI.call(dataPrompt, systemPrompt, 'pdf_opportunities', 32000);
      console.log('[PDFExport] Claude response received, length:', result.text?.length);
      const { parseClaudeJSON } = await import('../../lib/parseClaudeJSON');

      let parsed;
      try {
        parsed = parseClaudeJSON(result.text);
      } catch (parseErr) {
        let repaired = result.text.trim();
        const fence = repaired.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fence) repaired = fence[1].trim();
        repaired = repaired.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
        repaired = repaired.replace(/,\s*([\]}])/g, '$1');
        try {
          parsed = JSON.parse(repaired);
        } catch (_) {
          console.error('[PDFExport] JSON parse failed. Raw:', result.text.slice(0, 500));
          throw parseErr;
        }
      }

      if (parsed && parsed.recommendations && Array.isArray(parsed.recommendations)) {
        const opps = parsed.recommendations.map(r => ({
          title: r.title,
          insight: r.insight || '',
          opportunity: r.opportunity || '',
          steps: r.steps || [],
          included: true
        }));
        opps._opening = parsed.opening || '';
        opps._closing = parsed.closing || '';
        setPendingOpportunities(opps);
      } else if (Array.isArray(parsed) && parsed.length >= 1) {
        const opps = parsed.slice(0, 8).map(r => ({ ...r, included: true }));
        opps._opening = '';
        opps._closing = '';
        setPendingOpportunities(opps);
      } else {
        console.warn('[PDFExport] Unexpected response structure:', Object.keys(parsed || {}));
        setRecError('Unexpected response format from AI.');
      }
    } catch (err) {
      console.error('[PDFExport] RECOMMENDATION ERROR:', err?.message || err);
      setRecError(err?.message || 'Unknown error generating recommendations');
    } finally {
      setGeneratingAI(false);
    }
  };

  const updateOpportunity = (idx, field, value) => {
    setPendingOpportunities(prev => {
      const updated = prev.map((o, i) => i === idx ? { ...o, [field]: value } : o);
      // Preserve _opening and _closing
      updated._opening = prev._opening;
      updated._closing = prev._closing;
      return updated;
    });
  };

  const updateStep = (idx, stepIdx, value) => {
    setPendingOpportunities(prev => {
      const updated = prev.map((o, i) => {
        if (i !== idx) return o;
        const newSteps = [...(o.steps || [])];
        newSteps[stepIdx] = value;
        return { ...o, steps: newSteps };
      });
      updated._opening = prev._opening;
      updated._closing = prev._closing;
      return updated;
    });
  };

  const updateOpeningClosing = (field, value) => {
    setPendingOpportunities(prev => {
      const updated = [...prev];
      updated._opening = field === '_opening' ? value : prev._opening;
      updated._closing = field === '_closing' ? value : prev._closing;
      return updated;
    });
  };

  const addRecommendation = () => {
    setPendingOpportunities(prev => {
      const updated = [...prev, { title: '', insight: '', opportunity: '', steps: ['', '', ''], included: true }];
      updated._opening = prev._opening ?? '';
      updated._closing = prev._closing ?? '';
      return updated;
    });
  };

  const removeRecommendation = (idx) => {
    setPendingOpportunities(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      updated._opening = prev._opening;
      updated._closing = prev._closing;
      return updated;
    });
  };

  const addStep = (idx) => {
    setPendingOpportunities(prev => {
      const updated = prev.map((o, i) => {
        if (i !== idx) return o;
        return { ...o, steps: [...(o.steps || []), ''] };
      });
      updated._opening = prev._opening;
      updated._closing = prev._closing;
      return updated;
    });
  };

  const removeStep = (idx, stepIdx) => {
    setPendingOpportunities(prev => {
      const updated = prev.map((o, i) => {
        if (i !== idx) return o;
        return { ...o, steps: o.steps.filter((_, si) => si !== stepIdx) };
      });
      updated._opening = prev._opening;
      updated._closing = prev._closing;
      return updated;
    });
  };

  const isDisabled = exporting || rendering;

  return (
    <>
    <button
      onClick={handleExportClick}
      disabled={isDisabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: isDisabled ? '#94a3b8' : '#2563eb',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        padding: '10px 18px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
        boxShadow: isDisabled ? 'none' : '0 2px 4px rgba(37, 99, 235, 0.2)',
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.backgroundColor = '#1d4ed8';
          e.currentTarget.style.boxShadow = '0 4px 8px rgba(37, 99, 235, 0.3)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.backgroundColor = '#2563eb';
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(37, 99, 235, 0.2)';
        }
      }}
    >
      <FileDown size={18} />
      {exporting ? 'Preparing...' : rendering ? 'Rendering PDF...' : 'Export PDF'}
    </button>

    {showReviewModal && createPortal(
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <div style={{ backgroundColor: '#1E1E1E', border: '1px solid #333', borderRadius: '12px', width: '1100px', maxWidth: '95vw', maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={{ padding: '20px 32px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#fff' }}>Review PDF Content</div>
              <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>Edit recommendations before exporting</div>
            </div>
            <button onClick={handleCancelModal} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}>
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '24px 32px', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#93c5fd', letterSpacing: '0.5px' }}>STRATEGIC RECOMMENDATIONS</div>
              <button
                onClick={generateAIRecommendations}
                disabled={generatingAI}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: generatingAI ? '#1e3a5f' : 'linear-gradient(135deg, #2563eb, #7c3aed)',
                  border: 'none', borderRadius: '8px', padding: '8px 16px',
                  color: '#fff', fontSize: '13px', fontWeight: '600',
                  cursor: generatingAI ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s', opacity: generatingAI ? 0.7 : 1,
                }}
              >
                {generatingAI ? (
                  <><RotateCcw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</>
                ) : (
                  <>{pendingOpportunities.length > 0 ? 'Regenerate with AI' : 'Generate with AI'}</>
                )}
              </button>
            </div>

            {pendingOpportunities._opening !== undefined && (
              <div style={{ padding: '16px 20px', background: '#1a2e1a', borderRadius: '8px', marginBottom: '20px', border: '1px solid #2d5a2d' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#10b981', marginBottom: '8px', letterSpacing: '0.5px' }}>OPENING</div>
                <textarea
                  value={pendingOpportunities._opening || ''}
                  onChange={e => updateOpeningClosing('_opening', e.target.value)}
                  rows={4}
                  style={{ width: '100%', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', padding: '12px 14px', color: '#ccc', fontSize: '14px', lineHeight: '1.7', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {recError && (
              <div style={{ padding: '12px 16px', background: '#2a1a1a', borderRadius: '8px', color: '#f87171', fontSize: '13px', marginBottom: '16px', border: '1px solid #5a2d2d' }}>
                {recError}
              </div>
            )}
            {pendingOpportunities.length === 0 && !recError && (
              <div style={{ padding: '20px', background: '#2a2a2a', borderRadius: '8px', color: '#888', fontSize: '14px', textAlign: 'center', marginBottom: '16px' }}>
                Generate with AI or add your own recommendations below.
              </div>
            )}
            {pendingOpportunities.length > 0 && (
              pendingOpportunities.map((opp, idx) => (
                <div key={idx} style={{ background: opp.included ? '#1a2e1a' : '#2a2a2a', border: `1px solid ${opp.included ? '#2d5a2d' : '#444'}`, borderRadius: '10px', padding: '20px 24px', marginBottom: '16px', transition: 'all 0.2s', opacity: opp.included ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                    <button
                      onClick={() => updateOpportunity(idx, 'included', !opp.included)}
                      style={{ width: '30px', height: '30px', borderRadius: '6px', border: `2px solid ${opp.included ? '#10b981' : '#555'}`, background: opp.included ? '#10b981' : 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}
                    >
                      {opp.included && <Check size={16} />}
                    </button>
                    <input
                      type="text"
                      value={opp.title}
                      onChange={e => updateOpportunity(idx, 'title', e.target.value)}
                      disabled={!opp.included}
                      placeholder="Recommendation title..."
                      style={{ flex: 1, background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', padding: '10px 14px', color: '#fff', fontSize: '16px', fontWeight: '600', outline: 'none' }}
                    />
                    <button
                      onClick={() => removeRecommendation(idx)}
                      style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '6px', flexShrink: 0, transition: 'color 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                      onMouseLeave={e => e.currentTarget.style.color = '#666'}
                      title="Delete recommendation"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {(opp.title || opp.insight || opp.opportunity || (opp.steps && opp.steps.some(s => s))) ? (<>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#10b981', letterSpacing: '0.3px', marginBottom: '6px' }}>INSIGHT</div>
                    <textarea
                      value={opp.insight || ''}
                      onChange={e => updateOpportunity(idx, 'insight', e.target.value)}
                      disabled={!opp.included}
                      rows={3}
                      style={{ width: '100%', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', padding: '12px 14px', color: '#ccc', fontSize: '14px', lineHeight: '1.6', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#f59e0b', letterSpacing: '0.3px', marginBottom: '6px' }}>OPPORTUNITY</div>
                    <textarea
                      value={opp.opportunity || ''}
                      onChange={e => updateOpportunity(idx, 'opportunity', e.target.value)}
                      disabled={!opp.included}
                      rows={3}
                      style={{ width: '100%', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', padding: '12px 14px', color: '#ccc', fontSize: '14px', lineHeight: '1.6', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#93c5fd', marginBottom: '8px', letterSpacing: '0.3px' }}>ACTION STEPS</div>
                    {(opp.steps || []).map((step, si) => (
                      <div key={si} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '14px', color: '#93c5fd', fontWeight: '600', minWidth: '18px', paddingTop: '9px' }}>{si + 1}.</span>
                        <textarea
                          value={step}
                          onChange={e => updateStep(idx, si, e.target.value)}
                          disabled={!opp.included}
                          placeholder="Action step..."
                          rows={4}
                          style={{ flex: 1, background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', padding: '8px 12px', color: '#ccc', fontSize: '14px', outline: 'none', resize: 'vertical', lineHeight: '1.5', fontFamily: 'inherit' }}
                        />
                        <button
                          onClick={() => removeStep(idx, si)}
                          disabled={!opp.included}
                          style={{ background: 'none', border: 'none', color: '#555', cursor: opp.included ? 'pointer' : 'default', padding: '8px 4px', flexShrink: 0 }}
                          onMouseEnter={e => { if (opp.included) e.currentTarget.style.color = '#f87171'; }}
                          onMouseLeave={e => { if (opp.included) e.currentTarget.style.color = '#555'; }}
                          title="Remove step"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {opp.included && (
                      <button
                        onClick={() => addStep(idx)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px dashed #444', borderRadius: '6px', padding: '6px 12px', color: '#93c5fd', fontSize: '13px', cursor: 'pointer', marginTop: '6px', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#93c5fd'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#444'; }}
                      >
                        <Plus size={14} /> Add Step
                      </button>
                    )}
                  </div>
                  </>) : (
                    <div style={{ fontSize: '13px', color: '#666', marginTop: '-8px' }}>Type a title to expand fields...</div>
                  )}
                </div>
              ))
            )}

            <button
              onClick={addRecommendation}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', background: 'none', border: '2px dashed #444', borderRadius: '10px', padding: '14px', color: '#93c5fd', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '16px', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = 'rgba(147, 197, 253, 0.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.background = 'none'; }}
            >
              <Plus size={18} /> Add Recommendation
            </button>

            {pendingOpportunities._closing !== undefined && (
              <div style={{ padding: '16px 20px', background: '#1a2e1a', borderRadius: '8px', marginTop: '12px', border: '1px solid #2d5a2d' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#10b981', marginBottom: '8px', letterSpacing: '0.5px' }}>CLOSING</div>
                <textarea
                  value={pendingOpportunities._closing || ''}
                  onChange={e => updateOpeningClosing('_closing', e.target.value)}
                  rows={4}
                  style={{ width: '100%', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', padding: '12px 14px', color: '#ccc', fontSize: '14px', lineHeight: '1.7', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '18px 32px', borderTop: '1px solid #333', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="text"
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              placeholder="Draft name..."
              style={{ flex: 1, background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', padding: '8px 12px', color: '#ccc', fontSize: '13px', outline: 'none', minWidth: 0 }}
            />
            <button
              onClick={() => saveDraftNow(false)}
              disabled={savingDraft}
              style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #444', background: 'transparent', color: draftSavedFlash ? '#10b981' : '#93c5fd', fontSize: '14px', fontWeight: '500', cursor: savingDraft ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'color 0.3s', whiteSpace: 'nowrap' }}
            >
              {draftSavedFlash ? <Check size={16} /> : <Save size={16} />}
              {savingDraft ? 'Saving...' : draftSavedFlash ? 'Saved' : 'Save Draft'}
            </button>
            <button onClick={handleCancelModal} style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid #444', background: 'transparent', color: '#888', fontSize: '14px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Cancel
            </button>
            <button onClick={confirmAndExport} style={{ padding: '10px 28px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
              <FileDown size={16} />
              Export PDF
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
