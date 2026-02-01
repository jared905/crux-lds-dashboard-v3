import React, { useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { Download, Loader } from "lucide-react";

/**
 * Audit PDF Export
 * Generates a multi-page PDF from a completed audit record.
 * Follows the same html2canvas + jsPDF pattern as PDFExport.jsx.
 */
export default function AuditPDFExport({ audit }) {
  const [exporting, setExporting] = useState(false);

  const snapshot = audit.channel_snapshot || {};
  const series = audit.series_summary || {};
  const benchmark = audit.benchmark_data || {};
  const opportunities = audit.opportunities || {};
  const recommendations = audit.recommendations || {};
  const summary = audit.executive_summary || "";

  const exportToPDF = async () => {
    setExporting(true);

    try {
      const pages = [];

      // ── Page 1: Cover ──
      pages.push(buildPage(`
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:600px;text-align:center;">
          <div style="font-size:14px;color:#666;letter-spacing:2px;text-transform:uppercase;margin-bottom:16px;">Channel Audit Report</div>
          <div style="font-size:36px;font-weight:800;color:#1a1a2e;margin-bottom:8px;">${esc(snapshot.name || "Channel Audit")}</div>
          <div style="font-size:16px;color:#666;margin-bottom:32px;">
            ${esc(snapshot.size_tier || "")} · ${(snapshot.subscriber_count || 0).toLocaleString()} subscribers
          </div>
          <div style="font-size:14px;color:#999;margin-bottom:8px;">
            ${esc(audit.audit_type === "prospect" ? "Prospect Analysis" : "Client Baseline Audit")}
          </div>
          <div style="font-size:13px;color:#aaa;">
            Generated ${new Date(audit.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </div>
          <div style="margin-top:60px;font-size:12px;color:#bbb;">
            Full View Analytics · Powered by CRUX
          </div>
        </div>
      `));

      // ── Page 2: Executive Summary ──
      const summaryText = typeof summary === "string" ? summary : summary?.summary || "";
      if (summaryText) {
        pages.push(buildPage(`
          <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:20px;">Executive Summary</div>
          <div style="font-size:13px;line-height:1.9;color:#333;">${formatMarkdownForPDF(summaryText)}</div>
        `));
      }

      // ── Page 3: Channel Overview ──
      pages.push(buildPage(`
        <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:20px;">Channel Overview</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
          ${metricBox("Subscribers", (snapshot.subscriber_count || 0).toLocaleString())}
          ${metricBox("Total Views", (snapshot.total_view_count || 0).toLocaleString())}
          ${metricBox("Videos Analyzed", snapshot.total_videos_analyzed || 0)}
          ${metricBox("Recent Videos (90d)", snapshot.recent_videos_90d || 0)}
          ${metricBox("Avg Views (90d)", (snapshot.avg_views_recent || 0).toLocaleString())}
          ${metricBox("Avg Engagement", ((snapshot.avg_engagement_recent || 0) * 100).toFixed(2) + "%")}
        </div>
        <div style="padding:12px 16px;background:#f0f4ff;border-radius:8px;font-size:13px;color:#444;">
          <strong>Size Tier:</strong> ${esc(snapshot.size_tier || "—")}
        </div>
      `));

      // ── Page 4: Series Analysis ──
      if ((series.series || []).length > 0) {
        const seriesRows = (series.series || []).slice(0, 10).map(s => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${esc(s.name)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${s.videoCount}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${(s.avgViews || 0).toLocaleString()}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${s.performanceTrend || "—"}</td>
          </tr>
        `).join("");

        pages.push(buildPage(`
          <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:20px;">Series Analysis</div>
          <div style="font-size:13px;color:#666;margin-bottom:12px;">${series.total_series} series detected · ${series.uncategorized_count || 0} uncategorized</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f5f5f5;">
                <th style="padding:8px 12px;text-align:left;">Series</th>
                <th style="padding:8px 12px;text-align:center;">Videos</th>
                <th style="padding:8px 12px;text-align:right;">Avg Views</th>
                <th style="padding:8px 12px;text-align:center;">Trend</th>
              </tr>
            </thead>
            <tbody>${seriesRows}</tbody>
          </table>
        `));
      }

      // ── Page 5: Benchmarks ──
      if (benchmark.hasBenchmarks && benchmark.comparison?.metrics?.length > 0) {
        const benchRows = benchmark.comparison.metrics.map(m => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${esc(m.name)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${typeof m.value === "number" ? m.value.toLocaleString() : m.value}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${typeof m.benchmark === "number" ? m.benchmark.toLocaleString() : m.benchmark}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:600;color:${m.status === "above" ? "#16a34a" : m.status === "below" ? "#dc2626" : "#d97706"}">${m.ratio}x (${m.status})</td>
          </tr>
        `).join("");

        pages.push(buildPage(`
          <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:20px;">Competitive Benchmarks</div>
          <div style="font-size:13px;color:#666;margin-bottom:12px;">Compared against ${benchmark.peer_count} peer channels</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f5f5f5;">
                <th style="padding:8px 12px;text-align:left;">Metric</th>
                <th style="padding:8px 12px;text-align:right;">Channel</th>
                <th style="padding:8px 12px;text-align:right;">Peer Median</th>
                <th style="padding:8px 12px;text-align:center;">Score</th>
              </tr>
            </thead>
            <tbody>${benchRows}</tbody>
          </table>
          ${benchmark.comparison.overallScore ? `
            <div style="margin-top:20px;padding:16px;background:#f0f4ff;border-radius:8px;text-align:center;">
              <div style="font-size:12px;color:#666;">Overall Benchmark Score</div>
              <div style="font-size:28px;font-weight:800;color:${benchmark.comparison.overallScore >= 1 ? "#16a34a" : "#dc2626"}">${benchmark.comparison.overallScore}x</div>
            </div>
          ` : ""}
        `));
      }

      // ── Page 6: Opportunities ──
      const gaps = opportunities.content_gaps || [];
      const levers = opportunities.growth_levers || [];
      if (gaps.length > 0 || levers.length > 0) {
        pages.push(buildPage(`
          <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:20px;">Opportunities</div>
          ${gaps.length > 0 ? `
            <div style="font-size:16px;font-weight:600;color:#333;margin-bottom:12px;">Content Gaps</div>
            ${gaps.map(g => `
              <div style="padding:12px;background:#fafafa;border-radius:8px;margin-bottom:8px;border-left:3px solid ${g.potential_impact === "high" ? "#16a34a" : g.potential_impact === "medium" ? "#d97706" : "#9ca3af"};">
                <div style="font-size:13px;font-weight:600;margin-bottom:4px;">${esc(g.gap)}</div>
                <div style="font-size:12px;color:#666;">${esc(g.evidence || "")}</div>
                ${g.suggested_action ? `<div style="font-size:12px;color:#2962FF;margin-top:4px;">${esc(g.suggested_action)}</div>` : ""}
              </div>
            `).join("")}
          ` : ""}
          ${levers.length > 0 ? `
            <div style="font-size:16px;font-weight:600;color:#333;margin:20px 0 12px;">Growth Levers</div>
            ${levers.map(l => `
              <div style="padding:12px;background:#fafafa;border-radius:8px;margin-bottom:8px;border-left:3px solid ${l.priority === "high" ? "#16a34a" : l.priority === "medium" ? "#d97706" : "#9ca3af"};">
                <div style="font-size:13px;font-weight:600;margin-bottom:4px;">${esc(l.lever)}</div>
                <div style="font-size:12px;color:#666;">${esc(l.current_state || "")} → ${esc(l.target_state || "")}</div>
              </div>
            `).join("")}
          ` : ""}
        `));
      }

      // ── Page 7: Recommendations ──
      const recSections = [
        { title: "Stop", color: "#dc2626", items: recommendations.stop || [] },
        { title: "Start", color: "#16a34a", items: recommendations.start || [] },
        { title: "Optimize", color: "#d97706", items: recommendations.optimize || [] },
      ].filter(s => s.items.length > 0);

      if (recSections.length > 0) {
        pages.push(buildPage(`
          <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:20px;">Recommendations</div>
          ${recSections.map(sec => `
            <div style="margin-bottom:20px;">
              <div style="font-size:16px;font-weight:700;color:${sec.color};margin-bottom:10px;">${sec.title}</div>
              ${sec.items.map(r => `
                <div style="padding:12px;background:#fafafa;border-radius:8px;margin-bottom:8px;border-left:3px solid ${sec.color};">
                  <div style="font-size:13px;font-weight:600;margin-bottom:4px;">${esc(r.action)}</div>
                  <div style="font-size:12px;color:#666;">${esc(r.rationale || "")}</div>
                </div>
              `).join("")}
            </div>
          `).join("")}
        `));
      }

      // ── Render to PDF ──
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = 210;
      const pageHeight = 297;

      for (let i = 0; i < pages.length; i++) {
        const el = pages[i];
        document.body.appendChild(el);

        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });

        document.body.removeChild(el);

        const imgData = canvas.toDataURL("image/png");
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
      }

      const channelName = (snapshot.name || "Channel").replace(/[^a-zA-Z0-9]/g, "_");
      const dateStr = new Date().toISOString().split("T")[0];
      pdf.save(`Audit_Report_${channelName}_${dateStr}.pdf`);

    } catch (err) {
      console.error("PDF export failed:", err);
      alert("Failed to export PDF: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={exportToPDF}
      disabled={exporting}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "8px 16px",
        background: "rgba(41, 98, 255, 0.15)",
        border: "1px solid #2962FF",
        borderRadius: "8px",
        color: "#60a5fa",
        cursor: "pointer",
        fontWeight: "600",
        fontSize: "13px",
        opacity: exporting ? 0.6 : 1,
      }}
    >
      {exporting ? (
        <Loader size={14} style={{ animation: "spin 1s linear infinite" }} />
      ) : (
        <Download size={14} />
      )}
      {exporting ? "Exporting..." : "Export PDF"}
    </button>
  );
}

// ── Helpers ──

function buildPage(innerHtml) {
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.left = "-9999px";
  el.style.width = "1200px";
  el.style.backgroundColor = "#ffffff";
  el.style.padding = "48px";
  el.style.fontFamily = "system-ui, -apple-system, sans-serif";
  el.style.color = "#333";
  el.innerHTML = innerHtml;
  return el;
}

function metricBox(label, value) {
  return `
    <div style="padding:16px;background:#f5f5f5;border-radius:8px;text-align:center;">
      <div style="font-size:11px;color:#888;margin-bottom:6px;">${esc(label)}</div>
      <div style="font-size:20px;font-weight:700;color:#1a1a2e;">${value}</div>
    </div>
  `;
}

function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatMarkdownForPDF(md) {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<div style="font-size:14px;font-weight:700;margin:14px 0 6px;color:#1a1a2e;">$1</div>')
    .replace(/^## (.+)$/gm, '<div style="font-size:16px;font-weight:700;margin:18px 0 8px;color:#1a1a2e;">$1</div>')
    .replace(/^# (.+)$/gm, '<div style="font-size:18px;font-weight:700;margin:20px 0 10px;color:#1a1a2e;">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, '<div style="padding-left:16px;margin:3px 0;">• $1</div>')
    .replace(/\n\n/g, '<div style="margin-top:10px;"></div>')
    .replace(/\n/g, "<br/>");
}
