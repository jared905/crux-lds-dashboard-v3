import React, { useState, useMemo } from "react";
import { MessageSquare, Send, Lightbulb, TrendingUp, BarChart3 } from "lucide-react";

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? "0%" : `${(n * 100).toFixed(1)}%`;

export default function ContentIntelligence({ rows }) {
  const [question, setQuestion] = useState("");
  const [conversation, setConversation] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Example questions to help users get started
  const exampleQuestions = [
    "Does content about Christ perform better than content about faith?",
    "Do question titles work better than statement titles?",
    "Which performs better: Shorts or Long-form content?",
    "What's my best performing topic?",
    "Do videos with numbers in titles get more views?",
    "What time of year do my videos perform best?"
  ];

  // Analyze the data based on the question
  const analyzeQuestion = (userQuestion) => {
    const lowerQuestion = userQuestion.toLowerCase();

    // PATTERN 1: Keyword comparison (e.g., "christ" vs "faith")
    // Look for pattern: "about KEYWORD" or "content about KEYWORD" vs "about KEYWORD2"
    const aboutPattern1 = lowerQuestion.match(/(?:content\s+)?about\s+([a-z]+)/i);
    const aboutPattern2 = lowerQuestion.match(/(?:than|vs)\s+(?:content\s+)?about\s+([a-z]+)/i);

    if (aboutPattern1 && aboutPattern2) {
      const keyword1 = aboutPattern1[1];
      const keyword2 = aboutPattern2[1];
      return compareKeywords(keyword1.toLowerCase(), keyword2.toLowerCase());
    }

    // Fallback: Try quoted keywords or explicit comparison format
    const quotedMatch = lowerQuestion.match(/["']([a-z]{3,}?)["'].*(?:better|perform|more).*(?:than|vs).*["']([a-z]{3,}?)["']/i);
    if (quotedMatch) {
      const [_, keyword1, keyword2] = quotedMatch;
      return compareKeywords(keyword1.toLowerCase(), keyword2.toLowerCase());
    }

    // PATTERN 2: Question vs Statement titles
    if (lowerQuestion.includes("question") && lowerQuestion.includes("statement")) {
      return compareQuestionVsStatement();
    }

    // PATTERN 3: Title style analysis (numbers, questions, etc.)
    if ((lowerQuestion.includes("number") || lowerQuestion.includes("digit")) && lowerQuestion.includes("title")) {
      return analyzeTitlePattern("numbers");
    }

    // PATTERN 4: Format comparison (Shorts vs Long-form)
    if (lowerQuestion.includes("short") && lowerQuestion.includes("long")) {
      return compareFormats();
    }

    // PATTERN 5: Best performing topic
    if (lowerQuestion.includes("best") && (lowerQuestion.includes("topic") || lowerQuestion.includes("subject"))) {
      return findBestTopic();
    }

    // PATTERN 6: Time-based analysis
    if ((lowerQuestion.includes("when") || lowerQuestion.includes("time") || lowerQuestion.includes("season")) && lowerQuestion.includes("perform")) {
      return analyzeTimePatterns();
    }

    // PATTERN 7: CTR analysis
    if (lowerQuestion.includes("ctr") || (lowerQuestion.includes("click") && lowerQuestion.includes("through"))) {
      return analyzeCTRPatterns();
    }

    // PATTERN 8: Retention analysis
    if (lowerQuestion.includes("retention") || lowerQuestion.includes("watch time")) {
      return analyzeRetentionPatterns();
    }

    // Default: General stats
    return {
      answer: "I couldn't find a specific pattern to analyze in your question. Try asking about:\n- Comparing two keywords (e.g., 'Does content about X perform better than Y?')\n- Title styles (questions vs statements, numbers in titles)\n- Format comparison (Shorts vs Long-form)\n- Best performing topics\n- Time-based patterns\n- CTR or retention patterns",
      data: null,
      confidence: "low"
    };
  };

  // Compare two keywords in titles
  const compareKeywords = (keyword1, keyword2) => {
    // Validate keywords - must be at least 3 characters
    if (keyword1.length < 3 || keyword2.length < 3) {
      return {
        answer: `Keywords must be at least 3 characters long. "${keyword1}" (${keyword1.length} chars) and "${keyword2}" (${keyword2.length} chars) are too short.`,
        data: null,
        confidence: "none"
      };
    }

    // Use word boundaries for more accurate matching
    const regex1 = new RegExp(`\\b${keyword1}`, 'i');
    const regex2 = new RegExp(`\\b${keyword2}`, 'i');

    const videos1 = rows.filter(r => regex1.test(r.title));
    const videos2 = rows.filter(r => regex2.test(r.title));

    if (videos1.length === 0 && videos2.length === 0) {
      return {
        answer: `No videos found containing "${keyword1}" or "${keyword2}" in the title.`,
        data: null,
        confidence: "none"
      };
    }

    if (videos1.length === 0) {
      return {
        answer: `No videos found containing "${keyword1}". Found ${videos2.length} videos with "${keyword2}".`,
        data: null,
        confidence: "none"
      };
    }

    if (videos2.length === 0) {
      return {
        answer: `No videos found containing "${keyword2}". Found ${videos1.length} videos with "${keyword1}".`,
        data: null,
        confidence: "none"
      };
    }

    const stats1 = calculateStats(videos1);
    const stats2 = calculateStats(videos2);

    const winner = stats1.avgViews > stats2.avgViews ? keyword1 : keyword2;
    const loser = winner === keyword1 ? keyword2 : keyword1;
    const winnerStats = winner === keyword1 ? stats1 : stats2;
    const loserStats = winner === keyword1 ? stats2 : stats1;
    const difference = ((winnerStats.avgViews - loserStats.avgViews) / loserStats.avgViews) * 100;

    const topVideos1 = videos1.sort((a, b) => b.views - a.views).slice(0, 3);
    const topVideos2 = videos2.sort((a, b) => b.views - a.views).slice(0, 3);

    return {
      answer: `**"${winner.toUpperCase()}" performs ${difference.toFixed(0)}% better than "${loser.toUpperCase()}"**\n\n` +
        `📊 **${keyword1.toUpperCase()}**: ${videos1.length} videos, ${fmtInt(stats1.avgViews)} avg views, ${fmtPct(stats1.avgCTR)} CTR, ${fmtPct(stats1.avgRetention)} retention\n` +
        `📊 **${keyword2.toUpperCase()}**: ${videos2.length} videos, ${fmtInt(stats2.avgViews)} avg views, ${fmtPct(stats2.avgCTR)} CTR, ${fmtPct(stats2.avgRetention)} retention`,
      data: {
        keyword1: { name: keyword1, stats: stats1, videos: topVideos1 },
        keyword2: { name: keyword2, stats: stats2, videos: topVideos2 }
      },
      confidence: videos1.length >= 5 && videos2.length >= 5 ? "high" : videos1.length >= 3 && videos2.length >= 3 ? "medium" : "low"
    };
  };

  // Compare question vs statement titles
  const compareQuestionVsStatement = () => {
    const questions = rows.filter(r => r.title.includes("?"));
    const statements = rows.filter(r => !r.title.includes("?"));

    const statsQuestions = calculateStats(questions);
    const statsStatements = calculateStats(statements);

    const winner = statsQuestions.avgViews > statsStatements.avgViews ? "Questions" : "Statements";
    const difference = Math.abs(((statsQuestions.avgViews - statsStatements.avgViews) / statsStatements.avgViews) * 100);

    return {
      answer: `**${winner} perform ${difference.toFixed(0)}% better**\n\n` +
        `❓ **Question Titles**: ${questions.length} videos, ${fmtInt(statsQuestions.avgViews)} avg views, ${fmtPct(statsQuestions.avgCTR)} CTR\n` +
        `💬 **Statement Titles**: ${statements.length} videos, ${fmtInt(statsStatements.avgViews)} avg views, ${fmtPct(statsStatements.avgCTR)} CTR`,
      data: {
        questions: { stats: statsQuestions, count: questions.length },
        statements: { stats: statsStatements, count: statements.length }
      },
      confidence: questions.length >= 10 && statements.length >= 10 ? "high" : "medium"
    };
  };

  // Analyze title patterns (numbers, caps, etc.)
  const analyzeTitlePattern = (pattern) => {
    if (pattern === "numbers") {
      const withNumbers = rows.filter(r => /\d/.test(r.title));
      const withoutNumbers = rows.filter(r => !/\d/.test(r.title));

      const statsWithNumbers = calculateStats(withNumbers);
      const statsWithoutNumbers = calculateStats(withoutNumbers);

      const difference = ((statsWithNumbers.avgViews - statsWithoutNumbers.avgViews) / statsWithoutNumbers.avgViews) * 100;
      const winner = statsWithNumbers.avgViews > statsWithoutNumbers.avgViews ? "WITH numbers" : "WITHOUT numbers";

      return {
        answer: `**Titles ${winner} perform ${Math.abs(difference).toFixed(0)}% better**\n\n` +
          `🔢 **With Numbers**: ${withNumbers.length} videos, ${fmtInt(statsWithNumbers.avgViews)} avg views, ${fmtPct(statsWithNumbers.avgCTR)} CTR\n` +
          `📝 **Without Numbers**: ${withoutNumbers.length} videos, ${fmtInt(statsWithoutNumbers.avgViews)} avg views, ${fmtPct(statsWithoutNumbers.avgCTR)} CTR`,
        data: {
          withNumbers: { stats: statsWithNumbers, count: withNumbers.length },
          withoutNumbers: { stats: statsWithoutNumbers, count: withoutNumbers.length }
        },
        confidence: withNumbers.length >= 10 ? "high" : "medium"
      };
    }
  };

  // Compare Shorts vs Long-form
  const compareFormats = () => {
    const shorts = rows.filter(r => r.type === 'short');
    const longs = rows.filter(r => r.type !== 'short');

    const statsShorts = calculateStats(shorts);
    const statsLongs = calculateStats(longs);

    // Calculate ROI
    const shortsROI = shorts.length > 0 ? statsShorts.totalViews / (shorts.length * 2) : 0;
    const longsROI = longs.length > 0 ? statsLongs.totalViews / (longs.length * 8) : 0;

    const roiWinner = shortsROI > longsROI ? "Shorts" : "Long-form";
    const roiDifference = ((Math.max(shortsROI, longsROI) - Math.min(shortsROI, longsROI)) / Math.min(shortsROI, longsROI)) * 100;

    return {
      answer: `**${roiWinner} have ${roiDifference.toFixed(0)}% better ROI** (views per production hour)\n\n` +
        `📹 **Shorts**: ${shorts.length} videos, ${fmtInt(statsShorts.avgViews)} avg views, ${fmtInt(shortsROI)} views/hour ROI\n` +
        `🎬 **Long-form**: ${longs.length} videos, ${fmtInt(statsLongs.avgViews)} avg views, ${fmtInt(longsROI)} views/hour ROI\n\n` +
        `💡 **Insight**: ${shortsROI > longsROI ? "Shorts deliver better ROI per production hour." : "Long-form delivers better ROI despite longer production time."}`,
      data: {
        shorts: { stats: statsShorts, roi: shortsROI },
        longs: { stats: statsLongs, roi: longsROI }
      },
      confidence: "high"
    };
  };

  // Find best performing topic
  const findBestTopic = () => {
    const titleWords = {};

    // Common words to exclude from topic analysis
    const commonWords = new Set([
      'about', 'after', 'again', 'before', 'being', 'could', 'doing', 'every',
      'first', 'found', 'going', 'great', 'having', 'learn', 'makes', 'never',
      'other', 'really', 'should', 'still', 'their', 'there', 'these', 'thing',
      'things', 'think', 'those', 'through', 'until', 'using', 'wants', 'watch',
      'where', 'which', 'while', 'world', 'would', 'years', 'your'
    ]);

    rows.forEach(r => {
      const words = r.title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      words.forEach(word => {
        const clean = word.replace(/[^a-z]/g, '');
        if (clean.length > 4 && !commonWords.has(clean)) {
          if (!titleWords[clean]) titleWords[clean] = [];
          titleWords[clean].push(r);
        }
      });
    });

    const topics = Object.entries(titleWords)
      .filter(([word, videos]) => videos.length >= 3)
      .map(([word, videos]) => {
        const stats = calculateStats(videos);
        return { word, videos, stats };
      })
      .sort((a, b) => b.stats.avgViews - a.stats.avgViews);

    if (topics.length === 0) {
      return {
        answer: "Not enough videos with common topics to analyze. Need at least 3 videos on the same topic.",
        data: null,
        confidence: "none"
      };
    }

    const best = topics[0];
    const topVideos = best.videos.sort((a, b) => b.views - a.views).slice(0, 3);

    return {
      answer: `**"${best.word.toUpperCase()}" is your best performing topic**\n\n` +
        `📈 ${best.videos.length} videos, ${fmtInt(best.stats.avgViews)} avg views\n` +
        `🎯 ${fmtPct(best.stats.avgCTR)} CTR, ${fmtPct(best.stats.avgRetention)} retention\n\n` +
        `**Top performing videos:**\n` +
        topVideos.map((v, i) => `${i + 1}. ${v.title} (${fmtInt(v.views)} views)`).join('\n'),
      data: {
        topic: best.word,
        stats: best.stats,
        topVideos
      },
      confidence: best.videos.length >= 5 ? "high" : "medium"
    };
  };

  // Analyze time-based patterns
  const analyzeTimePatterns = () => {
    const videosByMonth = {};

    rows.filter(r => r.publishDate).forEach(r => {
      const date = new Date(r.publishDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!videosByMonth[monthKey]) videosByMonth[monthKey] = [];
      videosByMonth[monthKey].push(r);
    });

    const monthStats = Object.entries(videosByMonth)
      .map(([month, videos]) => ({
        month,
        stats: calculateStats(videos),
        count: videos.length
      }))
      .filter(m => m.count >= 2)
      .sort((a, b) => b.stats.avgViews - a.stats.avgViews);

    if (monthStats.length === 0) {
      return {
        answer: "Not enough time-based data to analyze patterns.",
        data: null,
        confidence: "none"
      };
    }

    const best = monthStats[0];
    const worst = monthStats[monthStats.length - 1];

    return {
      answer: `**Best month: ${formatMonth(best.month)}** (${fmtInt(best.stats.avgViews)} avg views)\n` +
        `**Worst month: ${formatMonth(worst.month)}** (${fmtInt(worst.stats.avgViews)} avg views)\n\n` +
        `📊 Top 3 months:\n` +
        monthStats.slice(0, 3).map((m, i) =>
          `${i + 1}. ${formatMonth(m.month)}: ${fmtInt(m.stats.avgViews)} avg views (${m.count} videos)`
        ).join('\n'),
      data: { monthStats },
      confidence: monthStats.length >= 6 ? "high" : "medium"
    };
  };

  // Analyze CTR patterns
  const analyzeCTRPatterns = () => {
    const sorted = [...rows].filter(r => r.ctr > 0).sort((a, b) => b.ctr - a.ctr);
    const top20 = sorted.slice(0, Math.ceil(sorted.length * 0.2));
    const bottom20 = sorted.slice(Math.floor(sorted.length * 0.8));

    const statsTop = calculateStats(top20);
    const statsBottom = calculateStats(bottom20);

    // Analyze title patterns
    const topHasNumbers = top20.filter(v => /\d/.test(v.title)).length / top20.length;
    const bottomHasNumbers = bottom20.filter(v => /\d/.test(v.title)).length / bottom20.length;

    const topHasQuestions = top20.filter(v => v.title.includes("?")).length / top20.length;
    const bottomHasQuestions = bottom20.filter(v => v.title.includes("?")).length / bottom20.length;

    let pattern = "varied hooks";
    if (topHasNumbers > bottomHasNumbers + 0.3) pattern = "numbers in titles";
    else if (topHasQuestions > bottomHasQuestions + 0.3) pattern = "question titles";

    return {
      answer: `**High CTR Pattern Identified: ${pattern}**\n\n` +
        `📈 Top 20% CTR: ${fmtPct(statsTop.avgCTR)} avg (${fmtInt(statsTop.avgViews)} avg views)\n` +
        `📉 Bottom 20% CTR: ${fmtPct(statsBottom.avgCTR)} avg (${fmtInt(statsBottom.avgViews)} avg views)\n\n` +
        `💡 **Recommendation**: ${pattern === "numbers in titles" ? "Use specific numbers/stats in titles" : pattern === "question titles" ? "Frame titles as questions" : "Study your top performers for common patterns"}`,
      data: { top20, bottom20, pattern },
      confidence: "high"
    };
  };

  // Analyze retention patterns
  const analyzeRetentionPatterns = () => {
    const sorted = [...rows].filter(r => r.retention > 0).sort((a, b) => b.retention - a.retention);
    const top20 = sorted.slice(0, Math.ceil(sorted.length * 0.2));
    const bottom20 = sorted.slice(Math.floor(sorted.length * 0.8));

    const statsTop = calculateStats(top20);
    const statsBottom = calculateStats(bottom20);

    const avgDurationTop = top20.reduce((sum, v) => sum + v.duration, 0) / top20.length;
    const avgDurationBottom = bottom20.reduce((sum, v) => sum + v.duration, 0) / bottom20.length;

    return {
      answer: `**Retention Analysis**\n\n` +
        `⭐ Top 20%: ${fmtPct(statsTop.avgRetention)} retention, ${Math.round(avgDurationTop)}s avg duration\n` +
        `📉 Bottom 20%: ${fmtPct(statsBottom.avgRetention)} retention, ${Math.round(avgDurationBottom)}s avg duration\n\n` +
        `💡 **Insight**: ${avgDurationTop < avgDurationBottom ? "Shorter content tends to retain better" : "Longer, quality content retains better"}`,
      data: { top20, bottom20 },
      confidence: "high"
    };
  };

  // Calculate stats for a set of videos
  const calculateStats = (videos) => {
    if (videos.length === 0) {
      return { avgViews: 0, avgCTR: 0, avgRetention: 0, totalViews: 0 };
    }

    const totalViews = videos.reduce((sum, v) => sum + (v.views || 0), 0);
    const totalImpressions = videos.reduce((sum, v) => sum + (v.impressions || 0), 0);

    return {
      avgViews: totalViews / videos.length,
      avgCTR: totalImpressions > 0
        ? videos.reduce((sum, v) => sum + (v.ctr || 0) * (v.impressions || 0), 0) / totalImpressions
        : 0,
      avgRetention: totalViews > 0
        ? videos.reduce((sum, v) => sum + (v.retention || 0) * (v.views || 0), 0) / totalViews
        : 0,
      totalViews
    };
  };

  // Format month string
  const formatMonth = (monthStr) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  // Handle question submission
  const handleAskQuestion = () => {
    if (!question.trim()) return;

    setIsAnalyzing(true);

    // Add user question to conversation
    const userMessage = { type: 'question', text: question };

    // Analyze and generate answer
    setTimeout(() => {
      const result = analyzeQuestion(question);
      const answerMessage = {
        type: 'answer',
        text: result.answer,
        data: result.data,
        confidence: result.confidence
      };

      setConversation(prev => [...prev, userMessage, answerMessage]);
      setQuestion("");
      setIsAnalyzing(false);
    }, 500);
  };

  const handleExampleClick = (exampleQ) => {
    setQuestion(exampleQ);
  };

  return (
    <div style={{ padding: "0" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
          <Lightbulb size={24} style={{ color: "#f59e0b" }} />
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#fff" }}>
            Content Intelligence
          </div>
        </div>
        <div style={{ fontSize: "14px", color: "#9E9E9E" }}>
          Ask strategic questions about your content performance and get data-driven answers
        </div>
      </div>

      {/* Question Input */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px"
      }}>
        <div style={{ fontSize: "16px", fontWeight: "600", color: "#fff", marginBottom: "16px" }}>
          Ask a Question
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
            placeholder="e.g., Does content about Christ perform better than content about faith?"
            disabled={isAnalyzing}
            style={{
              flex: 1,
              background: "#252525",
              border: "1px solid #333",
              borderRadius: "8px",
              padding: "14px 16px",
              color: "#fff",
              fontSize: "14px",
              outline: "none"
            }}
          />
          <button
            onClick={handleAskQuestion}
            disabled={!question.trim() || isAnalyzing}
            style={{
              background: question.trim() && !isAnalyzing ? "#3b82f6" : "#333",
              border: "none",
              borderRadius: "8px",
              padding: "14px 24px",
              color: "#fff",
              fontSize: "14px",
              fontWeight: "600",
              cursor: question.trim() && !isAnalyzing ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            {isAnalyzing ? "Analyzing..." : "Ask"}
            <Send size={16} />
          </button>
        </div>

        {/* Example Questions */}
        <div style={{ marginTop: "20px" }}>
          <div style={{ fontSize: "12px", color: "#888", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Example Questions
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {exampleQuestions.map((exampleQ, idx) => (
              <button
                key={idx}
                onClick={() => handleExampleClick(exampleQ)}
                style={{
                  background: "#252525",
                  border: "1px solid #333",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  color: "#b0b0b0",
                  fontSize: "12px",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                onMouseOver={(e) => {
                  e.target.style.background = "#2a2a2a";
                  e.target.style.borderColor = "#3b82f6";
                  e.target.style.color = "#fff";
                }}
                onMouseOut={(e) => {
                  e.target.style.background = "#252525";
                  e.target.style.borderColor = "#333";
                  e.target.style.color = "#b0b0b0";
                }}
              >
                {exampleQ}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Conversation */}
      {conversation.length > 0 && (
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "24px"
        }}>
          <div style={{ fontSize: "16px", fontWeight: "600", color: "#fff", marginBottom: "20px" }}>
            Analysis Results
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {conversation.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  background: msg.type === 'question' ? "#252525" : "#1a1a2e",
                  border: msg.type === 'question' ? "1px solid #333" : "1px solid #3b82f640",
                  borderRadius: "10px",
                  padding: "16px"
                }}
              >
                {msg.type === 'question' ? (
                  <div style={{ display: "flex", gap: "12px" }}>
                    <MessageSquare size={20} style={{ color: "#3b82f6", marginTop: "2px", flexShrink: 0 }} />
                    <div style={{ color: "#fff", fontSize: "14px", lineHeight: "1.6" }}>
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                      <BarChart3 size={20} style={{ color: "#10b981" }} />
                      <div style={{ fontSize: "12px", fontWeight: "600", color: "#10b981", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Analysis
                      </div>
                      {msg.confidence && (
                        <div style={{
                          fontSize: "10px",
                          color: msg.confidence === "high" ? "#10b981" : msg.confidence === "medium" ? "#f59e0b" : "#ef4444",
                          background: msg.confidence === "high" ? "#10b98120" : msg.confidence === "medium" ? "#f59e0b20" : "#ef444420",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          fontWeight: "600",
                          textTransform: "uppercase"
                        }}>
                          {msg.confidence} confidence
                        </div>
                      )}
                    </div>
                    <div style={{
                      color: "#e0e0e0",
                      fontSize: "14px",
                      lineHeight: "1.8",
                      whiteSpace: "pre-line"
                    }}>
                      {msg.text}
                    </div>

                    {/* Render data visualizations if available */}
                    {msg.data && renderDataVisualization(msg.data)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {conversation.length === 0 && (
        <div style={{
          background: "#1E1E1E",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "60px 24px",
          textAlign: "center"
        }}>
          <Lightbulb size={48} style={{ color: "#3b82f6", marginBottom: "16px" }} />
          <div style={{ fontSize: "18px", fontWeight: "600", color: "#fff", marginBottom: "8px" }}>
            Ask your first question
          </div>
          <div style={{ fontSize: "14px", color: "#888", maxWidth: "500px", margin: "0 auto" }}>
            Get instant insights about your content performance. Compare topics, analyze patterns, and make data-driven decisions.
          </div>
        </div>
      )}
    </div>
  );

  function renderDataVisualization(data) {
    // Render comparison bars for keyword comparisons
    if (data.keyword1 && data.keyword2) {
      const max = Math.max(data.keyword1.stats.avgViews, data.keyword2.stats.avgViews);

      return (
        <div style={{ marginTop: "16px" }}>
          <div style={{ fontSize: "11px", color: "#888", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
            Top Performing Videos
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {/* Keyword 1 */}
            <div>
              <div style={{ fontSize: "12px", color: "#3b82f6", fontWeight: "600", marginBottom: "8px" }}>
                {data.keyword1.name.toUpperCase()}
              </div>
              {data.keyword1.videos.map((video, i) => (
                <div key={i} style={{
                  background: "#0d0d0d",
                  border: "1px solid #222",
                  borderRadius: "4px",
                  padding: "8px",
                  marginBottom: "6px",
                  fontSize: "11px"
                }}>
                  <div style={{ color: "#e0e0e0", marginBottom: "4px" }}>{video.title}</div>
                  <div style={{ color: "#666" }}>{fmtInt(video.views)} views</div>
                </div>
              ))}
            </div>

            {/* Keyword 2 */}
            <div>
              <div style={{ fontSize: "12px", color: "#10b981", fontWeight: "600", marginBottom: "8px" }}>
                {data.keyword2.name.toUpperCase()}
              </div>
              {data.keyword2.videos.map((video, i) => (
                <div key={i} style={{
                  background: "#0d0d0d",
                  border: "1px solid #222",
                  borderRadius: "4px",
                  padding: "8px",
                  marginBottom: "6px",
                  fontSize: "11px"
                }}>
                  <div style={{ color: "#e0e0e0", marginBottom: "4px" }}>{video.title}</div>
                  <div style={{ color: "#666" }}>{fmtInt(video.views)} views</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return null;
  }
}
