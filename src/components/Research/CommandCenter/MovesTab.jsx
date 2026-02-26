import { useMemo, useState, useCallback } from 'react';
import { Zap, TrendingUp, Award, Film, Rocket, ChevronDown, ChevronUp, Loader, RefreshCw, ExternalLink } from 'lucide-react';

const fmtInt = (n) => (!n || isNaN(n)) ? '0' : Math.round(n).toLocaleString();

const EVENT_TYPES = {
  breakout: { label: 'Breakout Video', icon: Zap, color: '#ef4444' },
  velocity: { label: 'Upload Spike', icon: Rocket, color: '#f97316' },
  milestone: { label: 'Milestone', icon: Award, color: '#fbbf24' },
  acceleration: { label: 'Growth Acceleration', icon: TrendingUp, color: '#10b981' },
  newFormat: { label: 'New Format', icon: Film, color: '#8b5cf6' },
};

const TIME_RANGES = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];

/**
 * MovesTab — Reverse-chronological activity feed of significant competitor events.
 */
export default function MovesTab({
  competitors, snapshots, outliers, outliersLoading,
  fetchOutliers, handleViewInsight, categoryConfig, loading,
}) {
  const [timeRange, setTimeRange] = useState(30);
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [activeFilters, setActiveFilters] = useState(new Set(Object.keys(EVENT_TYPES)));
  const [insightCache, setInsightCache] = useState({});
  const [loadingInsight, setLoadingInsight] = useState(null);

  const toggleFilter = (type) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  // Build events from data
  const events = useMemo(() => {
    const items = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeRange);

    // 1. Breakout videos from outliers
    if (outliers) {
      outliers.forEach(v => {
        const pubDate = v.published_at ? new Date(v.published_at) : null;
        if (pubDate && pubDate >= cutoff) {
          items.push({
            type: 'breakout',
            date: pubDate,
            channel: v.channel,
            channelId: v.channel_id,
            title: v.title,
            metric: `${v.outlierScore}x channel average`,
            detail: `${fmtInt(v.view_count)} views vs ${fmtInt(v.channelAvgViews)} avg`,
            thumbnail: v.thumbnail_url,
            videoId: v.id,
            outlier: v,
          });
        }
      });
    }

    // 2. Subscriber milestones from snapshots
    const MILESTONES = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 5000000];
    competitors.forEach(c => {
      const snaps = snapshots[c.supabaseId] || [];
      if (snaps.length < 2) return;

      for (let i = 1; i < snaps.length; i++) {
        const prev = snaps[i - 1].subscriber_count || 0;
        const curr = snaps[i].subscriber_count || 0;
        const snapDate = new Date(snaps[i].snapshot_date);
        if (snapDate < cutoff) continue;

        // Milestone crossed
        for (const ms of MILESTONES) {
          if (prev < ms && curr >= ms) {
            items.push({
              type: 'milestone',
              date: snapDate,
              channel: c,
              channelId: c.supabaseId,
              title: `${c.name} crossed ${fmtInt(ms)} subscribers`,
              metric: fmtInt(curr) + ' subs',
              detail: `Milestone: ${fmtInt(ms)}`,
            });
          }
        }

        // Growth acceleration: 7-day rate > 2x 30-day rate
        if (i >= 7 && i === snaps.length - 1) {
          const weekAgoIdx = Math.max(0, i - 7);
          const monthAgoIdx = 0;
          const weekGrowth = curr - (snaps[weekAgoIdx].subscriber_count || 0);
          const monthGrowth = curr - (snaps[monthAgoIdx].subscriber_count || 0);
          const weekRate = weekGrowth / 7;
          const monthRate = monthGrowth / Math.max(1, snaps.length - 1);

          if (weekRate > 0 && monthRate > 0 && weekRate > monthRate * 2) {
            items.push({
              type: 'acceleration',
              date: snapDate,
              channel: c,
              channelId: c.supabaseId,
              title: `${c.name} accelerating`,
              metric: `${(weekRate / monthRate).toFixed(1)}x normal growth rate`,
              detail: `+${fmtInt(weekGrowth)} subs in 7 days vs ${fmtInt(Math.round(monthRate * 7))} typical`,
            });
          }
        }
      }
    });

    // Sort by date descending
    items.sort((a, b) => b.date - a.date);
    return items;
  }, [competitors, snapshots, outliers, timeRange]);

  // Filter events
  const filteredEvents = useMemo(
    () => events.filter(e => activeFilters.has(e.type)),
    [events, activeFilters]
  );

  // Load insight for a breakout video
  const loadInsight = useCallback(async (videoId, outlier) => {
    if (insightCache[videoId]) return;
    setLoadingInsight(videoId);
    try {
      const { getCachedInsight, analyzeCompetitorVideo } = await import('../../../services/competitorInsightsService');
      const cached = await getCachedInsight(videoId);
      if (cached) {
        setInsightCache(prev => ({ ...prev, [videoId]: cached.insight_data }));
      } else if (outlier) {
        const data = await analyzeCompetitorVideo(outlier);
        setInsightCache(prev => ({ ...prev, [videoId]: data }));
      }
    } catch (e) {
      console.warn('[MovesTab] Insight load failed:', e.message);
    } finally {
      setLoadingInsight(null);
    }
  }, [insightCache]);

  const formatDate = (d) => {
    const now = new Date();
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div>
      {/* Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '16px', flexWrap: 'wrap', gap: '8px',
      }}>
        {/* Time range */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {TIME_RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setTimeRange(r.days)}
              style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                border: `1px solid ${timeRange === r.days ? '#3b82f6' : '#444'}`,
                background: timeRange === r.days ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: timeRange === r.days ? '#3b82f6' : '#888', cursor: 'pointer',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Event type filters */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {Object.entries(EVENT_TYPES).map(([key, cfg]) => {
            const active = activeFilters.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                style={{
                  padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                  border: `1px solid ${active ? cfg.color + '60' : '#333'}`,
                  background: active ? cfg.color + '15' : 'transparent',
                  color: active ? cfg.color : '#666', cursor: 'pointer',
                }}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Refresh outliers */}
        <button
          onClick={() => fetchOutliers && fetchOutliers()}
          disabled={outliersLoading}
          style={{
            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
            border: '1px solid #444', background: 'transparent',
            color: '#888', cursor: outliersLoading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}
        >
          <RefreshCw size={12} style={outliersLoading ? { animation: 'spin 1s linear infinite' } : {}} />
          Refresh
        </button>
      </div>

      {/* Event feed */}
      {(loading || outliersLoading) && !events.length ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#888' }}>
          <Loader size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          <div style={{ fontSize: '12px' }}>Scanning for signals...</div>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#888' }}>
          <div style={{ fontSize: '13px' }}>No signals detected in the last {timeRange} days</div>
          <div style={{ fontSize: '11px', marginTop: '4px' }}>Try expanding the time range or adjusting filters</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredEvents.map((event, i) => {
            const cfg = EVENT_TYPES[event.type] || {};
            const Icon = cfg.icon || Zap;
            const isExpanded = expandedEvent === i;
            const insight = event.videoId ? insightCache[event.videoId] : null;

            return (
              <div
                key={i}
                style={{
                  background: '#252525', border: '1px solid #333', borderRadius: '8px',
                  overflow: 'hidden', transition: 'border-color 0.15s',
                  borderLeftWidth: '3px', borderLeftColor: cfg.color || '#444',
                }}
              >
                <button
                  onClick={() => setExpandedEvent(isExpanded ? null : i)}
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    padding: '12px 16px', cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: '12px',
                  }}
                >
                  {/* Event icon */}
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: (cfg.color || '#444') + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon size={16} color={cfg.color} />
                  </div>

                  {/* Channel thumbnail */}
                  {event.channel?.thumbnail_url && (
                    <img
                      src={event.channel.thumbnail_url}
                      alt=""
                      style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        objectFit: 'cover', flexShrink: 0,
                      }}
                    />
                  )}

                  {/* Event content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12px', fontWeight: '600', color: '#fff',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {event.title}
                    </div>
                    <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                      {event.detail}
                    </div>
                  </div>

                  {/* Metric badge */}
                  <span style={{
                    fontSize: '11px', fontWeight: '700', color: cfg.color,
                    background: (cfg.color || '#444') + '15',
                    padding: '3px 8px', borderRadius: '4px', whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}>
                    {event.metric}
                  </span>

                  {/* Date */}
                  <span style={{
                    fontSize: '10px', color: '#666', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {formatDate(event.date)}
                  </span>

                  {isExpanded ? <ChevronUp size={14} color="#666" /> : <ChevronDown size={14} color="#666" />}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid #333' }}>
                    {/* Video thumbnail for breakout events */}
                    {event.type === 'breakout' && event.thumbnail && (
                      <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                        <img
                          src={event.thumbnail}
                          alt=""
                          style={{
                            width: '120px', height: '68px', borderRadius: '6px',
                            objectFit: 'cover', flexShrink: 0,
                          }}
                        />
                        <div>
                          <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '4px' }}>
                            {event.title}
                          </div>
                          <div style={{ fontSize: '11px', color: '#888' }}>
                            {event.detail}
                          </div>
                          {event.outlier?.youtube_video_id && (
                            <a
                              href={`https://youtube.com/watch?v=${event.outlier.youtube_video_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: '11px', color: '#3b82f6', textDecoration: 'none',
                                display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px',
                              }}
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink size={10} /> Watch on YouTube
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* AI Insight for breakout videos */}
                    {event.type === 'breakout' && event.videoId && (
                      <div style={{ marginTop: '12px' }}>
                        {insight ? (
                          <div style={{
                            background: '#1E1E1E', border: '1px solid #333', borderRadius: '6px',
                            padding: '12px',
                          }}>
                            <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: '#888', marginBottom: '8px' }}>
                              AI Analysis
                            </div>
                            {insight.hookAnalysis && (
                              <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '6px' }}>
                                <strong style={{ color: '#fff' }}>Hook:</strong> {insight.hookAnalysis}
                              </div>
                            )}
                            {insight.whyItWorked && (
                              <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '6px' }}>
                                <strong style={{ color: '#fff' }}>Why it worked:</strong> {insight.whyItWorked}
                              </div>
                            )}
                            {insight.applicableTactics?.length > 0 && (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                                {insight.applicableTactics.map((t, j) => (
                                  <span key={j} style={{
                                    fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
                                    background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
                                  }}>
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div style={{
                              display: 'flex', gap: '12px', marginTop: '8px', fontSize: '10px',
                            }}>
                              <span style={{ color: '#888' }}>
                                Angle: <span style={{ color: '#ccc' }}>{insight.contentAngle}</span>
                              </span>
                              <span style={{ color: '#888' }}>
                                Replicability: <span style={{
                                  color: insight.replicability === 'high' ? '#10b981' :
                                    insight.replicability === 'medium' ? '#fbbf24' : '#ef4444'
                                }}>
                                  {insight.replicability}
                                </span>
                              </span>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              loadInsight(event.videoId, event.outlier);
                            }}
                            disabled={loadingInsight === event.videoId}
                            style={{
                              padding: '8px 16px', borderRadius: '6px', fontSize: '11px',
                              fontWeight: '600', border: '1px solid #444',
                              background: 'transparent', color: '#888',
                              cursor: loadingInsight === event.videoId ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', gap: '6px',
                            }}
                          >
                            {loadingInsight === event.videoId ? (
                              <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</>
                            ) : (
                              <><Zap size={12} /> Analyze with AI</>
                            )}
                          </button>
                        )}
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
