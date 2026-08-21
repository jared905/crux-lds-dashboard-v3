import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { fmtInt } from "../../lib/formatters.js";
import { getLatestBrief } from "../../services/intelligenceBriefService.js";
import { AlertTriangle, ArrowRight } from 'lucide-react';

const ROTATE_INTERVAL = 6000; // 6 seconds per card

const SEVERITY_COLORS = {
  Critical: { bg: "rgba(255, 85, 64, 0.15)", border: "var(--neg)", text: "var(--neg)" },
  Warning:  { bg: "rgba(245, 158, 11, 0.15)", border: "var(--warn)", text: "var(--warn)" },
  Monitor:  { bg: "rgba(96, 165, 250, 0.15)", border: "var(--accent-text)", text: "var(--accent-text)" },
};

/**
 * HeroBanner — Editorial hero with client branding + rotating insight cards
 */
export default function HeroBanner({ activeClient, kpis, _channelStats, filtered, narrative, onNavigateToStrategy }) {
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
    if (activeClient.isAggregate) { setBrief(null); return; }
    getLatestBrief(activeClient.id)
      .then(b => setBrief(b))
      .catch(() => {});
  }, [activeClient?.id, activeClient?.isAggregate]);

  const constraint = brief?.primary_constraint;
  const sevStyle = constraint ? SEVERITY_COLORS[constraint.severity] || SEVERITY_COLORS.Monitor : null;

  // Build array of insight stats
  const insights = useMemo(() => {
    if (!kpis || !filtered) return [];
    const items = [];

    // The narrative headline used to be slide 0 ("The Story"). It was the
    // tallest slide by far, so every rotation through it resized the card
    // and reflowed the entire page. It now renders as the permanent
    // standfirst under the client name — the one human sentence anchoring
    // the hero — and the rotation carries only the stat cards.

    // 0b. Brief priority action — what to focus on this week.
    // Credibility filter on STORED briefs: the generator now suppresses
    // absurd lifts (mean-of-3-videos artifacts like "32608% more views"),
    // but rows saved before that fix still carry them. Don't headline a
    // claim the current pipeline would refuse to make; self-heals on the
    // next generated brief.
    const credibleActions = (brief?.recommended_actions || []).filter(a => {
      const m = /([\d,]+)\s*%\s*more/.exec(a?.title || '');
      return !m || Number(m[1].replace(/,/g, '')) <= 400;
    });
    if (credibleActions.length > 0) {
      const topAction = credibleActions[0];
      items.push({
        label: "This Week's Priority",
        value: topAction.title,
        detail: credibleActions.length > 1
          ? `+ ${credibleActions.length - 1} more in your weekly brief`
          : "From your weekly intelligence brief",
        color: "var(--blue)",
        isNarrative: true,
        isBriefAction: true,
      });
    }

    // 0c. Aggregate view: which CHANNEL is winning the period. Only
    // meaningful on "All Channels" — one channel's page has one channel.
    const sorted = [...filtered].filter(v => v.views > 0).sort((a, b) => b.views - a.views);
    if (activeClient?.isAggregate) {
      const byChannel = new Map();
      for (const v of filtered) {
        if (!v.channel) continue;
        byChannel.set(v.channel, (byChannel.get(v.channel) || 0) + (v.views || 0));
      }
      const ranked = [...byChannel.entries()].sort((a, b) => b[1] - a[1]);
      if (ranked.length > 1) {
        const [topName, topViews] = ranked[0];
        items.push({
          label: "Top Channel",
          value: topName,
          detail: `${fmtInt(topViews)} views this period — best of ${ranked.length} channels`,
          color: "var(--pos)",
        });
      }
    }

    // 1. Best performing video (on the aggregate, says whose it is)
    if (sorted.length > 0) {
      const top = sorted[0];
      items.push({
        label: "Top Video",
        value: fmtInt(top.views) + " views",
        detail: activeClient?.isAggregate && top.channel
          ? `${top.title || "Untitled"} — ${top.channel}`
          : (top.title || "Untitled"),
        color: "var(--warn-text)",
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
          color: sViews > lViews ? "var(--pos)" : "var(--blue)",
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
        color: "var(--pos)",
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
            color: "var(--blue-deep)",
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
        color: "var(--neg)",
      });
    }

    // 6. Watch time per viewer.
    // Computed ONLY over videos that actually report watch hours — on
    // "All Channels", views arrive from every channel but watch hours
    // only from the OAuth-synced ones, so hours ÷ total views collapsed
    // to "0.0 min" (user-reported 2026-08-20). Divide matching hours by
    // matching views, and stay silent when coverage is too thin to mean
    // anything.
    // On the aggregate this stays hidden entirely: rows there mix
    // lifetime view counts with period-scoped watch hours from different
    // sync paths, so ANY division yields a confident-looking nonsense
    // number ("0.0 min"). No number beats a wrong number; single-channel
    // views and hours share a source, so the math holds there.
    const withWatch = activeClient?.isAggregate ? [] : filtered.filter(v => (v.watchHours || 0) > 0 && (v.views || 0) > 0);
    const watchViews = withWatch.reduce((sum, v) => sum + v.views, 0);
    const watchHours = withWatch.reduce((sum, v) => sum + v.watchHours, 0);
    const watchCoverage = filtered.length > 0 ? withWatch.length / filtered.length : 0;
    if (watchViews > 0 && watchHours > 0 && (watchCoverage >= 0.3 || withWatch.length >= 20)) {
      const minsPerViewer = ((watchHours * 60) / watchViews).toFixed(1);
      items.push({
        label: "Avg Watch Time",
        value: `${minsPerViewer} min`,
        detail: watchCoverage < 0.95
          ? `per viewer, from the ${withWatch.length} videos with watch-time data`
          : "per viewer across all content",
        color: "var(--blue)",
      });
    }

    return items;
  }, [kpis, filtered, brief, activeClient?.isAggregate]);

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

  const goBack = () => {
    if (insights.length <= 1) return;
    setFading(true);
    setTimeout(() => {
      setActiveIndex(i => (i - 1 + insights.length) % insights.length);
      setFading(false);
    }, 300);
  };

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
            color: "var(--ink)",
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
              color: "var(--muted)",
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
                  color: "var(--accent-text)",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                View Brief <ArrowRight size={10} />
              </span>
            )}
          </div>

          {/* Editorial standfirst — the period's story in one sentence. */}
          {narrative?.headline && (
            <div style={{ marginTop: "14px", maxWidth: "56ch" }}>
              <div style={{
                fontSize: isMobile ? "17px" : "21px",
                fontWeight: "400",
                color: "var(--ink)",
                lineHeight: "1.45",
                letterSpacing: "-0.005em",
                textWrap: "balance",
              }}>
                {narrative.headline}
              </div>
              {narrative.subheadline && (
                <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "6px", lineHeight: "1.5" }}>
                  {narrative.subheadline}
                </div>
              )}
            </div>
          )}
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
            position: "relative",
            background: "rgba(30, 30, 30, 0.6)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid var(--accent-border)",
            borderRadius: "12px",
            padding: isMobile ? "16px 28px" : "20px 36px",
            minWidth: isMobile ? "100%" : "380px",
            maxWidth: isMobile ? "100%" : "460px",
            transition: "border-color 0.3s ease",
          }}
        >
          {/* Prev / next — quiet chevrons at the mid-edges. The dots said
              "there are more"; these say "you can move". Kept alongside the
              dots and the per-slide progress bar. */}
          {insights.length > 1 && (
            <>
              <button
                type="button"
                onClick={goBack}
                aria-label="Previous insight"
                className="hero-nav-arrow"
                style={{ left: 4 }}
              >&#8249;</button>
              <button
                type="button"
                onClick={advance}
                aria-label="Next insight"
                className="hero-nav-arrow"
                style={{ right: 4 }}
              >&#8250;</button>
            </>
          )}
          {/* All slides render into the same grid cell. Hidden slides keep
              their layout (visibility, not display), so the card is always
              exactly as tall as its TALLEST slide — the page never reflows
              when the rotation lands on a longer one. */}
          <div style={{ display: "grid" }}>
            {insights.map((ins, idx) => {
              const isActive = idx === activeIndex;
              return (
                <div key={idx} aria-hidden={!isActive} style={{
                  gridArea: "1 / 1",
                  visibility: isActive ? "visible" : "hidden",
                  opacity: isActive && !fading ? 1 : 0,
                  transform: isActive && !fading ? "translateX(0)" : "translateX(-16px)",
                  transition: "opacity 0.3s ease, transform 0.3s ease",
                }}>
                  <div style={{
                    fontSize: "11px",
                    color: ins.color,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "6px",
                  }}>
                    {ins.label}
                  </div>
                  <div style={{
                    fontSize: ins.isNarrative ? (isMobile ? "20px" : "26px") : (isMobile ? "36px" : "48px"),
                    fontWeight: ins.isNarrative ? "300" : "800",
                    color: "var(--ink)",
                    fontFamily: ins.isNarrative ? "inherit" : "'Barlow Condensed', sans-serif",
                    letterSpacing: ins.isNarrative ? "0" : "-0.02em",
                    lineHeight: ins.isNarrative ? "1.35" : "1",
                    marginBottom: "8px",
                  }}>
                    {ins.value}
                  </div>
                  <div style={{
                    fontSize: "13px",
                    color: "var(--muted)",
                    lineHeight: "1.4",
                  }}>
                    {ins.detail}
                  </div>
                </div>
              );
            })}
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
