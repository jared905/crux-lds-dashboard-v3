import { useState, useEffect } from "react";
import {TrendingUp, TrendingDown, Clock, Calendar, Users, BarChart3} from "lucide-react";
import { Loader, Radar, Radio } from 'lucide-react';

const STRENGTH_COLORS = { strong: "var(--pos)", moderate: "var(--warn)", weak: "var(--neg)" };

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
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: "24px",
        padding: "32px", textAlign: "center", color: "var(--outline)", marginTop: "24px",
      }}>
        <Loader size={20} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
        <div style={{ fontSize: "13px" }}>Computing audience signals...</div>
      </div>
    );
  }

  if (!signals) {
    return (
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: "24px",
        padding: "24px", marginTop: "24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <Radio size={18} color="#0090c8" />
          <span style={{ fontSize: "16px", fontWeight: "700", color: "var(--ink)" }}>Audience Signals</span>
        </div>
        <div style={{ fontSize: "13px", color: "var(--faint)", textAlign: "center", padding: "16px 0" }}>
          Insufficient data — need at least 5 videos to compute signals
        </div>
      </div>
    );
  }

  const { high_engagement_formats, content_gaps, _computed } = signals;

  return (
    <div className="section-card" style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: "24px",
      padding: "24px", marginTop: "24px",
      "--glow-color": "rgba(0, 209, 255, 0.2)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(0, 144, 200, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Radar size={20} style={{ color: "var(--accent-text)" }} />
        </div>
        <span style={{ fontSize: "26px", fontWeight: "700", color: "var(--ink)" }}>Audience Signals</span>
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
                  padding: "6px 10px", background: "var(--input-bg)", borderRadius: "6px",
                }}>
                  <span style={{ fontSize: "12px", color: "var(--text)", fontWeight: "500" }}>{s.range}</span>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                      {Math.round(s.avg_views).toLocaleString()} views
                    </span>
                    {s.avg_retention > 0 && (
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                        {Math.round(s.avg_retention * 100)}% ret
                      </span>
                    )}
                    <span style={{
                      fontSize: "11px", fontWeight: "600",
                      color: s.vs_channel_avg >= 1.3 ? "var(--pos)" : s.vs_channel_avg >= 1.0 ? "var(--warn)" : "var(--neg)",
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
            <div style={{ padding: "8px 10px", background: "var(--input-bg)", borderRadius: "6px" }}>
              {_computed.posting_patterns.best_days?.length > 0 && (
                <div style={{ fontSize: "12px", color: "var(--text)", marginBottom: "6px" }}>
                  <span style={{ color: "var(--muted)" }}>Best days: </span>
                  <span style={{ fontWeight: "600" }}>{_computed.posting_patterns.best_days.join(", ")}</span>
                </div>
              )}
              <div style={{ fontSize: "12px", color: "var(--text)", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>Avg: </span>
                <span style={{ fontWeight: "600" }}>{_computed.posting_patterns.avg_uploads_per_week} uploads/week</span>
              </div>
              {_computed.posting_patterns.frequency_insight && (
                <div style={{ fontSize: "11px", color: "var(--blue-deep)", marginTop: "4px" }}>
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
            <div style={{ padding: "8px 10px", background: "var(--input-bg)", borderRadius: "6px" }}>
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
                padding: "10px 12px", background: "var(--input-bg)", borderRadius: "8px",
                border: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text)", marginBottom: "2px" }}>
                  {d.attribute}
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>{d.note}</div>
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
                padding: "8px 12px", background: "var(--input-bg)", borderRadius: "8px",
                border: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: "12px", color: "var(--text)" }}>{g.observation}</div>
                {g.youtube_opportunity && (
                  <div style={{ fontSize: "11px", color: "var(--blue-deep)", marginTop: "2px" }}>
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
      fontSize: "11px", fontWeight: "600", color: "var(--muted)",
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
      fontSize: "12px", color: "var(--faint)", padding: "12px",
      background: "var(--input-bg)", borderRadius: "6px", textAlign: "center",
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
      <div style={{ width: "90px", fontSize: "12px", color: "var(--muted)", fontWeight: "500", flexShrink: 0 }}>
        {format.format}
      </div>
      <div style={{
        flex: 1, height: "6px", background: "var(--input-bg)",
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
        background: `color-mix(in srgb, ${color} 13%, transparent)`, padding: "1px 5px", borderRadius: "3px",
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
  const color = isGrowing ? "var(--pos)" : isDecelerating ? "var(--neg)" : "var(--warn)";
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
          <div style={{ fontSize: "11px", color: "var(--muted)" }}>Last 30d</div>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text)" }}>
            +{recent_30d.toLocaleString()} subs
          </div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "var(--muted)" }}>Prior 30d</div>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--muted)" }}>
            +{prior_30d.toLocaleString()} subs
          </div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "var(--muted)" }}>Change</div>
          <div style={{ fontSize: "14px", fontWeight: "700", color }}>
            {ratio > 1 ? "+" : ""}{Math.round((ratio - 1) * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}
