import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
const AUDITED_COLOR = "#60a5fa";

const card = (extra = {}) => ({
  background: "#1E1E1E",
  borderRadius: "8px",
  border: "1px solid #333",
  padding: "24px",
  ...extra,
});

const fmtNum = (n) => (n || 0).toLocaleString();
const fmtPct = (n) => ((n || 0) * 100).toFixed(2) + "%";

export default function AuditCompetitiveBenchmark({ audit }) {
  const benchmark = audit.benchmark_data || {};
  const headToHead = benchmark.head_to_head || [];
  const channelMetrics = benchmark.channel_metrics || {};
  const snapshot = audit.channel_snapshot || {};

  // Build comparison data for charts
  const metricComparison = useMemo(() => {
    if (!headToHead.length) return [];
    const allChannels = [
      {
        name: snapshot.name || "Your Channel",
        avgViews: channelMetrics.avgViews || 0,
        avgEngagement: channelMetrics.avgEngagement || 0,
        uploadFrequency: channelMetrics.uploadFrequency || 0,
        subscribers: snapshot.subscriber_count || 0,
        isAudited: true,
      },
      ...headToHead.map(c => ({
        name: c.name,
        avgViews: c.avgViews || 0,
        avgEngagement: c.avgEngagement || 0,
        uploadFrequency: c.uploadFrequency || 0,
        subscribers: c.subscriber_count || 0,
        isAudited: false,
      })),
    ];
    return allChannels;
  }, [headToHead, channelMetrics, snapshot]);

  // Views comparison bar data
  const viewsData = useMemo(() =>
    metricComparison.map(c => ({
      name: c.name.length > 15 ? c.name.slice(0, 15) + "..." : c.name,
      fullName: c.name,
      views: c.avgViews,
      isAudited: c.isAudited,
    })),
    [metricComparison]
  );

  // Engagement comparison bar data
  const engagementData = useMemo(() =>
    metricComparison.map(c => ({
      name: c.name.length > 15 ? c.name.slice(0, 15) + "..." : c.name,
      fullName: c.name,
      engagement: Math.round(c.avgEngagement * 10000) / 100,
      isAudited: c.isAudited,
    })),
    [metricComparison]
  );

  // Upload frequency comparison
  const cadenceData = useMemo(() =>
    metricComparison.map(c => ({
      name: c.name.length > 15 ? c.name.slice(0, 15) + "..." : c.name,
      fullName: c.name,
      frequency: c.uploadFrequency,
      isAudited: c.isAudited,
    })),
    [metricComparison]
  );

  // Radar chart data (normalized 0-100)
  const radarData = useMemo(() => {
    if (!metricComparison.length) return [];
    const maxViews = Math.max(...metricComparison.map(c => c.avgViews), 1);
    const maxEng = Math.max(...metricComparison.map(c => c.avgEngagement), 0.001);
    const maxFreq = Math.max(...metricComparison.map(c => c.uploadFrequency), 0.1);
    const maxSubs = Math.max(...metricComparison.map(c => c.subscribers), 1);

    return [
      { metric: "Avg Views", ...Object.fromEntries(metricComparison.map(c => [c.name, Math.round((c.avgViews / maxViews) * 100)])) },
      { metric: "Engagement", ...Object.fromEntries(metricComparison.map(c => [c.name, Math.round((c.avgEngagement / maxEng) * 100)])) },
      { metric: "Cadence", ...Object.fromEntries(metricComparison.map(c => [c.name, Math.round((c.uploadFrequency / maxFreq) * 100)])) },
      { metric: "Subscribers", ...Object.fromEntries(metricComparison.map(c => [c.name, Math.round((c.subscribers / maxSubs) * 100)])) },
    ];
  }, [metricComparison]);

  // Content format comparison
  const formatData = useMemo(() => {
    if (!headToHead.length) return [];
    const formats = ["tutorial", "review", "vlog", "comparison", "listicle", "challenge"];
    return formats.map(fmt => {
      const row = { format: fmt };
      headToHead.forEach(c => {
        row[c.name] = c.contentFormats?.[fmt]?.pct || 0;
      });
      return row;
    });
  }, [headToHead]);

  // Title pattern comparison
  const patternData = useMemo(() => {
    if (!headToHead.length) return [];
    const patterns = ["question", "number", "caps_emphasis", "brackets", "first_person", "power_word"];
    return patterns.map(p => {
      const row = { pattern: p.replace("_", " ") };
      headToHead.forEach(c => {
        row[c.name] = c.titlePatterns?.[p]?.pct || 0;
      });
      return row;
    });
  }, [headToHead]);

  if (!headToHead.length) {
    return (
      <div style={card({ textAlign: "center", padding: "60px" })}>
        <div style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>No Competitor Data</div>
        <div style={{ fontSize: "13px", color: "#9E9E9E" }}>
          No competitors were specified for this audit. Run a new audit with competitors to see head-to-head analysis.
        </div>
      </div>
    );
  }

  const CustomBarTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: "#252525", border: "1px solid #444", borderRadius: "6px", padding: "8px 12px", fontSize: "12px" }}>
        <div style={{ fontWeight: "600", marginBottom: "4px" }}>{d.fullName}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color }}>
            {p.name}: {typeof p.value === "number" && p.value > 100 ? fmtNum(p.value) : p.value}{p.unit || ""}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Head-to-Head Summary Table */}
      <div style={card()}>
        <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px" }}>Head-to-Head Comparison</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #444" }}>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "#9E9E9E", fontWeight: "600" }}>Channel</th>
                <th style={{ textAlign: "right", padding: "8px 12px", color: "#9E9E9E", fontWeight: "600" }}>Subscribers</th>
                <th style={{ textAlign: "right", padding: "8px 12px", color: "#9E9E9E", fontWeight: "600" }}>Avg Views</th>
                <th style={{ textAlign: "right", padding: "8px 12px", color: "#9E9E9E", fontWeight: "600" }}>Engagement</th>
                <th style={{ textAlign: "right", padding: "8px 12px", color: "#9E9E9E", fontWeight: "600" }}>Uploads/Week</th>
                <th style={{ textAlign: "right", padding: "8px 12px", color: "#9E9E9E", fontWeight: "600" }}>Shorts %</th>
              </tr>
            </thead>
            <tbody>
              {/* Audited channel row */}
              <tr style={{ borderBottom: "1px solid #333", background: "rgba(41, 98, 255, 0.08)" }}>
                <td style={{ padding: "10px 12px", fontWeight: "600" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {snapshot.thumbnail_url && (
                      <img src={snapshot.thumbnail_url} alt="" style={{ width: "24px", height: "24px", borderRadius: "50%" }} />
                    )}
                    <span style={{ color: AUDITED_COLOR }}>{snapshot.name || "Your Channel"}</span>
                  </div>
                </td>
                <td style={{ textAlign: "right", padding: "10px 12px" }}>{fmtNum(snapshot.subscriber_count)}</td>
                <td style={{ textAlign: "right", padding: "10px 12px" }}>{fmtNum(channelMetrics.avgViews)}</td>
                <td style={{ textAlign: "right", padding: "10px 12px" }}>{fmtPct(channelMetrics.avgEngagement)}</td>
                <td style={{ textAlign: "right", padding: "10px 12px" }}>{channelMetrics.uploadFrequency}</td>
                <td style={{ textAlign: "right", padding: "10px 12px" }}>—</td>
              </tr>
              {/* Competitor rows */}
              {headToHead.map((c, i) => {
                const viewsRatio = channelMetrics.avgViews && c.avgViews ? channelMetrics.avgViews / c.avgViews : null;
                const engRatio = channelMetrics.avgEngagement && c.avgEngagement ? channelMetrics.avgEngagement / c.avgEngagement : null;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #333" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {c.thumbnail_url && (
                          <img src={c.thumbnail_url} alt="" style={{ width: "24px", height: "24px", borderRadius: "50%" }} />
                        )}
                        {c.name}
                      </div>
                    </td>
                    <td style={{ textAlign: "right", padding: "10px 12px" }}>{fmtNum(c.subscriber_count)}</td>
                    <td style={{
                      textAlign: "right", padding: "10px 12px",
                      color: viewsRatio && viewsRatio >= 1.2 ? "#22c55e" : viewsRatio && viewsRatio < 0.8 ? "#ef4444" : "#E0E0E0",
                    }}>
                      {fmtNum(c.avgViews)}
                    </td>
                    <td style={{
                      textAlign: "right", padding: "10px 12px",
                      color: engRatio && engRatio >= 1.2 ? "#22c55e" : engRatio && engRatio < 0.8 ? "#ef4444" : "#E0E0E0",
                    }}>
                      {fmtPct(c.avgEngagement)}
                    </td>
                    <td style={{ textAlign: "right", padding: "10px 12px" }}>{c.uploadFrequency}</td>
                    <td style={{ textAlign: "right", padding: "10px 12px" }}>{c.contentMix?.shortsRatio || 0}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: "11px", color: "#666", marginTop: "8px" }}>
          Green = you're ahead, Red = competitor leads (20% threshold)
        </div>
      </div>

      {/* Radar Overview */}
      {radarData.length > 0 && (
        <div style={card()}>
          <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px" }}>Competitive Radar</div>
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#333" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "#9E9E9E", fontSize: 12 }} />
              <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
              {metricComparison.map((c, i) => (
                <Radar
                  key={c.name}
                  name={c.name}
                  dataKey={c.name}
                  stroke={c.isAudited ? AUDITED_COLOR : COLORS[i % COLORS.length]}
                  fill={c.isAudited ? AUDITED_COLOR : COLORS[i % COLORS.length]}
                  fillOpacity={c.isAudited ? 0.2 : 0.05}
                  strokeWidth={c.isAudited ? 2 : 1}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: "12px" }} />
            </RadarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: "11px", color: "#666", textAlign: "center" }}>
            Normalized to 100 (highest value per metric = 100)
          </div>
        </div>
      )}

      {/* Views Comparison */}
      <div style={card()}>
        <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px" }}>Average Views (90 days)</div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={viewsData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#9E9E9E", fontSize: 11 }} tickFormatter={fmtNum} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#9E9E9E", fontSize: 11 }} width={120} />
            <Tooltip content={<CustomBarTooltip />} />
            <Bar
              dataKey="views"
              fill={AUDITED_COLOR}
              radius={[0, 4, 4, 0]}
              label={false}
            >
              {viewsData.map((entry, i) => (
                <rect key={i} fill={entry.isAudited ? AUDITED_COLOR : COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Engagement + Cadence side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div style={card()}>
          <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px" }}>Engagement Rate (%)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={engagementData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#9E9E9E", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#9E9E9E", fontSize: 10 }} width={100} />
              <Tooltip content={<CustomBarTooltip />} />
              <Bar dataKey="engagement" fill="#22c55e" radius={[0, 4, 4, 0]} unit="%" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={card()}>
          <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px" }}>Upload Frequency (per week)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cadenceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#9E9E9E", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#9E9E9E", fontSize: 10 }} width={100} />
              <Tooltip content={<CustomBarTooltip />} />
              <Bar dataKey="frequency" fill="#f59e0b" radius={[0, 4, 4, 0]} unit="/wk" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Content Format Distribution */}
      {formatData.length > 0 && (
        <div style={card()}>
          <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px" }}>Content Format Distribution</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={formatData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="format" tick={{ fill: "#9E9E9E", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9E9E9E", fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{ background: "#252525", border: "1px solid #444", borderRadius: "6px", fontSize: "12px" }}
              />
              {headToHead.map((c, i) => (
                <Bar key={c.name} dataKey={c.name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
              <Legend wrapperStyle={{ fontSize: "12px" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Title Pattern Comparison */}
      {patternData.length > 0 && (
        <div style={card()}>
          <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px" }}>Title Pattern Usage</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={patternData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="pattern" tick={{ fill: "#9E9E9E", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9E9E9E", fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{ background: "#252525", border: "1px solid #444", borderRadius: "6px", fontSize: "12px" }}
              />
              {headToHead.map((c, i) => (
                <Bar key={c.name} dataKey={c.name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
              <Legend wrapperStyle={{ fontSize: "12px" }} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: "11px", color: "#666", marginTop: "8px" }}>
            Percentage of titles using each pattern type
          </div>
        </div>
      )}
    </div>
  );
}
