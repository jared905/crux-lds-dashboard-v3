import React, { useState, useEffect } from 'react';
import { Loader, Zap, Copy, ArrowRight } from 'lucide-react';

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

export default function BreakoutsTab({
  outliers, outliersLoading, outlierDays, setOutlierDays,
  outlierMinMultiplier, setOutlierMinMultiplier,
  fetchOutliers, activeCompetitors, categoryConfig,
  handleViewInsight, onNavigateToTitleLab,
}) {
  const [inlineInsights, setInlineInsights] = useState({});
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  // Lazy-load cached insights for visible outliers
  useEffect(() => {
    if (outliers.length === 0) return;
    let cancelled = false;

    async function loadCachedInsights() {
      const { getCachedInsight } = await import('../../../services/competitorInsightsService');
      for (const video of outliers) {
        if (cancelled) break;
        if (inlineInsights[video.id]) continue;
        const cached = await getCachedInsight(video.id);
        if (cached && !cancelled) {
          setInlineInsights(prev => ({ ...prev, [video.id]: cached.insight_data }));
        }
      }
    }
    loadCachedInsights();
    return () => { cancelled = true; };
  }, [outliers]);

  const handleBatchAnalyze = async () => {
    setBatchLoading(true);
    const toAnalyze = outliers.filter(v => !inlineInsights[v.id]);
    setBatchProgress({ done: 0, total: toAnalyze.length });

    const { analyzeCompetitorVideo } = await import('../../../services/competitorInsightsService');
    for (const video of toAnalyze) {
      try {
        const insight = await analyzeCompetitorVideo(video);
        setInlineInsights(prev => ({ ...prev, [video.id]: insight }));
        setBatchProgress(prev => ({ ...prev, done: prev.done + 1 }));
      } catch (e) {
        console.warn('[breakouts] Batch analysis failed for', video.title, e.message);
        setBatchProgress(prev => ({ ...prev, done: prev.done + 1 }));
      }
    }
    setBatchLoading(false);
  };

  const uncachedCount = outliers.filter(v => !inlineInsights[v.id]).length;

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
        <select value={outlierDays} onChange={(e) => setOutlierDays(Number(e.target.value))}
          style={{ background: '#252525', border: '1px solid #555', borderRadius: '6px', padding: '6px 10px', color: '#fff', fontSize: '12px' }}>
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
          <option value={180}>180 days</option>
        </select>
        <select value={outlierMinMultiplier} onChange={(e) => setOutlierMinMultiplier(Number(e.target.value))}
          style={{ background: '#252525', border: '1px solid #555', borderRadius: '6px', padding: '6px 10px', color: '#fff', fontSize: '12px' }}>
          <option value={2}>2x+ avg</option>
          <option value={2.5}>2.5x+ avg</option>
          <option value={3}>3x+ avg</option>
          <option value={5}>5x+ avg</option>
        </select>
        <button onClick={() => fetchOutliers(activeCompetitors.map(c => c.supabaseId).filter(Boolean))} disabled={outliersLoading}
          style={{ background: '#3b82f6', border: 'none', borderRadius: '6px', padding: '6px 12px', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: outliersLoading ? 'not-allowed' : 'pointer', opacity: outliersLoading ? 0.6 : 1 }}>
          {outliersLoading ? 'Loading...' : 'Refresh'}
        </button>
        {outliers.length > 0 && uncachedCount > 0 && (
          <button onClick={handleBatchAnalyze} disabled={batchLoading}
            style={{ background: '#374151', border: '1px solid #555', borderRadius: '6px', padding: '6px 12px', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: batchLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Zap size={12} />
            {batchLoading ? `Analyzing ${batchProgress.done}/${batchProgress.total}...` : `Analyze All (${uncachedCount})`}
          </button>
        )}
      </div>

      {/* Outlier List */}
      {outliersLoading && outliers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>
          <Loader size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          <div style={{ fontSize: '13px' }}>Detecting breakout videos...</div>
        </div>
      ) : outliers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', color: '#666', fontSize: '13px' }}>No breakout videos found. Try adjusting filters.</div>
      ) : (
        <div style={{ display: 'grid', gap: '8px' }}>
          {outliers.map(video => {
            const insight = inlineInsights[video.id];
            const comp = activeCompetitors.find(c => c.supabaseId === video.channel_id);
            const cat = comp ? categoryConfig[comp.category] : null;

            return (
              <div key={video.id} style={{
                background: '#252525', border: '1px solid #333', borderRadius: '8px',
                padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                {/* Main row */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {video.thumbnail_url && (
                    <img src={video.thumbnail_url} alt="" style={{ width: '100px', height: '56px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {video.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <span style={{ fontSize: '11px', color: '#888' }}>{video.channel?.name || 'Unknown'}</span>
                      {cat && (
                        <span style={{ fontSize: '9px', fontWeight: '600', color: cat.color, background: `${cat.color}15`, padding: '1px 6px', borderRadius: '8px' }}>
                          {cat.label}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px', fontSize: '10px', color: '#b0b0b0' }}>
                      <span>{fmtInt(video.view_count)} views</span>
                      <span>Ch avg: {fmtInt(video.channelAvgViews)}</span>
                    </div>
                  </div>
                  <div style={{
                    background: video.outlierScore >= 5 ? '#166534' : video.outlierScore >= 3 ? '#854d0e' : '#1e3a5f',
                    border: `1px solid ${video.outlierScore >= 5 ? '#22c55e' : video.outlierScore >= 3 ? '#f59e0b' : '#3b82f6'}`,
                    borderRadius: '6px', padding: '4px 8px', textAlign: 'center', flexShrink: 0,
                  }}>
                    <div style={{
                      fontSize: '14px', fontWeight: '700',
                      color: video.outlierScore >= 5 ? '#22c55e' : video.outlierScore >= 3 ? '#f59e0b' : '#3b82f6',
                    }}>
                      {video.outlierScore}x
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                    <button onClick={() => handleViewInsight(video)}
                      style={{ background: '#374151', border: '1px solid #555', borderRadius: '6px', padding: '6px 10px', color: '#fff', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                      Insights
                    </button>
                    {onNavigateToTitleLab && (
                      <button onClick={() => onNavigateToTitleLab(video.title)}
                        style={{ background: 'transparent', border: '1px solid #3b82f6', borderRadius: '6px', padding: '4px 8px', color: '#3b82f6', fontSize: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}>
                        <ArrowRight size={10} /> Use Angle
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline insight preview */}
                {insight && insight.hookAnalysis && (
                  <div style={{
                    background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: '6px',
                    padding: '8px 10px', fontSize: '11px', color: '#a0a0d0', lineHeight: '1.4',
                  }}>
                    <span style={{ color: '#6366f1', fontWeight: '600', marginRight: '6px' }}>Hook:</span>
                    {insight.hookAnalysis}
                    {insight.applicableTactics && insight.applicableTactics.length > 0 && (
                      <div style={{ marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {insight.applicableTactics.slice(0, 3).map((tactic, i) => (
                          <span key={i} style={{
                            fontSize: '9px', background: '#6366f120', color: '#818cf8',
                            padding: '2px 6px', borderRadius: '4px', border: '1px solid #6366f140',
                          }}>
                            {tactic}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
