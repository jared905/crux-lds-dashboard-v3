import React, { useMemo } from "react";
import { TrendingUp, Award, AlertCircle, CheckCircle } from "lucide-react";

export default function ContentPerformanceTiers({ rows }) {
  const analysis = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    // Sort videos by views to determine tiers
    const sortedByViews = [...rows].sort((a, b) => (b.views || 0) - (a.views || 0));
    
    const total = sortedByViews.length;
    const top20Index = Math.ceil(total * 0.2);
    const bottom20Index = Math.floor(total * 0.8);

    // Categorize videos
    const winners = sortedByViews.slice(0, top20Index);
    const average = sortedByViews.slice(top20Index, bottom20Index);
    const underperformers = sortedByViews.slice(bottom20Index);

    // Calculate metrics for each tier
    const calcTierMetrics = (videos) => {
      const totalViews = videos.reduce((sum, v) => sum + (v.views || 0), 0);
      const totalWatchHours = videos.reduce((sum, v) => sum + (v.watchHours || 0), 0);
      const avgViews = totalViews / videos.length;
      const avgCtr = videos.reduce((sum, v) => sum + (v.ctr || 0), 0) / videos.length;
      const avgRetention = videos.reduce((sum, v) => sum + (v.retention || 0), 0) / videos.length;
      const viewShare = totalViews / sortedByViews.reduce((sum, v) => sum + (v.views || 0), 0);
      
      return {
        count: videos.length,
        totalViews,
        totalWatchHours,
        avgViews,
        avgCtr,
        avgRetention,
        viewShare,
        videos
      };
    };

    const winnerMetrics = calcTierMetrics(winners);
    const averageMetrics = calcTierMetrics(average);
    const underperformerMetrics = calcTierMetrics(underperformers);

    return {
      winners: winnerMetrics,
      average: averageMetrics,
      underperformers: underperformerMetrics,
      total
    };
  }, [rows]);

  if (!analysis) {
    return (
      <div style={{ background: "#1E1E1E", border: "1px solid #333", borderRadius: "12px", padding: "40px", marginBottom: "20px" }}>
        <div style={{ textAlign: "center", color: "#9E9E9E" }}>
          No data available for performance tier analysis
        </div>
      </div>
    );
  }

  const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
  const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;
  const fmtDate = (dateStr) => {
    if (!dateStr) return "No date";
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Donut chart calculations
  const total = analysis.winners.count + analysis.average.count + analysis.underperformers.count;
  const winnerPct = (analysis.winners.count / total) * 100;
  const averagePct = (analysis.average.count / total) * 100;
  const underperformerPct = (analysis.underperformers.count / total) * 100;

  // SVG donut chart
  const size = 200;
  const strokeWidth = 40;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  
  const winnerDash = (winnerPct / 100) * circumference;
  const averageDash = (averagePct / 100) * circumference;
  const underperformerDash = (underperformerPct / 100) * circumference;

  const winnerOffset = 0;
  const averageOffset = -winnerDash;
  const underperformerOffset = -(winnerDash + averageDash);

  const s = {
    card: {
      backgroundColor: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "20px",
      position: "relative",
      overflow: "hidden"
    },
    header: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      marginBottom: "24px"
    },
    title: {
      fontSize: "18px",
      fontWeight: "700",
      color: "#fff"
    },
    mainContent: {
      display: "grid",
      gridTemplateColumns: "300px 1fr",
      gap: "32px",
      alignItems: "start"
    },
    donutContainer: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "20px"
    },
    legend: {
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      width: "100%"
    },
    legendItem: (color) => ({
      display: "flex",
      alignItems: "center",
      gap: "10px",
      fontSize: "13px",
      color: "#E0E0E0"
    }),
    legendDot: (color) => ({
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      backgroundColor: color,
      flexShrink: 0
    }),
    tiersGrid: {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: "16px"
    },
    tierCard: (color) => ({
      background: "#252525",
      border: `1px solid ${color}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: "8px",
      padding: "20px"
    }),
    tierHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "16px"
    },
    tierTitle: (color) => ({
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "16px",
      fontWeight: "700",
      color
    }),
    tierCount: (color) => ({
      fontSize: "24px",
      fontWeight: "700",
      color
    }),
    metricsGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
      gap: "16px",
      marginBottom: "16px"
    },
    metric: {
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    },
    metricLabel: {
      fontSize: "11px",
      color: "#9E9E9E",
      fontWeight: "600",
      textTransform: "uppercase"
    },
    metricValue: (color) => ({
      fontSize: "18px",
      fontWeight: "700",
      color
    }),
    insight: {
      background: "#1E1E1E",
      padding: "12px",
      borderRadius: "6px",
      fontSize: "13px",
      color: "#E0E0E0",
      lineHeight: "1.5"
    },
    videoList: {
      marginTop: "12px",
      fontSize: "12px",
      color: "#9E9E9E"
    },
    videoItem: {
      padding: "6px 0",
      borderBottom: "1px solid #333"
    }
  };

  const colors = {
    winners: "#10b981",
    average: "#f59e0b", 
    underperformers: "#ef4444"
  };

  return (
    <div style={s.card}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #10b981, #f59e0b, #ef4444)" }} />
      <div style={s.header}>
        <Award size={20} style={{ color: "#10b981" }} />
        <div style={s.title}>Content Performance Tiers</div>
        <div style={{ fontSize: "12px", color: "#9E9E9E", background: "#252525", padding: "4px 10px", borderRadius: "6px" }}>
          Distribution by Views
        </div>
      </div>

      <div style={s.mainContent}>
        {/* Left side: Donut Chart + Legend */}
        <div style={s.donutContainer}>
          <div style={{ position: "relative", width: size, height: size }}>
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
              {/* Background circle */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#252525"
                strokeWidth={strokeWidth}
              />
              
              {/* Winners segment */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={colors.winners}
                strokeWidth={strokeWidth}
                strokeDasharray={`${winnerDash} ${circumference - winnerDash}`}
                strokeDashoffset={winnerOffset}
                strokeLinecap="round"
              />
              
              {/* Average segment */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={colors.average}
                strokeWidth={strokeWidth}
                strokeDasharray={`${averageDash} ${circumference - averageDash}`}
                strokeDashoffset={averageOffset}
                strokeLinecap="round"
              />
              
              {/* Underperformers segment */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={colors.underperformers}
                strokeWidth={strokeWidth}
                strokeDasharray={`${underperformerDash} ${circumference - underperformerDash}`}
                strokeDashoffset={underperformerOffset}
                strokeLinecap="round"
              />
            </svg>
            
            {/* Center text */}
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "32px", fontWeight: "700", color: "#fff" }}>{total}</div>
              <div style={{ fontSize: "12px", color: "#9E9E9E" }}>Total Videos</div>
            </div>
          </div>

          <div style={s.legend}>
            <div style={s.legendItem(colors.winners)}>
              <div style={s.legendDot(colors.winners)} />
              <div style={{ flex: 1 }}>
                <strong>Scale</strong> (Top 20%)
              </div>
              <div style={{ fontWeight: "700" }}>{analysis.winners.count} videos</div>
            </div>
            <div style={s.legendItem(colors.average)}>
              <div style={s.legendDot(colors.average)} />
              <div style={{ flex: 1 }}>
                <strong>Maintain</strong> (Middle 60%)
              </div>
              <div style={{ fontWeight: "700" }}>{analysis.average.count} videos</div>
            </div>
            <div style={s.legendItem(colors.underperformers)}>
              <div style={s.legendDot(colors.underperformers)} />
              <div style={{ flex: 1 }}>
                <strong>Cut/Pivot</strong> (Bottom 20%)
              </div>
              <div style={{ fontWeight: "700" }}>{analysis.underperformers.count} videos</div>
            </div>
          </div>
        </div>

        {/* Right side: Detailed Tier Analysis */}
        <div style={s.tiersGrid}>
          {/* Scale Tier */}
          <div style={s.tierCard(colors.winners)}>
            <div style={s.tierHeader}>
              <div style={s.tierTitle(colors.winners)}>
                <TrendingUp size={20} />
                <span>🚀 Scale — Double Down (Top 20%)</span>
              </div>
              <div style={s.tierCount(colors.winners)}>{analysis.winners.count}</div>
            </div>
            
            <div style={s.metricsGrid}>
              <div style={s.metric}>
                <div style={s.metricLabel}>Avg Views</div>
                <div style={s.metricValue(colors.winners)}>{fmtInt(analysis.winners.avgViews)}</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricLabel}>Total Views</div>
                <div style={s.metricValue(colors.winners)}>{fmtInt(analysis.winners.totalViews)}</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricLabel}>View Share</div>
                <div style={s.metricValue(colors.winners)}>{fmtPct(analysis.winners.viewShare)}</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricLabel}>Avg CTR</div>
                <div style={s.metricValue(colors.winners)}>{fmtPct(analysis.winners.avgCtr)}</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricLabel}>Avg Retention</div>
                <div style={s.metricValue(colors.winners)}>{fmtPct(analysis.winners.avgRetention)}</div>
              </div>
            </div>

            <div style={s.insight}>
              <strong style={{ color: colors.winners }}>💡 Key Insight:</strong> Your top {analysis.winners.count} video{analysis.winners.count !== 1 ? 's' : ''} ({winnerPct.toFixed(0)}% of content) generate{analysis.winners.count === 1 ? 's' : ''} {fmtPct(analysis.winners.viewShare)} of total views. 
              {analysis.winners.avgCtr > 0.06 && analysis.winners.avgRetention > 0.5 
                ? " These videos excel in both packaging (CTR) and quality (retention) — analyze what makes them work and replicate the formula."
                : analysis.winners.avgCtr > 0.06 
                ? " Strong thumbnails/titles are driving clicks — focus on improving retention to maximize these opportunities."
                : " High retention shows great content quality — improve thumbnails/titles to get more clicks."}
            </div>

            {analysis.winners.videos.length <= 5 && (
              <div style={s.videoList}>
                <div style={{ fontWeight: "600", marginBottom: "6px", color: "#E0E0E0" }}>Top Performers:</div>
                {analysis.winners.videos.slice(0, 3).map((v, i) => (
                  <div key={i} style={s.videoItem}>
                    <div style={{ marginBottom: "2px" }}>
                      {i + 1}. {v.title}
                    </div>
                    <div style={{ fontSize: "11px", color: "#666", paddingLeft: "14px" }}>
                      {fmtDate(v.publishDate)} • <strong>{fmtInt(v.views)}</strong> views
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Maintain Tier */}
          <div style={s.tierCard(colors.average)}>
            <div style={s.tierHeader}>
              <div style={s.tierTitle(colors.average)}>
                <CheckCircle size={20} />
                <span>✓ Maintain — Keep Publishing (Middle 60%)</span>
              </div>
              <div style={s.tierCount(colors.average)}>{analysis.average.count}</div>
            </div>
            
            <div style={s.metricsGrid}>
              <div style={s.metric}>
                <div style={s.metricLabel}>Avg Views</div>
                <div style={s.metricValue(colors.average)}>{fmtInt(analysis.average.avgViews)}</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricLabel}>Total Views</div>
                <div style={s.metricValue(colors.average)}>{fmtInt(analysis.average.totalViews)}</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricLabel}>View Share</div>
                <div style={s.metricValue(colors.average)}>{fmtPct(analysis.average.viewShare)}</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricLabel}>Avg CTR</div>
                <div style={s.metricValue(colors.average)}>{fmtPct(analysis.average.avgCtr)}</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricLabel}>Avg Retention</div>
                <div style={s.metricValue(colors.average)}>{fmtPct(analysis.average.avgRetention)}</div>
              </div>
            </div>

            <div style={s.insight}>
              <strong style={{ color: colors.average }}>💡 Key Insight:</strong> This is your baseline performance. 
              {Math.abs(analysis.average.avgCtr - analysis.winners.avgCtr) / analysis.winners.avgCtr > 0.3
                ? ` CTR is ${fmtPct(Math.abs(analysis.winners.avgCtr - analysis.average.avgCtr) / analysis.winners.avgCtr)} lower than winners — small thumbnail/title improvements could move these videos up a tier.`
                : Math.abs(analysis.average.avgRetention - analysis.winners.avgRetention) / analysis.winners.avgRetention > 0.3
                ? ` Retention is ${fmtPct(Math.abs(analysis.winners.avgRetention - analysis.average.avgRetention) / analysis.winners.avgRetention)} lower than winners — tighter editing and stronger hooks could boost performance.`
                : " Performance is consistent. Focus on replicating winner patterns to move more content into the top tier."}
            </div>
          </div>

          {/* Cut/Pivot Tier */}
          <div style={s.tierCard(colors.underperformers)}>
            <div style={s.tierHeader}>
              <div style={s.tierTitle(colors.underperformers)}>
                <AlertCircle size={20} />
                <span>⚠️ Cut/Pivot — Rethink Strategy (Bottom 20%)</span>
              </div>
              <div style={s.tierCount(colors.underperformers)}>{analysis.underperformers.count}</div>
            </div>
            
            <div style={s.metricsGrid}>
              <div style={s.metric}>
                <div style={s.metricLabel}>Avg Views</div>
                <div style={s.metricValue(colors.underperformers)}>{fmtInt(analysis.underperformers.avgViews)}</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricLabel}>Total Views</div>
                <div style={s.metricValue(colors.underperformers)}>{fmtInt(analysis.underperformers.totalViews)}</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricLabel}>View Share</div>
                <div style={s.metricValue(colors.underperformers)}>{fmtPct(analysis.underperformers.viewShare)}</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricLabel}>Avg CTR</div>
                <div style={s.metricValue(colors.underperformers)}>{fmtPct(analysis.underperformers.avgCtr)}</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricLabel}>Avg Retention</div>
                <div style={s.metricValue(colors.underperformers)}>{fmtPct(analysis.underperformers.avgRetention)}</div>
              </div>
            </div>

            <div style={s.insight}>
              <strong style={{ color: colors.underperformers }}>💡 Key Insight:</strong> These {analysis.underperformers.count} videos need attention. 
              {analysis.underperformers.avgCtr < 0.03 && analysis.underperformers.avgRetention > 0.4
                ? " Good retention but poor CTR suggests packaging issues — the content is solid but thumbnails/titles aren't driving clicks."
                : analysis.underperformers.avgCtr > 0.05 && analysis.underperformers.avgRetention < 0.3
                ? " Strong CTR but weak retention means thumbnails over-promise. Either improve content delivery or adjust expectations set by packaging."
                : " Both CTR and retention are low — these may be off-topic, poorly timed, or need complete rework. Consider unlisting or using as learning examples."}
            </div>

            {analysis.underperformers.videos.length <= 5 && (
              <div style={s.videoList}>
                <div style={{ fontWeight: "600", marginBottom: "6px", color: "#E0E0E0" }}>Needs Improvement:</div>
                {analysis.underperformers.videos.slice(0, 3).map((v, i) => (
                  <div key={i} style={s.videoItem}>
                    <div style={{ marginBottom: "2px" }}>
                      {v.title}
                    </div>
                    <div style={{ fontSize: "11px", color: "#666" }}>
                      {fmtDate(v.publishDate)} • <strong>{fmtInt(v.views)}</strong> views (CTR: {fmtPct(v.ctr)}, Ret: {fmtPct(v.retention)})
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Footer */}
      <div style={{ 
        marginTop: "24px", 
        paddingTop: "20px", 
        borderTop: "1px solid #333",
        background: "#252525",
        padding: "16px",
        borderRadius: "8px"
      }}>
        <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", marginBottom: "8px" }}>
          📊 Portfolio Health Summary
        </div>
        <div style={{ fontSize: "13px", color: "#E0E0E0", lineHeight: "1.6" }}>
          {analysis.winners.viewShare > 0.6 
            ? `Strong concentration: Top ${winnerPct.toFixed(0)}% of content drives ${fmtPct(analysis.winners.viewShare)} of views. This is normal, but diversifying successful patterns could reduce risk.`
            : analysis.winners.viewShare > 0.4
            ? `Healthy distribution: Performance is balanced across tiers. Continue optimizing average performers to move them into the winner category.`
            : `Opportunity for improvement: Winners aren't dominating enough. Focus on identifying and replicating what makes top performers successful.`}
        </div>
      </div>
    </div>
  );
}