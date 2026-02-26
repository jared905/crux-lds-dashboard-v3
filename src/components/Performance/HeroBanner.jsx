import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { fmtInt } from "../../lib/formatters.js";
import { TrendingUp, TrendingDown, AlertTriangle, ArrowRight } from "lucide-react";
import { getLatestBrief } from "../../services/intelligenceBriefService.js";

const ROTATE_INTERVAL = 6000; // 6 seconds per card

const SEVERITY_COLORS = {
  Critical: { bg: "rgba(239, 68, 68, 0.15)", border: "#ef4444", text: "#ef4444" },
  Warning:  { bg: "rgba(245, 158, 11, 0.15)", border: "#f59e0b", text: "#f59e0b" },
  Monitor:  { bg: "rgba(96, 165, 250, 0.15)", border: "#60a5fa", text: "#60a5fa" },
};

/**
 * HeroBanner — Editorial hero with client branding + rotating insight cards
 */
export default function HeroBanner({ activeClient, kpis, previousKpis, channelStats, filtered, narrative, onNavigateToStrategy }) {
  const { isMobile } = useMediaQuery();
  const [activeIndex, setActiveIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [brief, setBrief] = useState(null);
  const timerRef = useRef(null);
  const progressRef = useRef(null);

  // Fetch latest brief for constraint badge + priority card
  useEffect(() => {
    if (!activeClient?.id) { setBrief(null); return; }
    getLatestBrief(activeClient.id)
      .then(b => setBrief(b))
      .catch(() => {});
  }, [activeClient?.id]);

  const constraint = brief?.primary_constraint;
  const sevStyle = constraint ? SEVERITY_COLORS[constraint.severity] || SEVERITY_COLORS.Monitor : null;

  // Build array of insight stats
  const insights = useMemo(() => {
    if (!kpis || !filtered) return [];
    const items = [];

    // 0. Narrative headline — the period story
    if (narrative?.headline) {
      const sentimentColor = narrative.sentiment === "positive" ? "#10b981"
        : narrative.sentiment === "negative" ? "#ef4444" : "#818cf8";
      items.push({
        label: "The Story",
        value: narrative.headline,
        detail: narrative.subheadline || "",
        color: sentimentColor,
        isNarrative: true,
      });
    }

    // 0b. Brief priority action — what to focus on this week
    if (brief?.recommended_actions?.length > 0) {
      const topAction = brief.recommended_actions[0];
      items.push({
        label: "This Week's Priority",
        value: topAction.title,
        detail: brief.recommended_actions.length > 1
          ? `+ ${brief.recommended_actions.length - 1} more in your weekly brief`
          : "From your weekly intelligence brief",
        color: "#6366f1",
        isNarrative: true,
        isBriefAction: true,
      });
    }

    // 1. Best performing video
    const sorted = [...filtered].filter(v => v.views > 0).sort((a, b) => b.views - a.views);
    if (sorted.length > 0) {
      const top = sorted[0];
      items.push({
        label: "Top Video",
        value: fmtInt(top.views) + " views",
        detail: top.title || "Untitled",
        color: "#fbbf24",
      });
    }

    // 2. Format winner
    if (kpis.shortsMetrics && kpis.longsMetrics) {
      const sViews = kpis.shortsMetrics.views || 0;
      const lViews = kpis.longsMetrics.views || 0;
      if (sViews > 0 && lViews > 0) {
        const ratio = sViews > lViews ? (sViews / lViews) : (lViews / sViews);
        const winner = sViews > lViews ? "Shorts" : "Long-form";
        items.push({
          label: "Format Winner",
          value: `${winner} by ${ratio.toFixed(1)}x`,
          detail: `${fmtInt(sViews)} Shorts views vs ${fmtInt(lViews)} Long-form views`,
          color: sViews > lViews ? "#f97316" : "#0ea5e9",
        });
      }
    }

    // 3. Subscriber conversion rate
    if (kpis.views > 0 && kpis.subs > 0) {
      const ratio = Math.round(kpis.views / kpis.subs);
      items.push({
        label: "Subscriber Conversion",
        value: `1 in ${fmtInt(ratio)}`,
        detail: "viewers subscribed this period",
        color: "#10b981",
      });
    }

    // 4. Top vs bottom comparison
    if (sorted.length >= 10) {
      const topViews = sorted[0].views;
      const bottomN = sorted.slice(-Math.floor(sorted.length / 2));
      const bottomTotal = bottomN.reduce((s, v) => s + (v.views || 0), 0);
      if (bottomTotal > 0) {
        const multiple = (topViews / bottomTotal).toFixed(1);
        if (parseFloat(multiple) > 1) {
          items.push({
            label: "Power Concentration",
            value: `${multiple}x`,
            detail: `Your #1 video outperformed your bottom ${bottomN.length} videos combined`,
            color: "#8b5cf6",
          });
        }
      }
    }

    // 5. Publishing cadence
    const withDates = filtered.filter(v => v.publishDate);
    if (withDates.length >= 2) {
      const dates = withDates.map(v => new Date(v.publishDate)).sort((a, b) => a - b);
      const spanDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
      const weeks = Math.max(spanDays / 7, 1);
      const perWeek = (withDates.length / weeks).toFixed(1);
      items.push({
        label: "Upload Cadence",
        value: `${perWeek}/week`,
        detail: `${withDates.length} videos over ${Math.round(weeks)} weeks`,
        color: "#ef4444",
      });
    }

    // 6. Watch time per viewer
    if (kpis.views > 0 && kpis.watchHours > 0) {
      const minsPerViewer = ((kpis.watchHours * 60) / kpis.views).toFixed(1);
      items.push({
        label: "Avg Watch Time",
        value: `${minsPerViewer} min`,
        detail: "per viewer across all content",
        color: "#0ea5e9",
      });
    }

    return items;
  }, [kpis, previousKpis, filtered, narrative, brief]);

  // Auto-rotate
  const advance = useCallback(() => {
    if (insights.length <= 1) return;
    setFading(true);
    setTimeout(() => {
      setActiveIndex(i => (i + 1) % insights.length);
      setFading(false);
    }, 300);
  }, [insights.length]);

  useEffect(() => {
    if (paused || insights.length <= 1) return;
    timerRef.current = setInterval(advance, ROTATE_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [paused, advance, insights.length]);

  // Reset progress animation on index change
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.style.animation = "none";
      // Force reflow
      void progressRef.current.offsetHeight;
      progressRef.current.style.animation = `progressFill ${ROTATE_INTERVAL}ms linear both`;
    }
  }, [activeIndex]);

  const goTo = (idx) => {
    if (idx === activeIndex) return;
    setFading(true);
    setTimeout(() => {
      setActiveIndex(idx);
      setFading(false);
    }, 300);
  };

  const thumbnailUrl = activeClient?.thumbnailUrl || activeClient?.thumbnail_url;
  const current = insights[activeIndex] || null;

  return (
    <div className="animate-in" style={{ marginBottom: isMobile ? "20px" : "32px" }}>
      {/* Client identity row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: isMobile ? "12px" : "16px",
        marginBottom: isMobile ? "16px" : "20px",
      }}>
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={activeClient?.name}
            style={{
              width: isMobile ? "56px" : "72px",
              height: isMobile ? "56px" : "72px",
              borderRadius: "50%",
              border: "3px solid var(--accent-border)",
              objectFit: "cover",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: isMobile ? "36px" : "56px",
            fontWeight: "800",
            color: "#fff",
            letterSpacing: "-0.02em",
            lineHeight: "1.05",
            textTransform: "uppercase",
            fontFamily: "'Barlow Condensed', sans-serif",
          }}>
            {activeClient?.name || "Channel Overview"}
          </div>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginTop: "4px",
            flexWrap: "wrap",
          }}>
            <span style={{
              fontSize: "13px",
              color: "#9E9E9E",
              fontWeight: "500",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}>
              YouTube Performance Dashboard
            </span>
            {constraint && sevStyle && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "10px",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: sevStyle.text,
                background: sevStyle.bg,
                border: `1px solid ${sevStyle.border}`,
                padding: "3px 10px",
                borderRadius: "4px",
              }}>
                <AlertTriangle size={10} />
                {constraint.constraint}
              </span>
            )}
            {brief && (
              <span
                onClick={() => onNavigateToStrategy?.()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "10px",
                  fontWeight: "700",
                  color: "#818cf8",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                View Brief <ArrowRight size={10} />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Rotating insight card */}
      {current && (
        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          style={{
            display: "inline-flex",
            flexDirection: "column",
            gap: "6px",
            background: "rgba(30, 30, 30, 0.6)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid var(--accent-border)",
            borderRadius: "12px",
            padding: isMobile ? "16px 20px" : "20px 28px",
            minWidth: isMobile ? "100%" : "380px",
            maxWidth: isMobile ? "100%" : "460px",
            transition: "border-color 0.3s ease",
          }}
        >
          {/* Content with crossfade */}
          <div style={{
            opacity: fading ? 0 : 1,
            transform: fading ? "translateX(-16px)" : "translateX(0)",
            transition: "opacity 0.3s ease, transform 0.3s ease",
          }}>
            <div style={{
              fontSize: "11px",
              color: current.color,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "6px",
            }}>
              {current.label}
            </div>
            <div style={{
              fontSize: current.isNarrative ? (isMobile ? "20px" : "26px") : (isMobile ? "36px" : "48px"),
              fontWeight: current.isNarrative ? "300" : "800",
              color: "#fff",
              fontFamily: current.isNarrative ? "inherit" : "'Barlow Condensed', sans-serif",
              letterSpacing: current.isNarrative ? "0" : "-0.02em",
              lineHeight: current.isNarrative ? "1.35" : "1",
              marginBottom: "8px",
            }}>
              {current.value}
            </div>
            <div style={{
              fontSize: "13px",
              color: "#9E9E9E",
              lineHeight: "1.4",
            }}>
              {current.detail}
            </div>
          </div>

          {/* Dot indicators — active dot stretches into oval with gradient timer */}
          {insights.length > 1 && (
            <div style={{
              display: "flex",
              gap: "8px",
              marginTop: "12px",
              alignItems: "center",
            }}>
              {insights.map((insight, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <div
                    key={idx}
                    onClick={() => goTo(idx)}
                    style={{
                      width: isActive ? "36px" : "8px",
                      height: "8px",
                      borderRadius: "4px",
                      background: isActive ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.2)",
                      cursor: "pointer",
                      transition: "width 0.3s ease, background 0.3s ease",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {/* Gradient fill that progresses left to right */}
                    {isActive && (
                      <div
                        ref={progressRef}
                        className="hero-progress-fill"
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          height: "100%",
                          width: "100%",
                          borderRadius: "4px",
                          background: current.color,
                          transformOrigin: "left center",
                          animation: `progressFill ${ROTATE_INTERVAL}ms linear both`,
                          animationPlayState: paused ? "paused" : "running",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
