import React, { useState, useEffect } from 'react';
import { Loader, Zap, FileText, Check, ChevronDown, ChevronUp, RefreshCw, Film, Play } from 'lucide-react';

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

const FORMAT_ICONS = {
  interview: '🎙️',
  tutorial: '📚',
  vlog: '📹',
  documentary: '🎬',
  debate: '⚔️',
  challenge: '🏆',
  explainer: '💡',
};

export default function SeriesIdeasTab({ channelIds, clientId, rows }) {
  const [competitorSeries, setCompetitorSeries] = useState([]);
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [aiData, setAiData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [sentToBrief, setSentToBrief] = useState({});

  // Load competitor series on mount
  useEffect(() => {
    let cancelled = false;
    async function loadSeries() {
      setSeriesLoading(true);
      try {
        const { default: svc } = await import('../../../services/competitorIntelligenceService');
        const series = await svc.getTopCompetitorVideos(channelIds, { days: 180, limit: 100 });
        // Group by detected series-like patterns in titles
        // For now, load from detected_series if available
        const { supabase } = await import('../../../services/supabaseClient');
        if (supabase) {
          const { data } = await supabase
            .from('detected_series')
            .select('id, channel_id, series_name, video_count, avg_views, total_views, channels(name)')
            .in('channel_id', channelIds)
            .gte('video_count', 3)
            .order('avg_views', { ascending: false })
            .limit(15);
          if (!cancelled && data) setCompetitorSeries(data);
        }
      } catch (e) {
        console.warn('[series] Load failed:', e.message);
      } finally {
        if (!cancelled) setSeriesLoading(false);
      }
    }
    if (channelIds.length > 0) loadSeries();
    return () => { cancelled = true; };
  }, [channelIds]);

  // Check for cached AI data
  useEffect(() => {
    let cancelled = false;
    async function checkCache() {
      try {
        const { generateSeriesConcepts } = await import('../../../services/competitorIntelligenceService');
        const cached = await generateSeriesConcepts(channelIds, clientId, { forceRefresh: false });
        if (cached && !cancelled) setAiData(cached);
      } catch {
        // No cache
      }
    }
    if (channelIds.length > 0 && clientId) checkCache();
    return () => { cancelled = true; };
  }, [channelIds, clientId]);

  const handleGenerate = async (forceRefresh = false) => {
    setAiLoading(true);
    setError('');
    try {
      const { generateSeriesConcepts } = await import('../../../services/competitorIntelligenceService');
      const data = await generateSeriesConcepts(channelIds, clientId, { forceRefresh });
      setAiData(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const sendToBrief = async (series, idx) => {
    try {
      const { supabase } = await import('../../../services/supabaseClient');
      if (!supabase) throw new Error('Supabase not configured');
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('briefs').insert({
        client_id: clientId || null,
        title: `Series: ${series.name} — ${series.pilotTitle || 'Episode 1'}`,
        status: 'draft',
        source_type: 'series_idea',
        brief_data: {
          seriesName: series.name,
          premise: series.premise,
          format: series.format,
          cadence: series.cadence,
          targetLength: series.targetLength,
          pilotTitle: series.pilotTitle,
          pilotHook: series.pilotHook,
          whyItWorks: series.whyItWorks,
          competitorEvidence: series.competitorEvidence,
          differentiator: series.differentiator,
        },
        created_by: user?.id || null,
      });
      setSentToBrief(prev => ({ ...prev, [idx]: true }));
    } catch (e) {
      console.error('[series] Send to brief failed:', e.message);
    }
  };

  return (
    <div>
      {/* Competitor Series Overview */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Film size={14} color="#f59e0b" /> Competitor Series
        </div>
        {seriesLoading ? (
          <div style={{ textAlign: 'center', padding: '16px', color: '#888' }}>
            <Loader size={16} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 6px' }} />
            <div style={{ fontSize: '11px' }}>Loading series data...</div>
          </div>
        ) : competitorSeries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px', color: '#666', fontSize: '12px' }}>No detected competitor series.</div>
        ) : (
          <div style={{ display: 'grid', gap: '6px' }}>
            {competitorSeries.slice(0, 8).map((s, i) => (
              <div key={s.id || i} style={{
                background: '#252525', border: '1px solid #333', borderRadius: '6px',
                padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.series_name}
                  </div>
                  <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                    {s.channels?.name || 'Unknown'} · {s.video_count} episodes
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#f59e0b' }}>{fmtInt(s.avg_views)}</div>
                  <div style={{ fontSize: '9px', color: '#888' }}>avg views</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate Ideas */}
      {!aiData ? (
        <div style={{
          background: '#1a1a2e', border: '1px dashed #4a4a6a', borderRadius: '8px',
          padding: '20px', textAlign: 'center', marginBottom: '16px',
        }}>
          <Play size={24} color="#3b82f6" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>
            Generate Series Concepts
          </div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>
            Claude will analyze competitor series and your brand to suggest original series ideas
          </div>
          <button onClick={() => handleGenerate(true)} disabled={aiLoading}
            style={{
              background: '#3b82f6', border: 'none', borderRadius: '6px', padding: '8px 16px',
              color: '#fff', fontSize: '12px', fontWeight: '600', cursor: aiLoading ? 'not-allowed' : 'pointer',
              opacity: aiLoading ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}>
            {aiLoading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</> : <><Zap size={14} /> Generate Ideas</>}
          </button>
          {error && <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '8px' }}>{error}</div>}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={14} color="#3b82f6" /> Series Concepts
            </div>
            <button onClick={() => handleGenerate(true)} disabled={aiLoading}
              style={{ background: 'transparent', border: '1px solid #555', borderRadius: '6px', padding: '4px 8px', color: '#888', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <RefreshCw size={10} /> Regenerate
            </button>
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            {(aiData.series || []).map((s, idx) => {
              const isExpanded = expandedIdx === idx;
              return (
                <div key={idx} style={{
                  background: '#252525', border: '1px solid #333', borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  {/* Header */}
                  <div
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    style={{
                      padding: '12px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '10px',
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>{FORMAT_ICONS[s.format] || '🎬'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: '#b0b0b0', marginTop: '2px' }}>{s.premise}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      <span style={{
                        fontSize: '9px', fontWeight: '600', color: '#3b82f6',
                        background: '#3b82f615', padding: '2px 8px', borderRadius: '8px',
                        border: '1px solid #3b82f640',
                      }}>
                        {s.cadence}
                      </span>
                      <span style={{
                        fontSize: '9px', fontWeight: '600', color: '#888',
                        background: '#88888815', padding: '2px 8px', borderRadius: '8px',
                      }}>
                        {s.targetLength}
                      </span>
                      {isExpanded ? <ChevronUp size={14} color="#888" /> : <ChevronDown size={14} color="#888" />}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div style={{ padding: '0 12px 12px', borderTop: '1px solid #333' }}>
                      {/* Pilot Episode */}
                      <div style={{
                        background: '#1a2e1a', border: '1px solid #2a4a2a', borderRadius: '6px',
                        padding: '10px', marginTop: '10px', marginBottom: '10px',
                      }}>
                        <div style={{ fontSize: '10px', color: '#10b981', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase' }}>Pilot Episode</div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '4px' }}>{s.pilotTitle}</div>
                        {s.pilotHook && (
                          <div style={{ fontSize: '11px', color: '#a0d0a0', lineHeight: '1.4', fontStyle: 'italic' }}>
                            "{s.pilotHook}"
                          </div>
                        )}
                      </div>

                      {/* Why It Works */}
                      {s.whyItWorks && (
                        <div style={{ fontSize: '11px', color: '#b0b0b0', lineHeight: '1.5', marginBottom: '10px' }}>
                          <span style={{ fontWeight: '600', color: '#fff' }}>Why it works: </span>
                          {s.whyItWorks}
                        </div>
                      )}

                      {/* Competitor Evidence */}
                      {s.competitorEvidence && s.competitorEvidence.length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px', textTransform: 'uppercase' }}>Competitor Evidence</div>
                          {s.competitorEvidence.map((ev, i) => (
                            <div key={i} style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                              "{ev.seriesName}" by {ev.channel} — {ev.videoCount} eps, {fmtInt(ev.avgViews)} avg views
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Differentiator */}
                      {s.differentiator && (
                        <div style={{
                          fontSize: '11px', color: '#60a5fa', background: '#3b82f610',
                          padding: '8px 10px', borderRadius: '4px', borderLeft: '3px solid #3b82f6',
                          marginBottom: '10px',
                        }}>
                          <span style={{ fontWeight: '600' }}>Your edge: </span>{s.differentiator}
                        </div>
                      )}

                      {/* Send to Brief */}
                      <button onClick={() => sendToBrief(s, idx)} disabled={sentToBrief[idx]}
                        style={{
                          background: sentToBrief[idx] ? '#16453420' : '#374151',
                          border: `1px solid ${sentToBrief[idx] ? '#10b981' : '#555'}`,
                          borderRadius: '6px', padding: '6px 12px',
                          color: sentToBrief[idx] ? '#10b981' : '#fff',
                          fontSize: '11px', fontWeight: '600', cursor: sentToBrief[idx] ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: '6px',
                        }}>
                        {sentToBrief[idx] ? <><Check size={12} /> Sent to Briefs</> : <><FileText size={12} /> Send to Briefs</>}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
