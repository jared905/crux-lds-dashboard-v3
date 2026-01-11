import React, { useMemo, useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle, Zap } from "lucide-react";

export default function BrandFunnel({ rows, dateRange }) {
  const [particles, setParticles] = useState([]);

  const funnelData = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    // Calculate totals
    const totalImpressions = rows.reduce((sum, r) => sum + (r.impressions || 0), 0);
    const totalViews = rows.reduce((sum, r) => sum + (r.views || 0), 0);
    
    // Qualified Viewers = Views × Retention
    const qualifiedViewers = rows.reduce((sum, r) => {
      const views = r.views || 0;
      const retention = r.retention || 0;
      return sum + (views * retention);
    }, 0);

    // Calculate conversion rates - use weighted average from CTR column
    // Note: CTR in rows is already converted to decimal by normalizeData (4.69% → 0.0469)
    const ctr = totalImpressions > 0 ? 
      rows.reduce((sum, r) => sum + ((r.ctr || 0) * (r.impressions || 0)), 0) / totalImpressions : 
      0;
    const qualificationRate = totalViews > 0 ? (qualifiedViewers / totalViews) : 0;
    // Overall conversion = CTR × Retention (compound conversion through the funnel)
    const overallConversion = ctr * qualificationRate;

    // Split current date range in half and compare recent half vs older half
    // This shows if performance is trending up or down within the selected period
    const now = new Date();
    let daysBack = 28; // default
    if (dateRange === "90d") daysBack = 90;
    else if (dateRange === "ytd") {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      daysBack = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
    } else if (dateRange === "all") {
      // For "all time", use last 90 days for trending
      daysBack = 90;
    }

    const halfwayPoint = new Date(now.getTime() - (daysBack / 2) * 24 * 60 * 60 * 1000);
    const startPoint = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    // Split rows by publish date into recent vs older half
    const recentRows = rows.filter(r => r.publishDate && new Date(r.publishDate) >= halfwayPoint);
    const olderRows = rows.filter(r => r.publishDate && new Date(r.publishDate) >= startPoint && new Date(r.publishDate) < halfwayPoint);

    const calcPeriodMetrics = (data) => {
      const imps = data.reduce((sum, r) => sum + (r.impressions || 0), 0);
      const views = data.reduce((sum, r) => sum + (r.views || 0), 0);
      const qualified = data.reduce((sum, r) => sum + ((r.views || 0) * (r.retention || 0)), 0);
      const periodCTR = imps > 0 ? data.reduce((sum, r) => sum + ((r.ctr || 0) * (r.impressions || 0)), 0) / imps : 0;
      const periodQualRate = views > 0 ? (qualified / views) : 0;
      const periodOverallConv = periodCTR * periodQualRate;
      return { imps, views, qualified, overallConv: periodOverallConv };
    };

    const recentMetrics = calcPeriodMetrics(recentRows);
    const olderMetrics = calcPeriodMetrics(olderRows);

    const calcChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const trends = {
      impressions: calcChange(recentMetrics.imps, olderMetrics.imps),
      views: calcChange(recentMetrics.views, olderMetrics.views),
      qualified: calcChange(recentMetrics.qualified, olderMetrics.qualified)
    };

    const overallConversionTrend = calcChange(recentMetrics.overallConv, olderMetrics.overallConv);

    // Funnel Health Diagnosis
    let diagnosis = {
      type: "healthy",
      title: "Healthy Funnel",
      message: "Your funnel shows balanced performance across all stages.",
      icon: CheckCircle,
      color: "#10b981"
    };

    if (ctr < 0.03 && totalImpressions > 10000) {
      diagnosis = {
        type: "top-heavy",
        title: "Top-Heavy Funnel",
        message: "Strong impressions but weak click-through. Your packaging (thumbnails/titles) needs work.",
        action: "A/B test brighter thumbnails and more compelling titles",
        icon: AlertCircle,
        color: "#f59e0b"
      };
    } else if (ctr >= 0.04 && qualificationRate < 0.35) {
      diagnosis = {
        type: "leaky",
        title: "Leaky Bucket",
        message: "Great click-through but low retention. Content isn't delivering on the promise.",
        action: "Tighten intros, deliver value faster, align content with expectations",
        icon: AlertCircle,
        color: "#ef4444"
      };
    } else if (qualificationRate >= 0.5 && ctr >= 0.05) {
      diagnosis = {
        type: "cylinder",
        title: "The Cylinder (High-Quality Audience)",
        message: "Strong engagement at every stage. You have a loyal, highly-engaged audience.",
        action: "Perfect audience for product launches, donations, or premium content",
        icon: CheckCircle,
        color: "#10b981"
      };
    } else if (ctr >= 0.04 && qualificationRate >= 0.4) {
      diagnosis = {
        type: "healthy",
        title: "Healthy Funnel",
        message: "Solid performance across the board with room for optimization.",
        action: "Continue current strategy while testing incremental improvements",
        icon: CheckCircle,
        color: "#10b981"
      };
    }

    // Calculate widths - much wider minimum for better text fit
    const maxWidth = 100;
    const viewsWidth = totalImpressions > 0 ? Math.max((totalViews / totalImpressions) * maxWidth, 50) : 65;
    const qualifiedWidth = totalImpressions > 0 ? Math.max((qualifiedViewers / totalImpressions) * maxWidth, 40) : 50;

    return {
      stages: [
        {
          name: "Brand Reach",
          subtitle: "Impressions",
          value: totalImpressions,
          trend: trends.impressions,
          color: "#6366f1",
          width: maxWidth
        },
        {
          name: "Active Interest",
          subtitle: "Views",
          value: totalViews,
          trend: trends.views,
          color: "#8b5cf6",
          conversion: ctr,
          width: viewsWidth
        },
        {
          name: "Deep Resonance",
          subtitle: "Qualified Viewers",
          value: qualifiedViewers,
          trend: trends.qualified,
          color: "#ec4899",
          conversion: qualificationRate,
          width: qualifiedWidth
        }
      ],
      overallConversion,
      overallConversionTrend,
      ctr,
      qualificationRate,
      diagnosis
    };
  }, [rows]);

  // Particle animation
  useEffect(() => {
    if (!funnelData) return;
    
    const interval = setInterval(() => {
      setParticles(prev => {
        const active = prev.filter(p => p.progress < 100);
        
        if (Math.random() < 0.25) {
          active.push({
            id: Date.now() + Math.random(),
            progress: 0,
            x: 50 + (Math.random() - 0.5) * 35,
            speed: 0.4 + Math.random() * 0.4
          });
        }
        
        return active.map(p => ({
          ...p,
          progress: p.progress + p.speed
        }));
      });
    }, 60);
    
    return () => clearInterval(interval);
  }, [funnelData]);

  if (!funnelData) {
    return (
      <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px", padding: "40px", marginBottom: "20px" }}>
        <div style={{ textAlign: "center", color: "#9E9E9E" }}>
          No data available for funnel analysis
        </div>
      </div>
    );
  }

  const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
  const fmtPct = (n) => {
    if (!n || isNaN(n)) return "0%";
    const pct = n * 100;
    // Show 2 decimal places for numbers under 1%, otherwise 1 decimal
    return pct < 1 ? `${pct.toFixed(2)}%` : `${pct.toFixed(1)}%`;
  };

  const stages = funnelData.stages;
  const DiagnosisIcon = funnelData.diagnosis.icon;

  // Get date range label
  const dateRangeLabel = dateRange === "all" ? "All Time" : 
                        dateRange === "ytd" ? "Year to Date" : 
                        dateRange === "90d" ? "Last 90 Days" : 
                        "Last 28 Days";

  return (
    <div style={{ 
      background: "linear-gradient(135deg, #1E1E1E 0%, #2A2A2A 100%)", 
      border: "2px solid #333", 
      borderRadius: "12px", 
      padding: "28px", 
      marginBottom: "20px",
      position: "relative",
      overflow: "hidden"
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899)" }} />
      
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <Zap size={22} style={{ color: "#8b5cf6" }} />
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff" }}>Impact Funnel</div>
          <div style={{ fontSize: "13px", color: "#9E9E9E", background: "#252525", padding: "5px 12px", borderRadius: "6px" }}>
            {dateRangeLabel}
          </div>
        </div>
        <div style={{ fontSize: "14px", color: "#9E9E9E", marginLeft: "34px" }}>
          How your content converts passive viewers into engaged brand advocates
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 400px", gap: "40px", alignItems: "start" }}>
        
        {/* Left: SVG Funnel - MUCH WIDER */}
        <div style={{ position: "relative", minHeight: "540px" }}>
          <svg width="100%" height="540" viewBox="0 0 700 540" style={{ display: "block" }}>
            <defs>
              {/* Gradients */}
              {stages.map((stage, idx) => (
                <linearGradient key={idx} id={`grad${idx}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style={{ stopColor: stage.color, stopOpacity: 0.5 }} />
                  <stop offset="100%" style={{ stopColor: stage.color, stopOpacity: 0.15 }} />
                </linearGradient>
              ))}
              
              {/* Glow filter */}
              <filter id="glow">
                <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Stage 1 Trapezoid - WIDEST */}
            <path
              d={`M 30 30 L 670 30 L ${350 + (stages[1].width * 2.2)} 190 L ${350 - (stages[1].width * 2.2)} 190 Z`}
              fill="url(#grad0)"
              stroke={stages[0].color}
              strokeWidth="3"
              filter="url(#glow)"
            />
            <text x="350" y="85" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="700">
              {stages[0].name}
            </text>
            <text x="350" y="110" textAnchor="middle" fill="#cbd5e1" fontSize="14">
              {stages[0].subtitle}
            </text>
            <text x="350" y="150" textAnchor="middle" fill={stages[0].color} fontSize="36" fontWeight="700">
              {fmtInt(stages[0].value)}
            </text>
            {/* Trend indicator */}
            {stages[0].trend !== undefined && (
              <text x="350" y="175" textAnchor="middle" fontSize="13" fontWeight="600"
                fill={stages[0].trend === 0 ? "#9E9E9E" : stages[0].trend > 0 ? "#10b981" : "#ef4444"}>
                {stages[0].trend === 0 ? "—" : `${stages[0].trend > 0 ? "↑ +" : "↓ "}${stages[0].trend.toFixed(1)}% recent vs older`}
              </text>
            )}

            {/* Connector 1 */}
            <line x1="350" y1="190" x2="350" y2="225" stroke="#666" strokeWidth="2.5" strokeDasharray="6,6" />
            <polygon points="350,225 344,218 356,218" fill="#666" />
            {stages[1].conversion && (
              <text x="390" y="212" fill="#cbd5e1" fontSize="14" fontWeight="600">
                {fmtPct(stages[1].conversion)} Avg CTR
              </text>
            )}

            {/* Stage 2 Trapezoid - WIDE */}
            <path
              d={`M ${350 - (stages[1].width * 2.2)} 225 L ${350 + (stages[1].width * 2.2)} 225 L ${350 + (stages[2].width * 2.2)} 385 L ${350 - (stages[2].width * 2.2)} 385 Z`}
              fill="url(#grad1)"
              stroke={stages[1].color}
              strokeWidth="3"
              filter="url(#glow)"
            />
            <text x="350" y="280" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="700">
              {stages[1].name}
            </text>
            <text x="350" y="305" textAnchor="middle" fill="#cbd5e1" fontSize="14">
              {stages[1].subtitle}
            </text>
            <text x="350" y="345" textAnchor="middle" fill={stages[1].color} fontSize="36" fontWeight="700">
              {fmtInt(stages[1].value)}
            </text>
            {/* Trend indicator */}
            {stages[1].trend !== undefined && (
              <text x="350" y="370" textAnchor="middle" fontSize="13" fontWeight="600"
                fill={stages[1].trend === 0 ? "#9E9E9E" : stages[1].trend > 0 ? "#10b981" : "#ef4444"}>
                {stages[1].trend === 0 ? "—" : `${stages[1].trend > 0 ? "↑ +" : "↓ "}${stages[1].trend.toFixed(1)}% recent vs older`}
              </text>
            )}

            {/* Connector 2 */}
            <line x1="350" y1="385" x2="350" y2="420" stroke="#666" strokeWidth="2.5" strokeDasharray="6,6" />
            <polygon points="350,420 344,413 356,413" fill="#666" />
            {stages[2].conversion && (
              <text x="390" y="407" fill="#cbd5e1" fontSize="14" fontWeight="600">
                {fmtPct(stages[2].conversion)} Avg Retention
              </text>
            )}

            {/* Stage 3 Trapezoid - STILL WIDE */}
            <path
              d={`M ${350 - (stages[2].width * 2.2)} 420 L ${350 + (stages[2].width * 2.2)} 420 L ${350 + (stages[2].width * 1.9)} 515 L ${350 - (stages[2].width * 1.9)} 515 Z`}
              fill="url(#grad2)"
              stroke={stages[2].color}
              strokeWidth="3"
              filter="url(#glow)"
            />
            <text x="350" y="450" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="700">
              {stages[2].name}
            </text>
            <text x="350" y="472" textAnchor="middle" fill="#cbd5e1" fontSize="14">
              {stages[2].subtitle}
            </text>
            <text x="350" y="505" textAnchor="middle" fill={stages[2].color} fontSize="32" fontWeight="700">
              {fmtInt(stages[2].value)}
            </text>

            {/* Animated particles */}
            {particles.map(particle => {
              const y = (particle.progress / 100) * 495 + 30;
              const stage = y < 190 ? 0 : y < 385 ? 1 : 2;
              const opacity = Math.sin((particle.progress / 100) * Math.PI);
              
              return (
                <circle
                  key={particle.id}
                  cx={`${particle.x}%`}
                  cy={y}
                  r="4"
                  fill={stages[stage].color}
                  opacity={opacity * 0.8}
                />
              );
            })}
          </svg>
        </div>

        {/* Right: Diagnosis */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Diagnosis Card */}
          <div style={{
            background: "#252525",
            border: `2px solid ${funnelData.diagnosis.color}`,
            borderRadius: "12px",
            padding: "28px"
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "18px", marginBottom: "20px" }}>
              <div style={{
                background: `${funnelData.diagnosis.color}22`,
                borderRadius: "10px",
                padding: "14px"
              }}>
                <DiagnosisIcon size={36} style={{ color: funnelData.diagnosis.color }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "20px", fontWeight: "700", color: funnelData.diagnosis.color, marginBottom: "10px" }}>
                  {funnelData.diagnosis.title}
                </div>
                <div style={{ fontSize: "14px", color: "#E0E0E0", lineHeight: "1.6" }}>
                  {funnelData.diagnosis.message}
                </div>
              </div>
            </div>

            {/* Contextual Metrics */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "20px",
              padding: "16px",
              background: "#1E1E1E",
              borderRadius: "8px"
            }}>
              <div>
                <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Avg CTR</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "#8b5cf6" }}>{fmtPct(funnelData.ctr)}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Avg Retention</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "#ec4899" }}>{fmtPct(funnelData.qualificationRate)}</div>
              </div>
            </div>

            {funnelData.diagnosis.action && (
              <div style={{
                background: "#1E1E1E",
                borderLeft: `4px solid ${funnelData.diagnosis.color}`,
                padding: "18px",
                borderRadius: "8px"
              }}>
                <div style={{ fontSize: "11px", color: "#9E9E9E", fontWeight: "700", textTransform: "uppercase", marginBottom: "8px" }}>
                  Recommended Action
                </div>
                <div style={{ fontSize: "14px", color: "#E0E0E0", fontWeight: "600", lineHeight: "1.5" }}>
                  → {funnelData.diagnosis.action}
                </div>
              </div>
            )}
          </div>

          {/* Overall Conversion */}
          <div style={{
            background: "#252525",
            border: "1px solid #333",
            borderRadius: "12px",
            padding: "24px"
          }}>
            <div style={{ fontSize: "12px", color: "#9E9E9E", fontWeight: "700", textTransform: "uppercase", marginBottom: "8px" }}>
              Overall Conversion
            </div>
            <div style={{ fontSize: "14px", color: "#cbd5e1", marginBottom: "10px" }}>
              Impressions → Qualified Viewers
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px" }}>
              <div style={{ fontSize: "38px", fontWeight: "700", color: "#ec4899" }}>
                {fmtPct(funnelData.overallConversion)}
              </div>
              {funnelData.overallConversionTrend !== undefined && funnelData.overallConversionTrend !== 0 && (
                <div style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: funnelData.overallConversionTrend > 0 ? "#10b981" : "#ef4444"
                }}>
                  {funnelData.overallConversionTrend > 0 ? "↑ +" : "↓ "}{funnelData.overallConversionTrend.toFixed(1)}%
                </div>
              )}
            </div>
            <div style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "16px" }}>
              {funnelData.overallConversion >= 0.05
                ? "Exceptional - Rare performance level"
                : funnelData.overallConversion >= 0.04
                ? "Very strong conversion - Push toward 5% for exceptional status"
                : funnelData.overallConversion >= 0.03
                ? "Strong performance - Target 4%+ to reach very strong tier"
                : funnelData.overallConversion >= 0.02
                ? "Solid baseline - Target 3%+ for strong performance"
                : funnelData.overallConversion >= 0.01
                ? "Developing - Target 2%+ for solid performance"
                : "Needs work - Focus on improving each stage"}
            </div>

            {/* Progress Bar */}
            <div style={{ marginTop: "16px" }}>
              {/* The bar itself */}
              <div style={{
                position: "relative",
                height: "12px",
                background: "#1a1a1a",
                borderRadius: "6px",
                border: "1px solid #333",
                overflow: "visible"
              }}>
                {/* Progress fill */}
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: `${Math.min((funnelData.overallConversion / 0.05) * 100, 100)}%`,
                  background: funnelData.overallConversion >= 0.05
                    ? "linear-gradient(90deg, #10b981, #059669)"
                    : funnelData.overallConversion >= 0.04
                    ? "linear-gradient(90deg, #8b5cf6, #7c3aed)"
                    : funnelData.overallConversion >= 0.03
                    ? "linear-gradient(90deg, #6366f1, #4f46e5)"
                    : funnelData.overallConversion >= 0.02
                    ? "linear-gradient(90deg, #3b82f6, #2563eb)"
                    : funnelData.overallConversion >= 0.01
                    ? "linear-gradient(90deg, #f59e0b, #d97706)"
                    : "linear-gradient(90deg, #ef4444, #dc2626)",
                  borderRadius: "6px",
                  transition: "width 0.5s ease"
                }} />

                {/* Tier dividers */}
                <div style={{ position: "absolute", left: "20%", top: 0, bottom: 0, width: "1px", background: "#444" }} />
                <div style={{ position: "absolute", left: "40%", top: 0, bottom: 0, width: "1px", background: "#444" }} />
                <div style={{ position: "absolute", left: "60%", top: 0, bottom: 0, width: "1px", background: "#444" }} />
                <div style={{ position: "absolute", left: "80%", top: 0, bottom: 0, width: "1px", background: "#444" }} />

                {/* Current position marker */}
                <div style={{
                  position: "absolute",
                  top: "-4px",
                  left: `${Math.min((funnelData.overallConversion / 0.05) * 100, 100)}%`,
                  transform: "translateX(-50%)",
                  width: "4px",
                  height: "20px",
                  background: "#fff",
                  borderRadius: "2px",
                  boxShadow: "0 0 10px rgba(255,255,255,0.6)",
                  zIndex: 10
                }} />
              </div>

              {/* Percentage scale */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "11px", color: "#666", fontWeight: "600" }}>
                <span>0%</span>
                <span>1%</span>
                <span>2%</span>
                <span>3%</span>
                <span>4%</span>
                <span>5%</span>
              </div>

              {/* Tier labels below */}
              <div style={{ display: "flex", marginTop: "8px", fontSize: "11px", color: "#888" }}>
                <div style={{ flex: 1, textAlign: "center", borderLeft: "2px solid #ef4444", paddingLeft: "4px" }}>Needs Work</div>
                <div style={{ flex: 1, textAlign: "center", borderLeft: "2px solid #f59e0b", paddingLeft: "4px" }}>Developing</div>
                <div style={{ flex: 1, textAlign: "center", borderLeft: "2px solid #3b82f6", paddingLeft: "4px" }}>Solid</div>
                <div style={{ flex: 1, textAlign: "center", borderLeft: "2px solid #6366f1", paddingLeft: "4px" }}>Strong</div>
                <div style={{ flex: 1, textAlign: "center", borderLeft: "2px solid #8b5cf6", paddingLeft: "4px" }}>Very Strong</div>
                <div style={{ flex: 1, textAlign: "center", borderLeft: "2px solid #10b981", paddingLeft: "4px" }}>Exceptional</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}