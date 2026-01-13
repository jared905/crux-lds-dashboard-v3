import React, { useState } from 'react';
import { Sparkles, FileText, Loader2, AlertCircle, Copy, Check } from 'lucide-react';
import claudeAPI from '../services/claudeAPI';

/**
 * AI-Powered Executive Summary Generator
 * Generates natural language summaries and reports using Claude AI
 */
export default function AIExecutiveSummary({ rows, analysis }) {
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [estimatedCost, setEstimatedCost] = useState(null);
  const [copied, setCopied] = useState(false);

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

      const systemPrompt = `You are an executive communications specialist for YouTube content creators in the Latter-day Saints (LDS/Mormon) space.

Your goal is to write compelling, data-driven executive summaries that:
1. Tell a story about channel performance (not just list statistics)
2. Provide strategic context and insights
3. Are written in professional but accessible language
4. Are suitable for presenting to stakeholders, board members, or leadership
5. Focus on "why" things happened, not just "what" happened
6. Include specific, actionable recommendations

Write in a narrative style that executives would expect in a monthly board report.`;

      const userPrompt = `Write a comprehensive executive summary for this LDS YouTube channel's performance for the last 30 days.

**Current Month Performance (Last 30 Days):**
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

    } catch (err) {
      console.error('Error generating narrative:', err);
      setError(err.message || 'Failed to generate summary. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (narrative) {
      navigator.clipboard.writeText(narrative);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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

      {/* Info Banner (before generation) */}
      {!narrative && !loading && !error && (
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
                Estimated cost: $0.15-0.45 • Takes 10-15 seconds to generate
              </p>
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
            </div>
          </div>

          {/* Narrative Content */}
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div className="prose prose-lg max-w-none">
              {narrative.split('\n').map((line, index) => {
                // Markdown-style rendering
                if (line.startsWith('# ')) {
                  return <h1 key={index} className="text-3xl font-bold text-gray-900 mt-8 mb-4">{line.substring(2)}</h1>;
                }
                if (line.startsWith('## ')) {
                  return <h2 key={index} className="text-2xl font-bold text-gray-900 mt-6 mb-3">{line.substring(3)}</h2>;
                }
                if (line.startsWith('### ')) {
                  return <h3 key={index} className="text-xl font-semibold text-gray-900 mt-4 mb-2">{line.substring(4)}</h3>;
                }
                if (line.startsWith('- ') || line.startsWith('• ')) {
                  return (
                    <li key={index} className="ml-6 text-gray-700 leading-relaxed">
                      {line.substring(2)}
                    </li>
                  );
                }
                if (line.trim() === '') {
                  return <div key={index} className="h-4" />;
                }
                // Bold text
                const boldText = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                return (
                  <p
                    key={index}
                    className="text-gray-700 leading-relaxed mb-3"
                    dangerouslySetInnerHTML={{ __html: boldText }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
