import React, { useMemo } from "react";
import { Rocket, Wrench, Coffee, XCircle } from "lucide-react";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

export default function GrowKillMatrix({ patterns }) {
  // Classify patterns into quadrants based on effort vs opportunity
  const quadrants = useMemo(() => {
    if (!patterns || patterns.length === 0) {
      return { grow: [], optimize: [], maintain: [], stop: [] };
    }

    // Calculate median opportunity to determine high vs low return threshold
    const opportunities = patterns.map(p => p.opportunity || 0).sort((a, b) => a - b);
    const medianOpportunity = opportunities[Math.floor(opportunities.length / 2)];

    const classified = {
      grow: [],      // High Return, Low Effort - Priority 1
      optimize: [],  // High Return, High Effort - Priority 2
      maintain: [],  // Low Return, Low Effort - Priority 3
      stop: []       // Topic Elimination - Deprioritize
    };

    patterns.forEach(pattern => {
      // Skip analysis-only patterns (no actionable recommendations)
      if (pattern.type === "Format Ecosystem Analysis" || pattern.opportunity === 0) {
        return;
      }

      // Topic Elimination always goes to STOP quadrant
      if (pattern.type === "Topic Elimination") {
        classified.stop.push(pattern);
        return;
      }

      // Optimization patterns (Packaging, Retention, Upload Velocity) always go to OPTIMIZE
      if (pattern.type === "Packaging Optimization" ||
          pattern.type === "Retention Optimization" ||
          pattern.type === "Upload Velocity") {
        classified.optimize.push(pattern);
        return;
      }

      const isHighReturn = (pattern.opportunity || 0) >= medianOpportunity;
      const isLowEffort = pattern.effort === "Low";
      const isMediumEffort = pattern.effort === "Medium";

      if (isHighReturn && isLowEffort) {
        classified.grow.push(pattern);
      } else if (isHighReturn && !isLowEffort) {
        classified.optimize.push(pattern);
      } else if (!isHighReturn && (isLowEffort || isMediumEffort)) {
        classified.maintain.push(pattern);
      } else {
        classified.stop.push(pattern);
      }
    });

    return classified;
  }, [patterns]);

  const QuadrantCard = ({ title, icon: Icon, color, items, description, priority }) => (
    <div style={{
      background: "#252525",
      border: `2px solid ${color}40`,
      borderRadius: "12px",
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      minHeight: "280px"
    }}>
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <Icon size={20} style={{ color }} />
          <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>{title}</div>
        </div>
        <div style={{ fontSize: "11px", color: "#888", marginBottom: "6px" }}>{description}</div>
        <div style={{
          fontSize: "10px",
          color,
          background: `${color}20`,
          padding: "4px 8px",
          borderRadius: "4px",
          display: "inline-block",
          fontWeight: "600"
        }}>
          {priority}
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#555",
          fontSize: "12px",
          fontStyle: "italic"
        }}>
          No items in this quadrant
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {items.map((item, idx) => (
            <div
              key={idx}
              style={{
                background: "#1E1E1E",
                border: "1px solid #333",
                borderRadius: "6px",
                padding: "12px"
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff", marginBottom: "6px" }}>
                {item.finding}
              </div>
              <div style={{ fontSize: "11px", color: "#b0b0b0", marginBottom: "6px" }}>
                {item.recommendation}
              </div>
              {item.action && (
                <div style={{
                  fontSize: "11px",
                  color: "#fff",
                  background: "#0a0a0a",
                  border: `1px solid ${color}40`,
                  borderLeft: `2px solid ${color}`,
                  padding: "8px 10px",
                  borderRadius: "4px",
                  marginBottom: "6px",
                  lineHeight: "1.4"
                }}>
                  <strong style={{ color, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px" }}>→</strong> {item.action}
                </div>
              )}
              {item.videoExamples && item.videoExamples.length > 0 && (
                <div style={{ marginTop: "8px", marginBottom: "8px" }}>
                  <div style={{ fontSize: "9px", color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                    Example Videos:
                  </div>
                  {item.videoExamples.map((video, vIdx) => (
                    <div
                      key={vIdx}
                      style={{
                        background: "#0d0d0d",
                        border: "1px solid #222",
                        borderRadius: "4px",
                        padding: "6px 8px",
                        marginBottom: "4px",
                        fontSize: "10px"
                      }}
                    >
                      <div style={{ color: "#e0e0e0", marginBottom: "3px", fontSize: "10px" }}>
                        {video.title}
                      </div>
                      <div style={{ display: "flex", gap: "10px", fontSize: "9px", color: "#777" }}>
                        <span>{fmtInt(video.views)} views</span>
                        <span>{fmtPct(video.ctr)} CTR</span>
                        <span>{fmtPct(video.retention)} retention</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: "12px", fontSize: "10px", color: "#666" }}>
                <div>Impact: <span style={{ color: "#10b981", fontWeight: "600" }}>+{fmtInt(item.opportunity)}</span></div>
                <div>Effort: <span style={{ color: color, fontWeight: "600" }}>{item.effort}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginTop: "24px"
    }}>
      <div style={{ marginBottom: "24px" }}>
        <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", marginBottom: "8px" }}>
          Strategic Prioritization Matrix
        </div>
        <div style={{ fontSize: "14px", color: "#9E9E9E" }}>
          What to grow, optimize, maintain, and stop
        </div>
      </div>

      {/* 2x2 Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "16px"
      }}>
        <QuadrantCard
          title="GROW"
          icon={Rocket}
          color="#10b981"
          items={quadrants.grow}
          description="Quick wins - High impact, low effort"
          priority="Priority 1: Execute Now"
        />

        <QuadrantCard
          title="OPTIMIZE"
          icon={Wrench}
          color="#f59e0b"
          items={quadrants.optimize}
          description="Worth the investment - High impact, high effort"
          priority="Priority 2: Plan & Execute"
        />

        <QuadrantCard
          title="MAINTAIN"
          icon={Coffee}
          color="#60a5fa"
          items={quadrants.maintain}
          description="Small tweaks - Low impact, low effort"
          priority="Priority 3: Nice to Have"
        />

        <QuadrantCard
          title="STOP"
          icon={XCircle}
          color="#ef4444"
          items={quadrants.stop}
          description="Topics to eliminate - Stop making this content"
          priority="Priority 4: Deprioritize"
        />
      </div>

      {/* Matrix Explanation */}
      <div style={{
        marginTop: "24px",
        padding: "16px",
        background: "#252525",
        borderRadius: "8px",
        fontSize: "12px",
        color: "#888"
      }}>
        <div style={{ fontWeight: "600", color: "#fff", marginBottom: "8px" }}>How to Use This Matrix:</div>
        <ul style={{ margin: 0, paddingLeft: "20px", lineHeight: "1.8" }}>
          <li><strong style={{ color: "#10b981" }}>GROW:</strong> Execute these immediately. Low effort, high return = best ROI</li>
          <li><strong style={{ color: "#f59e0b" }}>OPTIMIZE:</strong> Plan resources for these. High impact justifies the effort</li>
          <li><strong style={{ color: "#60a5fa" }}>MAINTAIN:</strong> Do if you have spare capacity. Small wins add up</li>
          <li><strong style={{ color: "#ef4444" }}>STOP:</strong> Stop making this content. Remove from production calendar</li>
        </ul>
      </div>
    </div>
  );
}
