import { useState, useEffect } from 'react';
import { Lightbulb, Sparkles, TrendingUp, Clock, AlertCircle, Loader2 } from 'lucide-react';
import claudeAPI from '../services/claudeAPI';

export default function VideoIdeaGenerator({ data }) {
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

  // Save to localStorage whenever ideas change
  useEffect(() => {
    if (ideas.length > 0) {
      try {
        localStorage.setItem('ai_video_ideas', JSON.stringify({
          ideas,
          estimatedCost,
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error('Error saving ideas:', err);
      }
    }
  }, [ideas, estimatedCost]);

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Lightbulb className="w-6 h-6 text-yellow-500" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">AI Video Idea Generator</h2>
            <p className="text-sm text-gray-600">
              Generate data-driven video ideas based on your top performers
            </p>
          </div>
        </div>

        <button
          onClick={generateIdeas}
          disabled={loading || !data || data.length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Info Banner */}
      {!ideas.length && !loading && !error && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-6">
          <div className="flex gap-4">
            <Sparkles className="w-6 h-6 text-purple-600 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">How It Works</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>• Analyzes your top 20% performing videos</li>
                <li>• Identifies patterns in topics, titles, and engagement</li>
                <li>• Generates 10 new ideas tailored to your LDS audience</li>
                <li>• Includes titles, hooks, and thumbnail concepts</li>
                <li>• Estimated cost: $0.20-0.40 per generation</li>
              </ul>
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

      {/* Cost Estimate */}
      {estimatedCost && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-900">Ideas Generated Successfully</span>
              <span className="text-sm text-green-700">• Cost: ${estimatedCost.toFixed(4)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={generateIdeas}
                disabled={loading}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Generate New Ideas
              </button>
              <button
                onClick={clearIdeas}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generated Ideas */}
      {ideas.length > 0 && (
        <div className="grid gap-6">
          {ideas.map((idea, index) => (
            <div
              key={index}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold">
                    {index + 1}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTopicColor(idea.topic)}`}>
                      {idea.topic}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getConfidenceColor(idea.confidence)}`}>
                      {idea.confidence} confidence
                    </span>
                  </div>
                </div>
              </div>

              <h3 className="text-lg font-bold text-gray-900 mb-3">
                {idea.title}
              </h3>

              <div className="space-y-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-blue-900 uppercase mb-1">Opening Hook</p>
                      <p className="text-sm text-blue-800">{idea.hook}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-purple-900 uppercase mb-1">Thumbnail Concept</p>
                      <p className="text-sm text-purple-800">{idea.thumbnailConcept}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-gray-900 uppercase mb-1">Why This Works</p>
                      <p className="text-sm text-gray-700">{idea.whyItWorks}</p>
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
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-yellow-900">No Video Data Available</p>
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
