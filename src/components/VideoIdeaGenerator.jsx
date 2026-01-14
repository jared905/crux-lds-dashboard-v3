import { useState, useEffect } from 'react';
import { Lightbulb, Sparkles, TrendingUp, Clock, AlertCircle, Loader2 } from 'lucide-react';
import claudeAPI from '../services/claudeAPI';

export default function VideoIdeaGenerator({ data }) {
  // v2.2.1 - Updated styling
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

      const systemPrompt = `You are a YouTube content strategist specializing in Latter-day Saints (LDS/Mormon) content.
Your goal is to analyze successful videos and generate creative, data-driven video ideas that will resonate with an LDS audience.`;

      const userPrompt = `Analyze these top-performing videos from an LDS YouTube channel:

${JSON.stringify(videoData, null, 2)}

Channel Performance Context:
- Average views: ${Math.round(avgViews).toLocaleString()}
- Average CTR: ${(avgCTR * 100).toFixed(1)}%
- Average retention: ${(avgRetention * 100).toFixed(1)}%

Based on these successful videos, generate 10 new video ideas that:
1. Follow similar patterns and topics that already work for this audience
2. Are specific and actionable (not generic)
3. Are tailored to LDS/Mormon audience interests
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
      case 'high': return 'bg-green-100 text-green-800 border-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTopicColor = (topic) => {
    const colors = {
      'Temple': 'bg-purple-100 text-purple-800',
      'Scripture': 'bg-blue-100 text-blue-800',
      'Faith': 'bg-green-100 text-green-800',
      'Family': 'bg-pink-100 text-pink-800',
      'Testimony': 'bg-yellow-100 text-yellow-800',
      'History': 'bg-orange-100 text-orange-800',
    };

    for (const [key, color] of Object.entries(colors)) {
      if (topic?.includes(key)) return color;
    }

    return 'bg-gray-100 text-gray-800';
  };

  const clearIdeas = () => {
    setIdeas([]);
    setEstimatedCost(null);
    setError(null);
    localStorage.removeItem('ai_video_ideas');
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-gradient-to-br from-purple-50 via-white to-blue-50 rounded-2xl border-2 border-purple-200 shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <Lightbulb className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                AI Video Idea Generator
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Generate data-driven video ideas based on your top performers
              </p>
            </div>
          </div>

          <button
            onClick={generateIdeas}
            disabled={loading || !data || data.length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating Ideas...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Video Ideas
              </>
            )}
          </button>
        </div>
      </div>

      {/* Info Banner */}
      {!ideas.length && !loading && !error && (
        <div className="bg-gradient-to-br from-purple-50 via-blue-50 to-purple-50 border-2 border-purple-200 rounded-2xl p-8 shadow-lg">
          <div className="flex gap-6">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">How It Works</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-start gap-3 bg-white/70 rounded-lg p-3 border border-purple-100">
                  <div className="w-2 h-2 bg-purple-600 rounded-full mt-1.5"></div>
                  <span className="text-sm text-gray-700">Analyzes your top 20% performing videos</span>
                </div>
                <div className="flex items-start gap-3 bg-white/70 rounded-lg p-3 border border-purple-100">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-1.5"></div>
                  <span className="text-sm text-gray-700">Identifies patterns in topics, titles, and engagement</span>
                </div>
                <div className="flex items-start gap-3 bg-white/70 rounded-lg p-3 border border-purple-100">
                  <div className="w-2 h-2 bg-purple-600 rounded-full mt-1.5"></div>
                  <span className="text-sm text-gray-700">Generates 10 new ideas tailored to your LDS audience</span>
                </div>
                <div className="flex items-start gap-3 bg-white/70 rounded-lg p-3 border border-purple-100">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-1.5"></div>
                  <span className="text-sm text-gray-700">Includes titles, hooks, and thumbnail concepts</span>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="font-semibold text-green-700">Estimated cost: $0.20-0.40 per generation</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-xl p-5 shadow-md">
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="font-bold text-red-900 text-lg">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Cost Estimate */}
      {estimatedCost && (
        <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-green-50 border-2 border-green-300 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-md">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-bold text-green-900 text-lg">Ideas Generated Successfully</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-green-700">Cost: ${estimatedCost.toFixed(4)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer bg-white px-4 py-2 rounded-xl border-2 border-green-200 hover:border-green-300 transition-colors shadow-sm">
                <input
                  type="checkbox"
                  checked={includeInPDF}
                  onChange={(e) => setIncludeInPDF(e.target.checked)}
                  className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <span className="text-sm font-semibold text-green-900">Include in PDF Export</span>
              </label>
              <button
                onClick={generateIdeas}
                disabled={loading}
                className="px-5 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50"
              >
                Generate New Ideas
              </button>
              <button
                onClick={clearIdeas}
                className="px-5 py-2 bg-white hover:bg-gray-50 border-2 border-gray-300 text-gray-700 text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-md"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generated Ideas - Dashboard Styled */}
      {ideas.length > 0 && (
        <div id="video-ideas-content" className="grid gap-6">
          {ideas.map((idea, index) => (
            <div
              key={index}
              className="bg-gradient-to-br from-white to-gray-50 rounded-xl border-2 border-purple-100 p-6 hover:shadow-xl hover:border-purple-200 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    {index + 1}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-3 py-1 rounded-lg text-xs font-semibold shadow-sm ${getTopicColor(idea.topic)}`}>
                      {idea.topic}
                    </span>
                    <span className={`px-3 py-1 rounded-lg text-xs font-semibold border-2 shadow-sm ${getConfidenceColor(idea.confidence)}`}>
                      {idea.confidence} confidence
                    </span>
                  </div>
                </div>
              </div>

              <h3 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-4 leading-tight">
                {idea.title}
              </h3>

              <div className="space-y-3">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                  <div className="flex items-start gap-3">
                    <div className="bg-blue-600 rounded-lg p-2">
                      <Clock className="w-4 h-4 text-white flex-shrink-0" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-blue-900 uppercase mb-2 tracking-wide">Opening Hook</p>
                      <p className="text-sm text-blue-900 font-medium leading-relaxed">{idea.hook}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
                  <div className="flex items-start gap-3">
                    <div className="bg-purple-600 rounded-lg p-2">
                      <Sparkles className="w-4 h-4 text-white flex-shrink-0" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-purple-900 uppercase mb-2 tracking-wide">Thumbnail Concept</p>
                      <p className="text-sm text-purple-900 font-medium leading-relaxed">{idea.thumbnailConcept}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
                  <div className="flex items-start gap-3">
                    <div className="bg-green-600 rounded-lg p-2">
                      <TrendingUp className="w-4 h-4 text-white flex-shrink-0" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-green-900 uppercase mb-2 tracking-wide">Why This Works</p>
                      <p className="text-sm text-green-900 font-medium leading-relaxed">{idea.whyItWorks}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Data Message */}
      {(!data || data.length === 0) && !loading && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-xl p-5 shadow-md">
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="font-bold text-yellow-900 text-lg">No Video Data Available</p>
              <p className="text-sm text-yellow-700 mt-1">
                Please upload your YouTube Studio data first to generate video ideas.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
