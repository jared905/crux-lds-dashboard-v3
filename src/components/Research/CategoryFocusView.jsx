/**
 * CategoryFocusView — Full-screen category workspace
 *
 * Replaces the accordion drill-down with a dedicated view for a single category.
 * Three panels: Insights Strip (top), Leaderboard (left), Activity Stream (right).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, Users, Video, Eye, Play, Clock, Loader, ChevronRight } from 'lucide-react';

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
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
};

export default function CategoryFocusView({ lane, onBack, onChannelClick, categoryConfig }) {
  const [metric, setMetric] = useState('subscriberCount');
  const [recentVideos, setRecentVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(false);

  const { config, channels, subcategories } = lane;

  // Sort channels by active metric
  const sortedChannels = useMemo(() =>
    [...channels].sort((a, b) => (b[metric] || 0) - (a[metric] || 0)),
    [channels, metric]
  );

  const maxVal = sortedChannels[0]?.[metric] || 1;

  // Insights
  const insights = useMemo(() => {
    const totalSubs = channels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
    const avgUploads = channels.length > 0
      ? channels.reduce((s, c) => s + (c.uploadsLast30Days || 0), 0) / channels.length
      : 0;
    const topByViews = [...channels].sort((a, b) => (b.avgViewsPerVideo || 0) - (a.avgViewsPerVideo || 0))[0];
    const mostActive = [...channels].sort((a, b) => (b.uploadsLast30Days || 0) - (a.uploadsLast30Days || 0))[0];

    return { totalSubs, avgUploads, topByViews, mostActive };
  }, [channels]);

  // Metrics for toggle
  const metricOptions = [
    { key: 'subscriberCount', label: 'Subscribers', format: fmt },
    { key: 'avgViewsPerVideo', label: 'Avg Views', format: fmt },
    { key: 'uploadsLast30Days', label: 'Uploads (30d)', format: (n) => String(Math.round(n || 0)) },
    { key: 'engagementRate', label: 'Engagement', format: (n) => `${((n || 0) * 100).toFixed(1)}%` },
  ];

  const activeMetricConfig = metricOptions.find(m => m.key === metric);

  // Load recent videos for this category's channels
  useEffect(() => {
    const channelIds = channels.map(c => c.supabaseId).filter(Boolean);
    if (channelIds.length === 0) return;
    let cancelled = false;
    setVideosLoading(true);

    (async () => {
      try {
        const { getRecentVideosByChannels } = await import('../../services/competitorDatabase');
        const videoMap = await getRecentVideosByChannels(channelIds, { days: 30 });
        if (cancelled) return;

        const channelLookup = {};
        channels.forEach(c => { if (c.supabaseId) channelLookup[c.supabaseId] = c; });

        // Also fetch additional recent videos (not just most recent per channel)
        const { supabase } = await import('../../services/supabaseClient');
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);

        const { data: allRecent } = await supabase
          .from('videos')
          .select('id, channel_id, title, youtube_video_id, view_count, like_count, published_at, thumbnail_url, video_type')
          .in('channel_id', channelIds)
          .gte('published_at', cutoff.toISOString())
          .order('published_at', { ascending: false })
          .limit(50);

        if (!cancelled && allRecent) {
          const videos = allRecent.map(v => ({
            ...v,
            channel: channelLookup[v.channel_id] || null,
          }));
          setRecentVideos(videos);
        }
      } catch (err) {
        console.error('[CategoryFocus] Failed to load videos:', err);
      } finally {
        if (!cancelled) setVideosLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [channels]);

  // Group videos by time
  const groupedVideos = useMemo(() => {
    const now = Date.now();
    const today = [];
    const thisWeek = [];
    const older = [];

    recentVideos.forEach(v => {
      if (!v.published_at) { older.push(v); return; }
      const age = now - new Date(v.published_at).getTime();
      const days = age / 86_400_000;
      if (days < 1) today.push(v);
      else if (days < 7) thisWeek.push(v);
      else older.push(v);
    });

    return [
      { label: 'Today', videos: today },
      { label: 'This Week', videos: thisWeek },
      { label: 'Earlier', videos: older },
    ].filter(g => g.videos.length > 0);
  }, [recentVideos]);

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Breadcrumb */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '12px 0', marginBottom: '12px',
      }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', background: '#252525', border: '1px solid #444',
            borderRadius: '6px', color: '#ccc', fontSize: '12px', fontWeight: '600',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor = config.color; e.currentTarget.style.color = '#fff'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#ccc'; }}
        >
          <ArrowLeft size={14} /> All Categories
        </button>
        <ChevronRight size={12} style={{ color: '#555' }} />
        <span style={{ fontSize: '16px' }}>{config.icon}</span>
        <span style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>{config.label}</span>
        <span style={{ fontSize: '12px', color: '#888' }}>{channels.length} channels</span>
        {subcategories?.length > 1 && (
          <span style={{ fontSize: '10px', color: '#666', background: '#252525', padding: '2px 8px', borderRadius: '4px' }}>
            {subcategories.length} subcategories
          </span>
        )}
      </div>

      {/* Insights Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        <div className="page-section" style={{ padding: '14px', marginBottom: 0, borderTop: `3px solid ${config.color}` }}>
          <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Subscribers</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: config.color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: '4px' }}>
            {fmt(insights.totalSubs)}
          </div>
        </div>
        <div className="page-section" style={{ padding: '14px', marginBottom: 0, borderTop: '3px solid #10b981' }}>
          <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Uploads/Mo</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: '#10b981', fontFamily: "'Barlow Condensed', sans-serif", marginTop: '4px' }}>
            {insights.avgUploads.toFixed(1)}
          </div>
        </div>
        <div className="page-section" style={{ padding: '14px', marginBottom: 0, borderTop: '3px solid #f59e0b' }}>
          <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Top by Avg Views</div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {insights.topByViews?.name || '—'}
          </div>
          <div style={{ fontSize: '10px', color: '#f59e0b' }}>{fmt(insights.topByViews?.avgViewsPerVideo)} avg</div>
        </div>
        <div className="page-section" style={{ padding: '14px', marginBottom: 0, borderTop: '3px solid #8b5cf6' }}>
          <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Most Active</div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {insights.mostActive?.name || '—'}
          </div>
          <div style={{ fontSize: '10px', color: '#8b5cf6' }}>{insights.mostActive?.uploadsLast30Days || 0} uploads/mo</div>
        </div>
      </div>

      {/* Two-panel layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Left: Leaderboard */}
        <div className="page-section" style={{ padding: 0, marginBottom: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid #333',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>Leaderboard</div>
            <div style={{ display: 'flex', gap: '2px' }}>
              {metricOptions.map(m => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  style={{
                    padding: '3px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: '600',
                    border: `1px solid ${metric === m.key ? config.color : '#444'}`,
                    background: metric === m.key ? `${config.color}20` : 'transparent',
                    color: metric === m.key ? config.color : '#888',
                    cursor: 'pointer',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {sortedChannels.map((ch, idx) => {
              const val = ch[metric] || 0;
              const barPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
              return (
                <div
                  key={ch.id}
                  onClick={() => onChannelClick(ch.id)}
                  style={{
                    display: 'flex', alignItems: 'center',
                    padding: '8px 12px', cursor: 'pointer',
                    borderBottom: '1px solid #222', transition: 'background 0.1s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = '#1a1a1a'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '160px', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '10px', fontWeight: '700', minWidth: '20px', textAlign: 'right',
                      color: idx < 3 ? '#f59e0b' : '#555',
                      fontFamily: "'Barlow Condensed', sans-serif",
                    }}>
                      #{idx + 1}
                    </span>
                    <img src={ch.thumbnail} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    <span style={{
                      fontSize: '11px', color: '#e0e0e0', fontWeight: '500',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                    }}>
                      {ch.name}
                    </span>
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      height: '16px', width: `${Math.max(barPct, 1)}%`,
                      background: config.color, borderRadius: '3px',
                      transition: 'width 0.4s ease', minWidth: '4px',
                    }} />
                    <span style={{
                      fontSize: '11px', fontWeight: '700', color: '#fff',
                      fontFamily: "'Barlow Condensed', sans-serif", whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {activeMetricConfig.format(val)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Activity Stream */}
        <div className="page-section" style={{ padding: 0, marginBottom: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid #333',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <Clock size={14} style={{ color: config.color }} />
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>Recent Activity</div>
            <span style={{ fontSize: '10px', color: '#666' }}>{recentVideos.length} videos (30d)</span>
          </div>

          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {videosLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
                <Loader size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
                <div style={{ fontSize: '12px' }}>Loading activity...</div>
              </div>
            ) : recentVideos.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#555', fontSize: '12px' }}>
                No recent uploads in this category
              </div>
            ) : (
              groupedVideos.map(group => (
                <div key={group.label}>
                  <div style={{
                    padding: '8px 16px', background: '#151515',
                    fontSize: '10px', fontWeight: '700', color: '#888',
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                    borderBottom: '1px solid #222',
                  }}>
                    {group.label} ({group.videos.length})
                  </div>
                  {group.videos.map((video, i) => {
                    const ch = video.channel;
                    return (
                      <div
                        key={video.id || i}
                        onClick={() => ch?.id && onChannelClick(ch.id)}
                        style={{
                          display: 'flex', gap: '10px', padding: '10px 16px',
                          borderBottom: '1px solid #222', cursor: 'pointer',
                          transition: 'background 0.1s',
                        }}
                        onMouseOver={e => e.currentTarget.style.background = '#1a1a1a'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {video.thumbnail_url ? (
                          <img src={video.thumbnail_url} alt="" style={{
                            width: 96, height: 54, borderRadius: '4px', objectFit: 'cover',
                            background: '#252525', flexShrink: 0,
                          }} />
                        ) : (
                          <div style={{
                            width: 96, height: 54, borderRadius: '4px', background: '#252525',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <Play size={16} style={{ color: '#555' }} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '11px', fontWeight: '600', color: '#e0e0e0', lineHeight: '1.3',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}>
                            {video.title}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                            {ch?.thumbnail && <img src={ch.thumbnail} alt="" style={{ width: 14, height: 14, borderRadius: '50%' }} />}
                            <span style={{ fontSize: '10px', color: config.color, fontWeight: '500' }}>
                              {ch?.name || 'Unknown'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '10px', fontSize: '10px', color: '#888', marginTop: '3px' }}>
                            <span style={{ fontWeight: '600', color: '#ccc' }}>{fmt(video.view_count)} views</span>
                            <span>{timeAgo(video.published_at)}</span>
                            {video.video_type === 'short' && <span style={{ color: '#f97316', fontWeight: '600' }}>Short</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
