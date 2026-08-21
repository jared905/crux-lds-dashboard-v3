import {useState, useEffect} from 'react';
import claudeAPI from '../../services/claudeAPI';
import { getBrandContextWithSignals } from '../../services/brandContextService';
import { AlertCircle, Loader2, Sparkles, Zap } from 'lucide-react';
import ContentIntelligence from './ContentIntelligence.jsx';

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

  // Clear conversation when client changes
  useEffect(() => {
    setConversation([]);
    setQuestion('');
    setError(null);
  }, [activeClient?.id]);

  const clientName = activeClient?.name || 'this channel';

  // Dark theme styles
  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    },
    bannerCard: {
      backgroundColor: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    },
    iconBox: {
      width: '48px',
      height: '48px',
      borderRadius: '8px',
      backgroundColor: 'rgba(0, 209, 255, 0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    },
    headerText: {
      color: 'var(--ink)',
      fontSize: '18px',
      fontWeight: '600',
      marginBottom: '8px'
    },
    bodyText: {
      color: 'var(--text)',
      fontSize: '14px',
      lineHeight: '1.6',
      marginBottom: '12px'
    },
    mutedText: {
      color: 'var(--muted)',
      fontSize: '13px'
    },
    listItem: {
      color: 'var(--muted)',
      fontSize: '13px',
      marginBottom: '6px'
    },
    primaryButton: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px 20px',
      background: 'linear-gradient(135deg, #0090c8, #00D1FF)',
      color: 'var(--ink)',
      fontSize: '14px',
      fontWeight: '600',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, opacity 0.2s'
    },
    secondaryButton: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 16px',
      backgroundColor: 'var(--surface-high)',
      color: 'var(--text)',
      fontSize: '13px',
      fontWeight: '500',
      border: '1px solid #444',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, opacity 0.2s'
    },
    activeModeBanner: {
      backgroundColor: 'var(--card)',
      border: '1px solid #0090c8',
      borderRadius: '8px',
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '12px'
    },
    errorCard: {
      backgroundColor: 'rgba(255, 85, 64, 0.1)',
      border: '1px solid rgba(255, 85, 64, 0.3)',
      borderRadius: '10px',
      padding: '16px'
    },
    userMessage: {
      backgroundColor: 'rgba(0, 209, 255, 0.1)',
      border: '1px solid rgba(0, 209, 255, 0.3)',
      borderRadius: '8px',
      padding: '16px',
      marginLeft: '48px'
    },
    assistantMessage: {
      backgroundColor: 'var(--surface-high)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '16px',
      marginRight: '48px'
    },
    userAvatar: {
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      backgroundColor: 'var(--blue)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink)',
      fontSize: '14px',
      fontWeight: '600',
      flexShrink: 0
    },
    assistantAvatar: {
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #0090c8, #00D1FF)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink)',
      flexShrink: 0
    },
    inputCard: {
      backgroundColor: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '16px',
      position: 'sticky',
      bottom: '16px'
    },
    textarea: {
      flex: 1,
      padding: '14px 16px',
      backgroundColor: 'var(--surface-high)',
      border: '1px solid #444',
      borderRadius: '8px',
      color: 'var(--ink)',
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
      background: 'linear-gradient(135deg, #0090c8, #00D1FF)',
      color: 'var(--ink)',
      fontSize: '14px',
      fontWeight: '600',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, opacity 0.2s',
      whiteSpace: 'nowrap'
    },
    exampleCard: {
      backgroundColor: 'var(--surface-high)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '20px'
    },
    exampleButton: {
      textAlign: 'left',
      padding: '12px 16px',
      backgroundColor: 'var(--card)',
      border: '1px solid #444',
      borderRadius: '8px',
      color: 'var(--muted)',
      fontSize: '13px',
      cursor: 'pointer',
      transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, opacity 0.2s',
      width: '100%'
    }
  };

  // If AI is not enabled, use the original component
  if (!useAI) {
    return (
      <div style={styles.container}>
        {/* Toggle AI Mode Banner */}
        <div style={styles.bannerCard}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', paddingTop: '8px' }}>
            <div style={styles.iconBox}>
              <Sparkles style={{ width: '24px', height: '24px', color: 'var(--blue-deep)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={styles.headerText}>Run deep analysis</h3>
              <p style={styles.bodyText}>
                Ask ANY question about your data with Claude AI. No pattern matching limits - ask anything!
              </p>
              <div style={{ marginBottom: '16px' }}>
                <div style={styles.listItem}>• Answer complex multi-factor questions</div>
                <div style={styles.listItem}>• Discover unexpected patterns in your data</div>
                <div style={styles.listItem}>• Get natural language explanations and insights</div>
                <div style={{ ...styles.listItem, color: "var(--muted)" }}>• Estimated cost: $0.10-0.30 per question</div>
              </div>
              <button
                onClick={() => setUseAI(true)}
                style={styles.primaryButton}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(0, 209, 255, 0.4)';
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
        type: v.type === 'short' ? 'Short' : 'Long-form',
        views: v.views,
        ctr: v.ctr,
        retention: v.retention,
        date: v.date
      }));

      const shortCount = rows.filter(v => v.type === 'short').length;
      const longCount = rows.length - shortCount;

      let systemPrompt = `You are a YouTube analytics expert helping analyze content performance.

You have access to data from ${rows.length} videos from ${clientName}'s YouTube channel.

Channel Overview:
- Total videos: ${rows.length} (${longCount} long-form, ${shortCount} shorts)
- Average views: ${Math.round(avgViews).toLocaleString()}
- Average CTR: ${(avgCTR * 100).toFixed(1)}%
- Average retention: ${(avgRetention * 100).toFixed(1)}%

Analyze the data and answer questions with:
1. Specific numbers and statistics
2. Comparisons and patterns
3. Actionable insights
4. Clear, concise explanations

IMPORTANT: Shorts and long-form are different formats with different discovery mechanics. Each video includes a "type" field. Keep format-specific insights separate. Title/thumbnail recommendations should only reference long-form videos (shorts do not have clickable thumbnails).

Format your response in markdown for readability.`;

      // Inject brand context if available
      if (activeClient?.id) {
        try {
          const brandBlock = await getBrandContextWithSignals(activeClient.id, 'content_intelligence');
          if (brandBlock) systemPrompt += '\n\n' + brandBlock;
        } catch (e) {
          console.warn('[ContentIntelligence] Brand context fetch failed, proceeding without:', e.message);
        }
      }

      const userPrompt = `Based on this YouTube channel data for ${clientName}, please answer my question:

**Question:** ${question}

**Sample Data (100 videos):**
${JSON.stringify(videoData, null, 2)}

**Top 10 Performing Videos:**
${JSON.stringify(topVideos.slice(0, 10).map(v => ({
  title: v.title,
  type: v.type === 'short' ? 'Short' : 'Long-form',
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
            background: 'linear-gradient(135deg, #0090c8, #00D1FF)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Sparkles style={{ width: '18px', height: '18px', color: "var(--ink)" }} />
          </div>
          <div>
            <span style={{ color: "var(--ink)", fontWeight: '600', fontSize: '14px' }}>AI Mode Active</span>
            <span style={{ color: "var(--muted)", fontSize: '13px', marginLeft: '12px' }}>
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
                backgroundColor: 'rgba(255, 85, 64, 0.1)',
                borderColor: 'rgba(255, 85, 64, 0.3)',
                color: "var(--neg)"
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = 'rgba(255, 85, 64, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'rgba(255, 85, 64, 0.1)';
              }}
            >
              Clear Chat
            </button>
          )}
          <button
            onClick={() => setUseAI(false)}
            style={styles.secondaryButton}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = 'var(--outline-variant)';
              e.target.style.borderColor = 'var(--faint)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = "var(--input-bg)";
              e.target.style.borderColor = 'var(--outline-variant)';
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
            <AlertCircle style={{ width: '20px', height: '20px', color: "var(--neg)", flexShrink: 0 }} />
            <div>
              <p style={{ color: "var(--neg)", fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>Error</p>
              <p style={{ color: 'var(--neg-text)', fontSize: '13px' }}>{error}</p>
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
                  <span style={{ color: "var(--ink)", fontWeight: '600', fontSize: '14px' }}>
                    {message.role === 'user' ? 'You' : 'Claude AI'}
                  </span>
                  {message.cost && (
                    <span style={{ color: "var(--muted)", fontSize: '12px' }}>
                      ${message.cost.toFixed(4)}
                    </span>
                  )}
                </div>
                <div style={{ color: "var(--text)", fontSize: '14px', lineHeight: '1.7' }}>
                  {message.content.split('\n').map((line, i) => {
                    // Simple markdown rendering
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return <p key={i} style={{ fontWeight: '700', color: "var(--ink)", margin: '12px 0 8px' }}>{line.replace(/\*\*/g, '')}</p>;
                    }
                    if (line.startsWith('# ')) {
                      return <h3 key={i} style={{ fontSize: '16px', fontWeight: '700', color: "var(--ink)", marginTop: '16px', marginBottom: '8px' }}>{line.substring(2)}</h3>;
                    }
                    if (line.startsWith('## ')) {
                      return <h4 key={i} style={{ fontSize: '15px', fontWeight: '600', color: "var(--ink)", marginTop: '14px', marginBottom: '6px' }}>{line.substring(3)}</h4>;
                    }
                    if (line.startsWith('- ') || line.startsWith('• ')) {
                      return <div key={i} style={{ marginLeft: '16px', marginBottom: '4px', color: 'var(--muted)' }}>• {line.substring(2)}</div>;
                    }
                    if (line.match(/^\d+\.\s/)) {
                      return <div key={i} style={{ marginLeft: '16px', marginBottom: '4px', color: 'var(--muted)' }}>{line}</div>;
                    }
                    if (line.trim() === '') {
                      return <div key={i} style={{ height: '8px' }} />;
                    }
                    return <p key={i} style={{ margin: '4px 0', color: "var(--text)" }}>{line}</p>;
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
                e.target.style.boxShadow = '0 4px 12px rgba(0, 209, 255, 0.4)';
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
        <p style={{ color: 'var(--faint)', fontSize: '12px', marginTop: '10px' }}>
          Press Enter to send • Cost: ~$0.10-0.30 per question
        </p>
      </div>

      {/* Example Questions (only show if no conversation yet) */}
      {conversation.length === 0 && (
        <div style={styles.exampleCard}>
          <h3 style={{ color: "var(--ink)", fontSize: '15px', fontWeight: '600', marginBottom: '14px' }}>
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
                  e.target.style.backgroundColor = 'var(--outline-variant)';
                  e.target.style.borderColor = 'var(--blue-deep)';
                  e.target.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = "var(--card)";
                  e.target.style.borderColor = 'var(--outline-variant)';
                  e.target.style.color = 'var(--muted)';
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
