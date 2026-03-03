import React, { useState, useEffect, useMemo } from "react";
import { Clock, FileText, Loader, ChevronDown } from "lucide-react";
import { getTranscripts } from "../../services/atomizerService";

function formatRelativeDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AtomizerHistory({
  clientId,
  channelFilter,
  channels = [],
  onChannelFilterChange,
  activeTranscriptId,
  onSelectTranscript,
  refreshKey = 0,
}) {
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) { setTranscripts([]); return; }
    let cancelled = false;
    setLoading(true);

    getTranscripts(clientId, { limit: 50, channelId: channelFilter || undefined })
      .then(data => { if (!cancelled) setTranscripts(data || []); })
      .catch(err => {
        console.warn("[atomizer-history] Fetch failed:", err.message);
        if (!cancelled) setTranscripts([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [clientId, channelFilter, refreshKey]);

  const items = useMemo(() =>
    transcripts.map(t => {
      const atomized = t.atomized_content || [];
      return {
        ...t,
        directionCount: atomized.length,
        briefCreatedCount: atomized.filter(a => a.status === "brief_created").length,
        channelName: t.channels?.name || null,
      };
    }),
    [transcripts]
  );

  return (
    <div style={{
      width: "320px", flexShrink: 0, background: "#161616",
      borderLeft: "1px solid #333", display: "flex", flexDirection: "column",
      height: "calc(100vh - 120px)", position: "sticky", top: "80px",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #2a2a2a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: channels.length > 0 ? "12px" : "0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Clock size={14} color="#888" />
            <span style={{ fontSize: "13px", fontWeight: "700", color: "#b0b0b0" }}>History</span>
            {items.length > 0 && (
              <span style={{
                fontSize: "10px", fontWeight: "700", background: "#374151",
                color: "#9ca3af", borderRadius: "10px", padding: "2px 8px",
              }}>
                {items.length}
              </span>
            )}
          </div>
          {loading && <Loader size={12} color="#3b82f6" style={{ animation: "spin 1s linear infinite" }} />}
        </div>

        {/* Channel filter */}
        {channels.length > 0 && (
          <select
            value={channelFilter || ""}
            onChange={(e) => onChannelFilterChange(e.target.value || null)}
            style={{
              width: "100%", background: "#252525", border: "1px solid #444",
              borderRadius: "6px", padding: "6px 10px", color: "#e0e0e0",
              fontSize: "12px", outline: "none", boxSizing: "border-box",
              cursor: "pointer",
            }}
          >
            <option value="">All Channels</option>
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Transcript list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {!loading && items.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "200px", gap: "12px", padding: "24px",
          }}>
            <FileText size={32} color="#444" />
            <p style={{ fontSize: "12px", color: "#666", textAlign: "center", lineHeight: "1.5", margin: 0 }}>
              No transcripts yet. Analyze a transcript to see it here.
            </p>
          </div>
        )}

        {items.map(item => {
          const isActive = activeTranscriptId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTranscript(item)}
              style={{
                width: "100%", background: isActive ? "#1e293b" : "transparent",
                border: "none", borderLeft: isActive ? "3px solid #f59e0b" : "3px solid transparent",
                borderBottom: "1px solid #2a2a2a",
                padding: "12px 14px 12px 13px", cursor: "pointer", textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#1a1a1a"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              {/* Title */}
              <div style={{
                fontSize: "13px", fontWeight: "600", color: isActive ? "#fff" : "#d0d0d0",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                marginBottom: "4px",
              }}>
                {item.title || "Untitled"}
              </div>

              {/* Meta row */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11px", color: "#666" }}>
                  {formatRelativeDate(item.created_at)}
                </span>

                {item.directionCount > 0 && (
                  <span style={{ fontSize: "10px", color: "#888", background: "#2a2a2a", borderRadius: "6px", padding: "1px 6px" }}>
                    {item.directionCount} direction{item.directionCount !== 1 ? "s" : ""}
                  </span>
                )}

                {item.briefCreatedCount > 0 && (
                  <span style={{ fontSize: "10px", color: "#22c55e", background: "#16a34a22", borderRadius: "6px", padding: "1px 6px" }}>
                    {item.briefCreatedCount} brief{item.briefCreatedCount !== 1 ? "s" : ""}
                  </span>
                )}

                {item.channelName && (
                  <span style={{ fontSize: "10px", color: "#3b82f6", background: "#3b82f622", borderRadius: "6px", padding: "1px 6px" }}>
                    {item.channelName}
                  </span>
                )}
              </div>

              {/* Summary preview */}
              {item.analysis_summary && (
                <div style={{
                  fontSize: "11px", color: "#555", marginTop: "4px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {item.analysis_summary}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
