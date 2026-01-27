import React, { useMemo, useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle, Zap, Clock } from "lucide-react";

// 2026 YouTube Retention Benchmarks by video duration
// Source: YouTube Retention Benchmark Report 2026
const getExpectedRetention = (durationSeconds) => {
  const mins = durationSeconds / 60;
  if (mins < 1) return 0.70;      // Shorts: 70% average
  if (mins < 3) return 0.50;      // 1-3 min: 50% average
  if (mins < 5) return 0.45;      // 3-5 min: 45% average
  if (mins < 10) return 0.375;    // 5-10 min: 37.5% average
  if (mins < 20) return 0.325;    // 10-20 min: 32.5% average
  if (mins < 30) return 0.275;    // 20-30 min: 27.5% average
  if (mins < 60) return 0.225;    // 30-60 min: 22.5% average
  return 0.175;                   // 60+ min: 17.5% average
};

// Engagement threshold: viewers who watched above this % are considered "engaged"
// Research shows 50%+ retention indicates genuine interest vs casual scrolling
const ENGAGEMENT_THRESHOLD = 0.50;

export default function BrandFunnel({ rows, dateRange }) {
  const [particles, setParticles] = useState([]);

  const funnelData = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    // Calculate totals
    const totalImpressions = rows.reduce((sum, r) => sum + (r.impressions || 0), 0);
    const totalViews = rows.reduce((sum, r) => sum + (r.views || 0), 0);

    // Keep watch hours for secondary display
    const totalWatchHours = rows.reduce((sum, r) => sum + (r.watchHours || 0), 0);

    // ENGAGED VIEWERS: Estimate viewers who watched 50%+ of the video
    // Using retention data to estimate the proportion of engaged viewers per video
    // If a video has 40% avg retention, we estimate ~60% of viewers are "engaged" (watched meaningfully)
    // Formula: For each video, engaged = views × (retention / ENGAGEMENT_THRESHOLD) capped at 1.0
    const engagedViewers = rows.reduce((sum, r) => {
      const views = r.views || 0;
      const retention = r.avgViewPct || 0;
      // Engagement ratio: what portion of viewers likely hit 50%+ watch time
      // If avg retention is 60%, most viewers are engaged. If 30%, fewer are.
      // Use retention as a proxy - higher retention = more engaged viewers
      const engagementRatio = Math.min(retention / ENGAGEMENT_THRESHOLD, 1.0);
      return sum + (views * engagementRatio);
    }, 0);

    // Calculate expected engaged viewers based on industry benchmarks
    const expectedEngagedViewers = rows.reduce((sum, r) => {
      const duration = r.durationSeconds || 300;
      const views = r.views || 0;
      const expectedRet = getExpectedRetention(duration);
      const expectedEngagementRatio = Math.min(expectedRet / ENGAGEMENT_THRESHOLD, 1.0);
      return sum + (views * expectedEngagementRatio);
    }, 0);

    // Engagement Quality Ratio: actual vs expected (1.0 = meeting benchmarks)
    const engagementQualityRatio = expectedEngagedViewers > 0
      ? engagedViewers / expectedEngagedViewers
      : 0;

    // Average minutes watched per view (keep for context)
    const avgWatchMinutesPerView = totalViews > 0
      ? (totalWatchHours * 60) / totalViews
      : 0;

    // Engagement rate: what % of views became engaged viewers
    const engagementRate = totalViews > 0
      ? engagedViewers / totalViews
      : 0;

    // Calculate conversion rates - use weighted average from CTR column
    // Note: CTR in rows is already converted to decimal by normalizeData (4.69% → 0.0469)
    const ctr = totalImpressions > 0 ?
      rows.reduce((sum, r) => sum + ((r.ctr || 0) * (r.impressions || 0)), 0) / totalImpressions :
      0;

    // Keep qualificationRate for backward compatibility in trends
    const qualificationRate = totalViews > 0
      ? rows.reduce((sum, r) => sum + ((r.views || 0) * (r.retention || 0)), 0) / totalViews
      : 0;

    // NEW: Shorts vs Long-form breakdown
    const shorts = rows.filter(r => r.type === 'short');
    const longs = rows.filter(r => r.type === 'long' || r.type !== 'short');

    const shortsMetrics = {
      count: shorts.length,
      avgRetention: shorts.length > 0
        ? shorts.reduce((sum, r) => sum + (r.retention || 0), 0) / shorts.length
        : 0,
      totalWatchHours: shorts.reduce((sum, r) => sum + (r.watchHours || 0), 0)
    };

    const longsMetrics = {
      count: longs.length,
      avgRetention: longs.length > 0
        ? longs.reduce((sum, r) => sum + (r.retention || 0), 0) / longs.length
        : 0,
      totalWatchHours: longs.reduce((sum, r) => sum + (r.watchHours || 0), 0)
    };

    // Flag if >70% of content is Shorts
    const shortsHeavy = rows.length > 0 && (shorts.length / rows.length) > 0.7;

    // NEW: Staleness detection
    const mostRecentUpload = rows
      .filter(r => r.publishDate)
      .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate))[0];

    const daysSinceLastUpload = mostRecentUpload
      ? Math.floor((new Date() - new Date(mostRecentUpload.publishDate)) / (1000 * 60 * 60 * 24))
      : null;

    const isStale = daysSinceLastUpload !== null && daysSinceLastUpload > 14;

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
      const engaged = data.reduce((sum, r) => {
        const v = r.views || 0;
        const ret = r.avgViewPct || 0;
        const ratio = Math.min(ret / ENGAGEMENT_THRESHOLD, 1.0);
        return sum + (v * ratio);
      }, 0);
      const periodCTR = imps > 0 ? data.reduce((sum, r) => sum + ((r.ctr || 0) * (r.impressions || 0)), 0) / imps : 0;
      return { imps, views, engaged, periodCTR };
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
      engagedViewers: calcChange(recentMetrics.engaged, olderMetrics.engaged)
    };

    // Funnel Health Diagnosis based on engagementQualityRatio (research-backed)
    let diagnosis = {
      type: "developing",
      title: "Developing Funnel",
      message: "Building toward industry benchmarks. Focus on consistent improvement.",
      action: "Analyze top-performing videos and replicate successful patterns",
      icon: AlertCircle,
      color: "#3b82f6"
    };

    // Top-Heavy: Low CTR (unchanged from original)
    if (ctr < 0.03 && totalImpressions > 10000) {
      diagnosis = {
        type: "top-heavy",
        title: "Top-Heavy Funnel",
        message: "Strong impressions but weak click-through. Your packaging (thumbnails/titles) needs work.",
        action: "A/B test brighter thumbnails and more compelling titles",
        icon: AlertCircle,
        color: "#f59e0b"
      };
    }
    // Leaky Bucket: Good clicks but engagement below benchmarks
    else if (ctr >= 0.04 && engagementQualityRatio < 0.7) {
      diagnosis = {
        type: "leaky",
        title: "Leaky Bucket",
        message: "Great click-through but content isn't converting viewers to engaged audience.",
        action: "Tighten intros, deliver value faster, align content with thumbnail promises",
        icon: AlertCircle,
        color: "#ef4444"
      };
    }
    // Cylinder: High CTR + exceeds engagement benchmarks
    else if (ctr >= 0.05 && engagementQualityRatio >= 1.2 && !isStale) {
      diagnosis = {
        type: "cylinder",
        title: "The Cylinder (High-Quality Audience)",
        message: "Outperforming industry benchmarks at every stage. Loyal, deeply-engaged community.",
        action: "Perfect audience for product launches, memberships, or premium content",
        icon: CheckCircle,
        color: "#10b981"
      };
    }
    // Healthy: Solid across the board
    else if (ctr >= 0.04 && engagementQualityRatio >= 0.9) {
      diagnosis = {
        type: "healthy",
        title: "Healthy Funnel",
        message: "Meeting or exceeding industry benchmarks. Solid performance with room to grow.",
        action: "Continue current strategy while testing incremental improvements",
        icon: CheckCircle,
        color: "#10b981"
      };
    }

    // Calculate widths for funnel visualization
    const maxWidth = 100;
    const viewsWidth = totalImpressions > 0 ? Math.max((totalViews / totalImpressions) * maxWidth, 50) : 65;
    // Scale engaged viewers width based on engagement rate (higher = wider bottom)
    const engagedWidth = Math.max(Math.min(engagementQualityRatio * 45, 50), 35);

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
          name: "Engaged Viewers",
          subtitle: "50%+ Watch Time",
          value: engagedViewers,
          trend: trends.engagedViewers,
          color: "#ec4899",
          conversion: engagementRate,
          isEngagedViewers: true,
          width: engagedWidth
        }
      ],
      engagedViewers,
      totalWatchHours,
      engagementQualityRatio,
      engagementRate,
      avgWatchMinutesPerView,
      ctr,
      qualificationRate,
      shortsMetrics,
      longsMetrics,
      shortsHeavy,
      isStale,
      daysSinceLastUpload,
      diagnosis
    };
  }, [rows, dateRange]);

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
  const fmtHours = (n) => {
    if (!n || isNaN(n)) return "0 hrs";
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K hrs`;
    return `${Math.round(n).toLocaleString()} hrs`;
  };
  const fmtRatio = (n) => {
    if (!n || isNaN(n)) return "0x";
    return `${n.toFixed(2)}x`;
  };
  const fmtEngaged = (n) => {
    if (!n || isNaN(n)) return "0";
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return Math.round(n).toLocaleString();
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
        <div style={{ position: "relative", minHeight: "560px" }}>
          <svg width="100%" height="560" viewBox="0 0 700 560" style={{ display: "block" }}>
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
            {funnelData.engagementQualityRatio !== undefined && (
              <text x="390" y="407" fill="#cbd5e1" fontSize="14" fontWeight="600">
                {fmtRatio(funnelData.engagementQualityRatio)} vs Benchmark
              </text>
            )}

            {/* Stage 3 Trapezoid - Expanded for readability */}
            <path
              d={`M ${350 - (stages[2].width * 2.2)} 420 L ${350 + (stages[2].width * 2.2)} 420 L ${350 + (stages[2].width * 1.9)} 530 L ${350 - (stages[2].width * 1.9)} 530 Z`}
              fill="url(#grad2)"
              stroke={stages[2].color}
              strokeWidth="3"
              filter="url(#glow)"
            />
            <text x="350" y="450" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="700">
              {stages[2].name}
            </text>
            <text x="350" y="480" textAnchor="middle" fill={stages[2].color} fontSize="32" fontWeight="700">
              {fmtEngaged(stages[2].value)}
            </text>
            <text x="350" y="500" textAnchor="middle" fill="#cbd5e1" fontSize="14">
              people deeply engaged
            </text>
            <text x="350" y="520" textAnchor="middle" fill="#9E9E9E" fontSize="12">
              {funnelData.avgWatchMinutesPerView.toFixed(1)} min avg watch time
            </text>

            {/* Animated particles */}
            {particles.map(particle => {
              const y = (particle.progress / 100) * 510 + 30;
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
              marginBottom: "16px",
              padding: "16px",
              background: "#1E1E1E",
              borderRadius: "8px"
            }}>
              <div>
                <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Avg CTR</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "#8b5cf6" }}>{fmtPct(funnelData.ctr)}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Engagement Rate</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: funnelData.engagementRate >= 0.7 ? "#10b981" : funnelData.engagementRate >= 0.5 ? "#f59e0b" : "#ef4444" }}>
                  {fmtPct(funnelData.engagementRate)}
                </div>
              </div>
            </div>

            {/* Content Breakdown */}
            {(funnelData.shortsMetrics.count > 0 || funnelData.longsMetrics.count > 0) && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "16px",
                padding: "14px",
                background: "#1a1a1a",
                borderRadius: "8px",
                border: "1px solid #333"
              }}>
                {funnelData.shortsMetrics.count > 0 && (
                  <div>
                    <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "6px", fontWeight: "600" }}>
                      Shorts ({funnelData.shortsMetrics.count})
                    </div>
                    <div style={{ fontSize: "13px", color: "#E0E0E0" }}>
                      {fmtHours(funnelData.shortsMetrics.totalWatchHours)}
                    </div>
                    <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                      {fmtPct(funnelData.shortsMetrics.avgRetention)} ret
                    </div>
                  </div>
                )}
                {funnelData.longsMetrics.count > 0 && (
                  <div>
                    <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "6px", fontWeight: "600" }}>
                      Long-form ({funnelData.longsMetrics.count})
                    </div>
                    <div style={{ fontSize: "13px", color: "#E0E0E0" }}>
                      {fmtHours(funnelData.longsMetrics.totalWatchHours)}
                    </div>
                    <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                      {fmtPct(funnelData.longsMetrics.avgRetention)} ret
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Shorts-heavy warning */}
            {funnelData.shortsHeavy && (
              <div style={{
                fontSize: "11px",
                color: "#f59e0b",
                background: "#f59e0b15",
                padding: "8px 12px",
                borderRadius: "6px",
                marginBottom: "16px"
              }}>
                High retention % driven by Shorts format - watch hours is a better quality signal
              </div>
            )}

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

            {/* Staleness Warning */}
            {funnelData.isStale && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginTop: "16px",
                padding: "12px 14px",
                background: "#f59e0b15",
                border: "1px solid #f59e0b40",
                borderRadius: "8px"
              }}>
                <Clock size={18} style={{ color: "#f59e0b", flexShrink: 0 }} />
                <div style={{ fontSize: "12px", color: "#f59e0b", lineHeight: "1.4" }}>
                  <strong>No uploads in {funnelData.daysSinceLastUpload} days</strong> — metrics may not reflect current audience engagement
                </div>
              </div>
            )}
          </div>

          {/* Engagement Quality vs Industry Benchmark */}
          <div style={{
            background: "#252525",
            border: "1px solid #333",
            borderRadius: "12px",
            padding: "24px"
          }}>
            <div style={{ fontSize: "12px", color: "#9E9E9E", fontWeight: "700", textTransform: "uppercase", marginBottom: "8px" }}>
              Engagement vs Benchmark
            </div>
            <div style={{ fontSize: "14px", color: "#cbd5e1", marginBottom: "10px" }}>
              Engaged viewers compared to 2026 industry standards
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px" }}>
              <div style={{
                fontSize: "38px",
                fontWeight: "700",
                color: funnelData.engagementQualityRatio >= 1.3 ? "#10b981"
                  : funnelData.engagementQualityRatio >= 1.0 ? "#8b5cf6"
                  : funnelData.engagementQualityRatio >= 0.7 ? "#f59e0b"
                  : "#ef4444"
              }}>
                {fmtRatio(funnelData.engagementQualityRatio)}
              </div>
              <div style={{ fontSize: "14px", color: "#9E9E9E" }}>
                {fmtEngaged(funnelData.engagedViewers)} engaged
              </div>
            </div>
            <div style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "16px" }}>
              {funnelData.engagementQualityRatio >= 1.3
                ? "Excellent — Content deeply resonates, significantly outperforming benchmarks"
                : funnelData.engagementQualityRatio >= 1.0
                ? "Good — Exceeding industry benchmarks for viewer engagement"
                : funnelData.engagementQualityRatio >= 0.7
                ? "Average — Meeting industry benchmarks, room to grow"
                : funnelData.engagementQualityRatio >= 0.5
                ? "Developing — Below benchmarks, focus on hooking viewers early"
                : "Below Average — Significant opportunity to improve content resonance"}
            </div>

            {/* Progress Bar - based on engagement quality ratio */}
            <div style={{ marginTop: "16px" }}>
              {/* The bar itself - scale: 0.5x to 1.5x+ */}
              <div style={{
                position: "relative",
                height: "12px",
                background: "#1a1a1a",
                borderRadius: "6px",
                border: "1px solid #333",
                overflow: "visible"
              }}>
                {/* Progress fill - map 0.5-1.5 to 0-100% */}
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: `${Math.min(Math.max((funnelData.engagementQualityRatio - 0.5) / 1.0 * 100, 0), 100)}%`,
                  background: funnelData.engagementQualityRatio >= 1.3
                    ? "linear-gradient(90deg, #10b981, #059669)"
                    : funnelData.engagementQualityRatio >= 1.0
                    ? "linear-gradient(90deg, #8b5cf6, #7c3aed)"
                    : funnelData.engagementQualityRatio >= 0.7
                    ? "linear-gradient(90deg, #f59e0b, #d97706)"
                    : "linear-gradient(90deg, #ef4444, #dc2626)",
                  borderRadius: "6px",
                  transition: "width 0.5s ease"
                }} />

                {/* Tier dividers at 0.7x, 1.0x, 1.3x */}
                <div style={{ position: "absolute", left: "20%", top: 0, bottom: 0, width: "1px", background: "#444" }} />
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: "2px", background: "#666" }} />
                <div style={{ position: "absolute", left: "80%", top: 0, bottom: 0, width: "1px", background: "#444" }} />

                {/* Current position marker */}
                <div style={{
                  position: "absolute",
                  top: "-4px",
                  left: `${Math.min(Math.max((funnelData.engagementQualityRatio - 0.5) / 1.0 * 100, 0), 100)}%`,
                  transform: "translateX(-50%)",
                  width: "4px",
                  height: "20px",
                  background: "#fff",
                  borderRadius: "2px",
                  boxShadow: "0 0 10px rgba(255,255,255,0.6)",
                  zIndex: 10
                }} />
              </div>

              {/* Ratio scale */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "11px", color: "#666", fontWeight: "600" }}>
                <span>0.5x</span>
                <span>0.7x</span>
                <span style={{ color: "#888", fontWeight: "700" }}>1.0x</span>
                <span>1.3x</span>
                <span>1.5x+</span>
              </div>

              {/* Tier labels below */}
              <div style={{ display: "flex", marginTop: "8px", fontSize: "11px", color: "#888" }}>
                <div style={{ flex: 1, textAlign: "center", borderLeft: "2px solid #ef4444", paddingLeft: "4px" }}>Below</div>
                <div style={{ flex: 1.5, textAlign: "center", borderLeft: "2px solid #f59e0b", paddingLeft: "4px" }}>Average</div>
                <div style={{ flex: 1.5, textAlign: "center", borderLeft: "2px solid #8b5cf6", paddingLeft: "4px" }}>Good</div>
                <div style={{ flex: 1, textAlign: "center", borderLeft: "2px solid #10b981", paddingLeft: "4px" }}>Excellent</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}