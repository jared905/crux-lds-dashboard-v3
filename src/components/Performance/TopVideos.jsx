import React, { useState } from "react";
import {
  Smartphone, MonitorPlay, Eye, BarChart3,
  MousePointerClick, UserPlus, Clock, ExternalLink, ChevronDown, ChevronUp
} from "lucide-react";
import { fmtInt, fmtPct } from "../../lib/utils";
import { getYouTubeThumbnailUrl } from "../../lib/schema";

/**
 * Robust helper to parse duration from various inputs (Seconds, Strings, ISO 8601)
 */
const getDurationString = (video) => {
  let seconds = 0;

  // 1. Check for standard numeric seconds (e.g. 150)
  if (typeof video.duration === 'number') {
    seconds = video.duration;
  } 
  // 2. Check for string seconds (e.g. "150")
  else if (typeof video.duration === 'string' && !isNaN(video.duration)) {
    seconds = parseInt(video.duration, 10);
  }
  // 3. Check for YouTube API ISO 8601 format (e.g. "PT1H2M10S")
  else if (typeof video.duration === 'string' && video.duration.startsWith("PT")) {
    const match = video.duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const h = (parseInt(match[1]) || 0);
    const m = (parseInt(match[2]) || 0);
    const s = (parseInt(match[3]) || 0);
    seconds = (h * 3600) + (m * 60) + s;
  }
  // 4. Fallback: Check other common keys if 'duration' is missing
  else if (video.durationSec) {
    seconds = video.durationSec;
  }
  else if (video.lengthSeconds) {
    seconds = parseInt(video.lengthSeconds, 10);
  }

  // Formatting logic
  if (!seconds) return "--:--";
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function TopVideos({ rows, n = 10 }) {
  const [expanded, setExpanded] = useState(false);
  const safeRows = rows || [];
  const displayCount = expanded ? n * 2 : n;

  const sorted = [...safeRows].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, displayCount);
  const maxViews = sorted[0]?.views || 1;
  const canExpand = safeRows.length > n;

  const s = {
    card: {
      backgroundColor: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "20px",
      marginBottom: "20px",
      position: "relative",
      overflow: "hidden",
    },
    topGradient: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "4px",
      background: "linear-gradient(90deg, #ec4899, #8b5cf6, #3b82f6)",
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "20px",
    },
    title: {
      fontSize: "18px",
      fontWeight: "600",
      color: "#fff",
    },
    countBadge: {
      fontSize: "11px",
      fontWeight: "600",
      color: "#9E9E9E",
      backgroundColor: "#252525",
      padding: "4px 10px",
      borderRadius: "6px",
      border: "1px solid #333",
    },
    listContainer: {
      display: "flex",
      flexDirection: "column",
    },
    row: {
      display: "flex",
      alignItems: "center",
      gap: "16px",
      padding: "16px 0",
      borderBottom: "1px solid #333",
    },
    rank: (i) => ({
      fontSize: "16px",
      fontWeight: "700",
      width: "24px",
      textAlign: "center",
      color: i === 0 ? "#fcd34d" : i === 1 ? "#e5e7eb" : i === 2 ? "#d6d3d1" : "#475569",
      fontVariantNumeric: "tabular-nums",
    }),
    iconBox: (isShort) => ({
      width: "40px",
      height: "40px",
      borderRadius: "8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isShort ? "rgba(245, 158, 11, 0.1)" : "rgba(59, 130, 246, 0.1)",
      color: isShort ? "#fbbf24" : "#60a5fa",
      flexShrink: 0,
    }),
    thumbnail: {
      width: "80px",
      height: "45px",
      borderRadius: "6px",
      objectFit: "cover",
      backgroundColor: "#252525",
      flexShrink: 0,
      border: "1px solid #333",
    },
    thumbnailPlaceholder: {
      width: "80px",
      height: "45px",
      borderRadius: "6px",
      backgroundColor: "#252525",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      border: "1px solid #333",
      color: "#666",
    },
    info: {
      flex: 1,
      minWidth: 0,
      marginRight: "16px",
    },
    videoTitle: {
      fontSize: "14px",
      fontWeight: "600",
      color: "#E0E0E0",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      marginBottom: "8px",
    },
    videoTitleLink: {
      fontSize: "14px",
      fontWeight: "600",
      color: "#E0E0E0",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      marginBottom: "8px",
      textDecoration: "none",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      transition: "color 0.15s ease",
    },
    linkIcon: {
      color: "#666",
      flexShrink: 0,
      transition: "color 0.15s ease",
    },
    meta: {
      fontSize: "12px",
      fontWeight: "500",
      color: "#666",
      display: "flex",
      alignItems: "center",
      gap: "10px",
    },
    durationBadge: {
      display: "flex",
      alignItems: "center",
      gap: "5px",
      backgroundColor: "#252525",
      padding: "3px 8px",
      borderRadius: "4px",
      color: "#9E9E9E",
      fontSize: "11px",
      fontWeight: "600",
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "0.02em",
      border: "1px solid #333",
    },
    metricCol: (width = "75px") => ({
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      minWidth: width,
    }),
    metricLabel: {
      fontSize: "10px",
      fontWeight: "700",
      textTransform: "uppercase",
      color: "#9E9E9E",
      marginBottom: "4px",
      display: "flex",
      alignItems: "center",
      gap: "4px",
      letterSpacing: "0.05em",
    },
    metricValue: (color = "#E0E0E0") => ({
      fontSize: "14px",
      fontWeight: "600",
      color: color,
      fontVariantNumeric: "tabular-nums",
    }),
    barContainer: {
      height: "4px",
      width: "100%",
      backgroundColor: "#333",
      borderRadius: "2px",
      marginTop: "6px",
      overflow: "hidden",
    },
    barFill: (pct) => ({
      height: "100%",
      width: `${pct}%`,
      backgroundColor: "#6366f1",
      borderRadius: "2px",
    }),
  };

  return (
    <div style={s.card}>
      <div style={s.topGradient} />
      <div style={s.header}>
        <h2 style={s.title}>Top Videos</h2>
        <span style={s.countBadge}>Top {sorted.length} of {safeRows.length}</span>
      </div>

      <div style={s.listContainer}>
        {sorted.map((video, idx) => {
          const isShort = video.type === "short";
          const viewPct = Math.max(2, ((video.views || 0) / maxViews) * 100);

          const ctrColor = (video.ctr || 0) > 0.055 ? "#00C853" : "#E0E0E0";

          return (
            <div key={idx} style={{ 
              ...s.row, 
              borderBottom: idx === sorted.length - 1 ? "none" : "1px solid #334155" 
            }}>
              
              <div style={s.rank(idx)}>#{idx + 1}</div>

              {/* Thumbnail - use YouTube thumbnail if video ID available */}
              {video.youtubeVideoId ? (
                <a
                  href={video.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flexShrink: 0 }}
                >
                  <img
                    src={video.thumbnailUrl || getYouTubeThumbnailUrl(video.youtubeVideoId)}
                    alt={video.title}
                    style={s.thumbnail}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling && (e.target.nextSibling.style.display = 'flex');
                    }}
                  />
                </a>
              ) : (
                <div style={s.thumbnailPlaceholder}>
                  {isShort ? <Smartphone size={18} /> : <MonitorPlay size={18} />}
                </div>
              )}

              <div style={s.info}>
                {/* Title - clickable link if YouTube URL available */}
                {video.youtubeUrl ? (
                  <a
                    href={video.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={s.videoTitleLink}
                    title={video.title}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#60a5fa';
                      e.currentTarget.querySelector('svg').style.color = '#60a5fa';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#E0E0E0';
                      e.currentTarget.querySelector('svg').style.color = '#666';
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {video.title || "Untitled Video"}
                    </span>
                    <ExternalLink size={12} style={s.linkIcon} />
                  </a>
                ) : (
                  <div style={s.videoTitle} title={video.title}>{video.title || "Untitled Video"}</div>
                )}
                
                <div style={s.meta}>
                  {/* Format indicator (Shorts vs Long-form) */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    backgroundColor: isShort ? "rgba(245, 158, 11, 0.15)" : "rgba(59, 130, 246, 0.15)",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    color: isShort ? "#fbbf24" : "#60a5fa",
                    fontSize: "10px",
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    border: isShort ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid rgba(59, 130, 246, 0.3)",
                  }}>
                    {isShort ? <Smartphone size={11} /> : <MonitorPlay size={11} />}
                    {isShort ? "Short" : "Long"}
                  </div>

                  <span style={{color: "#666"}}>•</span>

                  {/* Robust Duration Badge */}
                  <div style={s.durationBadge}>
                    <Clock size={11} />
                    {getDurationString(video)}
                  </div>

                  <span style={{color: "#666"}}>•</span>

                  <span style={{color: "#9E9E9E"}}>{video.channel || "Unknown"}</span>

                  <span style={{color: "#666"}}>•</span>

                  <span>{video.publishDate ? new Date(video.publishDate).toLocaleDateString() : "No Date"}</span>
                </div>
              </div>

              <div style={s.metricCol("100px")}>
                <div style={s.metricLabel}><Eye size={12} /> Views</div>
                <div style={s.metricValue("#fff")}>{fmtInt(video.views || 0)}</div>
                <div style={s.barContainer}>
                  <div style={s.barFill(viewPct)}></div>
                </div>
              </div>

              <div style={s.metricCol()}>
                <div style={s.metricLabel}><BarChart3 size={12} /> Impr</div>
                <div style={s.metricValue()}>{fmtInt(video.impressions || 0)}</div>
              </div>

              <div style={s.metricCol()}>
                <div style={s.metricLabel}><MousePointerClick size={12} /> CTR</div>
                <div style={s.metricValue(ctrColor)}>{fmtPct(video.ctr || 0, 1)}</div>
              </div>

              <div style={s.metricCol()}>
                <div style={s.metricLabel}><UserPlus size={12} /> Subs</div>
                <div style={s.metricValue()}>{fmtInt(video.subscribers || 0)}</div>
              </div>

            </div>
          );
        })}
      </div>

      {canExpand && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            width: "100%",
            padding: "12px",
            marginTop: "16px",
            background: "#252525",
            border: "1px solid #333",
            borderRadius: "8px",
            color: "#9E9E9E",
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#2a2a2a";
            e.currentTarget.style.borderColor = "#555";
            e.currentTarget.style.color = "#E0E0E0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#252525";
            e.currentTarget.style.borderColor = "#333";
            e.currentTarget.style.color = "#9E9E9E";
          }}
        >
          {expanded ? (
            <>
              <ChevronUp size={14} />
              Show Top {n} Only
            </>
          ) : (
            <>
              <ChevronDown size={14} />
              Show Top {n * 2}
            </>
          )}
        </button>
      )}
    </div>
  );
}