import React, { useState } from "react";
import {
  Smartphone, MonitorPlay, Eye,
  Percent, MousePointerClick, UserPlus, Clock, ExternalLink, ChevronDown, ChevronUp, Users
} from "lucide-react";
import { fmtInt, fmtPct } from "../../lib/utils";
import { getYouTubeThumbnailUrl } from "../../lib/schema";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";

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
  const { isMobile } = useMediaQuery();
  const [expanded, setExpanded] = useState(false);
  const [sortMode, setSortMode] = useState('top'); // 'top' or 'recent'
  const safeRows = rows || [];
  const displayCount = expanded ? n * 2 : n;

  const sorted = sortMode === 'top'
    ? [...safeRows].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, displayCount)
    : [...safeRows].sort((a, b) => {
        const dateA = a.publishDate ? new Date(a.publishDate).getTime() : 0;
        const dateB = b.publishDate ? new Date(b.publishDate).getTime() : 0;
        return dateB - dateA;
      }).slice(0, displayCount);
  const maxViews = sorted[0]?.views || 1;
  const canExpand = safeRows.length > n;

  const s = {
    card: {
      background: "#1E1E1E",
      border: "1px solid #2A2A2A",
      borderRadius: "8px",
      padding: "20px",
      marginBottom: "20px",
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "20px",
    },
    title: {
      fontSize: "26px",
      fontWeight: "700",
      color: "#fff",
      margin: 0,
    },
    countBadge: {
      fontSize: "12px",
      fontWeight: "700",
      color: "#f472b6",
      backgroundColor: "rgba(236, 72, 153, 0.15)",
      padding: "4px 12px",
      borderRadius: "6px",
      fontFamily: "'Barlow Condensed', sans-serif",
      letterSpacing: "-0.01em",
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
    <div className="section-card podium-section" style={s.card}>
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #fbbf24, #fbbf24cc)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px #fbbf244d" }}>
            <svg width="36" height="36" viewBox="0 0 48 48" fill="none">
              {/* Podium blocks */}
              {/* 2nd place — left */}
              <rect x="4" y="28" width="12" height="16" rx="1.5" fill="white" opacity="0.7" />
              <text x="10" y="38" textAnchor="middle" fontFamily="'Barlow Condensed', sans-serif" fontSize="8" fontWeight="800" fill="#fbbf24" opacity="0.6">2</text>
              {/* 1st place — center (tallest) */}
              <rect x="18" y="20" width="12" height="24" rx="1.5" fill="white" opacity="0.9" />
              <text x="24" y="32" textAnchor="middle" fontFamily="'Barlow Condensed', sans-serif" fontSize="9" fontWeight="800" fill="#fbbf24" opacity="0.7">1</text>
              {/* 3rd place — right */}
              <rect x="32" y="32" width="12" height="12" rx="1.5" fill="white" opacity="0.6" />
              <text x="38" y="40" textAnchor="middle" fontFamily="'Barlow Condensed', sans-serif" fontSize="7" fontWeight="800" fill="#fbbf24" opacity="0.5">3</text>
              {/* Winner figure on 1st place — jumps on hover */}
              <g className="podium-winner">
                {/* Head */}
                <circle cx="24" cy="11" r="3" fill="white" opacity="0.9" />
                {/* Torso */}
                <rect x="22" y="14" width="4" height="5" rx="1" fill="white" opacity="0.9" />
                {/* Arms up (celebrating) */}
                <line x1="22" y1="15" x2="18" y2="11" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
                <line x1="26" y1="15" x2="30" y2="11" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
                {/* Legs */}
                <line x1="23" y1="19" x2="21.5" y2="20" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
                <line x1="25" y1="19" x2="26.5" y2="20" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
              </g>
              {/* 2nd place figure */}
              <circle cx="10" cy="22" r="2.5" fill="white" opacity="0.6" />
              <rect x="8.5" y="24.5" width="3" height="3.5" rx="0.8" fill="white" opacity="0.6" />
              {/* 3rd place figure */}
              <circle cx="38" cy="27" r="2.5" fill="white" opacity="0.5" />
              <rect x="36.5" y="29.5" width="3" height="2.5" rx="0.8" fill="white" opacity="0.5" />
            </svg>
          </div>
          <h2 style={s.title}>{sortMode === 'top' ? 'Top Videos' : 'Recent Uploads'}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '2px', background: '#252525', borderRadius: '6px', padding: '2px' }}>
            <button
              onClick={() => { setSortMode('top'); setExpanded(false); }}
              style={{
                padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                border: 'none', cursor: 'pointer',
                background: sortMode === 'top' ? '#3b82f6' : 'transparent',
                color: sortMode === 'top' ? '#fff' : '#888',
                transition: 'all 0.15s',
              }}
            >
              Top
            </button>
            <button
              onClick={() => { setSortMode('recent'); setExpanded(false); }}
              style={{
                padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                border: 'none', cursor: 'pointer',
                background: sortMode === 'recent' ? '#3b82f6' : 'transparent',
                color: sortMode === 'recent' ? '#fff' : '#888',
                transition: 'all 0.15s',
              }}
            >
              Recent
            </button>
          </div>
          <span style={s.countBadge}>{sortMode === 'top' ? 'Top' : 'Latest'} {sorted.length} of {safeRows.length}</span>
        </div>
      </div>

      <div style={s.listContainer}>
        {sorted.map((video, idx) => {
          const isShort = video.type === "short";
          const viewPct = Math.max(2, ((video.views || 0) / maxViews) * 100);

          const retColor = !video.avgViewPct ? "#555" : video.avgViewPct > 1.0 && isShort ? "#FFD700" : video.avgViewPct > 0.6 ? "#00C853" : "#E0E0E0";
          const ctrColor = !video.ctr ? "#555" : video.ctr > 0.055 ? "#00C853" : "#E0E0E0";

          return (
            <div key={idx} className="comparison-row" style={{
              ...s.row,
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "stretch" : "center",
              gap: isMobile ? "10px" : "16px",
              borderBottom: idx === sorted.length - 1 ? "none" : "1px solid #334155",
              borderRadius: "4px",
              padding: "16px 8px",
            }}>

              {/* Top section: rank + thumbnail + title/meta */}
              <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "10px" : "16px", minWidth: 0, flex: 1 }}>
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
                      style={{ ...s.thumbnail, ...(isMobile ? { width: "64px", height: "36px" } : {}) }}
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

                  <div style={{ ...s.meta, flexWrap: "wrap" }}>
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

                    {video.isCollaboration && (() => {
                      const isHost = video.collabRole === 'host';
                      const roleLabel = isHost ? 'Host' : 'Guest';
                      const partnerLabel = video.collabChannel
                        ? (isHost ? `w/ ${video.collabChannel}` : `on ${video.collabChannel}`)
                        : '';
                      return (
                        <>
                          <span style={{color: "#666"}}>•</span>
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            backgroundColor: isHost ? "rgba(34, 197, 94, 0.15)" : "rgba(168, 85, 247, 0.15)",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            color: isHost ? "#4ade80" : "#c084fc",
                            fontSize: "10px",
                            fontWeight: "700",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            border: isHost ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(168, 85, 247, 0.3)",
                          }}
                            title={video.collabChannel
                              ? `${roleLabel} collaboration ${isHost ? 'with' : 'on'} ${video.collabChannel}`
                              : `${roleLabel} collaboration`}
                          >
                            <Users size={11} />
                            {roleLabel}{partnerLabel ? ` · ${partnerLabel}` : ''}
                          </div>
                        </>
                      );
                    })()}

                    <span style={{color: "#666"}}>•</span>

                    {/* Robust Duration Badge */}
                    <div style={s.durationBadge}>
                      <Clock size={11} />
                      {getDurationString(video)}
                    </div>

                    {!isMobile && <span style={{color: "#666"}}>•</span>}
                    {!isMobile && <span style={{color: "#9E9E9E"}}>{video.channel || "Unknown"}</span>}
                    {!isMobile && <span style={{color: "#666"}}>•</span>}
                    {!isMobile && <span>{video.publishDate ? new Date(video.publishDate).toLocaleDateString() : "No Date"}</span>}
                  </div>
                </div>
              </div>

              {/* Metrics — grid row on mobile, inline on desktop */}
              <div style={isMobile
                ? { display: "grid", gridTemplateColumns: video.impressions ? "1fr 1fr 1fr 1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "8px", paddingLeft: "34px" }
                : { display: "grid", gridTemplateColumns: video.impressions ? "100px 80px 70px 70px 70px" : "100px 70px 70px 70px", gap: "12px", flexShrink: 0 }
              }>
                <div style={s.metricCol("auto")}>
                  <div style={s.metricLabel}><Eye size={12} /> Views</div>
                  <div style={s.metricValue("#fff")}>{fmtInt(video.views || 0)}</div>
                  {!isMobile && (
                    <div style={s.barContainer}>
                      <div style={s.barFill(viewPct)}></div>
                    </div>
                  )}
                </div>

                {video.impressions > 0 && (
                  <div style={s.metricCol("auto")}>
                    <div style={s.metricLabel}><Eye size={12} /> Impr</div>
                    <div style={s.metricValue("#a78bfa")}>{fmtInt(video.impressions)}</div>
                  </div>
                )}

                <div style={s.metricCol("auto")}>
                  <div style={s.metricLabel}><Percent size={12} /> Ret</div>
                  <div style={s.metricValue(video.avgViewPct ? retColor : "#555")}>
                    {video.avgViewPct ? fmtPct(video.avgViewPct, 0) : "—"}
                  </div>
                </div>

                <div style={s.metricCol("auto")}>
                  <div style={s.metricLabel}><MousePointerClick size={12} /> CTR</div>
                  <div style={s.metricValue(video.ctr ? ctrColor : "#555")}>
                    {video.ctr ? fmtPct(video.ctr, 1) : "—"}
                  </div>
                </div>

                <div style={s.metricCol("auto")}>
                  <div style={s.metricLabel}><UserPlus size={12} /> Subs</div>
                  <div style={s.metricValue(video.subscribers ? undefined : "#555")}>
                    {video.subscribers ? fmtInt(video.subscribers) : "—"}
                  </div>
                </div>
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