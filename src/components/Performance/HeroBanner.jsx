import { useMemo } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { useCountUp } from "../../hooks/useCountUp.js";
import { fmtInt, fmtPct } from "../../lib/formatters.js";
import { TrendingUp, TrendingDown } from "lucide-react";

/**
 * HeroBanner — Editorial hero with client branding + "wow" stat card
 *
 * Sits at the top of the dashboard. Shows the client name in large
 * display type with their channel thumbnail, plus a glassmorphic
 * "wow" card highlighting their most impressive metric change.
 */
export default function HeroBanner({ activeClient, kpis, previousKpis, channelStats, filtered }) {
  const { isMobile } = useMediaQuery();

  // Pick the "wow" stat: whichever metric has the highest positive delta
  const wowStat = useMemo(() => {
    if (!kpis || !previousKpis) return null;

    const candidates = [
      {
        label: "views",
        current: kpis.views,
        previous: previousKpis.views,
        format: fmtInt,
        noun: "views",
      },
      {
        label: "watch hours",
        current: kpis.watchHours,
        previous: previousKpis.watchHours,
        format: fmtInt,
        noun: "watch hours",
      },
      {
        label: "subscribers",
        current: kpis.subs,
        previous: previousKpis.subs,
        format: (v) => `${v >= 0 ? "+" : ""}${fmtInt(v)}`,
        noun: "subscribers",
      },
    ];

    let best = null;
    let bestDelta = 0;

    for (const c of candidates) {
      if (c.previous === 0 && c.current === 0) continue;
      const delta = c.previous !== 0
        ? ((c.current - c.previous) / Math.abs(c.previous)) * 100
        : (c.current > 0 ? 100 : 0);
      if (delta > bestDelta) {
        bestDelta = delta;
        best = { ...c, delta, deltaAbs: Math.abs(delta) };
      }
    }

    // If nothing is positive, pick the metric with the least negative delta
    if (!best) {
      let leastBad = null;
      let leastBadDelta = -Infinity;
      for (const c of candidates) {
        const delta = c.previous !== 0
          ? ((c.current - c.previous) / Math.abs(c.previous)) * 100
          : 0;
        if (delta > leastBadDelta) {
          leastBadDelta = delta;
          leastBad = { ...c, delta, deltaAbs: Math.abs(delta) };
        }
      }
      best = leastBad;
    }

    return best;
  }, [kpis, previousKpis]);

  const animatedValue = useCountUp(
    wowStat ? Math.abs(wowStat.current) : 0,
    1000,
    !!wowStat
  );

  const isPositive = wowStat?.delta > 0;
  const DeltaIcon = isPositive ? TrendingUp : TrendingDown;
  const deltaColor = isPositive ? "#10b981" : "#ef4444";

  // Build narrative line
  const narrative = useMemo(() => {
    if (!wowStat) return "";
    const direction = wowStat.delta > 0 ? "grew" : "declined";
    const pct = Math.abs(wowStat.delta).toFixed(0);
    return `Your channel ${direction} ${pct}% in ${wowStat.noun} compared to the prior period`;
  }, [wowStat]);

  const thumbnailUrl = activeClient?.thumbnailUrl || activeClient?.thumbnail_url;

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
        <div>
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
            fontSize: "13px",
            color: "#9E9E9E",
            fontWeight: "500",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginTop: "4px",
          }}>
            YouTube Performance Dashboard
          </div>
        </div>
      </div>

      {/* Wow stat card — glassmorphic */}
      {wowStat && wowStat.current !== 0 && (
        <div
          className="animate-in"
          style={{
            animationDelay: "0.2s",
            display: "inline-flex",
            flexDirection: "column",
            gap: "6px",
            background: "rgba(30, 30, 30, 0.6)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid var(--accent-border)",
            borderRadius: "12px",
            padding: isMobile ? "16px 20px" : "20px 28px",
            maxWidth: isMobile ? "100%" : "420px",
          }}
        >
          <div style={{
            fontSize: "11px",
            color: "var(--accent-text)",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}>
            {wowStat.label}
          </div>
          <div style={{
            fontSize: isMobile ? "40px" : "52px",
            fontWeight: "800",
            color: "var(--accent-text)",
            fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: "-0.02em",
            lineHeight: "1",
          }}>
            {wowStat.label === "subscribers"
              ? `${wowStat.current >= 0 ? "+" : "-"}${fmtInt(animatedValue)}`
              : fmtInt(animatedValue)}
          </div>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            fontWeight: "600",
            color: deltaColor,
          }}>
            <DeltaIcon size={14} />
            {isPositive ? "+" : ""}{wowStat.delta.toFixed(1)}% vs prior period
          </div>
          <div style={{
            fontSize: "13px",
            color: "#9E9E9E",
            marginTop: "2px",
            lineHeight: "1.4",
          }}>
            {narrative}
          </div>
        </div>
      )}
    </div>
  );
}
