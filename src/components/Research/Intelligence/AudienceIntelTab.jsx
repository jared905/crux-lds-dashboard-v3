import React, { useState, useEffect, useMemo } from 'react';
import { Loader, Zap, Users, TrendingUp, ArrowRight, RefreshCw } from 'lucide-react';

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

const TREND_ICONS = {
  rising: { icon: '📈', color: '#10b981' },
  stable: { icon: '➡️', color: '#888' },
  declining: { icon: '📉', color: '#ef4444' },
};

const SENTIMENT_COLORS = {
  positive: '#10b981',
  neutral: '#888',
  controversial: '#f59e0b',
};

export default function AudienceIntelTab({ channelIds, clientId, activeCompetitors, onNavigateToTitleLab }) {
  const [algorithmicTopics, setAlgorithmicTopics] = useState([]);
  const [aiData, setAiData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [dataLoading, setDataLoading] = useState(true);

  // Load algorithmic topics instantly on mount
  useEffect(() => {
    let cancelled = false;
    async function loadTopics() {
      setDataLoading(true);
      try {
        const { extractTopicsAlgorithmic, getTopCompetitorVideos } = await import('../../../services/competitorIntelligenceService');
        const videos = await getTopCompetitorVideos(channelIds, { days: 90, limit: 200 });
        if (!cancelled) {
          setAlgorithmicTopics(extractTopicsAlgorithmic(videos));
        }
      } catch (e) {
        console.warn('[audience] Topic extraction failed:', e.message);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }
    if (channelIds.length > 0) loadTopics();
    return () => { cancelled = true; };
  }, [channelIds]);

  // Check for cached AI analysis
  useEffect(() => {
    let cancelled = false;
    async function checkCache() {
      try {
        const { analyzeAudienceInterests } = await import('../../../services/competitorIntelligenceService');
        // Try fetching without force — will return cached if valid
        const cached = await analyzeAudienceInterests(channelIds, clientId, { forceRefresh: false });
        if (cached && !cancelled) setAiData(cached);
      } catch {
        // No cache, that's fine
      }
    }
    if (channelIds.length > 0 && clientId) checkCache();
    return () => { cancelled = true; };
  }, [channelIds, clientId]);

  const handleDeepAnalysis = async (forceRefresh = false) => {
    setAiLoading(true);
    setAiError('');
    try {
      const { analyzeAudienceInterests } = await import('../../../services/competitorIntelligenceService');
      const data = await analyzeAudienceInterests(channelIds, clientId, { forceRefresh });
      setAiData(data);
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div>
      {/* AI Audience Profile */}
      {aiData ? (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={14} color="#8b5cf6" /> Audience Profile
            </div>
            <button onClick={() => handleDeepAnalysis(true)} disabled={aiLoading}
              style={{ background: 'transparent', border: '1px solid #555', borderRadius: '6px', padding: '4px 8px', color: '#888', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <RefreshCw size={10} /> Regenerate
            </button>
          </div>
          <div style={{
            background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: '8px',
            padding: '12px', marginBottom: '12px',
          }}>
            <div style={{ fontSize: '12px', color: '#c4b5fd', lineHeight: '1.6' }}>
              {aiData.audienceProfile}
            </div>
            {aiData.topInterests && aiData.topInterests.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                {aiData.topInterests.map((interest, i) => (
                  <span key={i} style={{
                    fontSize: '10px', background: '#8b5cf620', color: '#a78bfa',
                    padding: '3px 8px', borderRadius: '12px', border: '1px solid #8b5cf640',
                  }}>
                    {interest}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Content Appetite */}
          {aiData.contentAppetite && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ background: '#252525', border: '1px solid #333', borderRadius: '6px', padding: '8px 12px', flex: '1 1 0' }}>
                <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase' }}>Preferred Length</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginTop: '2px' }}>{aiData.contentAppetite.preferredLength}</div>
              </div>
              <div style={{ background: '#252525', border: '1px solid #333', borderRadius: '6px', padding: '8px 12px', flex: '1 1 0' }}>
                <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase' }}>Preferred Format</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginTop: '2px' }}>{aiData.contentAppetite.preferredFormat}</div>
              </div>
              {aiData.contentAppetite.engagementDrivers?.length > 0 && (
                <div style={{ background: '#252525', border: '1px solid #333', borderRadius: '6px', padding: '8px 12px', flex: '2 1 0' }}>
                  <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase' }}>Engagement Drivers</div>
                  <div style={{ fontSize: '12px', color: '#fff', marginTop: '2px' }}>{aiData.contentAppetite.engagementDrivers.join(' · ')}</div>
                </div>
              )}
            </div>
          )}

          {/* AI-Identified Topics */}
          {aiData.topics && aiData.topics.length > 0 && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '10px' }}>Audience Interest Topics</div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {aiData.topics.map((topic, i) => {
                  const trend = TREND_ICONS[topic.trendDirection] || TREND_ICONS.stable;
                  return (
                    <div key={i} style={{
                      background: '#252525', border: '1px solid #333', borderRadius: '8px',
                      padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#fff' }}>{topic.topic}</span>
                          <span style={{ fontSize: '11px' }}>{trend.icon}</span>
                          <span style={{
                            fontSize: '9px', fontWeight: '600',
                            color: SENTIMENT_COLORS[topic.sentiment] || '#888',
                            background: `${SENTIMENT_COLORS[topic.sentiment] || '#888'}15`,
                            padding: '1px 6px', borderRadius: '8px',
                          }}>
                            {topic.sentiment}
                          </span>
                        </div>
                        <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                          {topic.frequency} videos · {fmtInt(topic.avgViews)} avg views
                        </div>
                        {topic.exampleTitles && topic.exampleTitles.length > 0 && (
                          <div style={{ fontSize: '10px', color: '#666', marginTop: '4px', fontStyle: 'italic' }}>
                            e.g. "{topic.exampleTitles[0]}"
                          </div>
                        )}
                      </div>
                      {onNavigateToTitleLab && (
                        <button onClick={() => onNavigateToTitleLab(topic.topic)}
                          style={{
                            background: 'transparent', border: '1px solid #3b82f6', borderRadius: '6px',
                            padding: '4px 8px', color: '#3b82f6', fontSize: '10px', fontWeight: '600',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                            flexShrink: 0, whiteSpace: 'nowrap',
                          }}>
                          <ArrowRight size={10} /> Create Content
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No AI data yet — show prompt */
        <div style={{
          background: '#1a1a2e', border: '1px dashed #4a4a6a', borderRadius: '8px',
          padding: '20px', textAlign: 'center', marginBottom: '16px',
        }}>
          <Users size={24} color="#8b5cf6" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>
            Audience Deep Analysis
          </div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>
            Use Claude to analyze competitor video data and build an audience interest profile
          </div>
          <button onClick={() => handleDeepAnalysis(false)} disabled={aiLoading}
            style={{
              background: '#8b5cf6', border: 'none', borderRadius: '6px', padding: '8px 16px',
              color: '#fff', fontSize: '12px', fontWeight: '600', cursor: aiLoading ? 'not-allowed' : 'pointer',
              opacity: aiLoading ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}>
            {aiLoading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</> : <><Zap size={14} /> Analyze Audience</>}
          </button>
          {aiError && <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '8px' }}>{aiError}</div>}
        </div>
      )}

      {/* Algorithmic Topic Extraction (always visible) */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <TrendingUp size={14} color="#10b981" /> Trending Topics (Algorithmic)
        </div>
        {dataLoading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
            <Loader size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
            <div style={{ fontSize: '12px' }}>Extracting topics...</div>
          </div>
        ) : algorithmicTopics.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#666', fontSize: '12px' }}>No topics detected from competitor videos.</div>
        ) : (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {algorithmicTopics.map((topic, i) => (
              <div key={i}
                onClick={() => onNavigateToTitleLab && onNavigateToTitleLab(topic.topic)}
                style={{
                  background: '#252525', border: '1px solid #333', borderRadius: '16px',
                  padding: '6px 12px', cursor: onNavigateToTitleLab ? 'pointer' : 'default',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#10b981'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#333'}
              >
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#fff' }}>{topic.topic}</div>
                <div style={{ fontSize: '9px', color: '#888' }}>
                  {topic.count} videos · {fmtInt(topic.avgViews)} avg
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
