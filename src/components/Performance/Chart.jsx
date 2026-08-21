import {useState, useMemo, useRef} from "react";
import { fmtInt } from "../../lib/formatters.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";

/**
 * Performance Timeline.
 *
 * Rewritten 2026-08 after review. What changed and why:
 *
 * - No per-point dots. Every date used to get a 6px glowing circle; at 300+
 *   points that is dot soup, and because the SVG uses
 *   preserveAspectRatio="none", every "circle" actually rendered as a
 *   stretched ellipse. The line and area carry the shape; the only
 *   persistent marker is the peak (green — the same green as the PEAK stat
 *   below, so the colour links the number to the moment it happened).
 * - Hover is a crosshair, not 300 hit targets: one mousemove handler snaps
 *   to the nearest point and shows a marker + tooltip. Markers are
 *   HTML overlays, not SVG circles, so they stay round.
 * - The glow filter is gone. Charts report; they don't glow.
 * - Axis: exactly ~6 ticks including first and last, year included whenever
 *   the range crosses a year boundary — the old month-day-only labels read
 *   as shuffled ("Jun 5 … Feb 27 … Jul 28 … May 14") on multi-year data,
 *   and the last two labels collided at the right edge.
 * - The stat tiles lost their coloured left border-caps. Colour lives in
 *   the numeral itself, nowhere else.
 * - Stats moved OUT of the fixed-height chart box — they used to overflow
 *   it, which clipped them against whatever rendered below.
 */
const VIEW_W = 1000;
const VIEW_H = 320;
const PAD = { left: 20, right: 20, top: 20, bottom: 40 };

// compact: hero-corner mode — shorter canvas, smaller headline, no
// stats row (the header number + delta already carry the summary).
// smooth Catmull-Rom → cubic-bezier path: preserves every data point,
// flows between them. The Pulse style (subscribers) rides on this.
function smoothPath(pts) {
  if (pts.length < 3) return "M " + pts.map(p => p.join(" ")).join(" L ");
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

const Chart = ({ rows, metric = "views", dailySeries = null, subSeries = null, prevTotals = null, compact = false, annotations = [] }) => {
  const { isMobile } = useMediaQuery();
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgWrapRef = useRef(null);

  // Real daily numbers when the snapshot RPC has them; otherwise the
  // old publish-day bucketing, and the header says which one it is —
  // "what the channel did each day" and "what each day's uploads have
  // earned" are different claims.
  // Subscribers = the Pulse chart: cumulative counts from daily channel
  // snapshots — monotonic, naturally flowing, drawn in the stylized
  // thick-line treatment. Down-sampled to ~40 points so the curve waves
  // instead of jittering.
  const isPulse = metric === "subscribers";
  const pulseData = useMemo(() => {
    if (!isPulse || !subSeries || subSeries.length < 3) return null;
    const step = Math.max(1, Math.ceil(subSeries.length / 40));
    const sampled = subSeries.filter((_, i) => i % step === 0 || i === subSeries.length - 1);
    return sampled.map(d => ({ date: d.date, value: d.subscribers }));
  }, [isPulse, subSeries]);

  const isDaily = Boolean(dailySeries && dailySeries.length >= 3);
  const data = useMemo(() => {
    if (isPulse) return pulseData || [];
    if (isDaily) {
      return dailySeries.map(d => ({
        date: d.date,
        value: metric === "views" ? (d.views || 0) : (d.watchHours || 0),
      }));
    }
    if (!rows.length) return [];
    const byDate = {};
    rows.forEach(r => {
      if (r.publishDate) {
        const date = r.publishDate.split('T')[0];
        const value = metric === "views" ? (r.views || 0) : (r.watchHours || 0);
        byDate[date] = (byDate[date] || 0) + value;
      }
    });
    return Object.entries(byDate)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, metric, dailySeries, isDaily, isPulse, pulseData]);

  const prevTotal = prevTotals ? (metric === "views" ? prevTotals.views : prevTotals.watchHours) : null;
  const prevAvg = prevTotal && data.length ? prevTotal / data.length : null;

  const geom = useMemo(() => {
    if (!data.length) return null;
    let max = Math.max(...data.map(d => d.value), isPulse ? 0 : (prevAvg || 0), 1);
    let min = 0;
    if (isPulse) {
      // cumulative series: zoom to the movement, not the absolute zero
      const lo = Math.min(...data.map(d => d.value));
      const span = Math.max(max - lo, 1);
      min = Math.max(lo - span * 0.25, 0);
      max = max + span * 0.1;
    }
    const chartW = VIEW_W - PAD.left - PAD.right;
    const chartH = VIEW_H - PAD.top - PAD.bottom;
    const xOf = i => PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
    const yOf = v => PAD.top + chartH - ((v - min) / Math.max(max - min, 1)) * chartH;
    const pts = data.map((d, i) => [xOf(i), yOf(d.value)]);
    const peakIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

    // ~6 ticks, always including the endpoints, and never letting the
    // second-to-last tick crowd the final one.
    const n = data.length;
    const step = Math.max(1, Math.floor(n / 5));
    const ticks = [];
    for (let i = 0; i < n; i += step) ticks.push(i);
    if (ticks[ticks.length - 1] !== n - 1) {
      if (n - 1 - ticks[ticks.length - 1] < step * 0.5) ticks.pop();
      ticks.push(n - 1);
    }
    const spansYears = data[0].date.slice(0, 4) !== data[n - 1].date.slice(0, 4);
    return { max, min, pts, xOf, yOf, peakIdx, ticks, spansYears };
  }, [data, prevAvg, isPulse]);

  if (!data.length) {
    return (
      <div style={{ padding: "60px", textAlign: "center", color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
        {isPulse
          ? "No subscriber history for this window yet — daily counts come from the nightly channel snapshots."
          : "No chart data available"}
      </div>
    );
  }

  const metricLabel = metric === "views" ? "Views" : metric === "subscribers" ? "Subscribers" : "Watch Hours";
  const metricColor = metric === "views" ? "#00D1FF" : metric === "subscribers" ? "#00D1FF" : "#0090c8";
  const { max, pts, peakIdx, ticks, spansYears } = geom;

  const fmtDate = (iso, withYear) =>
    new Date(iso).toLocaleDateString('en-US',
      withYear ? { month: 'short', day: 'numeric', year: '2-digit' }
               : { month: 'short', day: 'numeric' });

  const linePoints = pts.map(p => `${p[0]},${p[1]}`).join(' ');
  const areaPoints = `${PAD.left},${VIEW_H - PAD.bottom} ${linePoints} ${VIEW_W - PAD.right},${VIEW_H - PAD.bottom}`;

  // Snap mouse x to the nearest data index.
  const handleMove = (e) => {
    const rect = svgWrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const chartW = VIEW_W - PAD.left - PAD.right;
    const t = Math.min(Math.max((relX - PAD.left) / chartW, 0), 1);
    setHoverIdx(Math.round(t * (data.length - 1)));
  };

  // Convert viewBox coords to CSS % for the HTML overlays (round markers).
  const pctX = i => `${(pts[i][0] / VIEW_W) * 100}%`;
  const pctY = i => `${(pts[i][1] / VIEW_H) * 100}%`;

  const total = isPulse ? (data[data.length - 1]?.value || 0) : data.reduce((sum, d) => sum + d.value, 0);
  const pulseGain = isPulse && data.length > 1 ? data[data.length - 1].value - data[0].value : null;
  const deltaPct = !isPulse && prevTotal && prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
  const deltaColor = deltaPct == null || Math.abs(deltaPct) < 0.5
    ? "var(--muted)" : deltaPct > 0 ? "var(--pos)" : "var(--neg)";

  const H = compact ? 190 : 320;
  return (
    <div style={{ padding: compact ? "16px 22px 20px" : "28px" }}>
      {/* The number IS the headline. One huge total, its pace vs the
          prior period as a chip, and an honest note on the source. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "14px", flexWrap: "wrap", marginBottom: compact ? "14px" : "22px" }}>
        <span style={{ fontSize: compact ? "30px" : "44px", fontWeight: "650", color: "var(--ink)", lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
          {fmtInt(total)}
        </span>
        <span style={{ fontSize: "15px", color: "var(--muted)" }}>
          {isPulse
            ? "subscribers"
            : isDaily
              ? `${metricLabel.toLowerCase()} / ${data.length} days`
              : `${metricLabel.toLowerCase()} across ${data.length} publish days`}
        </span>
        {isPulse && pulseGain != null && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "5px",
            fontSize: "13px", fontWeight: "600",
            color: pulseGain >= 0 ? "var(--pos)" : "var(--neg)",
            border: `1px solid ${pulseGain >= 0 ? "var(--pos)" : "var(--neg)"}`,
            borderRadius: "999px", padding: "3px 12px",
            fontVariantNumeric: "tabular-nums", opacity: 0.9,
          }}>
            {pulseGain >= 0 ? "↗ +" : "↘ "}{fmtInt(Math.abs(pulseGain))} this period
          </span>
        )}
        {deltaPct != null && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "5px",
            fontSize: "13px", fontWeight: "600", color: deltaColor,
            border: `1px solid ${deltaColor}`, borderRadius: "999px",
            padding: "3px 12px", fontVariantNumeric: "tabular-nums", opacity: 0.9,
          }}>
            {deltaPct > 0 ? "↗" : deltaPct < 0 ? "↘" : ""} {deltaPct > 0 ? "+" : ""}{deltaPct.toFixed(1)}% vs prior period
          </span>
        )}
        {prevAvg != null && prevAvg > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "11px", fontWeight: 600, color: "var(--muted)" }}>
            <span aria-hidden="true" style={{ width: 20, borderTop: '1px solid var(--border)', display: "inline-block", opacity: 0.7 }} />
            prior period pace
          </span>
        )}
        {!compact && (
          <span style={{ fontSize: "12px", color: "#67747b", marginLeft: "auto" }}>
            {isDaily ? "real daily totals from synced snapshots" : "grouped by publish day"}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "24px" }}>
        {/* y-axis */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingRight: "16px", borderRight: "1px solid var(--border)", fontSize: "12px", color: "var(--muted)", fontWeight: "600", height: `${H}px`, fontVariantNumeric: "tabular-nums" }}>
          <div>{fmtInt(max)}</div><div>{fmtInt(geom.min != null ? (max + geom.min) / 2 : max / 2)}</div><div>{fmtInt(geom.min || 0)}</div>
        </div>

        <div
          ref={svgWrapRef}
          style={{ flex: 1, position: "relative", height: `${H}px`, cursor: "crosshair" }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Tooltip */}
          {hoverIdx !== null && (
            <div style={{
              position: "absolute",
              left: pctX(hoverIdx),
              top: pctY(hoverIdx),
              transform: "translate(-50%, -100%)",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "24px",
              padding: "10px 14px",
              pointerEvents: "none",
              zIndex: 20,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              marginTop: "-12px",
              whiteSpace: "nowrap",
            }}>
              <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "600", marginBottom: "3px" }}>
                {new Date(data[hoverIdx].date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <div style={{ fontSize: "18px", fontWeight: "600", color: metricColor, fontVariantNumeric: "tabular-nums" }}>
                {fmtInt(data[hoverIdx].value)} <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 400 }}>{metricLabel.toLowerCase()}</span>
              </div>
            </div>
          )}

          {/* Crosshair + hover marker (HTML so they stay crisp and round) */}
          {hoverIdx !== null && (
            <>
              <div style={{ position: "absolute", left: pctX(hoverIdx), top: `${(PAD.top / VIEW_H) * 100}%`, bottom: `${(PAD.bottom / VIEW_H) * 100}%`, width: "1px", background: "rgba(255,255,255,0.15)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: pctX(hoverIdx), top: pctY(hoverIdx), width: "9px", height: "9px", borderRadius: "50%", background: metricColor, border: "2px solid var(--card)", transform: "translate(-50%, -50%)", pointerEvents: "none" }} />
            </>
          )}

          {/* Timeline annotations — the events that explain the bends
              ("changed thumbnails", "new editor"). Amber flags so they
              never collide with the data colours. */}
          {annotations.map((a, k) => {
            if (!data.length) return null;
            const t = new Date(a.annotation_date).getTime();
            let best = 0, bestDist = Infinity;
            data.forEach((d, i) => {
              const dist = Math.abs(new Date(d.date).getTime() - t);
              if (dist < bestDist) { bestDist = dist; best = i; }
            });
            if (bestDist > 5 * 86400000) return null; // outside the window
            return (
              <div key={`ann-${k}`} title={`${a.annotation_date} — ${a.label}`}
                style={{ position: "absolute", left: pctX(best), top: 0, bottom: `${(PAD.bottom / VIEW_H) * 100}%`, pointerEvents: "auto", cursor: "help" }}>
                <div style={{ position: "absolute", top: 12, bottom: 0, left: 0, width: 1, background: "var(--warn)", opacity: 0.4 }} />
                <div style={{ position: "absolute", top: 0, left: 0, transform: "translateX(-50%)", width: 9, height: 9, borderRadius: 2, background: "var(--warn)", rotate: "45deg" }} />
              </div>
            );
          })}

          {/* Milestone dots. Pulse: three big hollow rings along the ride
              + a lime-filled end dot, per the chosen reference. Standard:
              hollow rings at start/end, peak in the stat-green. */}
          {isPulse ? (
            <>
              {[Math.floor(data.length * 0.25), Math.floor(data.length * 0.55), Math.floor(data.length * 0.8)].map(i => (
                <div key={`pr-${i}`} style={{ position: "absolute", left: pctX(i), top: pctY(i), width: "22px", height: "22px", borderRadius: "50%", background: "#0b1113", border: `5px solid ${metricColor}`, transform: "translate(-50%, -50%)", pointerEvents: "none", boxSizing: "border-box" }} />
              ))}
              <div style={{ position: "absolute", left: pctX(data.length - 1), top: pctY(data.length - 1), width: "24px", height: "24px", borderRadius: "50%", background: "#0b1113", border: "5px solid #0b1113", outline: `2px solid ${metricColor}`, transform: "translate(-50%, -50%)", pointerEvents: "none", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "var(--pos)" }} />
              </div>
            </>
          ) : (
            <>
              {[0, data.length - 1].filter(i => i !== peakIdx).map(i => (
                <div key={`ms-${i}`} style={{ position: "absolute", left: pctX(i), top: pctY(i), width: "11px", height: "11px", borderRadius: "50%", background: "var(--card)", border: `3px solid ${metricColor}`, transform: "translate(-50%, -50%)", pointerEvents: "none", boxSizing: "border-box" }} />
              ))}
              <div title={`Peak: ${fmtInt(data[peakIdx].value)} on ${fmtDate(data[peakIdx].date, true)}`}
                style={{ position: "absolute", left: pctX(peakIdx), top: pctY(peakIdx), width: "11px", height: "11px", borderRadius: "50%", background: "var(--card)", border: "3px solid var(--pos)", transform: "translate(-50%, -50%)", pointerEvents: "none", boxSizing: "border-box" }} />
            </>
          )}

          <svg width="100%" height={H} style={{ display: "block" }} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: metricColor, stopOpacity: 0.38 }} />
                <stop offset="100%" style={{ stopColor: metricColor, stopOpacity: 0.02 }} />
              </linearGradient>
            </defs>

            {!isPulse && prevAvg != null && prevAvg > 0 && (
              <line
                x1={PAD.left} x2={VIEW_W - PAD.right}
                y1={geom.yOf(prevAvg)} y2={geom.yOf(prevAvg)}
                stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="7,7"
                opacity="0.55" vectorEffect="non-scaling-stroke" />
            )}

            {[0, 0.5, 1].map(f => (
              <line key={f}
                x1={PAD.left} x2={VIEW_W - PAD.right}
                y1={PAD.top + (VIEW_H - PAD.top - PAD.bottom) * f}
                y2={PAD.top + (VIEW_H - PAD.top - PAD.bottom) * f}
                stroke="var(--border)" strokeWidth="1" strokeDasharray="4,6" opacity="0.5"
                vectorEffect="non-scaling-stroke" />
            ))}

            {isPulse ? (
              <>
                {/* Pulse style (the reference the user chose): smooth flow,
                    a wide soft under-stroke for neon depth, thick core line,
                    area fading beneath. Milestone rings are HTML overlays
                    (SVG circles stretch under preserveAspectRatio="none"). */}
                <path d={`${smoothPath(pts)} L ${pts[pts.length - 1][0]} ${VIEW_H - PAD.bottom} L ${pts[0][0]} ${VIEW_H - PAD.bottom} Z`}
                  fill="url(#areaGradient)" style={{ opacity: 0, animation: "fadeIn 0.8s ease-out 0.6s forwards" }} />
                <path d={smoothPath(pts)} fill="none" stroke={metricColor}
                  strokeWidth="16" strokeLinecap="round" strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke" opacity="0.16" />
                <path d={smoothPath(pts)} fill="none" stroke={metricColor}
                  strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  pathLength="1" strokeDasharray="1" strokeDashoffset="1"
                  style={{ animation: "chartDraw 1.2s ease-out 0.3s forwards" }} />
              </>
            ) : (
              <>
                <polygon points={areaPoints} fill="url(#areaGradient)"
                  style={{ opacity: 0, animation: "fadeIn 0.8s ease-out 0.8s forwards" }} />

                <polyline points={linePoints} fill="none" stroke={metricColor}
                  strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  pathLength="1" strokeDasharray="1" strokeDashoffset="1"
                  style={{ animation: "chartDraw 1.2s ease-out 0.3s forwards" }} />
              </>
            )}
          </svg>

          {/* x-axis labels as HTML — SVG text under preserveAspectRatio:none
              stretches with the viewport; HTML stays legible. Endpoints are
              edge-anchored so nothing clips. */}
          {(isMobile ? [0, data.length - 1] : ticks).map((i, k) => {
            const isFirst = i === 0;
            const isLast = i === data.length - 1;
            return (
              <div key={k} style={{
                position: "absolute",
                left: isLast ? "auto" : pctX(i),
                right: isLast ? 0 : "auto",
                bottom: "2px",
                transform: isFirst || isLast ? "none" : "translateX(-50%)",
                fontSize: "10px", fontWeight: 600, color: "var(--muted)",
                whiteSpace: "nowrap", pointerEvents: "none",
              }}>
                {fmtDate(data[i].date, spansYears)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary stats — siblings of the chart, so they can't be clipped by
          its fixed height. No coloured border-caps; the colour is the
          numeral, and the peak's green matches the dot on the line.
          Hidden in compact mode: the headline number already summarises. */}
      {!compact && <div style={{ marginTop: "20px", marginLeft: "60px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
        {[
          { label: "TOTAL", value: fmtInt(total), color: metricColor },
          { label: "PEAK", value: fmtInt(max), color: "var(--pos)" },
          { label: "AVERAGE", value: fmtInt(total / data.length), color: "var(--muted)" },
        ].map(s => (
          <div key={s.label} style={{ background: "var(--input-bg)", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "600", letterSpacing: "var(--track-label)", fontFamily: "var(--font-label)", marginBottom: "4px" }}>{s.label}</div>
            <div style={{ fontSize: "20px", fontWeight: "600", color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
          </div>
        ))}
      </div>}
    </div>
  );
};

export default Chart;
