import { useState } from 'react';
import { MessageSquare, Search, TrendingUp, Loader2, AlertCircle, Download, Tag, BarChart3 } from 'lucide-react';
import claudeAPI from '../services/claudeAPI';
import youtubeAPI from '../services/youtubeAPI';

export default function CommentAnalysis({ data }) {
  const [videoUrl, setVideoUrl] = useState('');
  const [maxComments, setMaxComments] = useState(500);
  const [comments, setComments] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingComments, setFetchingComments] = useState(false);
  const [analyzingComments, setAnalyzingComments] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [estimatedCost, setEstimatedCost] = useState(null);

  const fetchComments = async () => {
    setFetchingComments(true);
    setError(null);
    setProgress({ current: 0, total: 0 });

    try {
      const videoId = youtubeAPI.extractVideoId(videoUrl);
      if (!videoId) {
        throw new Error('Invalid YouTube URL. Please enter a valid video URL or ID.');
      }

      const fetchedComments = await youtubeAPI.getAllVideoComments(
        videoId,
        maxComments,
        (current, total) => {
          setProgress({ current, total });
        }
      );

      setComments(fetchedComments);
      setProgress({ current: fetchedComments.length, total: fetchedComments.length });

    } catch (err) {
      console.error('Error fetching comments:', err);
      setError(err.message || 'Failed to fetch comments. Please check your API key and try again.');
    } finally {
      setFetchingComments(false);
    }
  };

  const analyzeComments = async () => {
    if (comments.length === 0) {
      setError('No comments to analyze. Please fetch comments first.');
      return;
    }

    setAnalyzingComments(true);
    setError(null);

    try {
      // Prepare comment text for analysis
      const commentTexts = comments
        .filter(c => !c.isReply) // Only analyze top-level comments for efficiency
        .slice(0, 1000) // Limit to 1000 comments to manage token usage
        .map(c => c.text);

      const systemPrompt = `You are a YouTube audience research analyst specializing in Latter-day Saints (LDS/Mormon) content.
Your goal is to analyze viewer comments to extract themes, sentiment, and actionable insights for content creators.`;

      const userPrompt = `Analyze these ${commentTexts.length} comments from an LDS YouTube video:

${commentTexts.slice(0, 200).join('\n---\n')}

Provide a comprehensive analysis in JSON format:

{
  "summary": "2-3 sentence overview of the comment section sentiment and main topics",
  "themes": [
    {
      "name": "Theme name (e.g., 'Temple Questions', 'Conversion Stories')",
      "count": estimated number of comments about this theme,
      "sentiment": "positive/neutral/negative/mixed",
      "description": "What viewers are saying about this theme",
      "keywords": ["keyword1", "keyword2", "keyword3"]
    }
  ],
  "topPhrases": [
    "most common phrase or question viewers are asking",
    "second most common phrase",
    "third most common phrase"
  ],
  "contentGaps": [
    "Topic or question viewers want covered but isn't being addressed",
    "Another content opportunity based on viewer requests"
  ],
  "audienceInsights": [
    "Insight about who the audience is (demographics, beliefs, interests)",
    "Another audience characteristic or pattern"
  ],
  "recommendedActions": [
    "Specific action the creator should take based on this analysis",
    "Another actionable recommendation"
  ]
}

Be specific and data-driven. Focus on actionable insights.`;

      const result = await claudeAPI.call(userPrompt, systemPrompt, 'comment-analysis', 4096);

      // Parse the JSON response
      const responseText = result.text.trim();
      let parsedAnalysis;

      // Try to extract JSON if Claude wrapped it in markdown
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedAnalysis = JSON.parse(jsonMatch[0]);
      } else {
        parsedAnalysis = JSON.parse(responseText);
      }

      setAnalysis(parsedAnalysis);
      setEstimatedCost(result.cost);

    } catch (err) {
      console.error('Error analyzing comments:', err);
      setError(err.message || 'Failed to analyze comments. Please try again.');
    } finally {
      setAnalyzingComments(false);
    }
  };

  const getCommentsForTheme = (theme) => {
    if (!theme || !theme.keywords) return [];

    const keywords = theme.keywords.map(k => k.toLowerCase());
    return comments.filter(comment => {
      const text = comment.text.toLowerCase();
      return keywords.some(keyword => text.includes(keyword));
    }).slice(0, 10); // Show max 10 examples
  };

  const getSentimentColor = (sentiment) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive': return 'bg-green-100 text-green-800 border-green-200';
      case 'negative': return 'bg-red-100 text-red-800 border-red-200';
      case 'neutral': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'mixed': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <MessageSquare className="w-6 h-6 text-blue-500" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900">AI Comment Analysis</h2>
          <p className="text-sm text-gray-600">
            Analyze YouTube comments to discover themes, sentiment, and audience insights
          </p>
        </div>
      </div>

      {/* Fetch Comments Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">1. Fetch Comments</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              YouTube Video URL or ID
            </label>
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={fetchingComments}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Maximum Comments to Fetch
            </label>
            <input
              type="number"
              min="10"
              max="10000"
              step="100"
              value={maxComments}
              onChange={(e) => setMaxComments(parseInt(e.target.value))}
              className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={fetchingComments}
            />
            <p className="text-xs text-gray-500 mt-1">
              More comments = better analysis but uses more API quota
            </p>
          </div>

          <button
            onClick={fetchComments}
            disabled={fetchingComments || !videoUrl}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetchingComments ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Fetching... {progress.current} / {progress.total || '?'}
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Fetch Comments
              </>
            )}
          </button>

          {comments.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800">
                ✓ Successfully fetched <strong>{comments.length}</strong> comments
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Analyze Comments Section */}
      {comments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">2. Analyze with AI</h3>

          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Claude will analyze {Math.min(comments.length, 1000)} comments to extract themes, sentiment, and insights.
            </p>

            <button
              onClick={analyzeComments}
              disabled={analyzingComments}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analyzingComments ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyzing Comments...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Analyze Comments (~$0.50-1.50)
                </>
              )}
            </button>
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

      {/* Analysis Results */}
      {analysis && (
        <div className="space-y-6">
          {/* Cost */}
          {estimatedCost && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-900">Analysis Complete</span>
                </div>
                <span className="text-sm text-green-700">Cost: ${estimatedCost.toFixed(4)}</span>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Summary</h3>
            <p className="text-gray-700 leading-relaxed">{analysis.summary}</p>
          </div>

          {/* Themes */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-900">Themes Found</h3>
            </div>

            <div className="grid gap-4">
              {analysis.themes.map((theme, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedTheme(selectedTheme === index ? null : index)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <h4 className="font-semibold text-gray-900">{theme.name}</h4>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getSentimentColor(theme.sentiment)}`}>
                        {theme.sentiment}
                      </span>
                    </div>
                    <span className="text-sm text-gray-600">{theme.count} comments</span>
                  </div>

                  <p className="text-sm text-gray-700 mb-2">{theme.description}</p>

                  <div className="flex flex-wrap gap-2 mb-2">
                    {theme.keywords.map((keyword, i) => (
                      <span key={i} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        {keyword}
                      </span>
                    ))}
                  </div>

                  {selectedTheme === index && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-sm font-medium text-gray-900 mb-2">Example Comments:</p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {getCommentsForTheme(theme).map((comment, i) => (
                          <div key={i} className="bg-gray-50 rounded p-3 text-sm">
                            <p className="text-gray-700">{comment.text}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              — {comment.author} • {comment.likeCount} likes
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Top Phrases */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Top Phrases & Questions</h3>
            <ul className="space-y-2">
              {analysis.topPhrases.map((phrase, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-blue-600 font-semibold">{index + 1}.</span>
                  <span className="text-gray-700">"{phrase}"</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Content Gaps */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Content Opportunities</h3>
            <ul className="space-y-2">
              {analysis.contentGaps.map((gap, index) => (
                <li key={index} className="flex items-start gap-2 text-gray-700">
                  <span className="text-yellow-600">•</span>
                  <span>{gap}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Audience Insights */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Audience Insights</h3>
            <ul className="space-y-2">
              {analysis.audienceInsights.map((insight, index) => (
                <li key={index} className="flex items-start gap-2 text-gray-700">
                  <span className="text-blue-600">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Recommended Actions */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Recommended Actions</h3>
            <ul className="space-y-2">
              {analysis.recommendedActions.map((action, index) => (
                <li key={index} className="flex items-start gap-2 text-gray-700">
                  <span className="text-green-600">✓</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
