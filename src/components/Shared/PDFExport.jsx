import React, { useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { FileDown, X, Check, RotateCcw } from "lucide-react";

/**
 * PDF Export Component
 * Creates a clean, presentation-ready PDF with key executive metrics
 * Can optionally include AI-generated summary and video ideas
 */
export default function PDFExport({ kpis, top, filtered, dateRange, customDateRange, clientName, selectedChannel, allTimeKpis, channelStats }) {
  const [exporting, setExporting] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [pendingOpportunities, setPendingOpportunities] = useState([]);
  const [pendingComments, setPendingComments] = useState([]);
  const [pendingPublishedHtml, setPendingPublishedHtml] = useState('');
  const [rendering, setRendering] = useState(false);

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

  // Phase 1: Collect data (comments, AI opportunities, published section) then open review modal
  const handleExportClick = async () => {
    setExporting(true);

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

      // Generate 3 Key Opportunities via Claude AI
      let opportunities = [];
      try {
        const { default: claudeAPI } = await import('../../services/claudeAPI');
        // Refresh API key from localStorage in case it was set after module init
        if (!claudeAPI.apiKey) claudeAPI.apiKey = claudeAPI.loadAPIKey();
        if (claudeAPI.apiKey) {
          const formatVid = (v) => `"${v.title}" (${(v.views||0).toLocaleString()} views, ${((v.ctr||0)*100).toFixed(1)}% CTR, ${((v.retention||0)*100).toFixed(1)}% retention)`;

          const shorts = filtered.filter(r => r.type === 'short');
          const longs = filtered.filter(r => r.type !== 'short');
          const shortsViews = shorts.reduce((s, r) => s + (r.views || 0), 0);
          const longsViews = longs.reduce((s, r) => s + (r.views || 0), 0);

          const longsByCtr = [...longs].sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
          const longsByRet = [...longs].sort((a, b) => (b.retention || 0) - (a.retention || 0));
          const shortsByCtr = [...shorts].sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
          const shortsByRet = [...shorts].sort((a, b) => (b.retention || 0) - (a.retention || 0));

          const dataPrompt = `Channel performance for ${getDateRangeLabel()}:
- Total Views: ${kpis.views.toLocaleString()}${kpis.viewsChange !== undefined ? ` (${kpis.viewsChange >= 0 ? '+' : ''}${kpis.viewsChange.toFixed(1)}% vs previous period)` : ''}
- Watch Hours: ${kpis.watchHours.toLocaleString()}${kpis.watchHoursChange !== undefined ? ` (${kpis.watchHoursChange >= 0 ? '+' : ''}${kpis.watchHoursChange.toFixed(1)}%)` : ''}
- Subscribers: ${kpis.subs >= 0 ? '+' : ''}${kpis.subs.toLocaleString()}${kpis.subsChange !== undefined ? ` (${kpis.subsChange >= 0 ? '+' : ''}${kpis.subsChange.toFixed(1)}%)` : ''}
- Avg CTR: ${(kpis.avgCtr * 100).toFixed(1)}%
- Avg Retention: ${(kpis.avgRet * 100).toFixed(1)}%
- Shorts: ${shorts.length} videos, ${shortsViews.toLocaleString()} views
- Long-form: ${longs.length} videos, ${longsViews.toLocaleString()} views

=== LONG-FORM VIDEOS ===
Top 5 Long-form by CTR:
${longsByCtr.slice(0, 5).map(formatVid).join('\n')}

Bottom 5 Long-form by CTR:
${[...longsByCtr].reverse().slice(0, 5).map(formatVid).join('\n')}

Top 5 Long-form by Retention:
${longsByRet.slice(0, 5).map(formatVid).join('\n')}

Bottom 5 Long-form by Retention:
${[...longsByRet].reverse().slice(0, 5).map(formatVid).join('\n')}

=== SHORTS ===
Top 5 Shorts by CTR:
${shortsByCtr.slice(0, 5).map(formatVid).join('\n')}

Bottom 5 Shorts by CTR:
${[...shortsByCtr].reverse().slice(0, 5).map(formatVid).join('\n')}

Top 5 Shorts by Retention:
${shortsByRet.slice(0, 5).map(formatVid).join('\n')}

Bottom 5 Shorts by Retention:
${[...shortsByRet].reverse().slice(0, 5).map(formatVid).join('\n')}

Respond with ONLY a JSON array of exactly 6 objects: [{"title": "short action title", "recommendation": "2-3 sentence actionable recommendation"}]`;

          const systemPrompt = 'You are a YouTube growth strategist. Given this period\'s performance data, provide exactly 6 concise, actionable recommendations to improve the channel. IMPORTANT: Shorts and long-form are different formats — when recommending title or thumbnail strategies, only reference long-form videos as examples (shorts do not have clickable thumbnails). Keep each format\'s insights separate. Focus on specific, data-backed actions the creator can take immediately. Return ONLY valid JSON, no markdown fences.';

          const result = await claudeAPI.call(dataPrompt, systemPrompt, 'pdf_opportunities', 2048);
          // Strip markdown fences if present (e.g. ```json ... ```)
          let jsonText = result.text.trim();
          const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) jsonText = fenceMatch[1].trim();
          const parsed = JSON.parse(jsonText);
          if (Array.isArray(parsed) && parsed.length >= 1) {
            opportunities = parsed.slice(0, 6);
          }
        }
      } catch (err) {
        console.warn('Could not generate AI opportunities for PDF:', err);
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
            + '<h2 style="font-size: 26px; font-weight: 700; color: #1e293b; margin-bottom: 20px; line-height: 1.3;">📅 Content Published This Period</h2>'
            + '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 16px;">'
            + '<div style="background: #fff7ed; padding: 18px; border-radius: 12px; border: 2px solid #fed7aa;">'
            + '<div style="font-size: 18px; font-weight: 700; color: #ea580c; margin-bottom: 10px;">📱 Shorts Published</div>'
            + '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600;">Count</div><div style="font-size: 26px; font-weight: 700; color: #f97316;">' + sm.count + '</div></div>'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600;">Total Views</div><div style="font-size: 26px; font-weight: 700; color: #f97316;">' + sm.views.toLocaleString() + '</div></div>'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600;">Avg CTR</div><div style="font-size: 20px; font-weight: 600; color: #1e293b;">' + (sm.avgCtr * 100).toFixed(1) + '%</div></div>'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600;">Avg Retention</div><div style="font-size: 20px; font-weight: 600; color: #1e293b;">' + (sm.avgRet * 100).toFixed(1) + '%</div></div>'
            + '</div></div>'
            + '<div style="background: #eff6ff; padding: 18px; border-radius: 12px; border: 2px solid #bfdbfe;">'
            + '<div style="font-size: 18px; font-weight: 700; color: #0284c7; margin-bottom: 10px;">🎥 Long-form Published</div>'
            + '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600;">Count</div><div style="font-size: 26px; font-weight: 700; color: #0ea5e9;">' + lm.count + '</div></div>'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600;">Total Views</div><div style="font-size: 26px; font-weight: 700; color: #0ea5e9;">' + lm.views.toLocaleString() + '</div></div>'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600;">Avg CTR</div><div style="font-size: 20px; font-weight: 600; color: #1e293b;">' + (lm.avgCtr * 100).toFixed(1) + '%</div></div>'
            + '<div><div style="font-size: 12px; color: #64748b; font-weight: 600;">Avg Retention</div><div style="font-size: 20px; font-weight: 600; color: #1e293b;">' + (lm.avgRet * 100).toFixed(1) + '%</div></div>'
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

      // Store collected data and open review modal
      setPendingComments(topComments);
      setPendingOpportunities(opportunities.map(o => ({ ...o, included: true })));
      setPendingPublishedHtml(publishedSectionHtml);
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
      const topComments = pendingComments;
      const publishedSectionHtml = pendingPublishedHtml;

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
                <h1 style="margin: 0; font-size: 34px; font-weight: 700; color: #1e293b; line-height: 1.3;">Strategic YouTube Insights</h1>
                <p style="margin: 10px 0 0 0; font-size: 16px; color: #64748b; font-weight: 500;">${dateLabel} • ${dateStr}</p>
              </div>
            </div>
          </div>

          <!-- Key Metrics Grid -->
          <div data-pdf-section style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px;">
            <div style="background: #f8fafc; padding: 18px; border-radius: 12px; border-left: 5px solid #2563eb;">
              <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px; letter-spacing: 0.5px;">TOTAL VIEWS</div>
              <div style="font-size: 30px; font-weight: 700; color: #1e293b; line-height: 1;">${kpis.views.toLocaleString()}</div>
              ${kpis.viewsChange !== undefined ? `<div style="font-size: 12px; color: ${kpis.viewsChange >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 6px; font-weight: 600;">${kpis.viewsChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.viewsChange).toFixed(1)}% vs previous period</div>` : ''}
              ${allTimeKpis ? `<div style="border-top: 1px solid #e2e8f0; margin-top: 10px; padding-top: 8px;">
                <div style="font-size: 11px; color: #94a3b8; font-weight: 500;">Lifetime: <span style="color: #64748b; font-weight: 600;">${allTimeKpis.views.toLocaleString()}</span></div>
              </div>` : ''}
            </div>

            <div style="background: #f8fafc; padding: 18px; border-radius: 12px; border-left: 5px solid #16a34a;">
              <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px; letter-spacing: 0.5px;">WATCH HOURS</div>
              <div style="font-size: 30px; font-weight: 700; color: #1e293b; line-height: 1;">${kpis.watchHours.toLocaleString()}</div>
              ${kpis.watchHoursChange !== undefined ? `<div style="font-size: 12px; color: ${kpis.watchHoursChange >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 6px; font-weight: 600;">${kpis.watchHoursChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.watchHoursChange).toFixed(1)}% vs previous period</div>` : ''}
              ${allTimeKpis ? `<div style="border-top: 1px solid #e2e8f0; margin-top: 10px; padding-top: 8px;">
                <div style="font-size: 11px; color: #94a3b8; font-weight: 500;">Lifetime: <span style="color: #64748b; font-weight: 600;">${allTimeKpis.watchHours.toLocaleString()}</span></div>
              </div>` : ''}
            </div>

            <div style="background: #f8fafc; padding: 18px; border-radius: 12px; border-left: 5px solid #f59e0b;">
              <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px; letter-spacing: 0.5px;">SUBSCRIBERS</div>
              <div style="font-size: 30px; font-weight: 700; color: #1e293b; line-height: 1;">${channelStats?.subscriberCount ? Number(channelStats.subscriberCount).toLocaleString() : allTimeKpis ? allTimeKpis.subs.toLocaleString() : '—'}</div>
              <div style="font-size: 13px; color: #64748b; margin-top: 6px; font-weight: 500;">Subscribers Gained: <span style="color: ${kpis.subs >= 0 ? '#16a34a' : '#dc2626'}; font-weight: 600;">${kpis.subs >= 0 ? '+' : ''}${kpis.subs.toLocaleString()}</span></div>
              ${kpis.subsChange !== undefined ? `<div style="font-size: 12px; color: ${kpis.subsChange >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 4px; font-weight: 600;">${kpis.subsChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.subsChange).toFixed(1)}% vs previous period</div>` : ''}
            </div>

            <div style="background: #f8fafc; padding: 18px; border-radius: 12px; border-left: 5px solid #8b5cf6;">
              <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px; letter-spacing: 0.5px;">IMPRESSIONS</div>
              <div style="font-size: 30px; font-weight: 700; color: #1e293b; line-height: 1;">${filtered.reduce((s, r) => s + (r.impressions || 0), 0).toLocaleString()}</div>
              <div style="border-top: 1px solid #e2e8f0; margin-top: 10px; padding-top: 8px;">
                <div style="font-size: 11px; color: #94a3b8; font-weight: 500;">Avg CTR: <span style="color: #64748b; font-weight: 600;">${(kpis.avgCtr * 100).toFixed(1)}%</span></div>
              </div>
            </div>
          </div>

          <!-- Summary Stats -->
          <div data-pdf-section style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 22px 24px; border-radius: 12px; margin-bottom: 28px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; text-align: center;">
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 8px; font-weight: 600; letter-spacing: 0.5px;">TOTAL VIDEOS</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff;">${filtered.length}</div>
                ${kpis.countChange !== undefined ? `<div style="font-size: 12px; color: ${kpis.countChange >= 0 ? '#86efac' : '#fca5a5'}; margin-top: 4px; font-weight: 600;">${kpis.countChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.countChange).toFixed(1)}%</div>` : ''}
              </div>
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 8px; font-weight: 600; letter-spacing: 0.5px;">AVG VIEWS/VIDEO</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff;">${filtered.length > 0 ? Math.round(kpis.views / filtered.length).toLocaleString() : '0'}</div>
                ${kpis.avgViewsPerVideoChange !== undefined ? `<div style="font-size: 12px; color: ${kpis.avgViewsPerVideoChange >= 0 ? '#86efac' : '#fca5a5'}; margin-top: 4px; font-weight: 600;">${kpis.avgViewsPerVideoChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.avgViewsPerVideoChange).toFixed(1)}%</div>` : ''}
              </div>
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 8px; font-weight: 600; letter-spacing: 0.5px;">AVG CTR</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff;">${(kpis.avgCtr * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div style="font-size: 14px; color: #93c5fd; margin-bottom: 8px; font-weight: 600; letter-spacing: 0.5px;">AVG RETENTION</div>
                <div style="font-size: 32px; font-weight: 700; color: #ffffff;">${(kpis.avgRet * 100).toFixed(1)}%</div>
              </div>
            </div>
          </div>

          <!-- Content Performance -->
          <div data-pdf-section style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px;">
            <div style="background: #fff7ed; padding: 20px; border-radius: 12px; border: 3px solid #f97316;">
              <div style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 12px;">📱 Shorts Performance</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 6px; font-weight: 600;">Videos</div>
                  <div style="font-size: 28px; font-weight: 700; color: #f97316;">${kpis.shortsMetrics.count}</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 6px; font-weight: 600;">Views</div>
                  <div style="font-size: 28px; font-weight: 700; color: #f97316;">${(kpis.shortsMetrics.views / 1000).toFixed(1)}K</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 6px; font-weight: 600;">Avg CTR</div>
                  <div style="font-size: 24px; font-weight: 600; color: #1e293b;">${(kpis.shortsMetrics.avgCtr * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 6px; font-weight: 600;">Avg Retention</div>
                  <div style="font-size: 24px; font-weight: 600; color: #1e293b;">${(kpis.shortsMetrics.avgRet * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>

            <div style="background: #eff6ff; padding: 20px; border-radius: 12px; border: 3px solid #0ea5e9;">
              <div style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 12px;">🎥 Long-form Performance</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 6px; font-weight: 600;">Videos</div>
                  <div style="font-size: 28px; font-weight: 700; color: #0ea5e9;">${kpis.longsMetrics.count}</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 6px; font-weight: 600;">Views</div>
                  <div style="font-size: 28px; font-weight: 700; color: #0ea5e9;">${(kpis.longsMetrics.views / 1000).toFixed(1)}K</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 6px; font-weight: 600;">Avg CTR</div>
                  <div style="font-size: 24px; font-weight: 600; color: #1e293b;">${(kpis.longsMetrics.avgCtr * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div style="font-size: 13px; color: #64748b; margin-bottom: 6px; font-weight: 600;">Avg Retention</div>
                  <div style="font-size: 24px; font-weight: 600; color: #1e293b;">${(kpis.longsMetrics.avgRet * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Metric Definitions -->
          <div data-pdf-section style="display: flex; gap: 22px; margin-bottom: 28px; padding: 14px 18px; background: #f1f5f9; border-radius: 10px; border-left: 4px solid #94a3b8;">
            <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5;"><strong style="color: #475569;">CTR (Click-Through Rate):</strong> The percentage of people who saw your thumbnail and clicked to watch.</p>
            <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5;"><strong style="color: #475569;">AVD (Avg View Duration):</strong> The average percentage of your video that viewers watched before leaving.</p>
          </div>

          <!-- Top Performers -->
          <div data-pdf-section style="margin-bottom: 32px;">
            <h2 style="font-size: 26px; font-weight: 700; color: #1e293b; margin-bottom: 20px; line-height: 1.3;">🏆 Top Performing Videos</h2>
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
                            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${video.title || 'Untitled'}</div>
                            ${video.channel ? `<div style="font-size: 12px; color: #94a3b8; font-weight: 400; margin-top: 2px;">${video.channel}</div>` : ''}
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

          <!-- Content Published This Period -->
          ${publishedSectionHtml}

          ${topComments.length > 0 ? `
          <!-- Top Comments -->
          <div data-pdf-section style="margin-bottom: 32px;">
            <h2 style="font-size: 26px; font-weight: 700; color: #1e293b; margin-bottom: 22px; line-height: 1.3;">💬 Top Audience Comments</h2>
            ${topComments.map(c => `
              <div style="background: #f8fafc; padding: 18px 22px; border-radius: 12px; margin-bottom: 12px; border-left: 4px solid #2563eb;">
                <div style="font-size: 15px; color: #1e293b; line-height: 1.6; margin-bottom: 10px;">"${c.text}"</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 13px; color: #64748b; font-weight: 500;">— ${c.author}</span>
                  <div style="display: flex; align-items: center; gap: 16px;">
                    <span style="font-size: 12px; color: #94a3b8; max-width: 350px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.channel ? c.channel + ' · ' : ''}${c.videoTitle}</span>
                    <span style="font-size: 13px; color: #2563eb; font-weight: 600;">👍 ${c.likes.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          ` : ''}

          ${opportunities.length > 0 ? `
          <!-- 3 Key Opportunities -->
          <div data-pdf-section style="margin-bottom: 32px;">
            <h2 style="font-size: 26px; font-weight: 700; color: #1e293b; margin-bottom: 22px; padding-bottom: 10px; border-bottom: 3px solid #10b981; line-height: 1.3;">🎯 Key Opportunities</h2>
            ${opportunities.map((opp, idx) => `
              <div style="display: flex; gap: 16px; margin-bottom: 16px; background: linear-gradient(135deg, #f0fdf4, #dcfce7); padding: 22px; border-radius: 14px; border: 2px solid #86efac;">
                <div style="width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #10b981, #059669); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; color: white; flex-shrink: 0; box-shadow: 0 4px 8px rgba(16, 185, 129, 0.3);">
                  ${idx + 1}
                </div>
                <div style="flex: 1;">
                  <div style="font-size: 18px; font-weight: 700; color: #065f46; margin-bottom: 8px;">${opp.title}</div>
                  <div style="font-size: 15px; color: #374151; line-height: 1.7;">${opp.recommendation}</div>
                </div>
              </div>
            `).join('')}
          </div>
          ` : ''}

          ${aiContent.summary ? `
          <!-- AI Executive Summary -->
          <div data-pdf-section style="margin-top: 36px;">
            <h2 style="font-size: 32px; font-weight: 700; color: #1e293b; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 3px solid #2563eb; background: linear-gradient(90deg, #2563eb, #7c3aed); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
              🤖 AI Executive Summary
            </h2>
            <div style="background: linear-gradient(135deg, #f8fafc, #e0e7ff); padding: 28px; border-radius: 14px; border: 2px solid #818cf8;">
              ${aiContent.summary.split('\n').map(line => {
                if (line.startsWith('# ')) {
                  return `<h3 style="font-size: 26px; font-weight: 700; color: #1e3a8a; margin: 20px 0 12px 0;">${line.substring(2)}</h3>`;
                }
                if (line.startsWith('## ')) {
                  return `<h4 style="font-size: 22px; font-weight: 600; color: #312e81; margin: 18px 0 10px 0; padding-left: 12px; border-left: 4px solid #6366f1;">${line.substring(3)}</h4>`;
                }
                if (line.startsWith('### ')) {
                  return `<h5 style="font-size: 18px; font-weight: 600; color: #4338ca; margin: 14px 0 8px 0;">${line.substring(4)}</h5>`;
                }
                if (line.startsWith('- ') || line.startsWith('• ')) {
                  return `<li style="margin-left: 24px; margin-bottom: 8px; color: #374151; font-size: 15px; line-height: 1.6;">${line.substring(2)}</li>`;
                }
                if (line.trim() === '') {
                  return '<div style="height: 12px;"></div>';
                }
                const boldText = line.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #1d4ed8; font-weight: 600;">$1</strong>');
                return `<p style="color: #374151; font-size: 15px; line-height: 1.7; margin-bottom: 12px;">${boldText}</p>`;
              }).join('')}
            </div>
          </div>
          ` : ''}

          ${aiContent.ideas && aiContent.ideas.length > 0 ? `
          <!-- AI Video Ideas -->
          <div data-pdf-section style="margin-top: 36px;">
            <h2 style="font-size: 32px; font-weight: 700; color: #1e293b; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 3px solid #7c3aed; background: linear-gradient(90deg, #7c3aed, #2563eb); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
              💡 AI-Generated Video Ideas
            </h2>
            ${aiContent.ideas.map((idea, idx) => `
              <div style="background: linear-gradient(135deg, #faf5ff, #ede9fe); padding: 24px; border-radius: 14px; margin-bottom: 20px; border: 2px solid #a78bfa;">
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                  <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #7c3aed, #2563eb); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; color: white; box-shadow: 0 4px 8px rgba(124, 58, 237, 0.3);">
                    ${idx + 1}
                  </div>
                  <div>
                    <div style="display: inline-block; padding: 6px 14px; border-radius: 8px; background: #e0e7ff; color: #4338ca; font-size: 13px; font-weight: 600; margin-right: 8px;">
                      ${idea.topic}
                    </div>
                    <div style="display: inline-block; padding: 6px 14px; border-radius: 8px; border: 2px solid #10b981; background: #d1fae5; color: #065f46; font-size: 13px; font-weight: 600;">
                      ${idea.confidence} confidence
                    </div>
                  </div>
                </div>
                <h3 style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 16px; line-height: 1.3;">
                  ${idea.title}
                </h3>
                <div style="background: linear-gradient(135deg, #dbeafe, #bfdbfe); padding: 16px; border-radius: 10px; margin-bottom: 12px; border-left: 4px solid #2563eb;">
                  <div style="font-size: 12px; font-weight: 700; color: #1e3a8a; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">Opening Hook</div>
                  <div style="font-size: 14px; color: #1e40af; line-height: 1.6;">${idea.hook}</div>
                </div>
                <div style="background: linear-gradient(135deg, #f3e8ff, #e9d5ff); padding: 16px; border-radius: 10px; margin-bottom: 12px; border-left: 4px solid #7c3aed;">
                  <div style="font-size: 12px; font-weight: 700; color: #5b21b6; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">Thumbnail Concept</div>
                  <div style="font-size: 14px; color: #6b21a8; line-height: 1.6;">${idea.thumbnailConcept}</div>
                </div>
                <div style="background: linear-gradient(135deg, #d1fae5, #a7f3d0); padding: 16px; border-radius: 10px; border-left: 4px solid #10b981;">
                  <div style="font-size: 12px; font-weight: 700; color: #065f46; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">Why This Works</div>
                  <div style="font-size: 14px; color: #047857; line-height: 1.6;">${idea.whyItWorks}</div>
                </div>
              </div>
            `).join('')}
          </div>
          ` : ''}

          <!-- Footer -->
          <div data-pdf-footer style="padding-top: 18px; border-top: 1px solid #e2e8f0; text-align: center;">
            <div style="display: flex; justify-content: center; align-items: center; gap: 12px; margin-bottom: 8px;">
              <span style="color: #64748b; font-size: 14px; font-weight: 500;">Generated by Full View Analytics</span>
              <span style="color: #cbd5e1; font-size: 14px;">•</span>
              <span style="color: #94a3b8; font-size: 14px; font-weight: 500;">Powered by</span>
              <img src="/crux-logo.png" alt="CRUX" style="height: 32px; object-fit: contain; vertical-align: middle;" />
            </div>
            <div style="color: #cbd5e1; font-size: 13px;">${dateStr} • This report contains confidential information</div>
          </div>
        </div>
      `;

      // Wait for any images to load
      await new Promise(resolve => setTimeout(resolve, 500));

      // Prevent page breaks from splitting sections
      // Calculate effective page height based on container width and A4 aspect ratio
      const pageHeightPx = (297 / 210) * container.offsetWidth;
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

    } catch (error) {
      console.error('PDF export failed:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setRendering(false);
    }
  };

  const handleCancelModal = () => {
    setShowReviewModal(false);
    setPendingOpportunities([]);
    setPendingComments([]);
    setPendingPublishedHtml('');
  };

  const updateOpportunity = (idx, field, value) => {
    setPendingOpportunities(prev => prev.map((o, i) => i === idx ? { ...o, [field]: value } : o));
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

    {showReviewModal && (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={handleCancelModal}>
        <div style={{ backgroundColor: '#1E1E1E', border: '1px solid #333', borderRadius: '12px', width: '640px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>Review PDF Content</div>
              <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>Edit recommendations before exporting</div>
            </div>
            <button onClick={handleCancelModal} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}>
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#93c5fd', marginBottom: '14px', letterSpacing: '0.5px' }}>KEY OPPORTUNITIES</div>

            {pendingOpportunities.length === 0 ? (
              <div style={{ padding: '20px', background: '#2a2a2a', borderRadius: '8px', color: '#888', fontSize: '14px', textAlign: 'center' }}>
                No recommendations generated. The PDF will export without this section.
              </div>
            ) : (
              pendingOpportunities.map((opp, idx) => (
                <div key={idx} style={{ background: opp.included ? '#1a2e1a' : '#2a2a2a', border: `1px solid ${opp.included ? '#2d5a2d' : '#444'}`, borderRadius: '10px', padding: '16px', marginBottom: '12px', transition: 'all 0.2s', opacity: opp.included ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <button
                      onClick={() => updateOpportunity(idx, 'included', !opp.included)}
                      style={{ width: '28px', height: '28px', borderRadius: '6px', border: `2px solid ${opp.included ? '#10b981' : '#555'}`, background: opp.included ? '#10b981' : 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}
                    >
                      {opp.included && <Check size={16} />}
                    </button>
                    <input
                      type="text"
                      value={opp.title}
                      onChange={e => updateOpportunity(idx, 'title', e.target.value)}
                      disabled={!opp.included}
                      style={{ flex: 1, background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', padding: '8px 12px', color: '#fff', fontSize: '15px', fontWeight: '600', outline: 'none' }}
                    />
                  </div>
                  <textarea
                    value={opp.recommendation}
                    onChange={e => updateOpportunity(idx, 'recommendation', e.target.value)}
                    disabled={!opp.included}
                    rows={3}
                    style={{ width: '100%', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', padding: '10px 12px', color: '#ccc', fontSize: '14px', lineHeight: '1.6', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid #333', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button onClick={handleCancelModal} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #444', background: 'transparent', color: '#888', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={confirmAndExport} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileDown size={16} />
              Export PDF
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
