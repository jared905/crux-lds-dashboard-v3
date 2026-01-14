import { useState, useEffect } from 'react';
import { Lightbulb, Sparkles, TrendingUp, Clock, AlertCircle, Loader2 } from 'lucide-react';
import claudeAPI from '../services/claudeAPI';

/**
 * AI Video Idea Generator
 * v2.2.2 - Dark theme styling
 */
export default function VideoIdeaGenerator({ data, activeClient }) {
  // Load from localStorage on mount
  const loadFromStorage = () => {
    try {
      const saved = localStorage.getItem('ai_video_ideas');
      return saved ? JSON.parse(saved) : null;
    } catch (err) {
      console.error('Error loading saved ideas:', err);
      return null;
    }
  };

  const [ideas, setIdeas] = useState(() => loadFromStorage()?.ideas || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [estimatedCost, setEstimatedCost] = useState(() => loadFromStorage()?.estimatedCost || null);
  const [includeInPDF, setIncludeInPDF] = useState(() => loadFromStorage()?.includeInPDF || false);

  // Save to localStorage whenever ideas change
  useEffect(() => {
    if (ideas.length > 0) {
      try {
        localStorage.setItem('ai_video_ideas', JSON.stringify({
          ideas,
          estimatedCost,
          includeInPDF,
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error('Error saving ideas:', err);
      }
    }
  }, [ideas, estimatedCost, includeInPDF]);

  const generateIdeas = async () => {
    setLoading(true);
    setError(null);
    setEstimatedCost(null);

    try {
      // Get top 20% performing videos
      const sortedVideos = [...data].sort((a, b) => b.views - a.views);
      const topCount = Math.max(10, Math.floor(sortedVideos.length * 0.2));
      const topVideos = sortedVideos.slice(0, topCount);

      // Calculate average metrics
      const avgViews = topVideos.reduce((sum, v) => sum + v.views, 0) / topVideos.length;
      const avgCTR = topVideos.reduce((sum, v) => sum + (v.ctr || 0), 0) / topVideos.length;
      const avgRetention = topVideos.reduce((sum, v) => sum + (v.retention || 0), 0) / topVideos.length;

      // Prepare data for Claude
      const videoData = topVideos.map(v => ({
        title: v.title,
        views: v.views,
        ctr: v.ctr,
        retention: v.retention
      }));

      const clientName = activeClient?.name || 'this channel';

      const systemPrompt = `You are a YouTube content strategist.
Your goal is to analyze successful videos and generate creative, data-driven video ideas that will resonate with ${clientName}'s audience.`;

      const userPrompt = `Analyze these top-performing videos from ${clientName}'s YouTube channel:

${JSON.stringify(videoData, null, 2)}

Channel Performance Context:
- Average views: ${Math.round(avgViews).toLocaleString()}
- Average CTR: ${(avgCTR * 100).toFixed(1)}%
- Average retention: ${(avgRetention * 100).toFixed(1)}%

Based on these successful videos, generate 10 new video ideas that:
1. Follow similar patterns and topics that already work for this audience
2. Are specific and actionable (not generic)
3. Are tailored to the channel's audience interests
4. Include engaging, clickable titles
5. Suggest a compelling thumbnail concept
6. Provide a strong hook for the first 30 seconds

Format your response as a JSON array with this structure:
[
  {
    "title": "Exact video title to use",
    "topic": "Main topic category (e.g., Temple, Scripture Study, Faith Journey)",
    "hook": "Opening line that captures attention in first 10 seconds",
    "thumbnailConcept": "Visual concept for thumbnail",
    "whyItWorks": "Brief explanation of why this will perform well based on the data",
    "confidence": "high/medium/low"
  }
]

Be creative but data-driven. Focus on what actually performs for this channel.`;

      const result = await claudeAPI.call(userPrompt, systemPrompt, 'video-idea-generator', 4096);

      // Parse the JSON response
      const responseText = result.text.trim();
      let parsedIdeas;

      // Try to extract JSON if Claude wrapped it in markdown
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsedIdeas = JSON.parse(jsonMatch[0]);
      } else {
        parsedIdeas = JSON.parse(responseText);
      }

      setIdeas(parsedIdeas);
      setEstimatedCost(result.cost);

    } catch (err) {
      console.error('Error generating ideas:', err);
      setError(err.message || 'Failed to generate video ideas. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence) => {
    switch (confidence?.toLowerCase()) {
      case 'high': return { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '#10b981' };
      case 'medium': return { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '#f59e0b' };
      case 'low': return { bg: 'rgba(107, 114, 128, 0.1)', color: '#9ca3af', border: '#9ca3af' };
      default: return { bg: 'rgba(107, 114, 128, 0.1)', color: '#9ca3af', border: '#9ca3af' };
    }
  };

  const getTopicColor = (topic) => {
    const colors = {
      'Temple': { bg: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa' },
      'Scripture': { bg: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa' },
      'Faith': { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981' },
      'Family': { bg: 'rgba(236, 72, 153, 0.1)', color: '#f472b6' },
      'Testimony': { bg: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24' },
      'History': { bg: 'rgba(251, 146, 60, 0.1)', color: '#fb923c' },
    };

    for (const [key, value] of Object.entries(colors)) {
      if (topic?.includes(key)) return value;
    }

    return { bg: 'rgba(107, 114, 128, 0.1)', color: '#9ca3af' };
  };

  const clearIdeas = () => {
    setIdeas([]);
    setEstimatedCost(null);
    setError(null);
    localStorage.removeItem('ai_video_ideas');
  };

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
          background: "linear-gradient(90deg, #8b5cf6, #3b82f6, #ec4899)"
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
              backgroundColor: "rgba(139, 92, 246, 0.1)",
              color: "#a78bfa"
            }}>
              <Lightbulb size={24} />
            </div>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                AI Video Idea Generator
              </h2>
              <p style={{ fontSize: "13px", color: "#9E9E9E" }}>
                Generate data-driven video ideas based on your top performers
              </p>
            </div>
          </div>

          <button
            onClick={generateIdeas}
            disabled={loading || !data || data.length === 0}
            style={{
              background: "#2962FF",
              border: "none",
              borderRadius: "8px",
              padding: "12px 20px",
              color: "#fff",
              fontSize: "14px",
              fontWeight: "600",
              cursor: (loading || !data || data.length === 0) ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              opacity: (loading || !data || data.length === 0) ? 0.6 : 1
            }}
          >
            {loading ? (
              <>
                <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                Generating Ideas...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Generate Video Ideas
              </>
            )}
          </button>
        </div>
      </div>

      {/* Info Banner */}
      {!ideas.length && !loading && !error && (
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
              <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#fff", marginBottom: "16px" }}>How It Works</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                {[
                  "Analyzes your top 20% performing videos",
                  "Identifies patterns in topics, titles, and engagement",
                  "Generates 10 new ideas tailored to your audience",
                  "Includes titles, hooks, and thumbnail concepts"
                ].map((text, i) => (
                  <div key={i} style={{
                    background: "rgba(139, 92, 246, 0.05)",
                    border: "1px solid #333",
                    borderRadius: "8px",
                    padding: "12px",
                    fontSize: "13px",
                    color: "#E0E0E0"
                  }}>
                    {text}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                <TrendingUp size={16} style={{ color: "#10b981" }} />
                <span style={{ color: "#10b981", fontWeight: "600" }}>Estimated cost: $0.20-0.40 per generation</span>
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

      {/* Cost Estimate */}
      {estimatedCost && (
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
                <TrendingUp size={18} />
              </div>
              <div>
                <span style={{ fontWeight: "700", color: "#fff", fontSize: "14px" }}>Ideas Generated Successfully</span>
                <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "2px" }}>
                  Cost: ${estimatedCost.toFixed(4)}
                </div>
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
                onClick={generateIdeas}
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
                Generate New Ideas
              </button>
              <button
                onClick={clearIdeas}
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
      )}

      {/* Generated Ideas */}
      {ideas.length > 0 && (
        <div id="video-ideas-content" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {ideas.map((idea, index) => {
            const topicColors = getTopicColor(idea.topic);
            const confidenceColors = getConfidenceColor(idea.confidence);

            return (
              <div
                key={index}
                style={{
                  backgroundColor: "#1E1E1E",
                  border: "1px solid #333",
                  borderRadius: "12px",
                  padding: "24px",
                  position: "relative",
                  overflow: "hidden"
                }}
              >
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "3px",
                  background: `linear-gradient(90deg, ${topicColors.color}, ${confidenceColors.color})`
                }} />

                <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                      color: "#fff",
                      fontSize: "18px",
                      fontWeight: "700",
                      flexShrink: 0
                    }}>
                      {index + 1}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "700",
                        textTransform: "uppercase",
                        backgroundColor: topicColors.bg,
                        color: topicColors.color,
                        border: `1px solid ${topicColors.color}`
                      }}>
                        {idea.topic}
                      </span>
                      <span style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "700",
                        textTransform: "uppercase",
                        backgroundColor: confidenceColors.bg,
                        color: confidenceColors.color,
                        border: `1px solid ${confidenceColors.border}`
                      }}>
                        {idea.confidence} confidence
                      </span>
                    </div>
                  </div>
                </div>

                <h3 style={{
                  fontSize: "18px",
                  fontWeight: "700",
                  color: "#fff",
                  marginBottom: "16px",
                  lineHeight: "1.4"
                }}>
                  {idea.title}
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* Hook */}
                  <div style={{
                    background: "rgba(59, 130, 246, 0.05)",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    padding: "14px"
                  }}>
                    <div style={{ display: "flex", alignItems: "start", gap: "12px" }}>
                      <div style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(59, 130, 246, 0.1)",
                        color: "#60a5fa",
                        flexShrink: 0
                      }}>
                        <Clock size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          color: "#60a5fa",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: "6px"
                        }}>
                          Opening Hook
                        </p>
                        <p style={{ fontSize: "13px", color: "#E0E0E0", lineHeight: "1.6" }}>
                          {idea.hook}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Thumbnail */}
                  <div style={{
                    background: "rgba(139, 92, 246, 0.05)",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    padding: "14px"
                  }}>
                    <div style={{ display: "flex", alignItems: "start", gap: "12px" }}>
                      <div style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(139, 92, 246, 0.1)",
                        color: "#a78bfa",
                        flexShrink: 0
                      }}>
                        <Sparkles size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          color: "#a78bfa",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: "6px"
                        }}>
                          Thumbnail Concept
                        </p>
                        <p style={{ fontSize: "13px", color: "#E0E0E0", lineHeight: "1.6" }}>
                          {idea.thumbnailConcept}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Why It Works */}
                  <div style={{
                    background: "rgba(16, 185, 129, 0.05)",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    padding: "14px"
                  }}>
                    <div style={{ display: "flex", alignItems: "start", gap: "12px" }}>
                      <div style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(16, 185, 129, 0.1)",
                        color: "#10b981",
                        flexShrink: 0
                      }}>
                        <TrendingUp size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          color: "#10b981",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: "6px"
                        }}>
                          Why This Works
                        </p>
                        <p style={{ fontSize: "13px", color: "#E0E0E0", lineHeight: "1.6" }}>
                          {idea.whyItWorks}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No Data Message */}
      {(!data || data.length === 0) && !loading && (
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
            <p style={{ fontWeight: "700", color: "#fff", fontSize: "14px", marginBottom: "4px" }}>No Video Data Available</p>
            <p style={{ fontSize: "13px", color: "#9E9E9E" }}>
              Please upload your YouTube Studio data first to generate video ideas.
            </p>
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
