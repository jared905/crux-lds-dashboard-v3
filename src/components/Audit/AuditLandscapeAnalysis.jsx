import { useMemo } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

const COLORS = {
  primary: "#3b82f6",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  purple: "#8b5cf6",
  pink: "#ec4899",
  audited: "#60a5fa",
};

const SCATTER_COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

const card = (extra = {}) => ({
  background: "#1E1E1E",
  borderRadius: "8px",
  border: "1px solid #333",
  padding: "24px",
  ...extra,
});

export default function AuditLandscapeAnalysis({ audit }) {
  const landscape = audit.landscape_data;

  if (!landscape) {
    return (
      <div style={card({ textAlign: "center", padding: "60px" })}>
        <div style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>No Landscape Data</div>
        <div style={{ fontSize: "13px", color: "#9E9E9E" }}>
          Landscape analysis was not included in this audit. Run a new audit with competitors and enable "Include Landscape Analysis."
        </div>
      </div>
    );
  }

  const positioning = landscape.positioning;
  const saturation = landscape.saturation;
  const formatLandscape = landscape.format_landscape;
  const advantages = landscape.competitive_advantages;
  const narrative = landscape.narrative;

  // Scatter chart data
  const scatterData = useMemo(() => {
    if (!positioning?.positions?.length) return [];
    return positioning.positions.map(p => ({
      x: (p.x || 0) * 100,
      y: (p.y || 0) * 100,
      name: p.name,
      isAudited: p.is_audited,
    }));
  }, [positioning]);

  const CustomScatterTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: "#252525", border: "1px solid #444", borderRadius: "6px", padding: "8px 12px", fontSize: "12px" }}>
        <div style={{ fontWeight: "600", color: d.isAudited ? COLORS.audited : "#E0E0E0" }}>
          {d.name} {d.isAudited ? "(You)" : ""}
        </div>
      </div>
    );
  };

  // Format narrative with paragraphs
  const renderNarrative = (text) => {
    if (!text) return null;
    return text.split("\n\n").map((para, i) => (
      <p key={i} style={{ margin: "0 0 12px 0", lineHeight: "1.7" }}>{para}</p>
    ));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Narrative */}
      {narrative && (
        <div style={card()}>
          <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px" }}>Landscape Overview</div>
          <div style={{ fontSize: "14px", color: "#E0E0E0", lineHeight: "1.7" }}>
            {renderNarrative(narrative)}
          </div>
        </div>
      )}

      {/* Positioning Scatter */}
      {scatterData.length > 0 && positioning && (
        <div style={card()}>
          <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "4px" }}>Competitive Positioning</div>
          <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "16px" }}>
            {positioning.x_axis?.label} vs {positioning.y_axis?.label}
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 20, right: 40, bottom: 40, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                type="number"
                dataKey="x"
                domain={[0, 100]}
                tick={{ fill: "#9E9E9E", fontSize: 11 }}
                label={{ value: positioning.x_axis?.label, position: "bottom", fill: "#9E9E9E", fontSize: 12, offset: 20 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[0, 100]}
                tick={{ fill: "#9E9E9E", fontSize: 11 }}
                label={{ value: positioning.y_axis?.label, angle: -90, position: "insideLeft", fill: "#9E9E9E", fontSize: 12 }}
              />
              <Tooltip content={<CustomScatterTooltip />} />
              <Scatter data={scatterData}>
                {scatterData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.isAudited ? COLORS.audited : SCATTER_COLORS[i % SCATTER_COLORS.length]}
                    r={entry.isAudited ? 10 : 7}
                    stroke={entry.isAudited ? "#fff" : "none"}
                    strokeWidth={entry.isAudited ? 2 : 0}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px", justifyContent: "center" }}>
            {scatterData.map((entry, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                <div style={{
                  width: entry.isAudited ? "12px" : "10px",
                  height: entry.isAudited ? "12px" : "10px",
                  borderRadius: "50%",
                  background: entry.isAudited ? COLORS.audited : SCATTER_COLORS[i % SCATTER_COLORS.length],
                  border: entry.isAudited ? "2px solid #fff" : "none",
                }} />
                <span style={{ color: entry.isAudited ? COLORS.audited : "#9E9E9E" }}>
                  {entry.name} {entry.isAudited ? "(You)" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saturation / White Space */}
      {saturation && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Oversaturated */}
          <div style={card()}>
            <div style={{ fontSize: "14px", fontWeight: "700", color: COLORS.danger, marginBottom: "12px" }}>
              Oversaturated Areas
            </div>
            {saturation.oversaturated?.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {saturation.oversaturated.map((item, i) => (
                  <div key={i} style={{
                    padding: "10px 12px", background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "8px",
                  }}>
                    <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>
                      {item.topic_or_format}
                      <span style={{ fontSize: "11px", color: "#9E9E9E", marginLeft: "8px" }}>
                        {item.channels_active} channels active
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E" }}>{item.evidence}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "13px", color: "#9E9E9E" }}>No oversaturated areas identified</div>
            )}
          </div>

          {/* White Space */}
          <div style={card()}>
            <div style={{ fontSize: "14px", fontWeight: "700", color: COLORS.success, marginBottom: "12px" }}>
              White Space Opportunities
            </div>
            {saturation.white_space?.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {saturation.white_space.map((item, i) => (
                  <div key={i} style={{
                    padding: "10px 12px", background: "rgba(34, 197, 94, 0.08)",
                    border: "1px solid rgba(34, 197, 94, 0.2)", borderRadius: "8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "600" }}>{item.topic_or_format}</span>
                      {item.potential && (
                        <span style={{
                          fontSize: "10px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px",
                          background: item.potential === "high" ? "#166534" : item.potential === "medium" ? "#854d0e" : "#333",
                          color: item.potential === "high" ? "#22c55e" : item.potential === "medium" ? "#f59e0b" : "#9E9E9E",
                        }}>
                          {item.potential}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E" }}>{item.evidence}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "13px", color: "#9E9E9E" }}>No white space identified</div>
            )}
          </div>
        </div>
      )}

      {/* Format Landscape Grid */}
      {formatLandscape?.length > 0 && (
        <div style={card()}>
          <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px" }}>Format Landscape</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #444" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#9E9E9E" }}>Channel</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#9E9E9E" }}>Dominant Format</th>
                  <th style={{ textAlign: "center", padding: "8px 12px", color: "#9E9E9E" }}>Format Diversity</th>
                  <th style={{ textAlign: "center", padding: "8px 12px", color: "#9E9E9E" }}>Shorts Adoption</th>
                </tr>
              </thead>
              <tbody>
                {formatLandscape.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #333" }}>
                    <td style={{ padding: "10px 12px", fontWeight: "600" }}>{row.channel}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: "4px",
                        background: "#252525", border: "1px solid #444",
                        fontSize: "12px",
                      }}>
                        {row.dominant_format}
                      </span>
                    </td>
                    <td style={{ textAlign: "center", padding: "10px 12px" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "600",
                        background: row.format_diversity === "high" ? "#166534" : row.format_diversity === "medium" ? "#854d0e" : "#333",
                        color: row.format_diversity === "high" ? "#22c55e" : row.format_diversity === "medium" ? "#f59e0b" : "#9E9E9E",
                      }}>
                        {row.format_diversity}
                      </span>
                    </td>
                    <td style={{ textAlign: "center", padding: "10px 12px" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "600",
                        background: row.shorts_adoption === "heavy" ? "rgba(41, 98, 255, 0.15)" : row.shorts_adoption === "moderate" ? "#854d0e" : "#333",
                        color: row.shorts_adoption === "heavy" ? "#60a5fa" : row.shorts_adoption === "moderate" ? "#f59e0b" : "#9E9E9E",
                      }}>
                        {row.shorts_adoption}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Competitive Advantages */}
      {advantages && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div style={card()}>
            <div style={{ fontSize: "14px", fontWeight: "700", color: COLORS.success, marginBottom: "12px" }}>
              Your Strengths
            </div>
            {advantages.audited_channel_strengths?.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "#E0E0E0", lineHeight: "1.8" }}>
                {advantages.audited_channel_strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: "13px", color: "#9E9E9E" }}>None identified</div>
            )}
          </div>
          <div style={card()}>
            <div style={{ fontSize: "14px", fontWeight: "700", color: COLORS.warning, marginBottom: "12px" }}>
              Your Vulnerabilities
            </div>
            {advantages.audited_channel_vulnerabilities?.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "#E0E0E0", lineHeight: "1.8" }}>
                {advantages.audited_channel_vulnerabilities.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: "13px", color: "#9E9E9E" }}>None identified</div>
            )}
          </div>
        </div>
      )}

      {/* Biggest Threat */}
      {advantages?.biggest_threat && (
        <div style={card({ border: "1px solid rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.05)" })}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: COLORS.danger, marginBottom: "8px" }}>
            Biggest Competitive Threat
          </div>
          <div style={{ fontSize: "14px", color: "#E0E0E0", lineHeight: "1.6" }}>
            {advantages.biggest_threat}
          </div>
        </div>
      )}
    </div>
  );
}
