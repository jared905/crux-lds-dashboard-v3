import React, { useState } from 'react';
import { Sparkles, Zap, AlertCircle, Loader2 } from 'lucide-react';
import ContentIntelligence from './ContentIntelligence';
import claudeAPI from '../services/claudeAPI';

/**
 * Enhanced Content Intelligence with Claude AI (v2.2.3)
 * Wraps the existing rule-based ContentIntelligence with optional AI-powered analysis
 * Dark theme styling to match dashboard
 */
export default function EnhancedContentIntelligence({ rows, activeClient }) {
  const [useAI, setUseAI] = useState(false);
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const clientName = activeClient?.name || 'this channel';

  // Dark theme styles
  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    },
    bannerCard: {
      backgroundColor: '#1E1E1E',
      border: '1px solid #333',
      borderRadius: '12px',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    },
    gradientAccent: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '4px',
      background: 'linear-gradient(90deg, #8b5cf6, #3b82f6, #06b6d4)'
    },
    iconBox: {
      width: '48px',
      height: '48px',
      borderRadius: '12px',
      backgroundColor: 'rgba(139, 92, 246, 0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    },
    headerText: {
      color: '#fff',
      fontSize: '18px',
      fontWeight: '600',
      marginBottom: '8px'
    },
    bodyText: {
      color: '#E0E0E0',
      fontSize: '14px',
      lineHeight: '1.6',
      marginBottom: '12px'
    },
    mutedText: {
      color: '#9E9E9E',
      fontSize: '13px'
    },
    listItem: {
      color: '#B0B0B0',
      fontSize: '13px',
      marginBottom: '6px'
    },
    primaryButton: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px 20px',
      background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
      color: '#fff',
      fontSize: '14px',
      fontWeight: '600',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    },
    secondaryButton: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 16px',
      backgroundColor: '#252525',
      color: '#E0E0E0',
      fontSize: '13px',
      fontWeight: '500',
      border: '1px solid #444',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    },
    activeModeBanner: {
      backgroundColor: '#1E1E1E',
      border: '1px solid #8b5cf6',
      borderRadius: '12px',
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '12px'
    },
    errorCard: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '10px',
      padding: '16px'
    },
    userMessage: {
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      border: '1px solid rgba(59, 130, 246, 0.3)',
      borderRadius: '12px',
      padding: '16px',
      marginLeft: '48px'
    },
    assistantMessage: {
      backgroundColor: '#252525',
      border: '1px solid #333',
      borderRadius: '12px',
      padding: '16px',
      marginRight: '48px'
    },
    userAvatar: {
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      backgroundColor: '#3b82f6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: '14px',
      fontWeight: '600',
      flexShrink: 0
    },
    assistantAvatar: {
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      flexShrink: 0
    },
    inputCard: {
      backgroundColor: '#1E1E1E',
      border: '1px solid #333',
      borderRadius: '12px',
      padding: '16px',
      position: 'sticky',
      bottom: '16px'
    },
    textarea: {
      flex: 1,
      padding: '14px 16px',
      backgroundColor: '#252525',
      border: '1px solid #444',
      borderRadius: '8px',
      color: '#fff',
      fontSize: '14px',
      resize: 'none',
      outline: 'none',
      fontFamily: 'inherit',
      lineHeight: '1.5'
    },
    submitButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '14px 24px',
      background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
      color: '#fff',
      fontSize: '14px',
      fontWeight: '600',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      whiteSpace: 'nowrap'
    },
    exampleCard: {
      backgroundColor: '#252525',
      border: '1px solid #333',
      borderRadius: '12px',
      padding: '20px'
    },
    exampleButton: {
      textAlign: 'left',
      padding: '12px 16px',
      backgroundColor: '#1E1E1E',
      border: '1px solid #444',
      borderRadius: '8px',
      color: '#B0B0B0',
      fontSize: '13px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      width: '100%'
    }
  };

  // If AI is not enabled, use the original component
  if (!useAI) {
    return (
      <div style={styles.container}>
        {/* Toggle AI Mode Banner */}
        <div style={styles.bannerCard}>
          <div style={styles.gradientAccent} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', paddingTop: '8px' }}>
            <div style={styles.iconBox}>
              <Sparkles style={{ width: '24px', height: '24px', color: '#8b5cf6' }} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={styles.headerText}>Upgrade to AI-Powered Analysis</h3>
              <p style={styles.bodyText}>
                Ask ANY question about your data with Claude AI. No pattern matching limits - ask anything!
              </p>
              <div style={{ marginBottom: '16px' }}>
                <div style={styles.listItem}>• Answer complex multi-factor questions</div>
                <div style={styles.listItem}>• Discover unexpected patterns in your data</div>
                <div style={styles.listItem}>• Get natural language explanations and insights</div>
                <div style={{ ...styles.listItem, color: '#9E9E9E' }}>• Estimated cost: $0.10-0.30 per question</div>
              </div>
              <button
                onClick={() => setUseAI(true)}
                style={styles.primaryButton}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                <Sparkles style={{ width: '18px', height: '18px' }} />
                Enable AI Mode
              </button>
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

      const systemPrompt = `You are a YouTube analytics expert helping analyze content performance.

You have access to data from ${rows.length} videos from ${clientName}'s YouTube channel.

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

      const userPrompt = `Based on this YouTube channel data for ${clientName}, please answer my question:

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

  const clearConversation = () => {
    setConversation([]);
    setQuestion('');
    setError(null);
  };

  return (
    <div style={styles.container}>
      {/* Toggle Back to Rule-Based Mode */}
      <div style={styles.activeModeBanner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Sparkles style={{ width: '18px', height: '18px', color: '#fff' }} />
          </div>
          <div>
            <span style={{ color: '#fff', fontWeight: '600', fontSize: '14px' }}>AI Mode Active</span>
            <span style={{ color: '#9E9E9E', fontSize: '13px', marginLeft: '12px' }}>
              Ask any question about your data
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {conversation.length > 0 && (
            <button
              onClick={clearConversation}
              style={{
                ...styles.secondaryButton,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
                color: '#ef4444'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
              }}
            >
              Clear Chat
            </button>
          )}
          <button
            onClick={() => setUseAI(false)}
            style={styles.secondaryButton}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#333';
              e.target.style.borderColor = '#555';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = '#252525';
              e.target.style.borderColor = '#444';
            }}
          >
            <Zap style={{ width: '16px', height: '16px' }} />
            Switch to Rule-Based Mode (Free)
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={styles.errorCard}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <AlertCircle style={{ width: '20px', height: '20px', color: '#ef4444', flexShrink: 0 }} />
            <div>
              <p style={{ color: '#ef4444', fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>Error</p>
              <p style={{ color: '#fca5a5', fontSize: '13px' }}>{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Conversation History */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {conversation.map((message, index) => (
          <div
            key={index}
            style={message.role === 'user' ? styles.userMessage : styles.assistantMessage}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={message.role === 'user' ? styles.userAvatar : styles.assistantAvatar}>
                {message.role === 'user' ? '?' : <Sparkles style={{ width: '18px', height: '18px' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ color: '#fff', fontWeight: '600', fontSize: '14px' }}>
                    {message.role === 'user' ? 'You' : 'Claude AI'}
                  </span>
                  {message.cost && (
                    <span style={{ color: '#9E9E9E', fontSize: '12px' }}>
                      ${message.cost.toFixed(4)}
                    </span>
                  )}
                </div>
                <div style={{ color: '#E0E0E0', fontSize: '14px', lineHeight: '1.7' }}>
                  {message.content.split('\n').map((line, i) => {
                    // Simple markdown rendering
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return <p key={i} style={{ fontWeight: '700', color: '#fff', margin: '12px 0 8px' }}>{line.replace(/\*\*/g, '')}</p>;
                    }
                    if (line.startsWith('# ')) {
                      return <h3 key={i} style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginTop: '16px', marginBottom: '8px' }}>{line.substring(2)}</h3>;
                    }
                    if (line.startsWith('## ')) {
                      return <h4 key={i} style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginTop: '14px', marginBottom: '6px' }}>{line.substring(3)}</h4>;
                    }
                    if (line.startsWith('- ') || line.startsWith('• ')) {
                      return <div key={i} style={{ marginLeft: '16px', marginBottom: '4px', color: '#B0B0B0' }}>• {line.substring(2)}</div>;
                    }
                    if (line.match(/^\d+\.\s/)) {
                      return <div key={i} style={{ marginLeft: '16px', marginBottom: '4px', color: '#B0B0B0' }}>{line}</div>;
                    }
                    if (line.trim() === '') {
                      return <div key={i} style={{ height: '8px' }} />;
                    }
                    return <p key={i} style={{ margin: '4px 0', color: '#E0E0E0' }}>{line}</p>;
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div style={styles.inputCard}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Ask anything about ${clientName}'s video data... (e.g., 'Why did my views drop in December?' or 'What topics perform best on Sundays?')`}
            style={{
              ...styles.textarea,
              opacity: isAnalyzing ? 0.5 : 1
            }}
            rows="2"
            disabled={isAnalyzing}
          />
          <button
            onClick={askClaude}
            disabled={isAnalyzing || !question.trim()}
            style={{
              ...styles.submitButton,
              opacity: (isAnalyzing || !question.trim()) ? 0.5 : 1,
              cursor: (isAnalyzing || !question.trim()) ? 'not-allowed' : 'pointer'
            }}
            onMouseEnter={(e) => {
              if (!isAnalyzing && question.trim()) {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = 'none';
            }}
          >
            {isAnalyzing ? (
              <>
                <Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles style={{ width: '18px', height: '18px' }} />
                Ask AI
              </>
            )}
          </button>
        </div>
        <p style={{ color: '#666', fontSize: '12px', marginTop: '10px' }}>
          Press Enter to send • Cost: ~$0.10-0.30 per question
        </p>
      </div>

      {/* Example Questions (only show if no conversation yet) */}
      {conversation.length === 0 && (
        <div style={styles.exampleCard}>
          <h3 style={{ color: '#fff', fontSize: '15px', fontWeight: '600', marginBottom: '14px' }}>
            Example Questions to Try:
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '10px'
          }}>
            {[
              "Why did my performance drop in the last 30 days?",
              "What topics perform best on weekends?",
              "Which videos have high CTR but low retention?",
              "What patterns do my top 10% videos share?",
              "What content themes are underperforming?",
              "What's the optimal upload frequency based on my data?"
            ].map((exampleQ, i) => (
              <button
                key={i}
                onClick={() => setQuestion(exampleQ)}
                style={styles.exampleButton}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#333';
                  e.target.style.borderColor = '#8b5cf6';
                  e.target.style.color = '#E0E0E0';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#1E1E1E';
                  e.target.style.borderColor = '#444';
                  e.target.style.color = '#B0B0B0';
                }}
              >
                {exampleQ}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Spin animation for loader */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
