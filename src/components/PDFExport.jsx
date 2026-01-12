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
      container.style.padding = '60px';
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
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #2563eb;">
            <div>
              <h1 style="margin: 0; font-size: 32px; font-weight: 700; color: #1e293b;">YouTube Performance Report</h1>
              <p style="margin: 8px 0 0 0; font-size: 16px; color: #64748b;">${dateLabel} • Generated ${dateStr}</p>
            </div>
            <div style="text-align: right; color: #94a3b8; font-size: 14px;">
              <div style="font-weight: 600; color: #2563eb; font-size: 18px;">CRUX</div>
              <div style="font-size: 12px; margin-top: 4px;">Leadership Dashboard</div>
            </div>
          </div>

          <!-- Key Metrics Grid -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 48px;">
            <div style="background: #f8fafc; padding: 24px; border-radius: 12px; border-left: 4px solid #2563eb;">
              <div style="font-size: 14px; color: #64748b; font-weight: 600; margin-bottom: 8px;">TOTAL VIEWS</div>
              <div style="font-size: 36px; font-weight: 700; color: #1e293b;">${kpis.views.toLocaleString()}</div>
              ${kpis.viewsChange !== undefined ? `<div style="font-size: 13px; color: ${kpis.viewsChange >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 8px;">${kpis.viewsChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.viewsChange).toFixed(1)}% vs previous period</div>` : ''}
            </div>

            <div style="background: #f8fafc; padding: 24px; border-radius: 12px; border-left: 4px solid #16a34a;">
              <div style="font-size: 14px; color: #64748b; font-weight: 600; margin-bottom: 8px;">WATCH HOURS</div>
              <div style="font-size: 36px; font-weight: 700; color: #1e293b;">${kpis.watchHours.toLocaleString()}</div>
              ${kpis.watchHoursChange !== undefined ? `<div style="font-size: 13px; color: ${kpis.watchHoursChange >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 8px;">${kpis.watchHoursChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.watchHoursChange).toFixed(1)}% vs previous period</div>` : ''}
            </div>

            <div style="background: #f8fafc; padding: 24px; border-radius: 12px; border-left: 4px solid #f59e0b;">
              <div style="font-size: 14px; color: #64748b; font-weight: 600; margin-bottom: 8px;">SUBSCRIBERS</div>
              <div style="font-size: 36px; font-weight: 700; color: #1e293b;">${kpis.subs >= 0 ? '+' : ''}${kpis.subs.toLocaleString()}</div>
              ${kpis.subsChange !== undefined ? `<div style="font-size: 13px; color: ${kpis.subsChange >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 8px;">${kpis.subsChange >= 0 ? '↑' : '↓'} ${Math.abs(kpis.subsChange).toFixed(1)}% vs previous period</div>` : ''}
            </div>
          </div>

          <!-- Content Performance -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 48px;">
            <div style="background: #fff7ed; padding: 24px; border-radius: 12px; border: 2px solid #f97316;">
              <div style="font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 16px;">📱 Shorts Performance</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                  <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">Videos</div>
                  <div style="font-size: 24px; font-weight: 700; color: #f97316;">${kpis.shortsMetrics.count}</div>
                </div>
                <div>
                  <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">Views</div>
                  <div style="font-size: 24px; font-weight: 700; color: #f97316;">${(kpis.shortsMetrics.views / 1000).toFixed(1)}K</div>
                </div>
                <div>
                  <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">Avg CTR</div>
                  <div style="font-size: 20px; font-weight: 600; color: #1e293b;">${(kpis.shortsMetrics.avgCtr * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">Avg Retention</div>
                  <div style="font-size: 20px; font-weight: 600; color: #1e293b;">${(kpis.shortsMetrics.avgRet * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>

            <div style="background: #eff6ff; padding: 24px; border-radius: 12px; border: 2px solid #0ea5e9;">
              <div style="font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 16px;">🎥 Long-form Performance</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                  <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">Videos</div>
                  <div style="font-size: 24px; font-weight: 700; color: #0ea5e9;">${kpis.longsMetrics.count}</div>
                </div>
                <div>
                  <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">Views</div>
                  <div style="font-size: 24px; font-weight: 700; color: #0ea5e9;">${(kpis.longsMetrics.views / 1000).toFixed(1)}K</div>
                </div>
                <div>
                  <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">Avg CTR</div>
                  <div style="font-size: 20px; font-weight: 600; color: #1e293b;">${(kpis.longsMetrics.avgCtr * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">Avg Retention</div>
                  <div style="font-size: 20px; font-weight: 600; color: #1e293b;">${(kpis.longsMetrics.avgRet * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Top Performers -->
          <div style="margin-bottom: 48px;">
            <h2 style="font-size: 24px; font-weight: 700; color: #1e293b; margin-bottom: 24px;">🏆 Top Performing Videos</h2>
            <div style="background: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background: #e2e8f0;">
                    <th style="text-align: left; padding: 12px 16px; font-size: 12px; color: #64748b; font-weight: 600;">TITLE</th>
                    <th style="text-align: center; padding: 12px 16px; font-size: 12px; color: #64748b; font-weight: 600;">TYPE</th>
                    <th style="text-align: right; padding: 12px 16px; font-size: 12px; color: #64748b; font-weight: 600;">VIEWS</th>
                    <th style="text-align: right; padding: 12px 16px; font-size: 12px; color: #64748b; font-weight: 600;">CTR</th>
                    <th style="text-align: right; padding: 12px 16px; font-size: 12px; color: #64748b; font-weight: 600;">RETENTION</th>
                  </tr>
                </thead>
                <tbody>
                  ${top.slice(0, 8).map((video, idx) => `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 14px 16px; font-size: 13px; color: #1e293b; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${video.title || 'Untitled'}</td>
                      <td style="padding: 14px 16px; text-align: center;">
                        <span style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; background: ${video.type === 'short' ? '#fff7ed' : '#eff6ff'}; color: ${video.type === 'short' ? '#f97316' : '#0ea5e9'};">
                          ${video.type === 'short' ? 'SHORT' : 'LONG'}
                        </span>
                      </td>
                      <td style="padding: 14px 16px; text-align: right; font-size: 14px; font-weight: 600; color: #1e293b;">${(video.views || 0).toLocaleString()}</td>
                      <td style="padding: 14px 16px; text-align: right; font-size: 13px; color: #64748b;">${((video.ctr || 0) * 100).toFixed(1)}%</td>
                      <td style="padding: 14px 16px; text-align: right; font-size: 13px; color: #64748b;">${((video.retention || 0) * 100).toFixed(1)}%</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Summary Stats -->
          <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 32px; border-radius: 12px; border: 2px solid #cbd5e1;">
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; text-align: center;">
              <div>
                <div style="font-size: 14px; color: #64748b; margin-bottom: 8px;">Total Videos</div>
                <div style="font-size: 32px; font-weight: 700; color: #1e293b;">${filtered.length}</div>
              </div>
              <div>
                <div style="font-size: 14px; color: #64748b; margin-bottom: 8px;">Avg Views/Video</div>
                <div style="font-size: 32px; font-weight: 700; color: #1e293b;">${filtered.length > 0 ? Math.round(kpis.views / filtered.length).toLocaleString() : '0'}</div>
              </div>
              <div>
                <div style="font-size: 14px; color: #64748b; margin-bottom: 8px;">Avg CTR</div>
                <div style="font-size: 32px; font-weight: 700; color: #1e293b;">${(kpis.avgCtr * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div style="font-size: 14px; color: #64748b; margin-bottom: 8px;">Avg Retention</div>
                <div style="font-size: 32px; font-weight: 700; color: #1e293b;">${(kpis.avgRet * 100).toFixed(1)}%</div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;">
            <div>Generated by CRUX Leadership Dashboard • ${dateStr}</div>
            <div style="margin-top: 8px; color: #cbd5e1;">This report contains confidential information</div>
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
