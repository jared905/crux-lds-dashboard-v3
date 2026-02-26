import { useState, useEffect } from "react";
import { Radio, TrendingUp, TrendingDown, Clock, Calendar, Users, BarChart3, Loader } from "lucide-react";

const STRENGTH_COLORS = { strong: "#10b981", moderate: "#f59e0b", weak: "#ef4444" };

export default function AudienceSignals({ channelId }) {
  const [signals, setSignals] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!channelId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { computeAudienceSignals } = await import("../../services/audienceSignalService");
        const result = await computeAudienceSignals(channelId);
        if (!cancelled) setSignals(result);
      } catch (e) {
        console.warn("[AudienceSignals] Compute failed:", e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [channelId]);

  if (loading) {
    return (
      <div style={{
        background: "#1E1E1E", border: "1px solid #333", borderRadius: "8px",
        padding: "32px", textAlign: "center", color: "#888", marginTop: "24px",
      }}>
        <Loader size={20} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
        <div style={{ fontSize: "13px" }}>Computing audience signals...</div>
      </div>
    );
  }

  if (!signals) {
    return (
      <div style={{
        background: "#1E1E1E", border: "1px solid #333", borderRadius: "8px",
        padding: "24px", marginTop: "24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <Radio size={18} color="#8b5cf6" />
          <span style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>Audience Signals</span>
        </div>
        <div style={{ fontSize: "13px", color: "#666", textAlign: "center", padding: "16px 0" }}>
          Insufficient data — need at least 5 videos to compute signals
        </div>
      </div>
    );
  }

  const { high_engagement_formats, content_gaps, _computed } = signals;

  return (
    <div className="section-card" style={{
      background: "#1E1E1E", border: "1px solid #2A2A2A", borderRadius: "8px",
      padding: "24px", marginTop: "24px",
      "--glow-color": "rgba(139, 92, 246, 0.2)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
        <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #8b5cf6, #8b5cf6cc)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px #8b5cf64d", flexShrink: 0 }}>
          <svg className="radar-dish" width="32" height="32" viewBox="0 0 48 48" fill="none" style={{ overflow: "visible" }}>
            {/* Flat base platform */}
            <rect x="10" y="42" width="22" height="3" rx="1.5" fill="white" opacity="0.9" />
            {/* Support legs — angled inward to post */}
            <line x1="14" y1="42" x2="20" y2="34" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
            <line x1="28" y1="42" x2="22" y2="34" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
            {/* Vertical post */}
            <line x1="21" y1="34" x2="18" y2="24" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
            {/* Dish — tilted ellipse, side profile */}
            <ellipse cx="22" cy="18" rx="8" ry="18" transform="rotate(-30 22 18)" stroke="white" strokeWidth="2.5" fill="none" opacity="0.9" />
            {/* Cross support inside dish */}
            <line x1="16" y1="28" x2="34" y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
            <line x1="12" y1="14" x2="30" y2="26" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
            {/* Receiver arm — from dish center outward */}
            <line x1="22" y1="20" x2="34" y2="10" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            {/* Receiver dot */}
            <circle cx="35" cy="9" r="2.5" fill="white" opacity="0.9" />
            {/* Signal waves — hidden by default, appear on hover and move toward dish */}
            <g className="radar-waves" style={{ opacity: 0 }}>
              <path d="M40 -2 Q34 8, 42 18" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M46 -5 Q39 6, 48 18" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M52 -8 Q44 4, 54 18" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
            </g>
          </svg>
        </div>
        <span style={{ fontSize: "26px", fontWeight: "700", color: "#fff" }}>Audience Signals</span>
        <span className="stat-chip purple">{_computed?.video_count || 0} videos analyzed</span>
      </div>

      {/* Two-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

        {/* Top Formats */}
        <div>
          <SectionLabel icon={BarChart3} label="Top Formats" />
          {high_engagement_formats?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {high_engagement_formats.slice(0, 5).map((f, i) => (
                <FormatBar key={i} format={f} />
              ))}
            </div>
          ) : (
            <NoData>No format data</NoData>
          )}
        </div>

        {/* Optimal Duration */}
        <div>
          <SectionLabel icon={Clock} label="Optimal Duration" />
          {_computed?.optimal_duration?.sweet_spots?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {_computed.optimal_duration.sweet_spots.map((s, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 10px", background: "#252525", borderRadius: "6px",
                }}>
                  <span style={{ fontSize: "12px", color: "#e0e0e0", fontWeight: "500" }}>{s.range}</span>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                      {Math.round(s.avg_views).toLocaleString()} views
                    </span>
                    {s.avg_retention > 0 && (
                      <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                        {Math.round(s.avg_retention * 100)}% ret
                      </span>
                    )}
                    <span style={{
                      fontSize: "11px", fontWeight: "600",
                      color: s.vs_channel_avg >= 1.3 ? "#10b981" : s.vs_channel_avg >= 1.0 ? "#f59e0b" : "#ef4444",
                    }}>
                      {s.vs_channel_avg.toFixed(1)}x
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <NoData>No duration data</NoData>
          )}
        </div>

        {/* Posting Patterns */}
        <div>
          <SectionLabel icon={Calendar} label="Posting Patterns" />
          {_computed?.posting_patterns ? (
            <div style={{ padding: "8px 10px", background: "#252525", borderRadius: "6px" }}>
              {_computed.posting_patterns.best_days?.length > 0 && (
                <div style={{ fontSize: "12px", color: "#e0e0e0", marginBottom: "6px" }}>
                  <span style={{ color: "#9ca3af" }}>Best days: </span>
                  <span style={{ fontWeight: "600" }}>{_computed.posting_patterns.best_days.join(", ")}</span>
                </div>
              )}
              <div style={{ fontSize: "12px", color: "#e0e0e0", marginBottom: "6px" }}>
                <span style={{ color: "#9ca3af" }}>Avg: </span>
                <span style={{ fontWeight: "600" }}>{_computed.posting_patterns.avg_uploads_per_week} uploads/week</span>
              </div>
              {_computed.posting_patterns.frequency_insight && (
                <div style={{ fontSize: "11px", color: "#8b5cf6", marginTop: "4px" }}>
                  {_computed.posting_patterns.frequency_insight}
                </div>
              )}
            </div>
          ) : (
            <NoData>Not enough publishing data</NoData>
          )}
        </div>

        {/* Growth Signals */}
        <div>
          <SectionLabel icon={TrendingUp} label="Growth Signals" />
          {_computed?.growth_signals?.subscriber_velocity ? (
            <div style={{ padding: "8px 10px", background: "#252525", borderRadius: "6px" }}>
              <GrowthIndicator data={_computed.growth_signals.subscriber_velocity} />
            </div>
          ) : (
            <NoData>Not enough snapshot data</NoData>
          )}
        </div>
      </div>

      {/* Subscriber Drivers (full width) */}
      {_computed?.subscriber_drivers?.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <SectionLabel icon={Users} label="Subscriber Drivers" />
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {_computed.subscriber_drivers.slice(0, 3).map((d, i) => (
              <div key={i} style={{
                flex: 1, minWidth: "140px",
                padding: "10px 12px", background: "#252525", borderRadius: "6px",
                borderLeft: `3px solid ${i === 0 ? "#10b981" : i === 1 ? "#3b82f6" : "#f59e0b"}`,
              }}>
                <div style={{ fontSize: "12px", fontWeight: "600", color: "#e0e0e0", marginBottom: "2px" }}>
                  {d.attribute}
                </div>
                <div style={{ fontSize: "11px", color: "#9ca3af" }}>{d.note}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content Gaps (full width) */}
      {content_gaps?.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <SectionLabel icon={BarChart3} label="Content Gaps" />
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {content_gaps.map((g, i) => (
              <div key={i} style={{
                padding: "8px 12px", background: "#252525", borderRadius: "6px",
                borderLeft: "3px solid #f59e0b",
              }}>
                <div style={{ fontSize: "12px", color: "#e0e0e0" }}>{g.observation}</div>
                {g.youtube_opportunity && (
                  <div style={{ fontSize: "11px", color: "#8b5cf6", marginTop: "2px" }}>
                    → {g.youtube_opportunity}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ───────────────────────────────────────────────────────── */

function SectionLabel({ icon: Icon, label }) {
  return (
    <div style={{
      fontSize: "11px", fontWeight: "600", color: "#9E9E9E",
      textTransform: "uppercase", letterSpacing: "0.5px",
      marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px",
    }}>
      <Icon size={12} />
      {label}
    </div>
  );
}

function NoData({ children }) {
  return (
    <div style={{
      fontSize: "12px", color: "#555", padding: "12px",
      background: "#252525", borderRadius: "6px", textAlign: "center",
    }}>
      {children}
    </div>
  );
}

function FormatBar({ format }) {
  const strength = format.signal_strength || "weak";
  const color = STRENGTH_COLORS[strength];
  const vsAvg = format._computed?.vs_channel_avg || 0;
  const barWidth = Math.min(100, Math.max(5, vsAvg * 40));

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "8px", padding: "4px 0",
    }}>
      <div style={{ width: "90px", fontSize: "12px", color: "#b0b0b0", fontWeight: "500", flexShrink: 0 }}>
        {format.format}
      </div>
      <div style={{
        flex: 1, height: "6px", background: "#252525",
        borderRadius: "3px", overflow: "hidden",
      }}>
        <div style={{
          width: `${barWidth}%`, height: "100%",
          background: color, borderRadius: "3px",
        }} />
      </div>
      <div style={{ width: "35px", fontSize: "11px", fontWeight: "700", color, textAlign: "right" }}>
        {vsAvg.toFixed(1)}x
      </div>
      <div style={{
        fontSize: "9px", fontWeight: "600", color,
        background: `${color}20`, padding: "1px 5px", borderRadius: "3px",
        textTransform: "uppercase", width: "55px", textAlign: "center",
      }}>
        {strength}
      </div>
    </div>
  );
}

function GrowthIndicator({ data }) {
  const { trend, recent_30d, prior_30d, ratio } = data;
  const isGrowing = trend === "accelerating";
  const isDecelerating = trend === "decelerating";
  const color = isGrowing ? "#10b981" : isDecelerating ? "#ef4444" : "#f59e0b";
  const Icon = isGrowing ? TrendingUp : isDecelerating ? TrendingDown : TrendingUp;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: "13px", fontWeight: "700", color, textTransform: "capitalize" }}>
          {trend}
        </span>
      </div>
      <div style={{ display: "flex", gap: "16px" }}>
        <div>
          <div style={{ fontSize: "11px", color: "#9ca3af" }}>Last 30d</div>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#e0e0e0" }}>
            +{recent_30d.toLocaleString()} subs
          </div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "#9ca3af" }}>Prior 30d</div>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#9ca3af" }}>
            +{prior_30d.toLocaleString()} subs
          </div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "#9ca3af" }}>Change</div>
          <div style={{ fontSize: "14px", fontWeight: "700", color }}>
            {ratio > 1 ? "+" : ""}{Math.round((ratio - 1) * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}
