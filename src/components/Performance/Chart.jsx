import React, { useState, useMemo } from "react";
import { fmtInt } from "../../lib/formatters.js";

const Chart = ({ rows, metric = "views" }) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const data = useMemo(() => {
    if (!rows.length) return [];
    const byDate = {};
    rows.forEach(r => {
      if (r.publishDate) {
        const date = r.publishDate.split('T')[0];
        const value = metric === "views" ? (r.views || 0) : (r.watchHours || 0);
        byDate[date] = (byDate[date] || 0) + value;
      }
    });
    return Object.entries(byDate).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, metric]);

  if (!data.length) return <div style={{ padding: "60px", textAlign: "center", color: "#9E9E9E" }}>No chart data available</div>;

  const max = Math.max(...data.map(d => d.value), 1);
  const metricLabel = metric === "views" ? "Views" : "Watch Hours";
  const metricColor = metric === "views" ? "#3b82f6" : "#8b5cf6";
  const height = 320;
  const paddingLeft = 20;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;

  return (
    <div style={{ padding: "28px" }}>
      <div style={{ display: "flex", gap: "24px" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingRight: "16px", borderRight: "2px solid #333", fontSize: "12px", color: "#9E9E9E", fontWeight: "600", height: `${height}px` }}>
          <div>{fmtInt(max)}</div><div>{fmtInt(max / 2)}</div><div>0</div>
        </div>
        <div style={{ flex: 1, position: "relative", height: `${height}px` }}>
          {/* Tooltip */}
          {hoveredPoint !== null && (
            <div style={{
              position: "absolute",
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
              transform: "translate(-50%, -100%)",
              background: "#1E1E1E",
              border: `2px solid ${metricColor}`,
              borderRadius: "8px",
              padding: "12px 16px",
              pointerEvents: "none",
              zIndex: 1000,
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              marginTop: "-10px"
            }}>
              <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", marginBottom: "4px" }}>
                {new Date(data[hoveredPoint].date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: metricColor }}>
                {fmtInt(data[hoveredPoint].value)}
              </div>
              <div style={{ fontSize: "11px", color: "#9E9E9E", marginTop: "2px" }}>
                {metricLabel}
              </div>
            </div>
          )}

          <svg width="100%" height={height} style={{ display: "block" }} viewBox="0 0 1000 320" preserveAspectRatio="none">
            <defs>
              <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: metricColor, stopOpacity: 0.4 }} />
                <stop offset="100%" style={{ stopColor: metricColor, stopOpacity: 0.05 }} />
              </linearGradient>
              <filter id="chartGlow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Grid lines */}
            <line x1={paddingLeft} y1={paddingTop + (height - paddingTop - paddingBottom) * 0} x2={1000 - paddingRight} y2={paddingTop + (height - paddingTop - paddingBottom) * 0} stroke="#333" strokeWidth="1" strokeDasharray="5,5" opacity="0.3" />
            <line x1={paddingLeft} y1={paddingTop + (height - paddingTop - paddingBottom) * 0.5} x2={1000 - paddingRight} y2={paddingTop + (height - paddingTop - paddingBottom) * 0.5} stroke="#333" strokeWidth="1" strokeDasharray="5,5" opacity="0.3" />
            <line x1={paddingLeft} y1={paddingTop + (height - paddingTop - paddingBottom) * 1} x2={1000 - paddingRight} y2={paddingTop + (height - paddingTop - paddingBottom) * 1} stroke="#333" strokeWidth="1" strokeDasharray="5,5" opacity="0.3" />

            {(() => {
              const width = 1000;
              const chartWidth = width - paddingLeft - paddingRight;
              const chartHeight = height - paddingTop - paddingBottom;

              const points = data.map((d, i) => {
                const x = paddingLeft + (i / Math.max(data.length - 1, 1)) * chartWidth;
                const y = paddingTop + chartHeight - ((d.value / max) * chartHeight);
                return `${x},${y}`;
              }).join(' ');

              const areaPoints = `${paddingLeft},${height - paddingBottom} ${points} ${paddingLeft + chartWidth},${height - paddingBottom}`;

              return (
                <>
                  {/* Area fill */}
                  <polygon points={areaPoints} fill="url(#areaGradient)" vectorEffect="non-scaling-stroke" />

                  {/* Line */}
                  <polyline points={points} fill="none" stroke={metricColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" filter="url(#chartGlow)" />

                  {/* Data points */}
                  {data.map((d, i) => {
                    const x = paddingLeft + (i / Math.max(data.length - 1, 1)) * chartWidth;
                    const y = paddingTop + chartHeight - ((d.value / max) * chartHeight);
                    const isFirstOrLast = i === 0 || i === data.length - 1;
                    const isHigh = d.value > max * 0.7;
                    const isHovered = hoveredPoint === i;

                    return (
                      <g key={i}>
                        <circle
                          cx={x}
                          cy={y}
                          r={isHovered ? "10" : isFirstOrLast ? "7" : "6"}
                          fill={isHigh ? "#10b981" : metricColor}
                          stroke="#1E1E1E"
                          strokeWidth="2"
                          style={{ cursor: "pointer", transition: "all 0.2s" }}
                          vectorEffect="non-scaling-stroke"
                          filter={isHovered ? "url(#chartGlow)" : "none"}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                            const svgX = (x / 1000) * rect.width;
                            setHoveredPoint(i);
                            setTooltipPos({ x: svgX, y: (y / 320) * rect.height });
                          }}
                          onMouseLeave={() => setHoveredPoint(null)}
                        />

                        {/* Show date label for first, last, and every ~10th point */}
                        {(isFirstOrLast || i % Math.max(Math.floor(data.length / 8), 1) === 0) && (
                          <text
                            x={x}
                            y={height - paddingBottom + 18}
                            textAnchor="middle"
                            fill="#9E9E9E"
                            fontSize="10"
                            fontWeight="600"
                          >
                            {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </>
              );
            })()}
          </svg>

          {/* Summary stats below chart */}
          <div style={{ marginTop: "20px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            <div style={{ background: "#252525", padding: "12px", borderRadius: "8px", borderLeft: `3px solid ${metricColor}` }}>
              <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", marginBottom: "4px" }}>TOTAL</div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: metricColor }}>{fmtInt(data.reduce((sum, d) => sum + d.value, 0))}</div>
            </div>
            <div style={{ background: "#252525", padding: "12px", borderRadius: "8px", borderLeft: "3px solid #10b981" }}>
              <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", marginBottom: "4px" }}>PEAK</div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: "#10b981" }}>{fmtInt(max)}</div>
            </div>
            <div style={{ background: "#252525", padding: "12px", borderRadius: "8px", borderLeft: "3px solid #ec4899" }}>
              <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "600", marginBottom: "4px" }}>AVERAGE</div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: "#ec4899" }}>{fmtInt(data.reduce((sum, d) => sum + d.value, 0) / data.length)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chart;
