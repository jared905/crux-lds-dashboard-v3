import {useState} from "react";
import { Megaphone,
  Smartphone, MonitorPlay, Eye,
  Percent, MousePointerClick, UserPlus, Clock, ExternalLink, ChevronDown, ChevronUp, Users, Trophy
} from "lucide-react";
import { fmtInt, fmtPct } from "../../lib/utils";
import { videoKey } from "../../lib/organicFilter.js";
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

export default function TopVideos({ rows, n = 10, promotedFlags, organicOverrides, onOrganicOverride }) {
  const { isMobile } = useMediaQuery();
  const [expanded, setExpanded] = useState(false);
  const [sortMode, setSortMode] = useState('top'); // 'top' or 'recent'
  const safeRows = rows || [];
  const displayCount = expanded ? n * 2 : n;

  // Converters: subs gained per 1K views — which videos turn viewers
  // into audience (min 500 views so tiny samples can't top the list).
  const subsPer1K = (r) => (r.views || 0) >= 500 ? ((r.subscribers || 0) / r.views) * 1000 : -1;
  const sorted = sortMode === 'top'
    ? [...safeRows].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, displayCount)
    : sortMode === 'converters'
      ? [...safeRows].filter(r => subsPer1K(r) > 0).sort((a, b) => subsPer1K(b) - subsPer1K(a)).slice(0, displayCount)
      : [...safeRows].sort((a, b) => {
          const dateA = a.publishDate ? new Date(a.publishDate).getTime() : 0;
          const dateB = b.publishDate ? new Date(b.publishDate).getTime() : 0;
          return dateB - dateA;
        }).slice(0, displayCount);
  const maxViews = sorted[0]?.views || 1;
  const canExpand = safeRows.length > n;

  const s = {
    card: {
      background: "var(--card)",
      border: "1px solid var(--border)",
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
      color: "var(--ink)",
      margin: 0,
    },
    countBadge: {
      fontSize: "12px",
      fontWeight: "700",
      color: "var(--tert)",
      backgroundColor: "rgba(255, 131, 117, 0.15)",
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
      borderBottom: "1px solid var(--border)",
    },
    rank: (i) => ({
      fontSize: "16px",
      fontWeight: "700",
      width: "24px",
      textAlign: "center",
      color: i === 0 ? "var(--warn-text)" : i === 1 ? "var(--text)" : i === 2 ? "var(--muted)" : "var(--outline-variant)",
      fontVariantNumeric: "tabular-nums",
    }),
    iconBox: (isShort) => ({
      width: "40px",
      height: "40px",
      borderRadius: "8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isShort ? "rgba(205, 242, 0, 0.1)" : "rgba(0, 209, 255, 0.1)",
      color: isShort ? "var(--fmt-shorts)" : "var(--accent-text)",
      flexShrink: 0,
    }),
    thumbnail: {
      // Subtle outline keeps thumbnails from bleeding into the dark card.
      outline: "1px solid rgba(255, 255, 255, 0.1)",
      outlineOffset: "-1px",
      width: "80px",
      height: "45px",
      borderRadius: "6px",
      objectFit: "cover",
      backgroundColor: "var(--surface-high)",
      flexShrink: 0,
      border: "1px solid var(--border)",
    },
    thumbnailPlaceholder: {
      width: "80px",
      height: "45px",
      borderRadius: "6px",
      backgroundColor: "var(--surface-high)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      border: "1px solid var(--border)",
      color: "var(--faint)",
    },
    info: {
      flex: 1,
      minWidth: 0,
      marginRight: "16px",
    },
    videoTitle: {
      fontSize: "14px",
      fontWeight: "600",
      color: "var(--text)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      marginBottom: "8px",
    },
    videoTitleLink: {
      fontSize: "14px",
      fontWeight: "600",
      color: "var(--text)",
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
      color: "var(--faint)",
      flexShrink: 0,
      transition: "color 0.15s ease",
    },
    meta: {
      fontSize: "12px",
      fontWeight: "500",
      color: "var(--faint)",
      display: "flex",
      alignItems: "center",
      gap: "10px",
    },
    durationBadge: {
      display: "flex",
      alignItems: "center",
      gap: "5px",
      backgroundColor: "var(--surface-high)",
      padding: "3px 8px",
      borderRadius: "4px",
      color: "var(--muted)",
      fontSize: "11px",
      fontWeight: "600",
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "0.02em",
      border: "1px solid var(--border)",
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
      color: "var(--muted)",
      marginBottom: "4px",
      display: "flex",
      alignItems: "center",
      gap: "4px",
      letterSpacing: "0.05em",
    },
    metricValue: (color = "var(--text)") => ({
      fontSize: "14px",
      fontWeight: "600",
      color: color,
      fontVariantNumeric: "tabular-nums",
    }),
    barContainer: {
      height: "4px",
      width: "100%",
      backgroundColor: "var(--outline-variant)",
      borderRadius: "2px",
      marginTop: "6px",
      overflow: "hidden",
    },
    barFill: (pct) => ({
      height: "100%",
      width: `${pct}%`,
      backgroundColor: "var(--blue)",
      borderRadius: "2px",
    }),
  };

  return (
    <div className="section-card podium-section" style={s.card}>
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(0, 209, 255, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Trophy size={20} style={{ color: "var(--accent-text)" }} />
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "var(--track-label)", fontFamily: "var(--font-label)", color: "var(--muted)", marginBottom: "2px" }}>Performance</div>
            <h2 style={{ ...s.title, margin: 0 }}>{sortMode === 'top' ? 'Top Videos' : sortMode === 'converters' ? 'Conversion Engines' : 'Recent Uploads'}</h2>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '2px', background: "var(--input-bg)", borderRadius: '6px', padding: '2px' }}>
            <button
              onClick={() => { setSortMode('top'); setExpanded(false); }}
              style={{
                padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                border: 'none', cursor: 'pointer',
                background: sortMode === 'top' ? 'var(--blue)' : 'transparent',
                color: sortMode === 'top' ? 'var(--ink)' : 'var(--outline)',
                transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s',
              }}
            >
              Top
            </button>
            <button
              onClick={() => { setSortMode('converters'); setExpanded(false); }}
              title="Ranked by subscribers gained per 1,000 views — the videos that build the audience, not just rent traffic"
              style={{
                padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                border: 'none', cursor: 'pointer',
                background: sortMode === 'converters' ? 'var(--blue)' : 'transparent',
                color: sortMode === 'converters' ? 'var(--on-accent)' : 'var(--outline)',
                transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s',
              }}
            >
              Converters
            </button>
            <button
              onClick={() => { setSortMode('recent'); setExpanded(false); }}
              style={{
                padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                border: 'none', cursor: 'pointer',
                background: sortMode === 'recent' ? 'var(--blue)' : 'transparent',
                color: sortMode === 'recent' ? 'var(--ink)' : 'var(--outline)',
                transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s',
              }}
            >
              Recent
            </button>
          </div>
          <span style={s.countBadge}>{sortMode === 'top' ? 'Top' : sortMode === 'converters' ? 'Best' : 'Latest'} {sorted.length} of {safeRows.length}</span>
        </div>
      </div>

      <div style={s.listContainer}>
        {sorted.map((video, idx) => {
          const isShort = video.type === "short";
          const viewPct = Math.max(2, ((video.views || 0) / maxViews) * 100);

          const retColor = !video.avgViewPct ? "var(--faint)" : video.avgViewPct > 1.0 && isShort ? "var(--pos-text)" : video.avgViewPct > 0.6 ? "var(--pos)" : "var(--text)";
          const ctrColor = !video.ctr ? "var(--faint)" : video.ctr > 0.055 ? "var(--pos)" : "var(--text)";

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
                        e.currentTarget.style.color = 'var(--accent-text)';
                        e.currentTarget.querySelector('svg').style.color = 'var(--accent-text)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text)";
                        e.currentTarget.querySelector('svg').style.color = 'var(--faint)';
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
                      backgroundColor: isShort ? "rgba(205, 242, 0, 0.12)" : "rgba(0, 209, 255, 0.15)",
                      padding: "3px 8px",
                      borderRadius: "4px",
                      color: isShort ? "var(--pos-text)" : "var(--accent-text)",
                      fontSize: "10px",
                      fontWeight: "700",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      border: isShort ? "1px solid rgba(205, 242, 0, 0.3)" : "1px solid rgba(0, 209, 255, 0.3)",
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
                          <span style={{color: "var(--faint)"}}>•</span>
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            backgroundColor: isHost ? "rgba(205, 242, 0, 0.15)" : "var(--tert-bg)",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            color: isHost ? "var(--pos-text)" : "var(--tert)",
                            fontSize: "10px",
                            fontWeight: "700",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            border: isHost ? "1px solid rgba(205, 242, 0, 0.3)" : "1px solid var(--tert-border)",
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

                    {/* Organic/promoted correction — the heuristic flags
                        likely media buys, a human can overrule it either
                        way (stored via migration 116; Organic-only and
                        every KPI/export respect the corrected verdict). */}
                    {onOrganicOverride && promotedFlags && (() => {
                      const key = videoKey(video);
                      const flagged = promotedFlags.has(key);
                      const isManual = organicOverrides ? key in organicOverrides : false;
                      return (
                        <>
                          <span style={{color: "var(--faint)"}}>•</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); onOrganicOverride(video); }}
                            title={flagged
                              ? `Likely promoted (${isManual ? 'set by your team' : promotedFlags.get(key)}). Click if you know this video was organic.`
                              : "Counts as organic. Click if you know this video was promoted, so Organic-only excludes it."}
                            style={flagged ? {
                              display: "flex", alignItems: "center", gap: "4px",
                              backgroundColor: "rgba(245, 158, 11, 0.15)",
                              padding: "3px 8px", borderRadius: "4px",
                              color: "var(--warn-text)", fontSize: "10px", fontWeight: "700",
                              textTransform: "uppercase", letterSpacing: "0.05em",
                              border: "1px solid rgba(245, 158, 11, 0.3)",
                              cursor: "pointer", fontFamily: "inherit",
                            } : {
                              display: "flex", alignItems: "center", gap: "4px",
                              backgroundColor: "transparent",
                              padding: "3px 8px", borderRadius: "4px",
                              color: "var(--faint)", fontSize: "10px", fontWeight: "600",
                              textTransform: "uppercase", letterSpacing: "0.05em",
                              border: "1px dashed var(--outline-variant)",
                              cursor: "pointer", fontFamily: "inherit",
                            }}
                          >
                            <Megaphone size={11} />
                            {flagged ? (isManual ? "Promoted · manual" : "Promoted?") : "organic"}
                          </button>
                        </>
                      );
                    })()}

                    <span style={{color: "var(--faint)"}}>•</span>

                    {/* Robust Duration Badge */}
                    <div style={s.durationBadge}>
                      <Clock size={11} />
                      {getDurationString(video)}
                    </div>

                    {!isMobile && <span style={{color: "var(--faint)"}}>•</span>}
                    {!isMobile && <span style={{color: "var(--muted)"}}>{video.channel || "Unknown"}</span>}
                    {!isMobile && <span style={{color: "var(--faint)"}}>•</span>}
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
                  <div style={s.metricValue("var(--ink)")}>{fmtInt(video.views || 0)}</div>
                  {!isMobile && (
                    <div style={s.barContainer}>
                      <div style={s.barFill(viewPct)}></div>
                    </div>
                  )}
                </div>

                {video.impressions > 0 && (
                  <div style={s.metricCol("auto")}>
                    <div style={s.metricLabel}><Eye size={12} /> Impr</div>
                    <div style={s.metricValue("var(--accent-text)")}>{fmtInt(video.impressions)}</div>
                  </div>
                )}

                <div style={s.metricCol("auto")}>
                  <div style={s.metricLabel}><Percent size={12} /> Ret</div>
                  <div style={s.metricValue(video.avgViewPct ? retColor : "var(--faint)")}>
                    {video.avgViewPct ? fmtPct(video.avgViewPct, 0) : "—"}
                  </div>
                </div>

                <div style={s.metricCol("auto")}>
                  <div style={s.metricLabel}><MousePointerClick size={12} /> CTR</div>
                  <div style={s.metricValue(video.ctr ? ctrColor : "var(--faint)")}>
                    {video.ctr ? fmtPct(video.ctr, 1) : "—"}
                  </div>
                </div>

                <div style={s.metricCol("auto")}>
                  <div style={s.metricLabel}><UserPlus size={12} /> Subs</div>
                  <div style={s.metricValue(video.subscribers ? undefined : "var(--faint)")}>
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
            background: "var(--input-bg)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--muted)",
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "background-color 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--border)";
            e.currentTarget.style.borderColor = "var(--faint)";
            e.currentTarget.style.color = "var(--text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--input-bg)";
            e.currentTarget.style.borderColor = "var(--outline-variant)";
            e.currentTarget.style.color = "var(--muted)";
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