/**
 * ClientPositionCard — Interactive "Your Position" summary for client view
 *
 * Replaces the static KPI strip with a clickable, visual position overview.
 * Shows rank with adjacent channels, momentum trend, views comparison,
 * content mix vs competitors, and this-week movements.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, ArrowRight, Crown, Zap, Eye,
  BarChart3, Play, Clock, ChevronRight, Loader, Video,
} from 'lucide-react';

const fmt = (n) => {
  if (!n || isNaN(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return Math.round(n).toLocaleString();
};

const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
};

export default function ClientPositionCard({
  activeCompetitors,
  yourStats,
  categoryConfig,
  onChannelClick,
  onViewChange,
}) {
  const [recentMovements, setRecentMovements] = useState([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  // ─── Rank calculation with adjacent channels ──────────────────────────
  const rankData = useMemo(() => {
    if (!yourStats) return null;
    const allChannels = [
      { name: 'Your Channel', subs: yourStats.totalSubscribers, isYou: true, id: null, thumbnail: null },
      ...activeCompetitors.map(c => ({
        name: c.name, subs: c.subscriberCount || 0, isYou: false,
        id: c.id, thumbnail: c.thumbnail,
        category: c.category, uploadsLast30Days: c.uploadsLast30Days || 0,
        avgViewsPerVideo: c.avgViewsPerVideo || 0,
      })),
    ].sort((a, b) => b.subs - a.subs);

    const yourIndex = allChannels.findIndex(c => c.isYou);
    const rank = yourIndex + 1;
    const above = yourIndex > 0 ? allChannels[yourIndex - 1] : null;
    const below = yourIndex < allChannels.length - 1 ? allChannels[yourIndex + 1] : null;
    const leader = allChannels[0];
    const gapToAbove = above ? above.subs - yourStats.totalSubscribers : 0;

    return { rank, total: allChannels.length, above, below, leader, gapToAbove, allChannels };
  }, [activeCompetitors, yourStats]);

  // ─── Momentum & views comparison ─────────────────────────────────────
  const momentum = useMemo(() => {
    if (!yourStats) return null;
    const yourUploads = yourStats.videosLast30Days || 0;
    const avgUploads = activeCompetitors.length > 0
      ? activeCompetitors.reduce((s, c) => s + (c.uploadsLast30Days || 0), 0) / activeCompetitors.length
      : 0;
    const yourAvgViews = yourStats.avgViewsPerVideo || 0;
    const avgViews = activeCompetitors.length > 0
      ? activeCompetitors.reduce((s, c) => s + (c.avgViewsPerVideo || 0), 0) / activeCompetitors.length
      : 0;
    const viewsDiff = avgViews > 0 ? ((yourAvgViews / avgViews - 1) * 100) : 0;

    // Content mix
    const yourShorts = yourStats.shortsCount || 0;
    const yourLongs = yourStats.longsCount || 0;
    const yourTotal = yourShorts + yourLongs;
    const yourShortsRatio = yourTotal > 0 ? (yourShorts / yourTotal) * 100 : 0;

    const compShorts = activeCompetitors.reduce((s, c) => s + (c.shorts30d || 0), 0);
    const compLongs = activeCompetitors.reduce((s, c) => s + (c.longs30d || 0), 0);
    const compTotal = compShorts + compLongs;
    const compShortsRatio = compTotal > 0 ? (compShorts / compTotal) * 100 : 0;

    return {
      yourUploads, avgUploads, uploadsAhead: yourUploads > avgUploads,
      yourAvgViews, avgViews, viewsDiff, viewsAhead: viewsDiff > 0,
      yourShortsRatio, compShortsRatio,
    };
  }, [activeCompetitors, yourStats]);

  // ─── Fetch recent movements (outlier videos + sub changes) ────────────
  useEffect(() => {
    if (activeCompetitors.length === 0) return;
    let cancelled = false;
    setMovementsLoading(true);

    (async () => {
      try {
        const { supabase } = await import('../../services/supabaseClient');
        if (!supabase) return;

        const channelIds = activeCompetitors.map(c => c.supabaseId).filter(Boolean);
        if (channelIds.length === 0) return;

        // Get videos from last 7 days that outperform their channel's average
        const cutoff7d = new Date();
        cutoff7d.setDate(cutoff7d.getDate() - 7);

        const { data: recentVideos } = await supabase
          .from('videos')
          .select('title, view_count, channel_id, published_at, thumbnail_url, video_type')
          .in('channel_id', channelIds)
          .gte('published_at', cutoff7d.toISOString())
          .order('view_count', { ascending: false })
          .limit(20);

        if (cancelled) return;

        // Build channel lookup
        const chLookup = {};
        activeCompetitors.forEach(c => { if (c.supabaseId) chLookup[c.supabaseId] = c; });

        // Filter to outliers (>2x channel avg) + top performers
        const movements = (recentVideos || [])
          .map(v => {
            const ch = chLookup[v.channel_id];
            if (!ch) return null;
            const ratio = ch.avgViewsPerVideo > 0 ? v.view_count / ch.avgViewsPerVideo : 0;
            return { ...v, channel: ch, ratio, isOutlier: ratio >= 2 };
          })
          .filter(Boolean)
          .filter(v => v.isOutlier || v.view_count > 10000)
          .slice(0, 5);

        setRecentMovements(movements);
      } catch (err) {
        console.warn('[ClientPosition] Failed to load movements:', err);
      } finally {
        if (!cancelled) setMovementsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activeCompetitors]);

  if (!yourStats || !rankData) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
      {/* ── Row 1: Position + Rank Ladder ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

        {/* Your Position */}
        <div className="page-section" style={{ padding: '20px', marginBottom: 0, overflow: 'visible' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Crown size={16} style={{ color: rankData.rank <= 3 ? '#f59e0b' : '#888' }} />
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Your Position
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
            <span style={{
              fontSize: '48px', fontWeight: '800', color: '#fff',
              fontFamily: "'Barlow Condensed', sans-serif",
              lineHeight: 1,
            }}>
              #{rankData.rank}
            </span>
            <span style={{ fontSize: '16px', color: '#666' }}>of {rankData.total}</span>
          </div>

          {/* Rank ladder - channels around you */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {rankData.above && (
              <div
                onClick={() => rankData.above.id && onChannelClick(rankData.above.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 10px', borderRadius: '6px',
                  cursor: rankData.above.id ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                }}
                onMouseOver={e => e.currentTarget.style.background = '#252525'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: '10px', color: '#666', minWidth: '20px' }}>#{rankData.rank - 1}</span>
                {rankData.above.thumbnail && <img src={rankData.above.thumbnail} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />}
                <span style={{ fontSize: '11px', color: '#ccc', flex: 1 }}>{rankData.above.name}</span>
                <span style={{ fontSize: '10px', color: '#888' }}>{fmt(rankData.above.subs)}</span>
              </div>
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 10px', borderRadius: '6px',
              background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
            }}>
              <span style={{ fontSize: '10px', color: '#3b82f6', fontWeight: '700', minWidth: '20px' }}>#{rankData.rank}</span>
              <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: '700', flex: 1 }}>Your Channel</span>
              <span style={{ fontSize: '10px', color: '#60a5fa', fontWeight: '600' }}>{fmt(yourStats.totalSubscribers)}</span>
            </div>
            {rankData.below && (
              <div
                onClick={() => rankData.below.id && onChannelClick(rankData.below.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 10px', borderRadius: '6px',
                  cursor: rankData.below.id ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                }}
                onMouseOver={e => e.currentTarget.style.background = '#252525'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: '10px', color: '#666', minWidth: '20px' }}>#{rankData.rank + 1}</span>
                {rankData.below.thumbnail && <img src={rankData.below.thumbnail} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />}
                <span style={{ fontSize: '11px', color: '#ccc', flex: 1 }}>{rankData.below.name}</span>
                <span style={{ fontSize: '10px', color: '#888' }}>{fmt(rankData.below.subs)}</span>
              </div>
            )}
          </div>

          {rankData.gapToAbove > 0 && (
            <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingUp size={10} />
              {fmt(rankData.gapToAbove)} subs to next rank
            </div>
          )}

          <button
            onClick={() => onViewChange('leaderboard')}
            style={{
              marginTop: '12px', width: '100%', padding: '8px',
              background: 'transparent', border: '1px solid #333', borderRadius: '6px',
              color: '#888', fontSize: '10px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#60a5fa'; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#888'; }}
          >
            View Full Leaderboard <ChevronRight size={10} />
          </button>
        </div>

        {/* Momentum + Views + Content Mix */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Momentum & Views */}
          <div className="page-section" style={{ padding: '16px', marginBottom: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {/* Upload Momentum */}
              <div>
                <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Uploads / Month</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{
                    fontSize: '28px', fontWeight: '800', fontFamily: "'Barlow Condensed', sans-serif",
                    color: momentum?.uploadsAhead ? '#10b981' : '#f59e0b',
                  }}>
                    {momentum?.yourUploads || 0}
                  </span>
                  <span style={{ fontSize: '11px', color: '#666' }}>
                    vs {momentum?.avgUploads?.toFixed(1)} avg
                  </span>
                </div>
                {momentum?.uploadsAhead
                  ? <div style={{ fontSize: '10px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}><TrendingUp size={10} /> Above avg</div>
                  : <div style={{ fontSize: '10px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '3px' }}><TrendingDown size={10} /> Below avg</div>
                }
              </div>

              {/* Views Performance */}
              <div>
                <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Avg Views vs Field</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{
                    fontSize: '28px', fontWeight: '800', fontFamily: "'Barlow Condensed', sans-serif",
                    color: momentum?.viewsAhead ? '#10b981' : '#f59e0b',
                  }}>
                    {momentum?.viewsDiff > 0 ? '+' : ''}{momentum?.viewsDiff?.toFixed(0) || 0}%
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: '#666' }}>
                  {fmt(momentum?.yourAvgViews)} vs {fmt(momentum?.avgViews)} avg
                </div>
              </div>
            </div>

            <button
              onClick={() => onViewChange('trends')}
              style={{
                marginTop: '12px', width: '100%', padding: '6px',
                background: 'transparent', border: '1px solid #333', borderRadius: '6px',
                color: '#888', fontSize: '10px', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                transition: 'all 0.15s',
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#60a5fa'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#888'; }}
            >
              View Trends <ChevronRight size={10} />
            </button>
          </div>

          {/* Content Mix Comparison */}
          <div className="page-section" style={{ padding: '16px', marginBottom: 0 }}>
            <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Content Mix</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Your mix */}
              <div>
                <div style={{ fontSize: '10px', color: '#3b82f6', fontWeight: '600', marginBottom: '4px' }}>You</div>
                <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', background: '#252525' }}>
                  <div style={{ width: `${momentum?.yourShortsRatio || 0}%`, background: '#f97316', transition: 'width 0.4s' }} />
                  <div style={{ flex: 1, background: '#3b82f6' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#666', marginTop: '2px' }}>
                  <span>{Math.round(momentum?.yourShortsRatio || 0)}% Shorts</span>
                  <span>{Math.round(100 - (momentum?.yourShortsRatio || 0))}% Long-form</span>
                </div>
              </div>
              {/* Competitor avg mix */}
              <div>
                <div style={{ fontSize: '10px', color: '#888', fontWeight: '600', marginBottom: '4px' }}>Competitors Avg</div>
                <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', background: '#252525' }}>
                  <div style={{ width: `${momentum?.compShortsRatio || 0}%`, background: '#f9731688', transition: 'width 0.4s' }} />
                  <div style={{ flex: 1, background: '#3b82f688' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#666', marginTop: '2px' }}>
                  <span>{Math.round(momentum?.compShortsRatio || 0)}% Shorts</span>
                  <span>{Math.round(100 - (momentum?.compShortsRatio || 0))}% Long-form</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: This Week / Recent Movements ── */}
      <div className="page-section" style={{ padding: '16px 20px', marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Zap size={14} style={{ color: '#f59e0b' }} />
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#fff' }}>This Week</span>
          <span style={{ fontSize: '10px', color: '#666' }}>Notable competitor activity</span>
        </div>

        {movementsLoading ? (
          <div style={{ textAlign: 'center', padding: '16px', color: '#666', fontSize: '11px' }}>
            <Loader size={14} style={{ animation: 'spin 1s linear infinite', marginRight: '6px', verticalAlign: 'middle' }} />
            Loading movements...
          </div>
        ) : recentMovements.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px', color: '#555', fontSize: '11px' }}>
            No notable movements this week
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {recentMovements.map((m, i) => (
              <div
                key={i}
                onClick={() => m.channel?.id && onChannelClick(m.channel.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 10px', borderRadius: '6px',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseOver={e => e.currentTarget.style.background = '#252525'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                {m.thumbnail_url ? (
                  <img src={m.thumbnail_url} alt="" style={{ width: 48, height: 27, borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 48, height: 27, borderRadius: '4px', background: '#333', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', color: '#e0e0e0', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.title}
                  </div>
                  <div style={{ fontSize: '10px', color: '#888', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {m.channel?.thumbnail && <img src={m.channel.thumbnail} alt="" style={{ width: 12, height: 12, borderRadius: '50%' }} />}
                    <span>{m.channel?.name}</span>
                    <span>·</span>
                    <span>{timeAgo(m.published_at)}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#fff' }}>{fmt(m.view_count)}</div>
                  {m.isOutlier && (
                    <div style={{ fontSize: '9px', color: '#f59e0b', fontWeight: '600' }}>{m.ratio.toFixed(1)}x avg</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
