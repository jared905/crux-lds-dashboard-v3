import {useMemo, useEffect, useState} from "react";
import {AlertCircle, CheckCircle} from "lucide-react";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";

// 2026 YouTube Retention Benchmarks by video duration
// Source: YouTube Retention Benchmark Report 2026
import { getExpectedRetention } from "../../lib/retentionBenchmarks.js";
import { Clock, Target } from 'lucide-react';

// Engagement threshold: viewers who watched above this % are considered "engaged"
// Format-aware engagement bars (2026-08-20: a Shorts-heavy channel was
// reading ~100% engaged because Shorts naturally run 80-97% retention —
// finishing a 30-second clip is not devotion). Long-form: 50%+ average
// retention indicates genuine interest. Shorts: the bar is 85%+ —
// roughly "watched to the end".
const engagementThresholdFor = (r) =>
  ((r.duration || r.durationSeconds || 300) <= 180) ? 0.85 : 0.50;

export default function BrandFunnel({ rows, dateRange, coverageNote = null }) {
  const { isMobile } = useMediaQuery();
  const [particles, setParticles] = useState([]);

  const funnelData = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    // Calculate totals
    const totalImpressions = rows.reduce((sum, r) => sum + (r.impressions || 0), 0);
    const totalViews = rows.reduce((sum, r) => sum + (r.views || 0), 0);
    // Impressions must exceed views for the funnel's premise to hold.
    // When sync coverage mixes lifetime views with partial-period
    // impressions the ratio inverts (7.8M views "from" 111K impressions)
    // — treat impressions as untrustworthy, not as data.
    const hasRealImpressions = totalImpressions > 0 && totalImpressions >= totalViews;
    // Retention coverage: engagement modelling needs real retention rows.
    const retentionRows = rows.filter(r => (r.avgViewPct || 0) > 0).length;
    const retentionCoverage = rows.length > 0 ? retentionRows / rows.length : 0;

    // Keep watch hours for secondary display
    const totalWatchHours = rows.reduce((sum, r) => sum + (r.watchHours || 0), 0);

    // ENGAGED VIEWERS: Estimate viewers who watched 50%+ of the video
    // Using retention data to estimate the proportion of engaged viewers per video
    // If a video has 40% avg retention, we estimate ~60% of viewers are "engaged" (watched meaningfully)
    // Formula: engaged = views × (retention / format-aware bar) capped at 1.0
    const engagedViewers = rows.reduce((sum, r) => {
      const views = r.views || 0;
      const retention = r.avgViewPct || 0;
      // Retention as engagement proxy, against a format-aware bar:
      // 50% of a long-form video or 85% of a Short.
      const engagementRatio = Math.min(retention / engagementThresholdFor(r), 1.0);
      return sum + (views * engagementRatio);
    }, 0);

    // Calculate expected engaged viewers based on industry benchmarks
    const expectedEngagedViewers = rows.reduce((sum, r) => {
      const duration = r.duration || r.durationSeconds || 300;
      const views = r.views || 0;
      const expectedRet = getExpectedRetention(duration);
      // Same format-aware bar as the actuals, so the benchmark ratio
      // compares like with like.
      const expectedEngagementRatio = Math.min(expectedRet / engagementThresholdFor(r), 1.0);
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
        const ratio = Math.min(ret / engagementThresholdFor(r), 1.0);
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
      color: "var(--blue)"
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
        color: "var(--neg)"
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
        color: "var(--pos)"
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
        color: "var(--pos)"
      };
    }

    // Not enough coverage to model engagement at all → the component
    // renders an honest placeholder instead of a fabricated diagnosis
    // ("0 engaged · Leaky Bucket" on a channel whose retention simply
    // hasn't synced).
    if (retentionCoverage < 0.2 || engagedViewers <= 0) {
      return {
        insufficient: true,
        missing: [
          !hasRealImpressions && 'impressions',
          retentionCoverage < 0.2 && 'retention',
        ].filter(Boolean),
        totalViews,
      };
    }

    // Calculate widths for funnel visualization
    const maxWidth = 100;
    // Clamp [48, 82]: wide enough to read, always visibly narrower than
    // the stage above — an unclamped ratio once rendered stage 2 at 70x
    // the canvas (user-reported 2026-08-20, "so distorted and so big").
    const viewsWidth = hasRealImpressions
      ? Math.min(Math.max((totalViews / totalImpressions) * maxWidth, 48), 82)
      : 65;
    // Scale engaged viewers width based on engagement rate (higher = wider bottom)
    // Floor raised 35 → 42 so the stage-3 box never gets too narrow for
    // its own labels ("Engaged Viewers" was clipping at the old minimum).
    const engagedWidth = Math.max(Math.min(engagementQualityRatio * 45, 50), 42);

    return {
      stages: [
        {
          name: "Brand Reach",
          subtitle: "Impressions",
          value: totalImpressions,
          trend: trends.impressions,
          color: "#00D1FF",
          width: maxWidth
        },
        {
          name: "Active Interest",
          subtitle: "Views",
          value: totalViews,
          trend: trends.views,
          color: "#0090c8",
          conversion: ctr,
          width: viewsWidth
        },
        {
          name: "Engaged Viewers",
          subtitle: "50%+ Watch Time",
          value: engagedViewers,
          trend: trends.engagedViewers,
          color: "#CDF200",
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
      hasRealImpressions,
      diagnosis
    };
  }, [rows, dateRange]);

  // Particle animation
  useEffect(() => {
    if (!funnelData || funnelData.insufficient) return;
    
    // Dot density carries the story: every dot starts as an impression,
    // and at each stage boundary it survives with (roughly) the real
    // conversion rate — clamped so even weak funnels stay visibly alive.
    // So impressions hold the most dots, then views, then engaged.
    const viewSurvival = Math.min(Math.max(funnelData.ctr * 6, 0.3), 0.75);
    const engagedSurvival = Math.min(Math.max(funnelData.engagementRate * 1.2, 0.3), 0.7);
    const stageAt = (progress) => {
      const y = (progress / 100) * 510 + 30;
      return y < 190 ? 0 : y < 385 ? 1 : 2;
    };

    const interval = setInterval(() => {
      setParticles(prev => {
        const active = prev.filter(p => p.progress < 100);

        if (Math.random() < 0.35) {
          active.push({
            id: Date.now() + Math.random(),
            progress: 0,
            x: 50 + (Math.random() - 0.5) * 35,
            speed: 0.4 + Math.random() * 0.4
          });
        }

        return active
          .map(p => {
            const next = { ...p, progress: p.progress + p.speed };
            const crossedInto = stageAt(next.progress);
            if (crossedInto > stageAt(p.progress)) {
              const survival = crossedInto === 1 ? viewSurvival : engagedSurvival;
              if (Math.random() > survival) return null;
            }
            return next;
          })
          .filter(Boolean);
      });
    }, 60);
    
    return () => clearInterval(interval);
  }, [funnelData]);

  if (!funnelData) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "24px", padding: "40px", marginBottom: "20px" }}>
        <div style={{ textAlign: "center", color: "var(--muted)" }}>
          No data available for funnel analysis
        </div>
      </div>
    );
  }

  if (funnelData.insufficient) {
    return (
      <div className="section-card" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "24px", padding: "28px", marginBottom: "20px" }}>
        <div style={{ fontFamily: "var(--font-label)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 6 }}>
          Impact Funnel
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
          Not enough analytics coverage yet
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, maxWidth: "72ch" }}>
          The funnel models impressions → views → engaged viewers, and this channel's sync
          hasn't delivered {funnelData.missing.join(" or ") || "the underlying analytics"} yet —
          the views are real ({Math.round(funnelData.totalViews).toLocaleString()} in this window), but modelling
          engagement on top of missing data would produce a made-up verdict. This section fills
          in on its own once the channel's YouTube analytics sync has run.
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
    <div className="section-card target-section" style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "24px",
      "--glow-color": "rgba(0, 209, 255, 0.15)",
      padding: isMobile ? "16px" : "28px",
      marginBottom: "20px",
    }}>
      {/* Header */}
      <div style={{ marginBottom: isMobile ? "16px" : "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "8px" : "12px", marginBottom: "8px", flexWrap: "wrap" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(0, 209, 255, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
            <Target size={20} style={{ color: "#4cd6ff" }} />
          </div>
          <div style={{ fontSize: isMobile ? "22px" : "28px", fontWeight: "700", color: "var(--ink)" }}>Impact Funnel</div>
          <span className="stat-chip purple">{dateRangeLabel}</span>
          {funnelData.hasRealImpressions ? (
            <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--pos)", background: "rgba(205, 242, 0, 0.1)", border: "1px solid rgba(205, 242, 0, 0.3)", padding: "2px 8px", borderRadius: "4px" }}>
              Real Impressions
            </span>
          ) : (
            <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--warn)", background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "2px 8px", borderRadius: "4px" }}>
              Estimated Data
            </span>
          )}
        </div>
        {!isMobile && (
          <div style={{ fontSize: "14px", color: "var(--muted)", marginLeft: "34px" }}>
            How your content converts passive viewers into engaged brand advocates
          </div>
        )}
        {coverageNote && (
          <div style={{ fontSize: "12px", color: "#859399", marginLeft: isMobile ? 0 : "34px", marginTop: "6px", maxWidth: "80ch", lineHeight: 1.5 }}>
            {coverageNote}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 400px", gap: isMobile ? "20px" : "40px", alignItems: "start" }}>

        {/* Left: SVG Funnel */}
        <div style={{ position: "relative", minHeight: isMobile ? "330px" : "576px" }}>
          <svg width="100%" height={isMobile ? "330" : "576"} viewBox="0 0 700 576" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
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
            <text x="350" y="110" textAnchor="middle" fill="#bbc9cf" fontSize="14">
              {stages[0].subtitle}
            </text>
            <text x="350" y="150" textAnchor="middle" fill={stages[0].color} fontSize="36" fontWeight="700">
              {fmtInt(stages[0].value)}
            </text>
            {/* Trend indicator */}
            {stages[0].trend !== undefined && (
              <text x="350" y="175" textAnchor="middle" fontSize="13" fontWeight="600"
                fill={stages[0].trend === 0 ? "#9E9E9E" : stages[0].trend > 0 ? "#CDF200" : "var(--neg)"}>
                {stages[0].trend === 0 ? "—" : `${stages[0].trend > 0 ? "↑ +" : "↓ "}${stages[0].trend.toFixed(1)}% recent vs older`}
              </text>
            )}

            {/* Connector 1 */}
            <line x1="350" y1="190" x2="350" y2="225" stroke="#67747b" strokeWidth="2.5" strokeDasharray="6,6" />
            <polygon points="350,225 344,218 356,218" fill="#67747b" />
            {stages[1].conversion && (
              <text x="390" y="212" fill="#ffab9d" fontSize="14" fontWeight="600">
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
            <text x="350" y="305" textAnchor="middle" fill="#bbc9cf" fontSize="14">
              {stages[1].subtitle}
            </text>
            <text x="350" y="345" textAnchor="middle" fill={stages[1].color} fontSize="36" fontWeight="700">
              {fmtInt(stages[1].value)}
            </text>
            {/* Trend indicator */}
            {stages[1].trend !== undefined && (
              <text x="350" y="370" textAnchor="middle" fontSize="13" fontWeight="600"
                fill={stages[1].trend === 0 ? "#9E9E9E" : stages[1].trend > 0 ? "#CDF200" : "var(--neg)"}>
                {stages[1].trend === 0 ? "—" : `${stages[1].trend > 0 ? "↑ +" : "↓ "}${stages[1].trend.toFixed(1)}% recent vs older`}
              </text>
            )}

            {/* Connector 2 */}
            <line x1="350" y1="385" x2="350" y2="420" stroke="#67747b" strokeWidth="2.5" strokeDasharray="6,6" />
            <polygon points="350,420 344,413 356,413" fill="#67747b" />
            {funnelData.engagementQualityRatio !== undefined && (
              <text x="390" y="407" fill="#bbc9cf" fontSize="14" fontWeight="600">
                {fmtRatio(funnelData.engagementQualityRatio)} vs Benchmark
              </text>
            )}

            {/* Stage 3 Trapezoid - Expanded for readability */}
            <path
              d={`M ${350 - (stages[2].width * 2.2)} 420 L ${350 + (stages[2].width * 2.2)} 420 L ${350 + (stages[2].width * 1.9)} 546 L ${350 - (stages[2].width * 1.9)} 546 Z`}
              fill="url(#grad2)"
              stroke={stages[2].color}
              strokeWidth="3"
              filter="url(#glow)"
            />
            <text x="350" y="448" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700">
              {stages[2].name}
            </text>
            <text x="350" y="478" textAnchor="middle" fill={stages[2].color} fontSize="28" fontWeight="700">
              {fmtEngaged(stages[2].value)}
            </text>
            <text x="350" y="496" textAnchor="middle" fill="#bbc9cf" fontSize="11">
              est. watched 50%+ of a video
            </text>
            <text x="350" y="510" textAnchor="middle" fill="#bbc9cf" fontSize="11">
              (85%+ of a Short)
            </text>
            <text x="350" y="530" textAnchor="middle" fill="#a9b8be" fontSize="11">
              {funnelData.avgWatchMinutesPerView.toFixed(1)} min avg watch time
            </text>

            {/* Animated particles, squeezed to the funnel's width at
                their current depth so none float outside the walls */}
            {particles.map(particle => {
              const y = (particle.progress / 100) * 510 + 30;
              const stage = y < 190 ? 0 : y < 385 ? 1 : 2;
              const opacity = Math.sin((particle.progress / 100) * Math.PI);
              const w1 = stages[1].width * 2.2;
              const w2 = stages[2].width * 2.2;
              const w2b = stages[2].width * 1.9;
              let halfW;
              if (y < 190) halfW = 320 + (w1 - 320) * ((y - 30) / 160);
              else if (y < 225) halfW = w1;
              else if (y < 385) halfW = w1 + (w2 - w1) * ((y - 225) / 160);
              else if (y < 420) halfW = w2;
              else halfW = w2 + (w2b - w2) * ((y - 420) / 110);
              const cx = 350 + ((particle.x - 50) / 17.5) * (halfW * 0.8);

              return (
                <circle
                  key={particle.id}
                  cx={cx}
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
            background: "var(--input-bg)",
            border: `2px solid ${funnelData.diagnosis.color}`,
            borderRadius: "8px",
            padding: "28px"
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "18px", marginBottom: "20px" }}>
              <div style={{
                width: "44px", height: "44px", borderRadius: "12px",
                background: `${funnelData.diagnosis.color}1F`,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <DiagnosisIcon size={22} style={{ color: funnelData.diagnosis.color }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "20px", fontWeight: "700", color: funnelData.diagnosis.color, marginBottom: "10px", fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {funnelData.diagnosis.title}
                </div>
                <div style={{ fontSize: "14px", color: "var(--text)", lineHeight: "1.6" }}>
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
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "16px"
            }}>
              <div>
                <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>Avg CTR</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--tert)" }}>{fmtPct(funnelData.ctr)}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>Engagement Rate</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: funnelData.engagementRate >= 0.7 ? "var(--pos)" : funnelData.engagementRate >= 0.5 ? "var(--warn)" : "var(--neg)" }}>
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
                padding: "16px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "16px"
              }}>
                {funnelData.shortsMetrics.count > 0 && (
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "6px", fontWeight: "600" }}>
                      Shorts ({funnelData.shortsMetrics.count})
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text)" }}>
                      {fmtHours(funnelData.shortsMetrics.totalWatchHours)}
                    </div>
                    <div style={{ fontSize: "11px", color: "#859399", marginTop: "2px" }}>
                      {fmtPct(funnelData.shortsMetrics.avgRetention)} ret
                    </div>
                  </div>
                )}
                {funnelData.longsMetrics.count > 0 && (
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "6px", fontWeight: "600" }}>
                      Long-form ({funnelData.longsMetrics.count})
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text)" }}>
                      {fmtHours(funnelData.longsMetrics.totalWatchHours)}
                    </div>
                    <div style={{ fontSize: "11px", color: "#859399", marginTop: "2px" }}>
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
                color: "var(--warn)",
                background: "#f59e0b15",
                padding: "8px 12px",
                borderRadius: "8px",
                marginBottom: "16px"
              }}>
                High retention % driven by Shorts format - watch hours is a better quality signal
              </div>
            )}

            {funnelData.diagnosis.action && (
              <div style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                padding: "18px",
                borderRadius: "16px"
              }}>
                <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase", marginBottom: "8px" }}>
                  Recommended Action
                </div>
                <div style={{ fontSize: "14px", color: "var(--text)", fontWeight: "600", lineHeight: "1.5" }}>
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
                <Clock size={18} style={{ color: "var(--warn)", flexShrink: 0 }} />
                <div style={{ fontSize: "12px", color: "var(--warn)", lineHeight: "1.4" }}>
                  <strong>No uploads in {funnelData.daysSinceLastUpload} days</strong> — metrics may not reflect current audience engagement
                </div>
              </div>
            )}
          </div>

          {/* Engagement Quality vs Industry Benchmark */}
          <div style={{
            background: "var(--input-bg)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "24px"
          }}>
            <div style={{ fontSize: "12px", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase", marginBottom: "8px" }}>
              Engagement vs Benchmark
            </div>
            <div style={{ fontSize: "14px", color: "#bbc9cf", marginBottom: "10px" }}>
              Engaged viewers compared to 2026 industry standards
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px" }}>
              <div style={{
                fontSize: isMobile ? "28px" : "38px",
                fontWeight: "700",
                color: funnelData.engagementQualityRatio >= 1.3 ? "var(--pos)"
                  : funnelData.engagementQualityRatio >= 1.0 ? "#0090c8"
                  : funnelData.engagementQualityRatio >= 0.7 ? "var(--warn)"
                  : "var(--neg)"
              }}>
                {fmtRatio(funnelData.engagementQualityRatio)}
              </div>
              <div style={{ fontSize: "14px", color: "var(--muted)" }}>
                {fmtEngaged(funnelData.engagedViewers)} engaged
              </div>
            </div>
            <div style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "16px" }}>
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
                background: "var(--input-bg)",
                borderRadius: "6px",
                border: "1px solid var(--border)",
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
                    ? "linear-gradient(90deg, var(--pos), var(--pos-deep))"
                    : funnelData.engagementQualityRatio >= 1.0
                    ? "linear-gradient(90deg, #0090c8, #0077a8)"
                    : funnelData.engagementQualityRatio >= 0.7
                    ? "linear-gradient(90deg, var(--warn), var(--warn-deep))"
                    : "linear-gradient(90deg, var(--neg), var(--neg-deep))",
                  borderRadius: "6px",
                  transition: "width 0.5s ease"
                }} />

                {/* Tier dividers at 0.7x, 1.0x, 1.3x */}
                <div style={{ position: "absolute", left: "20%", top: 0, bottom: 0, width: "1px", background: "#454f55" }} />
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: "2px", background: "#67747b" }} />
                <div style={{ position: "absolute", left: "80%", top: 0, bottom: 0, width: "1px", background: "#454f55" }} />

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
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "11px", color: "#67747b", fontWeight: "600" }}>
                <span>0.5x</span>
                <span>0.7x</span>
                <span style={{ color: "#859399", fontWeight: "700" }}>1.0x</span>
                <span>1.3x</span>
                <span>1.5x+</span>
              </div>

              {/* Tier labels below */}
              <div style={{ display: "flex", marginTop: "8px", fontSize: "11px", color: "#859399" }}>
                <div style={{ flex: 1, textAlign: "center", borderLeft: "2px solid var(--neg)", paddingLeft: "4px" }}>Below</div>
                <div style={{ flex: 1.5, textAlign: "center", borderLeft: "2px solid var(--warn)", paddingLeft: "4px" }}>Average</div>
                <div style={{ flex: 1.5, textAlign: "center", borderLeft: "2px solid #0090c8", paddingLeft: "4px" }}>Good</div>
                <div style={{ flex: 1, textAlign: "center", borderLeft: "2px solid var(--pos)", paddingLeft: "4px" }}>Excellent</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}