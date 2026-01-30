import React, { useMemo, useState } from "react";
import { 
  Hash, Zap, AlertCircle, Sparkles, Calendar, RefreshCw, 
  TrendingUp, Target, Lightbulb
} from "lucide-react";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

// Expanded stopwords
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "by",
  "is", "are", "was", "were", "be", "been", "have", "has", "had", "will", "would", "could",
  "should", "may", "might", "must", "can", "cant", "dont", "wont", "didnt", "doesnt",
  "how", "what", "why", "who", "when", "where", "which", "video", "videos",
  "shorts", "youtube", "channel", "my", "your", "our", "we", "i", "you", "it", "this", "that",
  "these", "those", "from", "vs", "not", "do", "just", "so", "very", "really", "new", "now",
  "get", "gets", "getting", "make", "makes", "making", "about", "all", "also", "way", "ways"
]);

export default function Opportunities({ rows }) {
  const insights = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    const avgViews = rows.reduce((sum, r) => sum + r.views, 0) / rows.length;
    const avgCtr = rows.filter(r => r.ctr > 0).reduce((sum, r) => sum + r.ctr, 0) / Math.max(rows.filter(r => r.ctr > 0).length, 1);
    const avgRet = rows.filter(r => r.retention > 0).reduce((sum, r) => sum + r.retention, 0) / Math.max(rows.filter(r => r.retention > 0).length, 1);
    
    const totalChannelViews = rows.reduce((sum, r) => sum + r.views, 0);
    const totalChannelSubs = rows.reduce((sum, r) => sum + (r.subscribers || 0), 0);
    const avgSubsPerKViews = totalChannelViews > 0 ? (totalChannelSubs / totalChannelViews) * 1000 : 0;

    const now = new Date();

    // === TOP PERFORMING THEMES ===
    const phraseMap = {};
    
    rows.forEach(r => {
      if (!r.title) return;
      
      const words = r.title
        .toLowerCase()
        .replace(/[^\w\s'-]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOPWORDS.has(w));

      for (let i = 0; i < words.length - 1; i++) {
        const phrase = `${words[i]} ${words[i + 1]}`;
        if (!phraseMap[phrase]) {
          phraseMap[phrase] = { phrase, count: 0, totalViews: 0, totalCtr: 0, totalRet: 0, totalSubs: 0, videos: [], lastUsed: null };
        }
        phraseMap[phrase].count += 1;
        phraseMap[phrase].totalViews += r.views;
        phraseMap[phrase].totalCtr += r.ctr || 0;
        phraseMap[phrase].totalRet += r.retention || 0;
        phraseMap[phrase].totalSubs += r.subscribers || 0;
        phraseMap[phrase].videos.push(r);
        
        if (r.publishDate) {
          const publishDate = new Date(r.publishDate);
          if (!phraseMap[phrase].lastUsed || publishDate > phraseMap[phrase].lastUsed) {
            phraseMap[phrase].lastUsed = publishDate;
          }
        }
      }

      for (let i = 0; i < words.length - 2; i++) {
        const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        if (!phraseMap[phrase]) {
          phraseMap[phrase] = { phrase, count: 0, totalViews: 0, totalCtr: 0, totalRet: 0, totalSubs: 0, videos: [], lastUsed: null };
        }
        phraseMap[phrase].count += 1;
        phraseMap[phrase].totalViews += r.views;
        phraseMap[phrase].totalCtr += r.ctr || 0;
        phraseMap[phrase].totalRet += r.retention || 0;
        phraseMap[phrase].totalSubs += r.subscribers || 0;
        phraseMap[phrase].videos.push(r);
        
        if (r.publishDate) {
          const publishDate = new Date(r.publishDate);
          if (!phraseMap[phrase].lastUsed || publishDate > phraseMap[phrase].lastUsed) {
            phraseMap[phrase].lastUsed = publishDate;
          }
        }
      }
    });

    const phrases = Object.values(phraseMap)
      .filter(p => p.count >= 2)
      .map(p => ({
        ...p,
        avgViews: p.totalViews / p.count,
        avgCtr: p.totalCtr / p.count,
        avgRet: p.totalRet / p.count,
        avgSubs: p.totalSubs / p.count,
        subsPerKViews: p.totalViews > 0 ? (p.totalSubs / p.totalViews) * 1000 : 0,
        wordCount: p.phrase.split(' ').length,
        perfScore: ((p.totalViews / p.count) / avgViews) * ((p.totalCtr / p.count) / avgCtr) * ((p.totalRet / p.count) / avgRet),
        outperformsAvg: (p.totalViews / p.count) > avgViews * 1.2,
        subsConversionLift: avgSubsPerKViews > 0 ? (((p.totalSubs / p.totalViews) * 1000) - avgSubsPerKViews) / avgSubsPerKViews : 0,
        isAudienceBuilder: avgSubsPerKViews > 0 && ((p.totalSubs / p.totalViews) * 1000) > avgSubsPerKViews * 1.3,
        daysSinceLastUse: p.lastUsed ? Math.round((now - p.lastUsed) / (1000 * 60 * 60 * 24)) : 999
      }))
      .sort((a, b) => {
        if (a.wordCount !== b.wordCount) return b.wordCount - a.wordCount;
        return b.perfScore - a.perfScore;
      });

    // Deduplicate phrases
    const deduplicatedPhrases = [];
    for (const phrase of phrases) {
      let isDuplicate = false;
      for (const existing of deduplicatedPhrases) {
        if (existing.phrase.includes(phrase.phrase)) {
          isDuplicate = true;
          break;
        }
        if (phrase.phrase.includes(existing.phrase)) {
          const index = deduplicatedPhrases.indexOf(existing);
          deduplicatedPhrases.splice(index, 1);
          break;
        }
      }
      if (!isDuplicate) {
        deduplicatedPhrases.push(phrase);
      }
      if (deduplicatedPhrases.length >= 8) break;
    }

    // === AUDIENCE BUILDERS ===
    const audienceBuilders = deduplicatedPhrases
      .filter(p => p.isAudienceBuilder && p.count >= 2)
      .sort((a, b) => b.subsPerKViews - a.subsPerKViews)
      .slice(0, 4);

    // === ABANDONED WINNERS ===
    const abandonedWinners = deduplicatedPhrases
      .filter(p => {
        return p.count >= 3 && 
               p.daysSinceLastUse > 60 && 
               p.avgViews > avgViews * 1.2;
      })
      .sort((a, b) => b.avgViews - a.avgViews)
      .slice(0, 4);

    // === UNDERUSED FORMATS ===
    const formatPatterns = [
      { pattern: /wife|husband|spouse|partner/i, name: "Partner Collaboration" },
      { pattern: /live|concert|performance/i, name: "Live Performance" },
      { pattern: /vs\.|versus|comparison/i, name: "Comparison/VS" },
      { pattern: /ranking|tier list|top \d+/i, name: "Rankings/Lists" },
      { pattern: /how to|tutorial|guide/i, name: "Educational" },
      { pattern: /interview|conversation/i, name: "Interview" },
    ];

    const underusedFormats = formatPatterns.map(({ pattern, name }) => {
      const matching = rows.filter(r => pattern.test(r.title || ""));
      if (matching.length === 0 || matching.length > 10) return null;

      const avgFormatViews = matching.reduce((sum, v) => sum + v.views, 0) / matching.length;
      const avgFormatCtr = matching.reduce((sum, v) => sum + (v.ctr || 0), 0) / matching.length;
      const avgFormatRet = matching.reduce((sum, v) => sum + (v.retention || 0), 0) / matching.length;
      
      const performanceScore = (avgFormatViews / avgViews) * (avgFormatCtr / avgCtr) * (avgFormatRet / avgRet);
      
      return {
        name,
        count: matching.length,
        avgViews: avgFormatViews,
        viewLift: (avgFormatViews - avgViews) / avgViews,
        performanceScore,
        bestExample: matching.sort((a, b) => b.views - a.views)[0],
        isUnderused: matching.length <= 3 && performanceScore > 1.2
      };
    })
    .filter(f => f && f.isUnderused)
    .sort((a, b) => b.performanceScore - a.performanceScore)
    .slice(0, 3);

    return {
      topThemes: deduplicatedPhrases.slice(0, 6),
      audienceBuilders,
      abandonedWinners,
      underusedFormats
    };
  }, [rows]);

  if (!rows || rows.length === 0 || !insights) {
    return (
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "40px",
        marginBottom: "20px",
        textAlign: "center",
        color: "#9E9E9E"
      }}>
        <div style={{ fontSize: "16px", fontWeight: "600" }}>No data available</div>
        <div style={{ fontSize: "13px", marginTop: "8px" }}>Upload client data to see opportunities</div>
      </div>
    );
  }

  const s = {
    section: {
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "20px",
      position: "relative",
      overflow: "hidden"
    },
    gradientBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "4px",
      background: "linear-gradient(90deg, #10b981, #3b82f6, #8b5cf6)"
    },
    header: {
      marginBottom: "24px"
    },
    title: { fontSize: "20px", fontWeight: "700", color: "#fff", marginBottom: "4px" },
    subtitle: {
      fontSize: "13px",
      color: "#9E9E9E"
    },
    categoryHeader: (color) => ({
      fontSize: "14px",
      fontWeight: "700",
      color: "#E0E0E0",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      marginBottom: "12px",
      marginTop: "32px",
      paddingBottom: "8px",
      borderBottom: `2px solid ${color}`,
      display: "flex",
      alignItems: "center",
      gap: "8px"
    }),
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
      gap: "16px"
    },
    card: (theme) => {
      const themes = {
        green: { bg: "rgba(34, 197, 94, 0.1)", border: "#10b981" },
        blue: { bg: "rgba(59, 130, 246, 0.1)", border: "#3b82f6" },
        amber: { bg: "rgba(245, 158, 11, 0.1)", border: "#f59e0b" },
        purple: { bg: "rgba(139, 92, 246, 0.1)", border: "#8b5cf6" }
      };
      const c = themes[theme] || themes.blue;
      return {
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderLeft: `4px solid ${c.border}`,
        borderRadius: "8px",
        padding: "16px"
      };
    },
    cardHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "12px"
    },
    cardTitle: {
      fontSize: "16px",
      fontWeight: "700",
      color: "#fff",
      marginBottom: "4px",
      display: "flex",
      alignItems: "center",
      gap: "6px"
    },
    badge: {
      fontSize: "11px",
      background: "#333",
      color: "#9E9E9E",
      padding: "3px 8px",
      borderRadius: "4px",
      fontWeight: "600"
    },
    statsGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "12px",
      paddingTop: "12px",
      borderTop: "1px solid #333"
    },
    stat: {
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    },
    statValue: (good) => ({
      fontSize: "14px",
      fontWeight: "700",
      color: good ? "#10b981" : "#E0E0E0"
    }),
    statLabel: {
      fontSize: "11px",
      color: "#9E9E9E",
      textTransform: "uppercase"
    },
    insight: {
      fontSize: "12px",
      color: "#9E9E9E",
      lineHeight: "1.5",
      marginTop: "8px"
    },
    metric: {
      fontSize: "13px",
      fontWeight: "600",
      color: "#10b981"
    }
  };

  return (
    <div style={s.section}>
      <div style={s.gradientBar} />
      
      <div style={s.header}>
        <div style={s.title}>💡 Content Opportunities</div>
        <div style={s.subtitle}>Strategic insights on what to create next</div>
      </div>

      {/* AUDIENCE BUILDERS */}
      {insights.audienceBuilders.length > 0 && (
        <>
          <div style={s.categoryHeader("#3b82f6")}>
            <Target size={16} />
            Subscriber Magnets (Build Your Audience)
          </div>
          <div style={s.grid}>
            {insights.audienceBuilders.map((p, i) => (
              <div key={i} style={s.card('blue')}>
                <div style={s.cardHeader}>
                  <div style={s.cardTitle}>
                    "{p.phrase}"
                    <span style={s.badge}>{p.count}x</span>
                  </div>
                </div>
                <div style={s.insight}>
                  <span style={s.metric}>{p.subsPerKViews.toFixed(1)} subs/1K views</span> ({Math.round(p.subsConversionLift * 100) > 0 ? '+' : ''}{Math.round(p.subsConversionLift * 100)}% vs avg)
                  <div style={{ marginTop: "4px", color: "#60a5fa" }}>
                    This theme converts viewers to subscribers - prioritize for audience growth
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ABANDONED WINNERS */}
      {insights.abandonedWinners.length > 0 && (
        <>
          <div style={s.categoryHeader("#f59e0b")}>
            <Calendar size={16} />
            Bring These Back
          </div>
          <div style={s.grid}>
            {insights.abandonedWinners.map((p, i) => (
              <div key={i} style={s.card('amber')}>
                <div style={s.cardHeader}>
                  <div>
                    <div style={s.cardTitle}>"{p.phrase}"</div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E" }}>
                      {p.count} videos • {p.daysSinceLastUse} days since last use
                    </div>
                  </div>
                  <span style={s.badge}>+{Math.round((p.avgViews / (rows.reduce((s, r) => s + r.views, 0) / rows.length) - 1) * 100)}%</span>
                </div>
                <div style={s.insight}>
                  <span style={s.metric}>{fmtInt(p.avgViews)} avg views</span> - Consistently outperformed but abandoned for {Math.round(p.daysSinceLastUse / 30)} months. Revive it.
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* UNDERUSED FORMATS */}
      {insights.underusedFormats.length > 0 && (
        <>
          <div style={s.categoryHeader("#10b981")}>
            <Sparkles size={16} />
            Scale These Formats
          </div>
          <div style={s.grid}>
            {insights.underusedFormats.map((f, i) => (
              <div key={i} style={s.card('green')}>
                <div style={s.cardHeader}>
                  <div>
                    <div style={s.cardTitle}>{f.name}</div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E" }}>
                      Only {f.count} video{f.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span style={s.badge}>+{Math.round(f.viewLift * 100)}%</span>
                </div>
                <div style={s.insight}>
                  <span style={s.metric}>{fmtInt(f.avgViews)} avg views</span> - Performs {Math.round((f.performanceScore - 1) * 100)}% better than baseline. Expand it.
                  {f.bestExample && (
                    <div style={{ marginTop: "4px", fontSize: "11px", color: "#666" }}>
                      Best: "{f.bestExample.title}"
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* TOP THEMES */}
      <div style={s.categoryHeader("#8b5cf6")}>
        <Hash size={16} />
        Top Performing Themes
      </div>
      <div style={s.grid}>
        {insights.topThemes.map((p, i) => (
          <div key={i} style={s.card('purple')}>
            <div style={s.cardHeader}>
              <div style={s.cardTitle}>
                "{p.phrase}"
                <span style={s.badge}>{p.count}x</span>
                {p.isAudienceBuilder && <span style={{ marginLeft: "4px" }}>🧲</span>}
              </div>
            </div>
            
            <div style={s.statsGrid}>
              <div style={s.stat}>
                <span style={s.statValue(p.avgViews > rows.reduce((s, r) => s + r.views, 0) / rows.length)}>
                  {fmtInt(p.avgViews)}
                </span>
                <span style={s.statLabel}>Views</span>
              </div>
              <div style={s.stat}>
                <span style={s.statValue(p.avgCtr > 0.04)}>
                  {fmtPct(p.avgCtr)}
                </span>
                <span style={s.statLabel}>CTR</span>
              </div>
              <div style={s.stat}>
                <span style={s.statValue(p.avgRet > 0.4)}>
                  {fmtPct(p.avgRet)}
                </span>
                <span style={s.statLabel}>Ret</span>
              </div>
              <div style={s.stat}>
                <span style={s.statValue(p.isAudienceBuilder)}>
                  {p.subsPerKViews.toFixed(1)}
                </span>
                <span style={s.statLabel}>Subs/1K</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}