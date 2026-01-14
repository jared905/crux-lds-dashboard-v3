import React, { useState, useEffect } from 'react';
import { Sparkles, FileText, Loader2, AlertCircle, Copy, Check, TrendingUp } from 'lucide-react';
import claudeAPI from '../services/claudeAPI';

/**
 * AI-Powered Executive Summary Generator
 * Generates natural language summaries and reports using Claude AI
 * v2.2.2 - Dark theme styling
 */
export default function AIExecutiveSummary({ rows, analysis, activeClient }) {
  // Load from localStorage on mount
  const loadFromStorage = () => {
    try {
      const saved = localStorage.getItem('ai_executive_summary');
      return saved ? JSON.parse(saved) : null;
    } catch (err) {
      console.error('Error loading saved summary:', err);
      return null;
    }
  };

  const [narrative, setNarrative] = useState(() => loadFromStorage()?.narrative || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [estimatedCost, setEstimatedCost] = useState(() => loadFromStorage()?.estimatedCost || null);
  const [copied, setCopied] = useState(false);

  // Context fields for better AI guidance
  const [focusArea, setFocusArea] = useState('balanced');
  const [specificGoals, setSpecificGoals] = useState('');
  const [reportStyle, setReportStyle] = useState('executive');
  const [showContextFields, setShowContextFields] = useState(false);

  // Refinement state
  const [refinementQuestion, setRefinementQuestion] = useState('');
  const [refining, setRefining] = useState(false);
  const [conversationHistory, setConversationHistory] = useState(() => loadFromStorage()?.conversationHistory || []);
  const [includeInPDF, setIncludeInPDF] = useState(() => loadFromStorage()?.includeInPDF || false);

  // Save to localStorage whenever narrative or cost changes
  useEffect(() => {
    if (narrative) {
      try {
        localStorage.setItem('ai_executive_summary', JSON.stringify({
          narrative,
          estimatedCost,
          conversationHistory,
          includeInPDF,
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error('Error saving summary:', err);
      }
    }
  }, [narrative, estimatedCost, conversationHistory, includeInPDF]);

  const generateNarrative = async () => {
    setLoading(true);
    setError(null);

    try {
      // Prepare data for Claude
      const currentMonthData = rows
        .filter(r => {
          const now = new Date();
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return r.publishDate && new Date(r.publishDate) >= thirtyDaysAgo;
        })
        .sort((a, b) => b.views - a.views);

      const previousMonthData = rows.filter(r => {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        return r.publishDate && new Date(r.publishDate) >= sixtyDaysAgo && new Date(r.publishDate) < thirtyDaysAgo;
      });

      // Calculate stats
      const calcStats = (videos) => {
        if (videos.length === 0) return { views: 0, uploads: 0, avgViews: 0, avgCTR: 0, avgRetention: 0 };
        return {
          views: videos.reduce((s, v) => s + v.views, 0),
          uploads: videos.length,
          avgViews: videos.reduce((s, v) => s + v.views, 0) / videos.length,
          avgCTR: videos.reduce((s, v) => s + (v.ctr || 0), 0) / videos.length,
          avgRetention: videos.reduce((s, v) => s + (v.retention || 0), 0) / videos.length
        };
      };

      const currentStats = calcStats(currentMonthData);
      const previousStats = calcStats(previousMonthData);

      const topVideos = currentMonthData.slice(0, 5).map(v => ({
        title: v.title,
        views: v.views,
        ctr: v.ctr,
        retention: v.retention
      }));

      // Build context-aware system prompt
      const clientName = activeClient?.name || 'this channel';

      const focusGuidance = {
        growth: 'Focus heavily on subscriber growth, reach expansion, and audience acquisition metrics. Analyze what content drives new viewers.',
        engagement: 'Prioritize engagement metrics like CTR, retention, comments, and watch time. Identify what keeps audiences engaged.',
        content: `Emphasize content strategy, topic performance, video formats, and what resonates with ${clientName}'s audience.`,
        competitive: `Focus on competitive positioning, market trends, and how this channel compares to similar content creators in ${clientName}'s niche.`,
        monetization: 'Analyze revenue potential, ad performance, and opportunities to maximize earnings.',
        balanced: 'Provide a well-rounded analysis covering growth, engagement, and content strategy.'
      };

      const styleGuidance = {
        executive: 'Write in a concise, board-ready format. Focus on key insights and strategic implications. 2-3 paragraphs per section.',
        detailed: 'Provide comprehensive analysis with deeper dives into trends, patterns, and underlying factors. 3-5 paragraphs per section.',
        actionable: 'Emphasize concrete next steps and tactical recommendations. Include specific action items with expected outcomes.'
      };

      let systemPrompt = `You are an executive communications specialist for YouTube content creators.

Your goal is to write compelling, data-driven executive summaries that:
1. Tell a story about channel performance (not just list statistics)
2. Provide strategic context and insights
3. Are written in professional but accessible language
4. Are suitable for presenting to stakeholders, board members, or leadership
5. Focus on "why" things happened, not just "what" happened
6. Include specific, actionable recommendations

Context: You are analyzing performance for ${clientName}.

${focusGuidance[focusArea]}

${styleGuidance[reportStyle]}

Write in a narrative style that executives would expect in a monthly board report.`;

      let userPrompt = `Write a comprehensive executive summary for ${clientName}'s YouTube channel performance for the last 30 days.`;

      // Add user-specific goals if provided
      if (specificGoals && specificGoals.trim()) {
        userPrompt += `\n\n**IMPORTANT - User's Specific Goals/Questions:**\n${specificGoals.trim()}\n\nPlease address these goals/questions throughout your analysis.`;
      }

      userPrompt += `\n\n**Current Month Performance (Last 30 Days):**
- Total Views: ${currentStats.views.toLocaleString()}
- Videos Published: ${currentStats.uploads}
- Average Views per Video: ${Math.round(currentStats.avgViews).toLocaleString()}
- Average CTR: ${(currentStats.avgCTR * 100).toFixed(1)}%
- Average Retention: ${(currentStats.avgRetention * 100).toFixed(1)}%

**Previous Month Performance (30-60 Days Ago):**
- Total Views: ${previousStats.views.toLocaleString()}
- Videos Published: ${previousStats.uploads}
- Average Views per Video: ${Math.round(previousStats.avgViews).toLocaleString()}
- Average CTR: ${(previousStats.avgCTR * 100).toFixed(1)}%
- Average Retention: ${(previousStats.avgRetention * 100).toFixed(1)}%

**Top 5 Performing Videos This Month:**
${JSON.stringify(topVideos, null, 2)}

Please write a comprehensive executive summary with these sections:

# Executive Summary

## Overview
[2-3 sentences capturing the overall performance and key storyline]

## Key Highlights
[3-5 bullet points of major wins or notable achievements]

## Performance Analysis
[2-3 paragraphs analyzing what drove the performance - be specific about topics, formats, patterns]

## Challenges & Areas for Improvement
[2-3 sentences about concerning trends or areas needing attention]

## Strategic Recommendations
[3-5 actionable recommendations with rationale]

## Outlook
[1-2 sentences about what to watch for next month]

Write in a professional narrative style. Use specific numbers. Focus on insights, not just data reporting. Consider the specific audience context in your analysis.`;

      const result = await claudeAPI.call(userPrompt, systemPrompt, 'executive-summary', 4096);

      setNarrative(result.text);
      setEstimatedCost(result.cost);

      // Initialize conversation history for refinements
      setConversationHistory([
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: result.text }
      ]);

    } catch (err) {
      console.error('Error generating narrative:', err);
      setError(err.message || 'Failed to generate summary. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const refineNarrative = async (quickAction = null) => {
    setRefining(true);
    setError(null);

    try {
      let refinementPrompt;

      if (quickAction) {
        const quickActions = {
          shorter: 'Make this summary more concise - aim for 50% shorter while keeping key insights.',
          longer: 'Expand this analysis with more depth and detail, especially in the performance analysis section.',
          moreData: 'Include more specific data points and metrics to support your analysis.',
          moreRecs: 'Provide 3-5 additional actionable recommendations with clear next steps.',
          focusGrowth: 'Refocus this summary to emphasize growth opportunities and subscriber acquisition strategies.',
          focusEngagement: 'Refocus this summary to emphasize audience engagement and retention improvements.'
        };
        refinementPrompt = quickActions[quickAction];
      } else {
        refinementPrompt = refinementQuestion;
      }

      if (!refinementPrompt || !refinementPrompt.trim()) return;

      const systemPrompt = `You are refining an executive summary based on user feedback. Maintain the professional tone and structure, but adjust based on the specific request. Keep the same general format unless asked to change it.`;

      const result = await claudeAPI.call(
        `Original summary:\n\n${narrative}\n\n---\n\nUser's request: ${refinementPrompt}\n\nPlease provide the refined summary:`,
        systemPrompt,
        'summary-refinement',
        4096
      );

      setNarrative(result.text);
      setEstimatedCost(prev => prev + result.cost);
      setRefinementQuestion('');

      // Update conversation history
      setConversationHistory([
        ...conversationHistory,
        { role: 'user', content: refinementPrompt },
        { role: 'assistant', content: result.text }
      ]);

    } catch (err) {
      console.error('Error refining narrative:', err);
      setError(err.message || 'Failed to refine summary. Please try again.');
    } finally {
      setRefining(false);
    }
  };

  const copyToClipboard = () => {
    if (narrative) {
      navigator.clipboard.writeText(narrative);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const clearSummary = () => {
    setNarrative(null);
    setEstimatedCost(null);
    setConversationHistory([]);
    setError(null);
    localStorage.removeItem('ai_executive_summary');
  };

  // If no analysis data, show message
  if (!analysis || !rows || rows.length === 0) {
    return (
      <div style={{
        backgroundColor: "#1E1E1E",
        border: "1px solid #f59e0b",
        borderLeft: "4px solid #f59e0b",
        borderRadius: "8px",
        padding: "16px",
        display: "flex",
        gap: "12px"
      }}>
        <div style={{
          width: "40px",
          height: "40px",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(245, 158, 11, 0.1)",
          color: "#f59e0b",
          flexShrink: 0
        }}>
          <AlertCircle size={20} />
        </div>
        <div>
          <p style={{ fontWeight: "600", color: "#fff", marginBottom: "4px" }}>No Data Available</p>
          <p style={{ fontSize: "13px", color: "#9E9E9E" }}>
            Please upload video data to generate an executive summary.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header Card */}
      <div style={{
        backgroundColor: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        position: "relative",
        overflow: "hidden"
      }}>
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)"
        }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{
              width: "48px",
              height: "48px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              color: "#60a5fa"
            }}>
              <FileText size={24} />
            </div>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                AI Executive Summary
              </h2>
              <p style={{ fontSize: "13px", color: "#9E9E9E" }}>
                Generate stakeholder-ready performance narratives
              </p>
            </div>
          </div>

          {!narrative && (
            <button
              onClick={generateNarrative}
              disabled={loading}
              style={{
                background: "#2962FF",
                border: "none",
                borderRadius: "8px",
                padding: "12px 20px",
                color: "#fff",
                fontSize: "14px",
                fontWeight: "600",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Generate Summary (~$0.30)
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Context Fields (before generation) */}
      {!narrative && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Toggle Context Fields */}
          <button
            onClick={() => setShowContextFields(!showContextFields)}
            style={{
              background: "#252525",
              border: "1px solid #333",
              borderRadius: "8px",
              padding: "12px 16px",
              color: "#8b5cf6",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              textAlign: "left"
            }}
          >
            <span>{showContextFields ? '▼' : '▶'}</span>
            Customize Summary Focus (Optional - Improves Quality)
          </button>

          {/* Context Fields */}
          {showContextFields && (
            <div style={{
              backgroundColor: "#1E1E1E",
              border: "1px solid #333",
              borderRadius: "12px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px"
            }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#E0E0E0", marginBottom: "8px" }}>
                  Focus Area
                </label>
                <select
                  value={focusArea}
                  onChange={(e) => setFocusArea(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: "#252525",
                    border: "1px solid #333",
                    borderRadius: "8px",
                    color: "#E0E0E0",
                    fontSize: "14px",
                    cursor: "pointer"
                  }}
                >
                  <option value="balanced">Balanced Overview (Default)</option>
                  <option value="growth">Growth & Subscriber Acquisition</option>
                  <option value="engagement">Engagement & Retention</option>
                  <option value="content">Content Strategy</option>
                  <option value="competitive">Competitive Analysis</option>
                  <option value="monetization">Monetization & Revenue</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#E0E0E0", marginBottom: "8px" }}>
                  Specific Questions or Goals (Optional)
                </label>
                <textarea
                  value={specificGoals}
                  onChange={(e) => setSpecificGoals(e.target.value)}
                  placeholder="Example: Why did views drop in week 3? Which video topics perform best? How do we compare to similar channels?"
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: "#252525",
                    border: "1px solid #333",
                    borderRadius: "8px",
                    color: "#E0E0E0",
                    fontSize: "14px",
                    resize: "vertical"
                  }}
                />
                <p style={{ fontSize: "11px", color: "#9E9E9E", marginTop: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Sparkles size={12} />
                  The AI will address these specific questions throughout the analysis
                </p>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#E0E0E0", marginBottom: "8px" }}>
                  Report Style
                </label>
                <select
                  value={reportStyle}
                  onChange={(e) => setReportStyle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: "#252525",
                    border: "1px solid #333",
                    borderRadius: "8px",
                    color: "#E0E0E0",
                    fontSize: "14px",
                    cursor: "pointer"
                  }}
                >
                  <option value="executive">Executive Brief (Concise)</option>
                  <option value="detailed">Detailed Analysis (Comprehensive)</option>
                  <option value="actionable">Action-Oriented (Tactical)</option>
                </select>
              </div>
            </div>
          )}

          {/* Info Banner */}
          <div style={{
            backgroundColor: "#1E1E1E",
            border: "1px solid #333",
            borderRadius: "12px",
            padding: "24px",
            position: "relative",
            overflow: "hidden"
          }}>
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "4px",
              background: "linear-gradient(90deg, #3b82f6, #8b5cf6)"
            }} />
            <div style={{ display: "flex", gap: "20px" }}>
              <div style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(139, 92, 246, 0.1)",
                color: "#a78bfa",
                flexShrink: 0
              }}>
                <Sparkles size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#fff", marginBottom: "16px" }}>What You'll Get</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                  {[
                    { label: "Professional narrative summary", sub: "Suitable for stakeholders and leadership" },
                    { label: "Strategic insights", sub: "Explaining why performance changed" },
                    { label: "Actionable recommendations", sub: "Tailored to your channel's audience" },
                    { label: "Board-ready format", sub: "Copy directly into reports or presentations" }
                  ].map((item, i) => (
                    <div key={i} style={{
                      background: "rgba(59, 130, 246, 0.05)",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      padding: "12px"
                    }}>
                      <div style={{ fontSize: "13px", fontWeight: "600", color: "#E0E0E0", marginBottom: "4px" }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: "11px", color: "#9E9E9E" }}>
                        {item.sub}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                  <TrendingUp size={16} style={{ color: "#10b981" }} />
                  <span style={{ color: "#10b981", fontWeight: "600" }}>Cost: $0.15-0.45 • Takes 10-15 seconds • Can refine after generation</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          backgroundColor: "#1E1E1E",
          border: "1px solid #ef4444",
          borderLeft: "4px solid #ef4444",
          borderRadius: "8px",
          padding: "16px",
          display: "flex",
          gap: "12px"
        }}>
          <div style={{
            width: "40px",
            height: "40px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "#ef4444",
            flexShrink: 0
          }}>
            <AlertCircle size={20} />
          </div>
          <div>
            <p style={{ fontWeight: "700", color: "#fff", fontSize: "14px", marginBottom: "4px" }}>Error</p>
            <p style={{ fontSize: "13px", color: "#9E9E9E" }}>{error}</p>
          </div>
        </div>
      )}

      {/* Generated Narrative */}
      {narrative && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Cost & Actions */}
          <div style={{
            backgroundColor: "#1E1E1E",
            border: "1px solid #10b981",
            borderLeft: "4px solid #10b981",
            borderRadius: "12px",
            padding: "20px"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(16, 185, 129, 0.1)",
                  color: "#10b981"
                }}>
                  <Sparkles size={18} />
                </div>
                <div>
                  <span style={{ fontWeight: "700", color: "#fff", fontSize: "14px" }}>Summary Generated</span>
                  {estimatedCost && (
                    <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "2px" }}>
                      Cost: ${estimatedCost.toFixed(4)}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  background: "#252525",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid #333",
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "#E0E0E0"
                }}>
                  <input
                    type="checkbox"
                    checked={includeInPDF}
                    onChange={(e) => setIncludeInPDF(e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  Include in PDF Export
                </label>
                <button
                  onClick={copyToClipboard}
                  style={{
                    background: "#252525",
                    border: "1px solid #333",
                    borderRadius: "8px",
                    padding: "8px 14px",
                    color: "#E0E0E0",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  {copied ? (
                    <>
                      <Check size={16} style={{ color: "#10b981" }} />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={generateNarrative}
                  disabled={loading}
                  style={{
                    background: "#2962FF",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 14px",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.6 : 1
                  }}
                >
                  Regenerate
                </button>
                <button
                  onClick={clearSummary}
                  style={{
                    background: "#252525",
                    border: "1px solid #333",
                    borderRadius: "8px",
                    padding: "8px 14px",
                    color: "#E0E0E0",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Narrative Content */}
          <div id="ai-summary-content" style={{
            backgroundColor: "#1E1E1E",
            border: "1px solid #333",
            borderRadius: "12px",
            padding: "32px"
          }}>
            <div style={{ fontSize: "15px", lineHeight: "1.7", color: "#E0E0E0" }}>
              {narrative.split('\n').map((line, index) => {
                // Markdown-style rendering
                if (line.startsWith('# ')) {
                  return (
                    <h1 key={index} style={{
                      fontSize: "28px",
                      fontWeight: "700",
                      color: "#fff",
                      marginTop: 0,
                      marginBottom: "24px",
                      paddingBottom: "12px",
                      borderBottom: "2px solid #333"
                    }}>
                      {line.substring(2)}
                    </h1>
                  );
                }
                if (line.startsWith('## ')) {
                  return (
                    <h2 key={index} style={{
                      fontSize: "20px",
                      fontWeight: "700",
                      color: "#fff",
                      marginTop: "32px",
                      marginBottom: "12px"
                    }}>
                      {line.substring(3)}
                    </h2>
                  );
                }
                if (line.startsWith('### ')) {
                  return (
                    <h3 key={index} style={{
                      fontSize: "17px",
                      fontWeight: "600",
                      color: "#E0E0E0",
                      marginTop: "24px",
                      marginBottom: "10px"
                    }}>
                      {line.substring(4)}
                    </h3>
                  );
                }
                if (line.startsWith('- ') || line.startsWith('• ')) {
                  return (
                    <li key={index} style={{
                      marginLeft: "24px",
                      color: "#E0E0E0",
                      lineHeight: "1.7",
                      marginBottom: "8px",
                      paddingLeft: "8px"
                    }}>
                      {line.substring(2)}
                    </li>
                  );
                }
                if (line.trim() === '') {
                  return <div key={index} style={{ height: "12px" }} />;
                }
                // Bold text
                const boldText = line.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #60a5fa; font-weight: 600">$1</strong>');
                return (
                  <p
                    key={index}
                    style={{
                      color: "#E0E0E0",
                      lineHeight: "1.7",
                      marginBottom: "12px"
                    }}
                    dangerouslySetInnerHTML={{ __html: boldText }}
                  />
                );
              })}
            </div>
          </div>

          {/* Refinement Section */}
          <div style={{
            backgroundColor: "#1E1E1E",
            border: "1px solid #333",
            borderRadius: "12px",
            padding: "24px",
            position: "relative",
            overflow: "hidden"
          }}>
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "4px",
              background: "linear-gradient(90deg, #8b5cf6, #3b82f6)"
            }} />
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <div style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(139, 92, 246, 0.1)",
                color: "#a78bfa"
              }}>
                <Sparkles size={18} />
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>
                Refine This Summary
              </h3>
            </div>

            {/* Quick Actions */}
            <div style={{ marginBottom: "20px" }}>
              <p style={{ fontSize: "13px", fontWeight: "600", color: "#9E9E9E", marginBottom: "12px" }}>Quick refinements:</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {[
                  { key: 'shorter', label: 'Make Shorter' },
                  { key: 'longer', label: 'Add More Detail' },
                  { key: 'moreData', label: 'More Data Points' },
                  { key: 'moreRecs', label: 'More Recommendations' },
                  { key: 'focusGrowth', label: 'Focus on Growth' },
                  { key: 'focusEngagement', label: 'Focus on Engagement' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => refineNarrative(key)}
                    disabled={refining}
                    style={{
                      background: "#252525",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      padding: "8px 14px",
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#E0E0E0",
                      cursor: refining ? "not-allowed" : "pointer",
                      opacity: refining ? 0.6 : 1
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Refinement */}
            <div>
              <p style={{ fontSize: "13px", fontWeight: "600", color: "#9E9E9E", marginBottom: "12px" }}>Or ask a specific question:</p>
              <div style={{ display: "flex", gap: "12px" }}>
                <input
                  type="text"
                  value={refinementQuestion}
                  onChange={(e) => setRefinementQuestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && refineNarrative()}
                  placeholder="Example: Add a section about competitor analysis..."
                  disabled={refining}
                  style={{
                    flex: 1,
                    padding: "12px",
                    backgroundColor: "#252525",
                    border: "1px solid #333",
                    borderRadius: "8px",
                    color: "#E0E0E0",
                    fontSize: "14px"
                  }}
                />
                <button
                  onClick={() => refineNarrative()}
                  disabled={refining || !refinementQuestion.trim()}
                  style={{
                    background: "#2962FF",
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 20px",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: (refining || !refinementQuestion.trim()) ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    opacity: (refining || !refinementQuestion.trim()) ? 0.6 : 1
                  }}
                >
                  {refining ? (
                    <>
                      <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                      Refining...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Refine
                    </>
                  )}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px" }}>
                <TrendingUp size={14} style={{ color: "#10b981" }} />
                <p style={{ fontSize: "11px", color: "#9E9E9E" }}>
                  Each refinement costs ~$0.05-0.15 depending on complexity
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
