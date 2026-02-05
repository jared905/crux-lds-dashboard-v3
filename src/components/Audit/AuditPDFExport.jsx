import { useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { Download, Loader } from "lucide-react";

/**
 * Audit PDF Export
 * Generates a multi-page PDF from a completed audit record.
 * Includes new Video Insights section with categorization data.
 */
export default function AuditPDFExport({ audit, videoAnalysis }) {
  const [exporting, setExporting] = useState(false);

  const snapshot = audit.channel_snapshot || {};
  const series = audit.series_summary || {};
  const benchmark = audit.benchmark_data || {};
  const opportunities = audit.opportunities || {};
  const recommendations = audit.recommendations || {};
  const summary = audit.executive_summary || "";
  const videos = audit.videos || [];

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
      const shortsCount = videos.filter(v => v.is_short || (v.duration && v.duration < 62)).length;
      const longFormCount = videos.length - shortsCount;
      const shortsPct = videos.length > 0 ? Math.round((shortsCount / videos.length) * 100) : 0;
      const longFormPct = 100 - shortsPct;

      pages.push(buildPage(`
        <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:20px;">Channel Overview</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
          ${metricBox("Subscribers", (snapshot.subscriber_count || 0).toLocaleString(), "#3b82f6")}
          ${metricBox("Total Views", (snapshot.total_view_count || 0).toLocaleString(), "#8b5cf6")}
          ${metricBox("Videos Analyzed", snapshot.total_videos_analyzed || 0, "#ec4899")}
          ${metricBox("Recent Videos (90d)", snapshot.recent_videos_90d || 0, "#3b82f6")}
          ${metricBox("Avg Views (90d)", (snapshot.avg_views_recent || 0).toLocaleString(), "#22c55e")}
          ${metricBox("Avg Engagement", ((snapshot.avg_engagement_recent || 0) * 100).toFixed(2) + "%", "#f59e0b")}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div style="padding:16px;background:#f5f5f5;border-radius:8px;">
            <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:12px;">Content Mix</div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
              <div style="width:12px;height:12px;border-radius:3px;background:#ec4899;"></div>
              <div style="flex:1;font-size:13px;">Shorts</div>
              <div style="font-size:16px;font-weight:700;">${shortsCount}</div>
              <div style="font-size:12px;color:#666;">(${shortsPct}%)</div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:12px;height:12px;border-radius:3px;background:#3b82f6;"></div>
              <div style="flex:1;font-size:13px;">Long-form</div>
              <div style="font-size:16px;font-weight:700;">${longFormCount}</div>
              <div style="font-size:12px;color:#666;">(${longFormPct}%)</div>
            </div>
          </div>
          <div style="padding:16px;background:#f0f4ff;border-radius:8px;">
            <div style="font-size:11px;color:#666;margin-bottom:4px;">Size Tier</div>
            <div style="font-size:20px;font-weight:700;color:#1a1a2e;text-transform:capitalize;">${esc(snapshot.size_tier || "—")}</div>
            <div style="font-size:11px;color:#888;margin-top:4px;">${getTierRange(snapshot.size_tier)}</div>
          </div>
        </div>
      `));

      // ── Page 4: Video Insights (NEW) ──
      if (videoAnalysis && videoAnalysis.summary.totalVideos > 0) {
        const { baselines, summary: vSummary, investigateVideos, highReachVideos } = videoAnalysis;
        const breakoutPerformers = highReachVideos.filter(v => !v.is_low_engagement).slice(0, 5);

        pages.push(buildPage(`
          <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:20px;">Video Insights</div>

          <!-- Baselines -->
          <div style="padding:16px;background:#f5f5f5;border-radius:8px;margin-bottom:16px;">
            <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:12px;">Channel Baselines</div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
              ${metricBoxSmall("Median Views", baselines.medianViews.toLocaleString())}
              ${metricBoxSmall("Median Engagement", (baselines.medianEngagement * 100).toFixed(2) + "%")}
              ${metricBoxSmall("High Reach Threshold", ">" + Math.round(baselines.highReachThreshold).toLocaleString(), "#22c55e")}
              ${metricBoxSmall("Low Engagement Threshold", "<" + (baselines.lowEngagementThreshold * 100).toFixed(2) + "%", "#ef4444")}
            </div>
          </div>

          <!-- Quadrant Summary -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
            ${quadrantBox("Breakout Hits", "High reach + high engagement", vSummary.highReachCount - investigateVideos.length, "#22c55e")}
            ${quadrantBox("Hidden Gems", "Normal reach + high engagement", vSummary.totalVideos - vSummary.highReachCount - vSummary.lowEngagementCount + investigateVideos.length, "#3b82f6")}
            ${quadrantBox("Investigate", "High reach + low engagement", investigateVideos.length, "#f59e0b")}
            ${quadrantBox("Underperformers", "Normal reach + low engagement", vSummary.lowEngagementCount - investigateVideos.length, "#ef4444")}
          </div>

          ${investigateVideos.length > 0 ? `
            <!-- Videos to Investigate -->
            <div style="margin-bottom:20px;">
              <div style="font-size:14px;font-weight:700;color:#f59e0b;margin-bottom:12px;">Videos to Investigate (${investigateVideos.length})</div>
              <div style="font-size:11px;color:#666;margin-bottom:12px;">High reach but low engagement — ask about distribution strategy</div>
              ${investigateVideos.slice(0, 5).map(v => `
                <div style="padding:12px;background:#fffbeb;border-radius:8px;margin-bottom:8px;border-left:3px solid #f59e0b;">
                  <div style="font-size:13px;font-weight:600;margin-bottom:4px;">${esc(v.title)}</div>
                  <div style="font-size:11px;color:#666;margin-bottom:6px;">
                    ${(v.view_count || 0).toLocaleString()} views (${v.views_ratio}x median) · ${(v.engagement_rate * 100).toFixed(2)}% engagement (${v.engagement_ratio}x median)
                  </div>
                  <div style="font-size:11px;color:#92400e;font-style:italic;">
                    "${v.conversation_prompt}"
                  </div>
                </div>
              `).join("")}
            </div>
          ` : ""}

          ${breakoutPerformers.length > 0 ? `
            <!-- Breakout Performers -->
            <div>
              <div style="font-size:14px;font-weight:700;color:#22c55e;margin-bottom:12px;">Breakout Performers (${breakoutPerformers.length})</div>
              <div style="font-size:11px;color:#666;margin-bottom:12px;">High reach with strong engagement — replicate these</div>
              ${breakoutPerformers.map((v, i) => `
                <div style="display:flex;align-items:center;gap:12px;padding:10px;background:#f0fdf4;border-radius:8px;margin-bottom:6px;">
                  <div style="width:24px;height:24px;border-radius:50%;background:#22c55e;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;">${i + 1}</div>
                  <div style="flex:1;font-size:12px;font-weight:500;">${esc(v.title)}</div>
                  <div style="font-size:12px;color:#666;">${(v.view_count || 0).toLocaleString()} views</div>
                  <div style="font-size:12px;color:#22c55e;font-weight:600;">${v.views_ratio}x</div>
                </div>
              `).join("")}
            </div>
          ` : ""}
        `));
      }

      // ── Page 5: Series Analysis ──
      if ((series.series || []).length > 0) {
        const seriesRows = (series.series || []).slice(0, 10).map(s => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${esc(s.name)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${s.videoCount}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${(s.avgViews || 0).toLocaleString()}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">
              <span style="color:${s.performanceTrend === 'growing' ? '#22c55e' : s.performanceTrend === 'declining' ? '#ef4444' : '#666'};">${s.performanceTrend || "—"}</span>
            </td>
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

      // ── Page 6: Benchmarks ──
      if (benchmark.hasBenchmarks && benchmark.comparison?.metrics?.length > 0) {
        const TIER_INFO = {
          emerging: { label: "Emerging", range: "0 – 10K subs" },
          growing: { label: "Growing", range: "10K – 100K subs" },
          established: { label: "Established", range: "100K – 500K subs" },
          major: { label: "Major", range: "500K – 1M subs" },
          elite: { label: "Elite", range: "1M+ subs" },
        };
        const tierKey = benchmark.tier || snapshot.size_tier;
        const tierInfo = TIER_INFO[tierKey] || { label: tierKey, range: "" };
        const bm = benchmark.benchmarks || {};

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
          <div style="padding:12px 16px;background:#f0f4ff;border-radius:8px;margin-bottom:16px;">
            <div style="font-size:14px;font-weight:700;color:#1a1a2e;">${esc(tierInfo.label)} Tier</div>
            <div style="font-size:12px;color:#666;margin-top:2px;">${esc(tierInfo.range)} · ${benchmark.peer_count} peer channels · ${(snapshot.subscriber_count || 0).toLocaleString()} subscribers (this channel)</div>
          </div>
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
              <div style="font-size:11px;color:#888;margin-top:4px;">${benchmark.comparison.overallScore >= 1.2 ? "Outperforming peers" : benchmark.comparison.overallScore >= 0.8 ? "On par with peers" : "Below peer average"}</div>
            </div>
          ` : ""}
          ${bm.engagementRate ? `
            <div style="margin-top:20px;">
              <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:8px;">Tier Ranges</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div style="padding:10px;background:#fafafa;border-radius:8px;">
                  <div style="font-size:11px;color:#888;">Views per Video</div>
                  <div style="font-size:12px;margin-top:4px;">p25: ${(bm.all?.p25 || 0).toLocaleString()} · Median: ${(bm.all?.median || 0).toLocaleString()} · p75: ${(bm.all?.p75 || 0).toLocaleString()}</div>
                </div>
                <div style="padding:10px;background:#fafafa;border-radius:8px;">
                  <div style="font-size:11px;color:#888;">Engagement Rate</div>
                  <div style="font-size:12px;margin-top:4px;">p25: ${((bm.engagementRate.p25 || 0) * 100).toFixed(2)}% · Median: ${((bm.engagementRate.median || 0) * 100).toFixed(2)}% · p75: ${((bm.engagementRate.p75 || 0) * 100).toFixed(2)}%</div>
                </div>
              </div>
            </div>
          ` : ""}
        `));
      }

      // ── Page 7: Opportunities ──
      const gaps = opportunities.content_gaps || [];
      const levers = opportunities.growth_levers || [];
      if (gaps.length > 0 || levers.length > 0) {
        pages.push(buildPage(`
          <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:20px;">Opportunities</div>
          ${gaps.length > 0 ? `
            <div style="font-size:16px;font-weight:600;color:#333;margin-bottom:12px;">Content Gaps</div>
            ${gaps.map(g => `
              <div style="padding:12px;background:#fafafa;border-radius:8px;margin-bottom:8px;border-left:3px solid ${g.potential_impact === "high" ? "#16a34a" : g.potential_impact === "medium" ? "#d97706" : "#9ca3af"};">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                  <div style="font-size:13px;font-weight:600;">${esc(g.gap)}</div>
                  <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:${g.potential_impact === "high" ? "#dcfce7" : g.potential_impact === "medium" ? "#fef3c7" : "#f3f4f6"};color:${g.potential_impact === "high" ? "#16a34a" : g.potential_impact === "medium" ? "#d97706" : "#6b7280"};text-transform:uppercase;">${g.potential_impact} impact</span>
                </div>
                <div style="font-size:12px;color:#666;">${esc(g.evidence || "")}</div>
                ${g.suggested_action ? `<div style="font-size:12px;color:#2962FF;margin-top:4px;">→ ${esc(g.suggested_action)}</div>` : ""}
              </div>
            `).join("")}
          ` : ""}
          ${levers.length > 0 ? `
            <div style="font-size:16px;font-weight:600;color:#333;margin:20px 0 12px;">Growth Levers</div>
            ${levers.map(l => `
              <div style="padding:12px;background:#fafafa;border-radius:8px;margin-bottom:8px;border-left:3px solid ${l.priority === "high" ? "#16a34a" : l.priority === "medium" ? "#d97706" : "#9ca3af"};">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                  <div style="font-size:13px;font-weight:600;">${esc(l.lever)}</div>
                  <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:${l.priority === "high" ? "#dcfce7" : l.priority === "medium" ? "#fef3c7" : "#f3f4f6"};color:${l.priority === "high" ? "#16a34a" : l.priority === "medium" ? "#d97706" : "#6b7280"};text-transform:uppercase;">${l.priority}</span>
                </div>
                <div style="font-size:12px;color:#666;">${esc(l.current_state || "")} → ${esc(l.target_state || "")}</div>
              </div>
            `).join("")}
          ` : ""}
        `));
      }

      // ── Page 8: Recommendations ──
      const recSections = [
        { title: "Stop", color: "#dc2626", bgColor: "#fef2f2", items: recommendations.stop || [] },
        { title: "Start", color: "#16a34a", bgColor: "#f0fdf4", items: recommendations.start || [] },
        { title: "Optimize", color: "#d97706", bgColor: "#fffbeb", items: recommendations.optimize || [] },
      ].filter(s => s.items.length > 0);

      if (recSections.length > 0) {
        pages.push(buildPage(`
          <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:20px;">Recommendations</div>

          <!-- Summary bar -->
          <div style="display:flex;gap:12px;margin-bottom:20px;">
            <div style="flex:1;padding:12px;background:#fef2f2;border-radius:8px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#dc2626;">${(recommendations.stop || []).length}</div>
              <div style="font-size:11px;color:#666;">Stop</div>
            </div>
            <div style="flex:1;padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#16a34a;">${(recommendations.start || []).length}</div>
              <div style="font-size:11px;color:#666;">Start</div>
            </div>
            <div style="flex:1;padding:12px;background:#fffbeb;border-radius:8px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#d97706;">${(recommendations.optimize || []).length}</div>
              <div style="font-size:11px;color:#666;">Optimize</div>
            </div>
          </div>

          ${recSections.map(sec => `
            <div style="margin-bottom:20px;">
              <div style="font-size:16px;font-weight:700;color:${sec.color};margin-bottom:10px;">${sec.title}</div>
              ${sec.items.map(r => `
                <div style="padding:12px;background:${sec.bgColor};border-radius:8px;margin-bottom:8px;border-left:3px solid ${sec.color};">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                    <div style="font-size:13px;font-weight:600;">${esc(r.action)}</div>
                    ${r.impact ? `<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:#fff;color:${r.impact === "high" ? "#16a34a" : r.impact === "medium" ? "#d97706" : "#6b7280"};text-transform:uppercase;">${r.impact}</span>` : ""}
                  </div>
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

function metricBox(label, value, color = "#1a1a2e") {
  return `
    <div style="padding:16px;background:#f5f5f5;border-radius:8px;text-align:center;">
      <div style="font-size:11px;color:#888;margin-bottom:6px;">${esc(label)}</div>
      <div style="font-size:20px;font-weight:700;color:${color};">${value}</div>
    </div>
  `;
}

function metricBoxSmall(label, value, color = "#1a1a2e") {
  return `
    <div style="padding:10px;background:#fff;border-radius:6px;text-align:center;">
      <div style="font-size:10px;color:#888;margin-bottom:4px;">${esc(label)}</div>
      <div style="font-size:14px;font-weight:700;color:${color};">${value}</div>
    </div>
  `;
}

function quadrantBox(label, description, count, color) {
  return `
    <div style="padding:12px;background:#fafafa;border-radius:8px;border-left:3px solid ${color};">
      <div style="font-size:10px;color:#888;margin-bottom:2px;">${description}</div>
      <div style="font-size:24px;font-weight:700;color:${color};">${count}</div>
      <div style="font-size:12px;font-weight:600;margin-top:2px;">${label}</div>
    </div>
  `;
}

function getTierRange(tier) {
  const ranges = {
    emerging: "0 – 10K subscribers",
    growing: "10K – 100K subscribers",
    established: "100K – 500K subscribers",
    major: "500K – 1M subscribers",
    elite: "1M+ subscribers",
  };
  return ranges[tier] || "";
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
