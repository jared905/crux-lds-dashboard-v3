import React, { useState } from 'react';
import { Sparkles, Zap, AlertCircle, Loader2 } from 'lucide-react';
import ContentIntelligence from './ContentIntelligence';
import claudeAPI from '../services/claudeAPI';

/**
 * Enhanced Content Intelligence with Claude AI
 * Wraps the existing rule-based ContentIntelligence with optional AI-powered analysis
 */
export default function EnhancedContentIntelligence({ rows }) {
  const [useAI, setUseAI] = useState(false);
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  // If AI is not enabled, use the original component
  if (!useAI) {
    return (
      <div className="space-y-4">
        {/* Toggle AI Mode Banner */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4">
              <Sparkles className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Upgrade to AI-Powered Analysis</h3>
                <p className="text-sm text-gray-700 mb-3">
                  Ask ANY question about your data with Claude AI. No pattern matching limits - ask anything!
                </p>
                <ul className="text-sm text-gray-600 space-y-1 mb-4">
                  <li>• Answer complex multi-factor questions</li>
                  <li>• Discover unexpected patterns in your data</li>
                  <li>• Get natural language explanations and insights</li>
                  <li>• Estimated cost: $0.10-0.30 per question</li>
                </ul>
                <button
                  onClick={() => setUseAI(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  Enable AI Mode
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Original Rule-Based Component */}
        <ContentIntelligence rows={rows} />
      </div>
    );
  }

  // AI-powered Q&A
  const askClaude = async () => {
    if (!question.trim()) return;

    setIsAnalyzing(true);
    setError(null);

    // Add user question to conversation
    const userMessage = { role: 'user', content: question };
    setConversation(prev => [...prev, userMessage]);

    try {
      // Prepare video data (top performers + sample data)
      const sortedVideos = [...rows].sort((a, b) => b.views - a.views);
      const topVideos = sortedVideos.slice(0, 50);
      const sampleVideos = rows.slice(0, 100);

      // Calculate channel stats
      const totalViews = rows.reduce((sum, v) => sum + v.views, 0);
      const avgViews = totalViews / rows.length;
      const avgCTR = rows.reduce((sum, v) => sum + (v.ctr || 0), 0) / rows.length;
      const avgRetention = rows.reduce((sum, v) => sum + (v.retention || 0), 0) / rows.length;

      const videoData = sampleVideos.map(v => ({
        title: v.title,
        views: v.views,
        ctr: v.ctr,
        retention: v.retention,
        date: v.date
      }));

      const systemPrompt = `You are a YouTube analytics expert specializing in Latter-day Saints (LDS/Mormon) content.

You have access to data from ${rows.length} videos from an LDS YouTube channel.

Channel Overview:
- Total videos: ${rows.length}
- Average views: ${Math.round(avgViews).toLocaleString()}
- Average CTR: ${(avgCTR * 100).toFixed(1)}%
- Average retention: ${(avgRetention * 100).toFixed(1)}%

Analyze the data and answer questions with:
1. Specific numbers and statistics
2. Comparisons and patterns
3. Actionable insights
4. Clear, concise explanations

Format your response in markdown for readability.`;

      const userPrompt = `Based on this LDS YouTube channel data, please answer my question:

**Question:** ${question}

**Sample Data (100 videos):**
${JSON.stringify(videoData, null, 2)}

**Top 10 Performing Videos:**
${JSON.stringify(topVideos.slice(0, 10).map(v => ({
  title: v.title,
  views: v.views,
  ctr: v.ctr,
  retention: v.retention
})), null, 2)}

Please provide a detailed, data-driven answer.`;

      const result = await claudeAPI.call(userPrompt, systemPrompt, 'content-intelligence-qa', 2048);

      // Add AI response to conversation
      const aiMessage = {
        role: 'assistant',
        content: result.text,
        cost: result.cost
      };
      setConversation(prev => [...prev, aiMessage]);
      setQuestion(''); // Clear input

    } catch (err) {
      console.error('Error asking Claude:', err);
      setError(err.message || 'Failed to get AI response. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askClaude();
    }
  };

  return (
    <div className="space-y-4">
      {/* Toggle Back to Rule-Based Mode */}
      <div className="bg-gradient-to-r from-purple-100 to-blue-100 border border-purple-300 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <span className="font-medium text-gray-900">AI Mode Active</span>
            <span className="text-sm text-gray-600">Ask any question about your data</span>
          </div>
          <button
            onClick={() => setUseAI(false)}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            <Zap className="w-4 h-4" />
            Switch to Rule-Based Mode (Free)
          </button>
        </div>
      </div>

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

      {/* Conversation History */}
      <div className="space-y-4">
        {conversation.map((message, index) => (
          <div
            key={index}
            className={`rounded-xl p-4 ${
              message.role === 'user'
                ? 'bg-blue-50 border border-blue-200 ml-12'
                : 'bg-white border border-gray-200 mr-12'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                }`}
              >
                {message.role === 'user' ? '?' : <Sparkles className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900">
                    {message.role === 'user' ? 'You' : 'Claude AI'}
                  </span>
                  {message.cost && (
                    <span className="text-xs text-gray-500">
                      ${message.cost.toFixed(4)}
                    </span>
                  )}
                </div>
                <div className="prose prose-sm max-w-none text-gray-700">
                  {message.content.split('\n').map((line, i) => {
                    // Simple markdown rendering
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return <p key={i} className="font-bold my-2">{line.replace(/\*\*/g, '')}</p>;
                    }
                    if (line.startsWith('# ')) {
                      return <h3 key={i} className="text-lg font-bold mt-4 mb-2">{line.substring(2)}</h3>;
                    }
                    if (line.startsWith('- ') || line.startsWith('• ')) {
                      return <li key={i} className="ml-4">{line.substring(2)}</li>;
                    }
                    if (line.trim() === '') {
                      return <br key={i} />;
                    }
                    return <p key={i} className="my-1">{line}</p>;
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sticky bottom-0">
        <div className="flex gap-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask anything about your video data... (e.g., 'Why did my views drop in December?' or 'What topics perform best on Sundays?')"
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            rows="2"
            disabled={isAnalyzing}
          />
          <button
            onClick={askClaude}
            disabled={isAnalyzing || !question.trim()}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Ask AI
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send • Cost: ~$0.10-0.30 per question
        </p>
      </div>

      {/* Example Questions (only show if no conversation yet) */}
      {conversation.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">Example Questions to Try:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              "Why did my performance drop in the last 30 days?",
              "What topics perform best on weekends?",
              "Which videos have high CTR but low retention?",
              "What patterns do my top 10% videos share?",
              "Are my temple videos performing better than scripture content?",
              "What's the optimal upload frequency based on my data?"
            ].map((exampleQ, i) => (
              <button
                key={i}
                onClick={() => setQuestion(exampleQ)}
                className="text-left px-4 py-2 bg-white hover:bg-purple-50 border border-gray-200 hover:border-purple-300 rounded-lg text-sm text-gray-700 transition-colors"
              >
                {exampleQ}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
