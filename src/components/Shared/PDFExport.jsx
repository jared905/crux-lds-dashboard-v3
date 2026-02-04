import React, { useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { FileDown } from "lucide-react";

/**
 * PDF Export Component
 * Creates a clean, presentation-ready PDF with key executive metrics
 * Can optionally include AI-generated summary and video ideas
 */
export default function PDFExport({ kpis, top, filtered, dateRange, clientName, selectedChannel }) {
  const [exporting, setExporting] = useState(false);

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
      default: return 'Last 28 Days';
    }
  };

  const exportToPDF = async () => {
    setExporting(true);

    try {
      // Create a temporary container for the PDF content
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.width = '1200px';
      container.style.backgroundColor = '#ffffff';
      container.style.padding = '40px';
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

      // Fetch top comments from top 3 videos via server proxy (sorted by likes)
      let topComments = [];
      try {
        const videosWithIds = top.filter(v => v.youtubeVideoId).slice(0, 3);
        const titleMap = {};
        videosWithIds.forEach(v => { titleMap[v.youtubeVideoId] = v.title || 'Untitled'; });

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
              .slice(0, 5)
              .map(c => ({
                text: c.text,
                author: c.author,
                likes: c.likeCount || 0,
                videoTitle: titleMap[c.videoId] || 'Unknown Video'
              }));
          }
        }
      } catch (err) {
        console.warn('Could not fetch comments for PDF:', err);
      }

      // Determine channel display name
      const uniqueChannels = [...new Set(filtered.map(r => r.channel).filter(Boolean))];
      const displayName = selectedChannel && selectedChannel !== 'all'
        ? selectedChannel
        : clientName || uniqueChannels[0] || '';

      // Build the PDF content
      container.innerHTML = `
        <div style="max-width: 1080px; margin: 0 auto;">
          <!-- Header -->
          <div data-pdf-section style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 36px; padding-bottom: 20px; border-bottom: 3px solid #2563eb;">
            <div style="display: flex; align-items: center; gap: 20px;">
              <div style="background: #1a1a1a; padding: 16px 20px; border-radius: 10px;">
                <img src="/Full_View_Logo.png" alt="Full View Analytics" style="height: 85px; object-fit: contain; display: block;" />
              </div>
              <div style="border-left: 2px solid #cbd5e1; padding-left: 20px;">
                ${displayName ? `<div style="font-size: 22px; font-weight: 700; color: #2563eb; margin-bottom: 4px;">${displayName}</div>` : ''}
                <h1 style="margin: 0; font-size: 38px; font-weight: 700; color: #1e293b; line-height: 1.2;">Strategic YouTube Insights</h1>
                <p style="margin: 8px 0 0 0; font-size: 18px; color: #64748b; font-weight: 500;">${dateLabel} • ${dateStr}</p>
              </div>
            </div>
          </div>

          <!-- Key Metrics Grid -->
          <div data-pdf-section style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 40px;">
            <div style="background: #f8fafc; padding: 28px; border-radius: 14px; border-left: 5px solid #2563eb;">
              <div style="font-size: 16px; color: #64748b; font-weight: 600; margin-bottom: 10px; letter-spacing: 0.5px;">TOTAL VIEWS</div>
              <div style="font-size: 42px; font-weight: 700; color: #1e293b; line-height: 1;">${kpis.views.toLocaleString()}</div>
              ${kpis.viewsChange !== undefined ? `<div style="font-size: 15px; color: ${kpis.viewsChange >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 10px; font-weight: 600;">${kpis.viewsChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.viewsChange).toFixed(1)}% vs previous period</div>` : ''}
            </div>

            <div style="background: #f8fafc; padding: 28px; border-radius: 14px; border-left: 5px solid #16a34a;">
              <div style="font-size: 16px; color: #64748b; font-weight: 600; margin-bottom: 10px; letter-spacing: 0.5px;">WATCH HOURS</div>
              <div style="font-size: 42px; font-weight: 700; color: #1e293b; line-height: 1;">${kpis.watchHours.toLocaleString()}</div>
              ${kpis.watchHoursChange !== undefined ? `<div style="font-size: 15px; color: ${kpis.watchHoursChange >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 10px; font-weight: 600;">${kpis.watchHoursChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.watchHoursChange).toFixed(1)}% vs previous period</div>` : ''}
            </div>

            <div style="background: #f8fafc; padding: 28px; border-radius: 14px; border-left: 5px solid #f59e0b;">
              <div style="font-size: 16px; color: #64748b; font-weight: 600; margin-bottom: 10px; letter-spacing: 0.5px;">SUBSCRIBERS</div>
              <div style="font-size: 42px; font-weight: 700; color: #1e293b; line-height: 1;">${kpis.subs >= 0 ? '+' : ''}${kpis.subs.toLocaleString()}</div>
              ${kpis.subsChange !== undefined ? `<div style="font-size: 15px; color: ${kpis.subsChange >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 10px; font-weight: 600;">${kpis.subsChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.subsChange).toFixed(1)}% vs previous period</div>` : ''}
            </div>
          </div>

          <!-- Content Performance -->
          <div data-pdf-section style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px;">
            <div style="background: #fff7ed; padding: 24px; border-radius: 14px; border: 3px solid #f97316;">
              <div style="font-size: 24px; font-weight: 700; color: #1e293b; margin-bottom: 16px;">📱 Shorts Performance</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;">
                <div>
                  <div style="font-size: 15px; color: #64748b; margin-bottom: 8px; font-weight: 600;">Videos</div>
                  <div style="font-size: 32px; font-weight: 700; color: #f97316;">${kpis.shortsMetrics.count}</div>
                </div>
                <div>
                  <div style="font-size: 15px; color: #64748b; margin-bottom: 8px; font-weight: 600;">Views</div>
                  <div style="font-size: 32px; font-weight: 700; color: #f97316;">${(kpis.shortsMetrics.views / 1000).toFixed(1)}K</div>
                </div>
                <div>
                  <div style="font-size: 15px; color: #64748b; margin-bottom: 8px; font-weight: 600;">Avg CTR</div>
                  <div style="font-size: 28px; font-weight: 600; color: #1e293b;">${(kpis.shortsMetrics.avgCtr * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div style="font-size: 15px; color: #64748b; margin-bottom: 8px; font-weight: 600;">Avg Retention</div>
                  <div style="font-size: 28px; font-weight: 600; color: #1e293b;">${(kpis.shortsMetrics.avgRet * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>

            <div style="background: #eff6ff; padding: 24px; border-radius: 14px; border: 3px solid #0ea5e9;">
              <div style="font-size: 24px; font-weight: 700; color: #1e293b; margin-bottom: 16px;">🎥 Long-form Performance</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;">
                <div>
                  <div style="font-size: 15px; color: #64748b; margin-bottom: 8px; font-weight: 600;">Videos</div>
                  <div style="font-size: 32px; font-weight: 700; color: #0ea5e9;">${kpis.longsMetrics.count}</div>
                </div>
                <div>
                  <div style="font-size: 15px; color: #64748b; margin-bottom: 8px; font-weight: 600;">Views</div>
                  <div style="font-size: 32px; font-weight: 700; color: #0ea5e9;">${(kpis.longsMetrics.views / 1000).toFixed(1)}K</div>
                </div>
                <div>
                  <div style="font-size: 15px; color: #64748b; margin-bottom: 8px; font-weight: 600;">Avg CTR</div>
                  <div style="font-size: 28px; font-weight: 600; color: #1e293b;">${(kpis.longsMetrics.avgCtr * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div style="font-size: 15px; color: #64748b; margin-bottom: 8px; font-weight: 600;">Avg Retention</div>
                  <div style="font-size: 28px; font-weight: 600; color: #1e293b;">${(kpis.longsMetrics.avgRet * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Metric Definitions -->
          <div data-pdf-section style="display: flex; gap: 24px; margin-bottom: 32px; padding: 14px 20px; background: #f1f5f9; border-radius: 10px; border-left: 4px solid #94a3b8;">
            <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;"><strong style="color: #475569;">CTR (Click-Through Rate):</strong> The percentage of people who saw your thumbnail and clicked to watch.</p>
            <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;"><strong style="color: #475569;">Retention:</strong> The average percentage of your video that viewers watched before leaving.</p>
          </div>

          <!-- Top Performers -->
          <div data-pdf-section style="margin-bottom: 32px;">
            <h2 style="font-size: 30px; font-weight: 700; color: #1e293b; margin-bottom: 20px;">🏆 Top Performing Videos</h2>
            <div style="background: #f8fafc; border-radius: 14px; overflow: hidden; border: 2px solid #e2e8f0;">
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background: #e2e8f0;">
                    <th style="text-align: left; padding: 16px 20px; font-size: 15px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">TITLE</th>
                    <th style="text-align: center; padding: 16px 20px; font-size: 15px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">TYPE</th>
                    <th style="text-align: right; padding: 16px 20px; font-size: 15px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">VIEWS</th>
                    <th style="text-align: right; padding: 16px 20px; font-size: 15px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">CTR</th>
                    <th style="text-align: right; padding: 16px 20px; font-size: 15px; color: #64748b; font-weight: 600; letter-spacing: 0.5px;">RETENTION</th>
                  </tr>
                </thead>
                <tbody>
                  ${top.slice(0, 10).map((video, idx) => `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 18px 20px; font-size: 16px; color: #1e293b; max-width: 400px; font-weight: 500;">
                        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 5px;">${video.title || 'Untitled'}</div>
                        ${video.channel ? `<div style="font-size: 13px; color: #94a3b8; font-weight: 400;">${video.channel}</div>` : ''}
                      </td>
                      <td style="padding: 18px 20px; text-align: center;">
                        <span style="display: inline-block; padding: 6px 14px; border-radius: 7px; font-size: 13px; font-weight: 700; background: ${video.type === 'short' ? '#fff7ed' : '#eff6ff'}; color: ${video.type === 'short' ? '#f97316' : '#0ea5e9'};">
                          ${video.type === 'short' ? 'SHORT' : 'LONG'}
                        </span>
                      </td>
                      <td style="padding: 18px 20px; text-align: right; font-size: 17px; font-weight: 600; color: #1e293b;">${(video.views || 0).toLocaleString()}</td>
                      <td style="padding: 18px 20px; text-align: right; font-size: 16px; color: #64748b; font-weight: 500;">${((video.ctr || 0) * 100).toFixed(1)}%</td>
                      <td style="padding: 18px 20px; text-align: right; font-size: 16px; color: #64748b; font-weight: 500;">${((video.retention || 0) * 100).toFixed(1)}%</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          ${topComments.length > 0 ? `
          <!-- Top Comments -->
          <div data-pdf-section style="margin-bottom: 32px;">
            <h2 style="font-size: 30px; font-weight: 700; color: #1e293b; margin-bottom: 20px;">💬 Top Audience Comments</h2>
            ${topComments.map(c => `
              <div style="background: #f8fafc; padding: 18px 22px; border-radius: 12px; margin-bottom: 12px; border-left: 4px solid #2563eb;">
                <div style="font-size: 15px; color: #1e293b; line-height: 1.6; margin-bottom: 10px;">"${c.text}"</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 13px; color: #64748b; font-weight: 500;">— ${c.author}</span>
                  <div style="display: flex; align-items: center; gap: 16px;">
                    <span style="font-size: 12px; color: #94a3b8; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.videoTitle}</span>
                    <span style="font-size: 13px; color: #2563eb; font-weight: 600;">👍 ${c.likes.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          ` : ''}

          <!-- Summary Stats -->
          <div data-pdf-section style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 28px; border-radius: 14px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; text-align: center;">
              <div>
                <div style="font-size: 16px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px;">TOTAL VIDEOS</div>
                <div style="font-size: 38px; font-weight: 700; color: #ffffff;">${filtered.length}</div>
              </div>
              <div>
                <div style="font-size: 16px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px;">AVG VIEWS/VIDEO</div>
                <div style="font-size: 38px; font-weight: 700; color: #ffffff;">${filtered.length > 0 ? Math.round(kpis.views / filtered.length).toLocaleString() : '0'}</div>
              </div>
              <div>
                <div style="font-size: 16px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px;">AVG CTR</div>
                <div style="font-size: 38px; font-weight: 700; color: #ffffff;">${(kpis.avgCtr * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div style="font-size: 16px; color: #93c5fd; margin-bottom: 10px; font-weight: 600; letter-spacing: 0.5px;">AVG RETENTION</div>
                <div style="font-size: 38px; font-weight: 700; color: #ffffff;">${(kpis.avgRet * 100).toFixed(1)}%</div>
              </div>
            </div>
          </div>

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
          <div data-pdf-section style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; text-align: center;">
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
          const spacer = nextPageStart - sectionTop + 20;
          section.style.marginTop = `${spacer}px`;
        }
      });

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
      setExporting(false);
    }
  };

  return (
    <button
      onClick={exportToPDF}
      disabled={exporting}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: exporting ? '#94a3b8' : '#2563eb',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        padding: '10px 18px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: exporting ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
        boxShadow: exporting ? 'none' : '0 2px 4px rgba(37, 99, 235, 0.2)',
      }}
      onMouseEnter={(e) => {
        if (!exporting) {
          e.currentTarget.style.backgroundColor = '#1d4ed8';
          e.currentTarget.style.boxShadow = '0 4px 8px rgba(37, 99, 235, 0.3)';
        }
      }}
      onMouseLeave={(e) => {
        if (!exporting) {
          e.currentTarget.style.backgroundColor = '#2563eb';
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(37, 99, 235, 0.2)';
        }
      }}
    >
      <FileDown size={18} />
      {exporting ? 'Generating PDF...' : 'Export PDF'}
    </button>
  );
}
