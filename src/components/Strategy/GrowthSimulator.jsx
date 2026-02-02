import React, { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, MonitorPlay, Smartphone, Zap, MousePointerClick, UserPlus, ArrowRight, RotateCcw, Minus } from "lucide-react";
import { fmtInt, fmtPct } from "../../lib/utils";

export default function GrowthSimulator({ rows, currentSubscribers = 0, channelSubscriberMap = {}, selectedChannel = "all" }) {
  // Allow manual override of subscriber count if the auto-detected value is 0 or seems wrong
  const [manualSubCount, setManualSubCount] = useState(null);
  // --- CALCULATE BASELINES WITH IMPROVED LOGIC ---
  const baselines = useMemo(() => {
    const defaultBaselines = {
      avgLongViews: 1000,
      avgShortViews: 500,
      longConvRate: 0.008,
      shortConvRate: 0.001,
      avgCtr: 0.05,
      avgRet: 0.50,
      avgConv: 0.005,
      currentLongFreq: 4,
      currentShortFreq: 8
    };

    if (!rows || rows.length === 0) return defaultBaselines;

    // Filter for recent data (last 12 months) for CTR/retention baselines
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 12);

    const recentRows = rows.filter(r => {
      if (!r.publishDate) return true;
      return new Date(r.publishDate) >= cutoffDate;
    });

    // For content cadence, use ALL uploads to get accurate frequency
    const allLongs = rows.filter(r => r.type !== 'short' && !r.isTotal);
    const allShorts = rows.filter(r => r.type === 'short' && !r.isTotal);

    const longs = recentRows.filter(r => r.type !== 'short');
    const shorts = recentRows.filter(r => r.type === 'short');

    // Use median instead of mean to avoid outlier skew
    const getMedian = (arr) => {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const avgLongViews = longs.length ? getMedian(longs.map(r => r.views)) : defaultBaselines.avgLongViews;
    const avgShortViews = shorts.length ? getMedian(shorts.map(r => r.views)) : defaultBaselines.avgShortViews;

    const totalLongSubs = longs.reduce((a, r) => a + (r.subscribers || 0), 0);
    const totalLongViews = longs.reduce((a, r) => a + r.views, 0);
    const longConvRate = totalLongViews > 0 ? totalLongSubs / totalLongViews : defaultBaselines.longConvRate;

    const totalShortSubs = shorts.reduce((a, r) => a + (r.subscribers || 0), 0);
    const totalShortViews = shorts.reduce((a, r) => a + r.views, 0);
    const shortConvRate = totalShortViews > 0 ? totalShortSubs / totalShortViews : defaultBaselines.shortConvRate;

    // Use ONLY long-form CTR since it has the most impact on growth
    // Shorts CTR is typically higher but less meaningful for subscriber conversion
    const avgCtr = longs.length
      ? longs.reduce((a, r) => a + (r.ctr || 0), 0) / longs.length
      : defaultBaselines.avgCtr;

    const avgRet = recentRows.length ? recentRows.reduce((a, r) => a + (r.retention || r.avgViewDuration / r.duration || 0.5), 0) / recentRows.length : defaultBaselines.avgRet;

    const totalSubs = totalLongSubs + totalShortSubs;
    const totalViews = totalLongViews + totalShortViews;
    const avgConv = totalViews > 0 ? totalSubs / totalViews : defaultBaselines.avgConv;

    // Calculate actual monthly cadence from ALL uploads to get true posting frequency
    // Find the date range of all uploads
    const calculateCadence = (videos) => {
      if (videos.length === 0) return 0;

      // Get videos with valid dates
      const datedVideos = videos.filter(v => v.publishDate);
      if (datedVideos.length === 0) return videos.length; // Fallback if no dates

      // Find earliest and latest publish dates
      const dates = datedVideos.map(v => new Date(v.publishDate).getTime());
      const earliest = Math.min(...dates);
      const latest = Math.max(...dates);

      // Calculate months between first and last upload
      const monthsSpan = Math.max(1, (latest - earliest) / (1000 * 60 * 60 * 24 * 30));

      // Videos per month = total videos / months span
      return Math.round(datedVideos.length / monthsSpan);
    };

    const currentLongFreq = calculateCadence(allLongs) || defaultBaselines.currentLongFreq;
    const currentShortFreq = calculateCadence(allShorts) || defaultBaselines.currentShortFreq;

    return {
      avgLongViews: Math.round(avgLongViews),
      avgShortViews: Math.round(avgShortViews),
      longConvRate,
      shortConvRate,
      avgCtr,
      avgRet,
      avgConv,
      currentLongFreq,
      currentShortFreq
    };
  }, [rows]);

  const [inputs, setInputs] = useState({
    longsPerMonth: baselines.currentLongFreq,
    shortsPerMonth: baselines.currentShortFreq,
    retentionLift: 0,
    ctrLift: 0,
    convLift: 0
  });

  const handleReset = () => {
    setInputs({
      longsPerMonth: baselines.currentLongFreq,
      shortsPerMonth: baselines.currentShortFreq,
      retentionLift: 0,
      ctrLift: 0,
      convLift: 0
    });
  };

  // Use manual override if set, otherwise use the passed prop
  const currentSubCount = manualSubCount !== null ? manualSubCount : currentSubscribers;

  const hasMultipleChannels = Object.keys(channelSubscriberMap).length > 1;

  // --- PROJECTION CALCULATION ---
  const projection = useMemo(() => {
    const months = 6;
    const data = [];
    let cumulativeSubsBase = 0;
    let cumulativeSubsProj = 0;

    // Add Month 0 (current state)
    data.push({
      month: "Now",
      baseSubsAcc: currentSubCount,
      projSubsAcc: currentSubCount
    });

    for (let i = 1; i <= months; i++) {
      // Baseline (status quo)
      const baseSubs = (baselines.currentLongFreq * baselines.avgLongViews * baselines.longConvRate) +
                       (baselines.currentShortFreq * baselines.avgShortViews * baselines.shortConvRate);
      cumulativeSubsBase += baseSubs;

      // Projected scenario
      const retentionMultiplier = 1 + ((inputs.retentionLift / 100) * 1.5); // 1.5x amplifier for retention
      const ctrMultiplier = 1 + (inputs.ctrLift / 100);
      const convMultiplier = 1 + (inputs.convLift / 100);

      const projLongViews = baselines.avgLongViews * retentionMultiplier * ctrMultiplier;
      const projShortViews = baselines.avgShortViews * retentionMultiplier * ctrMultiplier;

      // Apply conversion multiplier to individual conversion rates for more accurate modeling
      const projLongConvRate = baselines.longConvRate * convMultiplier;
      const projShortConvRate = baselines.shortConvRate * convMultiplier;

      const projSubs = (inputs.longsPerMonth * projLongViews * projLongConvRate) +
                       (inputs.shortsPerMonth * projShortViews * projShortConvRate);

      cumulativeSubsProj += projSubs;

      data.push({
        month: `M${i}`,
        baseSubsAcc: Math.round(currentSubCount + cumulativeSubsBase),
        projSubsAcc: Math.round(currentSubCount + cumulativeSubsProj)
      });
    }

    const totalGain = Math.round(cumulativeSubsProj);
    const baselineTotal = Math.round(cumulativeSubsBase);
    const improvement = baselineTotal > 0 ? ((totalGain / baselineTotal - 1) * 100) : 0;

    return { data, totalGain, baselineTotal, improvement };
  }, [baselines, inputs, currentSubCount]);

  // --- STYLES ---
  const s = {
    card: {
      backgroundColor: "#1E1E1E",
      border: "2px solid #333",
      borderRadius: "12px",
      padding: "28px",
      marginBottom: "20px",
      color: "#fff"
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "28px"
    },
    headerLeft: {
      flex: 1
    },
    headerRight: {
      display: "flex",
      gap: "12px",
      alignItems: "center"
    },
    h2: {
      fontSize: "20px",
      fontWeight: "800",
      color: "#fff",
      margin: 0,
      letterSpacing: "-0.01em"
    },
    sub: {
      fontSize: "13px",
      color: "#9E9E9E",
      marginTop: "6px",
      lineHeight: "1.4"
    },
    resetBtn: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "8px 14px",
      backgroundColor: "#252525",
      border: "1px solid #333",
      borderRadius: "8px",
      color: "#E0E0E0",
      fontSize: "12px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "all 0.2s ease",
    },
    layout: {
      display: "grid",
      gridTemplateColumns: "380px 1fr",
      gap: "48px",
      alignItems: "start"
    },
    controls: {
      display: "flex",
      flexDirection: "column",
      gap: "16px"
    },
    sectionLabel: {
      fontSize: "10px",
      fontWeight: "800",
      color: "#666",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      marginBottom: "8px",
      marginTop: "4px"
    },
    controlGroup: {
      display: "flex",
      flexDirection: "column",
      gap: "6px"
    },
    labelRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "2px"
    },
    label: {
      fontSize: "12px",
      fontWeight: "700",
      color: "#E0E0E0",
      letterSpacing: "0.01em"
    },
    impactPill: {
      fontSize: "11px",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "4px 10px",
      borderRadius: "6px",
      background: "#252525",
      border: "1px solid #333",
      color: "#E0E0E0",
      fontWeight: "600"
    },
    currentBadge: {
      fontSize: "10px",
      fontWeight: "600",
      color: "#9E9E9E",
      backgroundColor: "#252525",
      padding: "3px 8px",
      borderRadius: "5px",
      letterSpacing: "0.02em"
    },
    impactVal: {
      color: "#4ade80",
      fontWeight: "700"
    },
    sliderBox: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "8px 12px",
      backgroundColor: "#252525",
      borderRadius: "10px",
      border: "1px solid #333"
    },
    slider: {
      flex: 1,
      accentColor: "#60a5fa",
      cursor: "pointer",
      height: "6px"
    },
    valBox: {
      minWidth: "60px",
      textAlign: "right",
      fontSize: "14px",
      fontWeight: "700",
      color: "#fff",
      backgroundColor: "#333",
      padding: "6px 10px",
      borderRadius: "6px"
    },
    divider: {
      height: "1px",
      backgroundColor: "#333",
      margin: "12px 0"
    },
    forecastHeader: {
      display: "flex",
      alignItems: "center",
      gap: "32px",
      padding: "24px",
      backgroundColor: "#252525",
      border: "2px solid #333",
      borderRadius: "12px",
      marginBottom: "28px"
    },
    forecastMetric: {
      display: "flex",
      flexDirection: "column",
      gap: "6px"
    },
    forecastLabel: {
      fontSize: "11px",
      fontWeight: "700",
      color: "#9E9E9E",
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },
    forecastValue: {
      fontSize: "32px",
      fontWeight: "900",
      color: "#fff",
      letterSpacing: "-0.02em"
    },
    forecastGain: {
      fontSize: "13px",
      fontWeight: "600",
      color: "#4ade80"
    },
    forecastArrow: {
      fontSize: "32px",
      color: "#666",
      fontWeight: "300",
      marginTop: "12px"
    },
    forecastDivider: {
      width: "1px",
      height: "80px",
      backgroundColor: "#333",
      margin: "0 8px"
    },
    forecastChanges: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    },
    changeItem: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "13px",
      color: "#E0E0E0",
      fontWeight: "600"
    },
    tooltip: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      backgroundColor: "#374151",
      border: "1px solid #4b5563",
      color: "#9ca3af",
      fontSize: "10px",
      fontWeight: "700",
      cursor: "help",
      marginLeft: "6px"
    }
  };

  return (
    <div style={s.card}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h2 style={s.h2}>Growth Projection Simulator</h2>
          <div style={s.sub}>
            Model subscriber growth by adjusting content cadence and quality metrics over 6 months.
          </div>
        </div>
        <div style={s.headerRight}>
          <button 
            style={s.resetBtn} 
            onClick={handleReset}
            onMouseEnter={(e) => e.target.style.backgroundColor = "#333"}
            onMouseLeave={(e) => e.target.style.backgroundColor = "#252525"}
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <TrendingUp size={24} className="text-green-400" />
        </div>
      </div>

      {/* HIGH-LEVEL FORECAST SUMMARY */}
      <div style={s.forecastHeader}>
        <div style={s.forecastMetric}>
          <div style={s.forecastLabel}>Current Subscribers</div>
          {currentSubscribers === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                value={manualSubCount || ''}
                onChange={(e) => setManualSubCount(e.target.value ? parseInt(e.target.value) : null)}
                placeholder="Enter count"
                style={{
                  ...s.forecastValue,
                  width: '180px',
                  padding: '8px 12px',
                  backgroundColor: '#252525',
                  border: '2px solid #f59e0b',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '24px'
                }}
              />
              <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '600', maxWidth: '120px', lineHeight: '1.3' }}>
                No subscriber data found. Enter manually.
              </div>
            </div>
          ) : (
            <div>
              <div style={s.forecastValue}>{fmtInt(currentSubCount)}</div>
              {hasMultipleChannels && selectedChannel === "all" && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                  {Object.entries(channelSubscriberMap).map(([name, stats]) => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9E9E9E' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#60a5fa', flexShrink: 0 }} />
                      <span style={{ fontWeight: '600', color: '#E0E0E0' }}>{stats.title || name}</span>
                      <span>{fmtInt(stats.subscriberCount)}</span>
                    </div>
                  ))}
                </div>
              )}
              {!hasMultipleChannels && selectedChannel !== "all" && (
                <div style={{ fontSize: '11px', color: '#9E9E9E', marginTop: '4px' }}>
                  {selectedChannel}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div style={s.forecastArrow}>→</div>
        
        <div style={s.forecastMetric}>
          <div style={s.forecastLabel}>6-Month Projection</div>
          <div style={{...s.forecastValue, color: "#22c55e"}}>
            {fmtInt(currentSubCount + projection.totalGain)}
          </div>
          <div style={s.forecastGain}>+{fmtInt(projection.totalGain)} new subs</div>
        </div>

        <div style={s.forecastDivider} />

        <div style={s.forecastChanges}>
          <div style={s.forecastLabel}>Changes from Status Quo</div>
          {inputs.longsPerMonth !== baselines.currentLongFreq && (
            <div style={s.changeItem}>
              <MonitorPlay size={14} className="text-blue-400" />
              <span>Long-form: {inputs.longsPerMonth}/mo {inputs.longsPerMonth > baselines.currentLongFreq ? '↑' : '↓'}</span>
            </div>
          )}
          {inputs.shortsPerMonth !== baselines.currentShortFreq && (
            <div style={s.changeItem}>
              <Smartphone size={14} className="text-pink-400" />
              <span>Shorts: {inputs.shortsPerMonth}/mo {inputs.shortsPerMonth > baselines.currentShortFreq ? '↑' : '↓'}</span>
            </div>
          )}
          {inputs.ctrLift > 0 && (
            <div style={s.changeItem}>
              <MousePointerClick size={14} className="text-purple-400" />
              <span>CTR +{inputs.ctrLift}%</span>
            </div>
          )}
          {inputs.retentionLift > 0 && (
            <div style={s.changeItem}>
              <Zap size={14} className="text-yellow-400" />
              <span>Retention +{inputs.retentionLift}%</span>
            </div>
          )}
          {inputs.convLift > 0 && (
            <div style={s.changeItem}>
              <UserPlus size={14} className="text-green-400" />
              <span>Conversion +{inputs.convLift}%</span>
            </div>
          )}
          {inputs.longsPerMonth === baselines.currentLongFreq && 
           inputs.shortsPerMonth === baselines.currentShortFreq &&
           inputs.ctrLift === 0 && inputs.retentionLift === 0 && inputs.convLift === 0 && (
            <div style={{...s.changeItem, color: "#9E9E9E"}}>
              <Minus size={14} />
              <span>No changes (Status Quo)</span>
            </div>
          )}
          {projection.improvement !== 0 && (
            <div style={{...s.changeItem, color: projection.improvement > 0 ? "#22c55e" : "#ef4444", fontWeight: "700", marginTop: "4px"}}>
              {projection.improvement > 0 ? '↑' : '↓'} {Math.abs(projection.improvement).toFixed(0)}% vs baseline
            </div>
          )}
        </div>
      </div>

      <div style={s.layout}>
        {/* LEFT SIDE: CONTROLS */}
        <div style={s.controls}>
          {/* CADENCE SECTION */}
          <div style={s.sectionLabel}>Content Cadence</div>

          <div style={s.controlGroup}>
            <div style={s.labelRow}>
              <div style={s.label}>
                Long Form Frequency
              </div>
              <div style={s.currentBadge}>Current: {baselines.currentLongFreq}/mo</div>
            </div>
            <div style={s.sliderBox}>
              <MonitorPlay size={18} className="text-blue-400" />
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                style={s.slider}
                value={inputs.longsPerMonth}
                onChange={(e) => setInputs({ ...inputs, longsPerMonth: Number(e.target.value) })}
              />
              <div style={{
                ...s.valBox,
                color: inputs.longsPerMonth > baselines.currentLongFreq ? "#4ade80" : 
                       inputs.longsPerMonth < baselines.currentLongFreq ? "#f87171" : "#fff"
              }}>
                {inputs.longsPerMonth}/mo
              </div>
            </div>
          </div>

          <div style={s.controlGroup}>
            <div style={s.labelRow}>
              <div style={s.label}>
                Shorts Frequency
              </div>
              <div style={s.currentBadge}>Current: {baselines.currentShortFreq}/mo</div>
            </div>
            <div style={s.sliderBox}>
              <Smartphone size={18} className="text-pink-400" />
              <input
                type="range"
                min="0"
                max="60"
                step="1"
                style={s.slider}
                value={inputs.shortsPerMonth}
                onChange={(e) => setInputs({ ...inputs, shortsPerMonth: Number(e.target.value) })}
              />
              <div style={{
                ...s.valBox,
                color: inputs.shortsPerMonth > baselines.currentShortFreq ? "#4ade80" : 
                       inputs.shortsPerMonth < baselines.currentShortFreq ? "#f87171" : "#fff"
              }}>
                {inputs.shortsPerMonth}/mo
              </div>
            </div>
          </div>

          <div style={s.divider} />

          {/* QUALITY SECTION */}
          <div style={s.sectionLabel}>Content Quality Lifts</div>

          <div style={s.controlGroup}>
            <div style={s.labelRow}>
              <div style={s.label}>
                Packaging (CTR Lift)
              </div>
              <div style={s.impactPill}>
                <span>{fmtPct(baselines.avgCtr, 1)}</span>
                <ArrowRight size={10} />
                <span style={s.impactVal}>{fmtPct(baselines.avgCtr * (1 + inputs.ctrLift / 100), 1)}</span>
              </div>
            </div>
            <div style={s.sliderBox}>
              <MousePointerClick size={18} className="text-purple-400" />
              <input
                type="range"
                min="0"
                max="30"
                step="5"
                style={s.slider}
                value={inputs.ctrLift}
                onChange={(e) => setInputs({ ...inputs, ctrLift: Number(e.target.value) })}
              />
              <div style={s.valBox}>+{inputs.ctrLift}%</div>
            </div>
          </div>

          <div style={s.controlGroup}>
            <div style={s.labelRow}>
              <div style={s.label}>
                Content Quality (Retention Lift)
              </div>
              <div style={s.impactPill}>
                <span>{fmtPct(baselines.avgRet, 1)}</span>
                <ArrowRight size={10} />
                <span style={s.impactVal}>{fmtPct(baselines.avgRet * (1 + inputs.retentionLift / 100), 1)}</span>
              </div>
            </div>
            <div style={s.sliderBox}>
              <Zap size={18} className="text-yellow-400" />
              <input
                type="range"
                min="0"
                max="30"
                step="5"
                style={s.slider}
                value={inputs.retentionLift}
                onChange={(e) => setInputs({ ...inputs, retentionLift: Number(e.target.value) })}
              />
              <div style={s.valBox}>+{inputs.retentionLift}%</div>
            </div>
          </div>

          <div style={s.controlGroup}>
            <div style={s.labelRow}>
              <div style={s.label}>
                Conversion Rate Lift
              </div>
              <div style={s.impactPill}>
                <span>{fmtPct(baselines.avgConv, 2)}</span>
                <ArrowRight size={10} />
                <span style={s.impactVal}>{fmtPct(baselines.avgConv * (1 + inputs.convLift / 100), 2)}</span>
              </div>
            </div>
            <div style={s.sliderBox}>
              <UserPlus size={18} className="text-green-400" />
              <input
                type="range"
                min="0"
                max="50"
                step="5"
                style={s.slider}
                value={inputs.convLift}
                onChange={(e) => setInputs({ ...inputs, convLift: Number(e.target.value) })}
              />
              <div style={s.valBox}>+{inputs.convLift}%</div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: CHART */}
        <div style={{ height: 480, width: "100%" }}>
          <ResponsiveContainer>
            <AreaChart data={projection.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorProj" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4ade80" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorBase" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12, fill: "#9E9E9E" }}
                axisLine={{ stroke: "#333" }}
              />
              <YAxis 
                tickFormatter={fmtInt} 
                tick={{ fontSize: 12, fill: "#9E9E9E" }}
                axisLine={{ stroke: "#333" }}
              />
              <Tooltip
                formatter={(val, name) => [
                  fmtInt(val),
                  name === "projSubsAcc" ? "Projected Subs" : "Baseline Subs"
                ]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #333",
                  backgroundColor: "#1E1E1E",
                  color: "#fff",
                  fontSize: "12px",
                  padding: "8px 12px"
                }}
                labelStyle={{ color: "#9E9E9E", fontWeight: "600" }}
              />
              <Legend 
                verticalAlign="top" 
                height={36}
                wrapperStyle={{ fontSize: "13px", fontWeight: "600" }}
              />
              <Area
                type="monotone"
                dataKey="baseSubsAcc"
                name="Baseline Subs"
                stroke="#94a3b8"
                fillOpacity={1}
                fill="url(#colorBase)"
                strokeDasharray="5 5"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="projSubsAcc"
                name="Projected Subs"
                stroke="#4ade80"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorProj)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}