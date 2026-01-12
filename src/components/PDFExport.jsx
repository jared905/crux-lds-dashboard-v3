import React, { useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { FileDown } from "lucide-react";

/**
 * PDF Export Component
 * Creates a clean, presentation-ready PDF with key executive metrics
 */
export default function PDFExport({ kpis, top, filtered, dateRange }) {
  const [exporting, setExporting] = useState(false);

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

      // Build the PDF content
      container.innerHTML = `
        <div style="max-width: 1080px; margin: 0 auto;">
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 36px; padding-bottom: 20px; border-bottom: 3px solid #2563eb;">
            <div style="display: flex; align-items: center; gap: 20px;">
              <div style="background: #1a1a1a; padding: 16px 20px; border-radius: 10px;">
                <img src="/Full_View_Logo.png" alt="Full View Analytics" style="height: 85px; object-fit: contain; display: block;" />
              </div>
              <div style="border-left: 2px solid #cbd5e1; padding-left: 20px;">
                <h1 style="margin: 0; font-size: 38px; font-weight: 700; color: #1e293b; line-height: 1.2;">Strategic YouTube Insights</h1>
                <p style="margin: 8px 0 0 0; font-size: 18px; color: #64748b; font-weight: 500;">${dateLabel} • ${dateStr}</p>
              </div>
            </div>
          </div>

          <!-- Key Metrics Grid -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 40px;">
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
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px;">
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

          <!-- Top Performers -->
          <div style="margin-bottom: 32px;">
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
                  ${top.slice(0, 8).map((video, idx) => `
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

          <!-- Summary Stats -->
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 28px; border-radius: 14px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
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

          <!-- Footer -->
          <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; text-align: center;">
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

      // Capture the content as canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
      });

      // Remove temporary container
      document.body.removeChild(container);

      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

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
