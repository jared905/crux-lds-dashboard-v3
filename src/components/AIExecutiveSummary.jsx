import React, { useState, useEffect } from 'react';
import { Sparkles, FileText, Loader2, AlertCircle, Copy, Check } from 'lucide-react';
import claudeAPI from '../services/claudeAPI';

/**
 * AI-Powered Executive Summary Generator
 * Generates natural language summaries and reports using Claude AI
 */
export default function AIExecutiveSummary({ rows, analysis }) {
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
      const focusGuidance = {
        growth: 'Focus heavily on subscriber growth, reach expansion, and audience acquisition metrics. Analyze what content drives new viewers.',
        engagement: 'Prioritize engagement metrics like CTR, retention, comments, and watch time. Identify what keeps audiences engaged.',
        content: 'Emphasize content strategy, topic performance, video formats, and what resonates with the LDS audience.',
        competitive: 'Focus on competitive positioning, market trends, and how this channel compares to similar LDS content creators.',
        monetization: 'Analyze revenue potential, ad performance, and opportunities to maximize earnings.',
        balanced: 'Provide a well-rounded analysis covering growth, engagement, and content strategy.'
      };

      const styleGuidance = {
        executive: 'Write in a concise, board-ready format. Focus on key insights and strategic implications. 2-3 paragraphs per section.',
        detailed: 'Provide comprehensive analysis with deeper dives into trends, patterns, and underlying factors. 3-5 paragraphs per section.',
        actionable: 'Emphasize concrete next steps and tactical recommendations. Include specific action items with expected outcomes.'
      };

      let systemPrompt = `You are an executive communications specialist for YouTube content creators in the Latter-day Saints (LDS/Mormon) space.

Your goal is to write compelling, data-driven executive summaries that:
1. Tell a story about channel performance (not just list statistics)
2. Provide strategic context and insights
3. Are written in professional but accessible language
4. Are suitable for presenting to stakeholders, board members, or leadership
5. Focus on "why" things happened, not just "what" happened
6. Include specific, actionable recommendations

${focusGuidance[focusArea]}

${styleGuidance[reportStyle]}

Write in a narrative style that executives would expect in a monthly board report.`;

      let userPrompt = `Write a comprehensive executive summary for this LDS YouTube channel's performance for the last 30 days.`;

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

Write in a professional narrative style. Use specific numbers. Focus on insights, not just data reporting. Consider the LDS audience context in your analysis.`;

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
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-yellow-900">No Data Available</p>
            <p className="text-sm text-yellow-700 mt-1">
              Please upload video data to generate an executive summary.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-purple-600" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">AI Executive Summary</h2>
            <p className="text-sm text-gray-600">
              Generate stakeholder-ready performance narratives
            </p>
          </div>
        </div>

        {!narrative && (
          <button
            onClick={generateNarrative}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Summary (~$0.30)
              </>
            )}
          </button>
        )}
      </div>

      {/* Context Fields (before generation) */}
      {!narrative && !loading && (
        <div className="space-y-4">
          {/* Toggle Context Fields */}
          <button
            onClick={() => setShowContextFields(!showContextFields)}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-2"
          >
            {showContextFields ? '▼' : '▶'} Customize Summary Focus (Optional - Improves Quality)
          </button>

          {/* Context Fields */}
          {showContextFields && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Focus Area
                </label>
                <select
                  value={focusArea}
                  onChange={(e) => setFocusArea(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Specific Questions or Goals (Optional)
                </label>
                <textarea
                  value={specificGoals}
                  onChange={(e) => setSpecificGoals(e.target.value)}
                  placeholder="Example: Why did views drop in week 3? Which video topics perform best? How do we compare to similar channels?"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The AI will address these specific questions throughout the analysis
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Report Style
                </label>
                <select
                  value={reportStyle}
                  onChange={(e) => setReportStyle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="executive">Executive Brief (Concise)</option>
                  <option value="detailed">Detailed Analysis (Comprehensive)</option>
                  <option value="actionable">Action-Oriented (Tactical)</option>
                </select>
              </div>
            </div>
          )}

          {/* Info Banner */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-6">
            <div className="flex gap-4">
              <Sparkles className="w-6 h-6 text-purple-600 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">What You'll Get</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li>• <strong>Professional narrative summary</strong> suitable for stakeholders and leadership</li>
                  <li>• <strong>Strategic insights</strong> explaining why performance changed, not just what changed</li>
                  <li>• <strong>Actionable recommendations</strong> tailored to your channel's LDS audience</li>
                  <li>• <strong>Context-aware analysis</strong> considering seasonal trends, topics, and format performance</li>
                  <li>• <strong>Board-ready format</strong> you can copy directly into reports or presentations</li>
                </ul>
                <p className="text-xs text-gray-600 mt-4">
                  Estimated cost: $0.15-0.45 • Takes 10-15 seconds to generate • Can refine after generation
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-900">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Generated Narrative */}
      {narrative && (
        <div className="space-y-4">
          {/* Cost & Actions */}
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-900">Summary Generated</span>
              {estimatedCost && (
                <span className="text-sm text-green-700">• Cost: ${estimatedCost.toFixed(4)}</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInPDF}
                  onChange={(e) => setIncludeInPDF(e.target.checked)}
                  className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <span className="text-sm font-medium text-green-900">Include in PDF Export</span>
              </label>
              <div className="flex items-center gap-2">
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy to Clipboard
                  </>
                )}
              </button>
              <button
                onClick={generateNarrative}
                disabled={loading}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Regenerate
              </button>
              <button
                onClick={clearSummary}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          </div>

          {/* Narrative Content - Dashboard Styled */}
          <div id="ai-summary-content" className="bg-gradient-to-br from-white to-gray-50 rounded-xl border-2 border-blue-100 shadow-lg p-8">
            <div className="prose prose-lg max-w-none">
              {narrative.split('\n').map((line, index) => {
                // Markdown-style rendering with dashboard styling
                if (line.startsWith('# ')) {
                  return (
                    <h1 key={index} className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mt-0 mb-6 pb-4 border-b-3 border-blue-200">
                      {line.substring(2)}
                    </h1>
                  );
                }
                if (line.startsWith('## ')) {
                  return (
                    <h2 key={index} className="text-2xl font-bold text-gray-900 mt-8 mb-4 flex items-center gap-3">
                      <span className="w-1.5 h-8 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></span>
                      {line.substring(3)}
                    </h2>
                  );
                }
                if (line.startsWith('### ')) {
                  return <h3 key={index} className="text-xl font-semibold text-gray-800 mt-6 mb-3">{line.substring(4)}</h3>;
                }
                if (line.startsWith('- ') || line.startsWith('• ')) {
                  return (
                    <li key={index} className="ml-6 text-gray-700 leading-relaxed mb-2 pl-2 border-l-2 border-blue-200">
                      {line.substring(2)}
                    </li>
                  );
                }
                if (line.trim() === '') {
                  return <div key={index} className="h-3" />;
                }
                // Bold text with blue highlight
                const boldText = line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-blue-700 font-semibold">$1</strong>');
                return (
                  <p
                    key={index}
                    className="text-gray-700 leading-relaxed mb-4 text-base"
                    dangerouslySetInnerHTML={{ __html: boldText }}
                  />
                );
              })}
            </div>
          </div>

          {/* Refinement Section */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              Refine This Summary
            </h3>

            {/* Quick Actions */}
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Quick refinements:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => refineNarrative('shorter')}
                  disabled={refining}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Make Shorter
                </button>
                <button
                  onClick={() => refineNarrative('longer')}
                  disabled={refining}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Add More Detail
                </button>
                <button
                  onClick={() => refineNarrative('moreData')}
                  disabled={refining}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  More Data Points
                </button>
                <button
                  onClick={() => refineNarrative('moreRecs')}
                  disabled={refining}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  More Recommendations
                </button>
                <button
                  onClick={() => refineNarrative('focusGrowth')}
                  disabled={refining}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Focus on Growth
                </button>
                <button
                  onClick={() => refineNarrative('focusEngagement')}
                  disabled={refining}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Focus on Engagement
                </button>
              </div>
            </div>

            {/* Custom Refinement */}
            <div>
              <p className="text-sm text-gray-600 mb-2">Or ask a specific question:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={refinementQuestion}
                  onChange={(e) => setRefinementQuestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && refineNarrative()}
                  placeholder="Example: Add a section about competitor analysis..."
                  disabled={refining}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
                <button
                  onClick={() => refineNarrative()}
                  disabled={refining || !refinementQuestion.trim()}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {refining ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Refining...
                    </>
                  ) : (
                    'Refine'
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Each refinement costs ~$0.05-0.15 depending on complexity
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
