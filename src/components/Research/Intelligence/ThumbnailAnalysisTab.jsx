import React, { useState, useEffect } from 'react';
import { Loader, Zap, Eye, RefreshCw, CheckCircle, Image } from 'lucide-react';

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

const FREQ_COLORS = {
  common: '#10b981',
  occasional: '#f59e0b',
  rare: '#3b82f6',
};

export default function ThumbnailAnalysisTab({ channelIds, clientId, rows }) {
  const [thumbnails, setThumbnails] = useState([]);
  const [gridLoading, setGridLoading] = useState(true);
  const [patternData, setPatternData] = useState(null);
  const [patternLoading, setPatternLoading] = useState(false);
  const [visionData, setVisionData] = useState(null);
  const [visionLoading, setVisionLoading] = useState(false);
  const [error, setError] = useState('');
  const [hoveredId, setHoveredId] = useState(null);

  // Load thumbnail grid on mount
  useEffect(() => {
    let cancelled = false;
    async function loadGrid() {
      setGridLoading(true);
      try {
        const { getThumbnailGrid } = await import('../../../services/competitorIntelligenceService');
        const data = await getThumbnailGrid(channelIds, { days: 90, limit: 30 });
        if (!cancelled) setThumbnails(data);
      } catch (e) {
        console.warn('[thumbnails] Grid load failed:', e.message);
      } finally {
        if (!cancelled) setGridLoading(false);
      }
    }
    if (channelIds.length > 0) loadGrid();
    return () => { cancelled = true; };
  }, [channelIds]);

  const handleQuickAnalysis = async (forceRefresh = false) => {
    setPatternLoading(true);
    setError('');
    try {
      const { analyzeThumbnailPatterns } = await import('../../../services/competitorIntelligenceService');
      const data = await analyzeThumbnailPatterns(channelIds, clientId, { forceRefresh });
      setPatternData(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setPatternLoading(false);
    }
  };

  const handleDeepAnalysis = async () => {
    setVisionLoading(true);
    setError('');
    try {
      const videoIds = thumbnails.slice(0, 8).map(t => t.id);
      const { analyzeThumbnailsDeep } = await import('../../../services/competitorIntelligenceService');
      const data = await analyzeThumbnailsDeep(videoIds, clientId, { forceRefresh: true });
      setVisionData(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setVisionLoading(false);
    }
  };

  // Client thumbnails for comparison
  const clientThumbnails = (rows || [])
    .filter(r => r.thumbnail_url || r.thumbnailUrl)
    .slice(0, 6)
    .map(r => ({
      title: r.title,
      thumbnailUrl: r.thumbnail_url || r.thumbnailUrl,
      views: r.views,
    }));

  return (
    <div>
      {/* Thumbnail Grid */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Eye size={14} color="#3b82f6" /> Top Performer Thumbnails
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => handleQuickAnalysis(false)} disabled={patternLoading}
              style={{
                background: '#3b82f6', border: 'none', borderRadius: '6px', padding: '6px 12px',
                color: '#fff', fontSize: '11px', fontWeight: '600', cursor: patternLoading ? 'not-allowed' : 'pointer',
                opacity: patternLoading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '4px',
              }}>
              {patternLoading ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</> : <><Zap size={12} /> Analyze Patterns</>}
            </button>
            {patternData && (
              <button onClick={handleDeepAnalysis} disabled={visionLoading}
                style={{
                  background: '#8b5cf6', border: 'none', borderRadius: '6px', padding: '6px 12px',
                  color: '#fff', fontSize: '11px', fontWeight: '600', cursor: visionLoading ? 'not-allowed' : 'pointer',
                  opacity: visionLoading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                {visionLoading ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Deep Scan...</> : <><Image size={12} /> Deep Vision Analysis</>}
              </button>
            )}
          </div>
        </div>

        {gridLoading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>
            <Loader size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
            <div style={{ fontSize: '12px' }}>Loading thumbnails...</div>
          </div>
        ) : thumbnails.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: '#666', fontSize: '12px' }}>No competitor thumbnails available.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
            {thumbnails.map(t => (
              <div key={t.id} style={{ position: 'relative', cursor: 'pointer' }}
                onMouseEnter={() => setHoveredId(t.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <img src={t.thumbnailUrl} alt=""
                  style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #333' }}
                />
                {hoveredId === t.id && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
                    borderRadius: '0 0 6px 6px', padding: '20px 6px 6px',
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: '600', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </div>
                    <div style={{ fontSize: '9px', color: '#b0b0b0' }}>
                      {fmtInt(t.views)} views · {t.channel}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Side-by-side comparison */}
      {clientThumbnails.length > 0 && thumbnails.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '10px' }}>Your Thumbnails vs Top Competitors</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px', textTransform: 'uppercase' }}>Your Channel</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                {clientThumbnails.map((t, i) => (
                  <img key={i} src={t.thumbnailUrl} alt=""
                    style={{ width: '100%', height: '50px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #333' }}
                  />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px', textTransform: 'uppercase' }}>Top Competitors</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                {thumbnails.slice(0, 6).map(t => (
                  <img key={t.id} src={t.thumbnailUrl} alt=""
                    style={{ width: '100%', height: '50px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #333' }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: '11px', color: '#ef4444', marginBottom: '12px' }}>{error}</div>}

      {/* Pattern Analysis Results */}
      {patternData && (
        <div style={{ marginBottom: '16px' }}>
          {/* Thumbnail Rules */}
          {patternData.thumbnailRules && patternData.thumbnailRules.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '10px' }}>Thumbnail Rules</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {patternData.thumbnailRules.map((rule, i) => (
                  <div key={i} style={{
                    background: '#252525', border: '1px solid #333', borderRadius: '6px',
                    padding: '8px 12px', display: 'flex', alignItems: 'flex-start', gap: '8px',
                  }}>
                    <CheckCircle size={14} color="#10b981" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span style={{ fontSize: '12px', color: '#e0e0e0', lineHeight: '1.4' }}>{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Performer Insight */}
          {patternData.topPerformerInsight && (
            <div style={{
              background: '#1a2e1a', border: '1px solid #2a4a2a', borderRadius: '8px',
              padding: '12px', marginBottom: '14px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#10b981', marginBottom: '4px' }}>Top Performer Insight</div>
              <div style={{ fontSize: '12px', color: '#a0d0a0', lineHeight: '1.5' }}>{patternData.topPerformerInsight}</div>
            </div>
          )}

          {/* Patterns */}
          {patternData.patterns && patternData.patterns.length > 0 && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '10px' }}>Detected Patterns</div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {patternData.patterns.map((p, i) => (
                  <div key={i} style={{
                    background: '#252525', border: '1px solid #333', borderRadius: '8px',
                    padding: '12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>{p.pattern}</span>
                      <span style={{
                        fontSize: '9px', fontWeight: '600',
                        color: FREQ_COLORS[p.frequency] || '#888',
                        background: `${FREQ_COLORS[p.frequency] || '#888'}15`,
                        padding: '2px 6px', borderRadius: '8px',
                      }}>
                        {p.frequency}
                      </span>
                      {p.avgPerformanceMultiplier && (
                        <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: '600' }}>
                          {p.avgPerformanceMultiplier.toFixed(1)}x avg
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <div style={{ fontSize: '11px', color: '#b0b0b0', lineHeight: '1.4', marginBottom: '6px' }}>{p.description}</div>
                    )}
                    <div style={{
                      fontSize: '11px', color: '#3b82f6', background: '#3b82f610',
                      padding: '6px 8px', borderRadius: '4px', borderLeft: '3px solid #3b82f6',
                    }}>
                      {p.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vision Analysis Results */}
      {visionData && (
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Image size={14} color="#8b5cf6" /> Deep Vision Analysis
          </div>

          {/* Visual stats row */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {visionData.textUsage?.percentWithText != null && (
              <div style={{ background: '#252525', border: '1px solid #333', borderRadius: '6px', padding: '8px 12px', flex: '1 1 0' }}>
                <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase' }}>Text Overlay</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginTop: '2px' }}>{visionData.textUsage.percentWithText}%</div>
              </div>
            )}
            {visionData.faceUsage?.percentWithFaces != null && (
              <div style={{ background: '#252525', border: '1px solid #333', borderRadius: '6px', padding: '8px 12px', flex: '1 1 0' }}>
                <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase' }}>Faces</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginTop: '2px' }}>{visionData.faceUsage.percentWithFaces}%</div>
              </div>
            )}
            {visionData.colorTrends?.length > 0 && (
              <div style={{ background: '#252525', border: '1px solid #333', borderRadius: '6px', padding: '8px 12px', flex: '1 1 0' }}>
                <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase' }}>Dominant Colors</div>
                <div style={{ fontSize: '12px', color: '#fff', marginTop: '2px' }}>{visionData.colorTrends.join(', ')}</div>
              </div>
            )}
          </div>

          {/* Visual Patterns */}
          {visionData.visualPatterns?.length > 0 && (
            <div style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
              {visionData.visualPatterns.map((p, i) => (
                <div key={i} style={{ background: '#252525', border: '1px solid #333', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>{p.pattern}</div>
                  <div style={{ fontSize: '11px', color: '#b0b0b0', lineHeight: '1.4', marginBottom: '6px' }}>{p.description}</div>
                  <div style={{
                    fontSize: '11px', color: '#8b5cf6', background: '#8b5cf610',
                    padding: '6px 8px', borderRadius: '4px', borderLeft: '3px solid #8b5cf6',
                  }}>
                    {p.howToReplicate}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action Items */}
          {visionData.actionItems?.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>Action Items</div>
              {visionData.actionItems.map((item, i) => (
                <div key={i} style={{
                  background: '#1a2e1a', border: '1px solid #2a4a2a', borderRadius: '6px',
                  padding: '8px 10px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <CheckCircle size={12} color="#10b981" />
                  <span style={{ fontSize: '11px', color: '#a0d0a0' }}>{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
