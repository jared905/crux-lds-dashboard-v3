/**
 * ChannelProfileView — Full-page channel profile workspace
 *
 * Replaces the narrow sidebar drawer with a proper layout:
 * - Header with channel identity + actions
 * - KPI row with color
 * - Three-column layout: Overview / Content / Activity
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, RefreshCw, ExternalLink, Trash2, Unlink, Crown, Play,
  TrendingUp, TrendingDown, Video, Eye, Users, Clock, Loader, ChevronRight,
} from 'lucide-react';
import { analyzeTitlePatterns, analyzeUploadSchedule, categorizeContentFormats } from '../../lib/competitorAnalysis';

const fmt = (n) => {
  if (!n || isNaN(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return Math.round(n).toLocaleString();
};

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();

const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
};

export default function ChannelProfileView({
  channel,
  onBack,
  onRefresh,
  onRemove,
  onUnlinkFromClient,
  onCategoryChange,
  isRefreshing,
  categoryConfig,
  masterView,
  userTimezone,
  refreshKey,
}) {
  const [dbData, setDbData] = useState({ recent: [], top: null, allVideos: [], subDelta: null, snapshots: [] });
  const [loading, setLoading] = useState(true);

  const catCfg = categoryConfig?.[channel.category] || { color: '#3b82f6', icon: '📁', label: channel.category || 'Uncategorized' };

  // Normalize localStorage video shape → DB schema shape (single source of truth)
  const normalizeLocal = (v) => ({
    youtube_video_id: v.id,
    title: v.title,
    thumbnail_url: v.thumbnail,
    view_count: v.views,
    like_count: v.likes,
    comment_count: v.comments,
    published_at: v.publishedAt,
    video_type: v.type === 'short' ? 'short' : 'long',
    duration_seconds: v.duration,
  });

  // Stable key to avoid re-triggering on object identity changes
  const localVideoCount = channel.videos?.length || 0;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // If no Supabase record, use localStorage only
      if (!channel.supabaseId) {
        if (localVideoCount > 0) {
          const all = channel.videos.map(normalizeLocal);
          const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
          const recent = all
            .filter(v => v.published_at && new Date(v.published_at).getTime() >= cutoff)
            .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
            .slice(0, 10);
          const top = [...all].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 5);
          setDbData({ recent, allVideos: all, top: top[0] || null, topVideos: top, subDelta: null, snapshots: [] });
        }
        setLoading(false);
        return;
      }

      try {
        const { supabase } = await import('../../services/supabaseClient');
        if (!supabase || cancelled) return;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        const VIDEO_COLS = 'youtube_video_id, title, thumbnail_url, view_count, like_count, comment_count, published_at, video_type, duration_seconds';

        const [{ data: videos }, { data: topArr }, { data: snaps }] = await Promise.all([
          supabase.from('videos').select(VIDEO_COLS)
            .eq('channel_id', channel.supabaseId)
            .gte('published_at', cutoff.toISOString())
            .order('published_at', { ascending: false }).limit(50),
          supabase.from('videos').select(VIDEO_COLS)
            .eq('channel_id', channel.supabaseId)
            .order('view_count', { ascending: false }).limit(5),
          supabase.from('channel_snapshots').select('subscriber_count, total_view_count, snapshot_date')
            .eq('channel_id', channel.supabaseId)
            .order('snapshot_date', { ascending: false }).limit(30),
        ]);

        if (cancelled) return;

        const hasDbVideos = videos?.length > 0;

        // Fall back to localStorage when Supabase has no videos
        let recent, allVideos, topVideos;
        if (hasDbVideos) {
          recent = videos.slice(0, 10);
          allVideos = videos;
          topVideos = topArr || [];
        } else if (localVideoCount > 0) {
          allVideos = channel.videos.map(normalizeLocal);
          recent = allVideos
            .filter(v => v.published_at && new Date(v.published_at) >= cutoff)
            .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
            .slice(0, 10);
          topVideos = [...allVideos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 5);
        } else {
          recent = [];
          allVideos = [];
          topVideos = [];
        }

        const subDelta = snaps?.length >= 2
          ? (snaps[0].subscriber_count || 0) - (snaps[1].subscriber_count || 0)
          : null;

        setDbData({
          recent,
          allVideos,
          top: topVideos[0] || null,
          topVideos,
          subDelta,
          snapshots: (snaps || []).reverse(),
        });
      } catch (err) {
        console.warn('[ChannelProfile] Load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [channel.supabaseId, localVideoCount, refreshKey]);

  // Auto-refresh: if we finished loading and have zero videos from any source, fetch once
  const [autoRefreshed, setAutoRefreshed] = useState(false);
  useEffect(() => {
    if (loading || autoRefreshed || isRefreshing) return;
    if (dbData.allVideos.length > 0 || localVideoCount > 0) return;
    if (!channel.id || !onRefresh) return;
    setAutoRefreshed(true);
    onRefresh(channel.id);
  }, [loading, autoRefreshed, isRefreshing, dbData.allVideos.length, localVideoCount, channel.id, onRefresh]);

  // Content analysis
  const titleAnalysis = useMemo(() => channel.videos?.length > 0 ? analyzeTitlePatterns(channel.videos) : null, [channel.videos]);
  const scheduleAnalysis = useMemo(() => channel.videos?.length > 0 ? analyzeUploadSchedule(channel.videos, userTimezone) : null, [channel.videos, userTimezone]);
  const formatAnalysis = useMemo(() => channel.videos?.length > 0 ? categorizeContentFormats(channel.videos) : null, [channel.videos]);

  // Content mix — use channel.videos (same source as Format Breakdown), fall back to DB
  const contentMix = useMemo(() => {
    if (channel.videos?.length > 0) {
      const isShort = (v) => v.type === 'short' || (!v.type && v.duration && v.duration <= 60);
      const shorts = channel.videos.filter(isShort).length;
      const total = channel.videos.length;
      return { shorts, longs: total - shorts, total, shortsRatio: total > 0 ? (shorts / total) * 100 : 0 };
    }
    if (dbData.allVideos.length > 0) {
      const isShort = (v) => v.video_type === 'short' || (!v.video_type && v.duration_seconds && v.duration_seconds <= 60);
      const shorts = dbData.allVideos.filter(isShort).length;
      const total = dbData.allVideos.length;
      return { shorts, longs: total - shorts, total, shortsRatio: total > 0 ? (shorts / total) * 100 : 0 };
    }
    return { shorts: 0, longs: 0, total: 0, shortsRatio: 0 };
  }, [channel.videos, dbData.allVideos]);

  // Recent uploads — use channel.videos first (same source that works for Format Breakdown)
  const recentUploads = useMemo(() => {
    if (channel.videos?.length > 0) {
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      return channel.videos
        .filter(v => v.publishedAt && new Date(v.publishedAt).getTime() >= cutoff)
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
        .slice(0, 10)
        .map(normalizeLocal);
    }
    return dbData.recent;
  }, [channel.videos, dbData.recent]);

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Breadcrumb + Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 0', marginBottom: '12px',
      }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', background: '#252525', border: '1px solid #444',
            borderRadius: '6px', color: '#ccc', fontSize: '12px', fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <ChevronRight size={12} style={{ color: '#555' }} />
        <img src={channel.thumbnail} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
        <div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>{channel.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <span style={{ fontSize: '11px', color: catCfg.color, background: `${catCfg.color}15`, padding: '1px 8px', borderRadius: '10px', fontWeight: '600' }}>
              {catCfg.icon} {catCfg.label}
            </span>
            {channel.subcategory && <span style={{ fontSize: '10px', color: '#666' }}>{channel.subcategory}</span>}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button onClick={() => onRefresh(channel.id)} disabled={isRefreshing}
            style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #3b82f6', borderRadius: '6px', color: '#3b82f6', fontSize: '11px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {isRefreshing ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
            {isRefreshing ? 'Syncing...' : 'Refresh'}
          </button>
          <a href={`https://www.youtube.com/channel/${channel.id}`} target="_blank" rel="noopener noreferrer"
            style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #555', borderRadius: '6px', color: '#888', fontSize: '11px', fontWeight: '600', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ExternalLink size={12} /> YouTube
          </a>
          {onUnlinkFromClient && (
            <button onClick={() => onUnlinkFromClient(channel.id)}
              style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #f59e0b', borderRadius: '6px', color: '#f59e0b', fontSize: '11px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Unlink size={12} /> Unlink
            </button>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '16px' }}>
        <KPICard label="Subscribers" value={fmt(channel.subscriberCount)} color="#3b82f6" delta={dbData.subDelta} />
        <KPICard label="Avg Views" value={fmt(channel.avgViewsPerVideo)} color="#10b981" />
        <KPICard label="Total Views" value={fmt(channel.viewCount)} color="#8b5cf6" />
        <KPICard label="Uploads (30d)" value={String(channel.uploadsLast30Days || 0)} color="#f59e0b" />
        <KPICard label="Engagement" value={`${((channel.engagementRate || 0) * 100).toFixed(1)}%`} color="#ec4899" />
      </div>

      {/* Subscriber Sparkline */}
      {dbData.snapshots.length >= 3 && (
        <div className="page-section" style={{ padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '10px', color: '#888', flexShrink: 0 }}>Sub Trend</span>
          <div style={{ flex: 1, height: '28px', display: 'flex', alignItems: 'end', gap: '1px' }}>
            {dbData.snapshots.map((snap, i) => {
              const vals = dbData.snapshots.map(s => s.subscriber_count);
              const min = Math.min(...vals);
              const max = Math.max(...vals);
              const range = max - min || 1;
              const pct = ((snap.subscriber_count - min) / range) * 100;
              const isLast = i === dbData.snapshots.length - 1;
              return (
                <div key={i} style={{
                  flex: 1, minWidth: '3px', height: `${Math.max(pct, 8)}%`,
                  background: isLast ? '#3b82f6' : dbData.subDelta >= 0 ? '#10b981' : '#ef4444',
                  opacity: isLast ? 1 : 0.5, borderRadius: '2px 2px 0 0',
                }} />
              );
            })}
          </div>
          {dbData.subDelta !== null && (
            <span style={{ fontSize: '11px', fontWeight: '600', color: dbData.subDelta >= 0 ? '#10b981' : '#ef4444', flexShrink: 0 }}>
              {dbData.subDelta >= 0 ? '+' : ''}{fmt(dbData.subDelta)}
            </span>
          )}
        </div>
      )}

      {/* Three-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>

        {/* Column 1: Content Mix + Schedule */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Content Mix */}
          <div className="page-section" style={{ padding: '16px', marginBottom: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>Content Mix</div>
            {contentMix.total > 0 ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ background: '#252525', borderRadius: '6px', padding: '10px', borderTop: '3px solid #f97316' }}>
                    <div style={{ fontSize: '9px', color: '#888' }}>SHORTS</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#f97316', fontFamily: "'Barlow Condensed', sans-serif" }}>{contentMix.shorts}</div>
                  </div>
                  <div style={{ background: '#252525', borderRadius: '6px', padding: '10px', borderTop: '3px solid #3b82f6' }}>
                    <div style={{ fontSize: '9px', color: '#888' }}>LONG-FORM</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#3b82f6', fontFamily: "'Barlow Condensed', sans-serif" }}>{contentMix.longs}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: '#252525' }}>
                  {contentMix.shorts > 0 && <div style={{ width: `${contentMix.shortsRatio}%`, background: '#f97316' }} />}
                  {contentMix.longs > 0 && <div style={{ flex: 1, background: '#3b82f6' }} />}
                </div>
              </>
            ) : (
              <div style={{ fontSize: '11px', color: '#555', fontStyle: 'italic' }}>No video data</div>
            )}
          </div>

          {/* Schedule */}
          {scheduleAnalysis && (
            <div className="page-section" style={{ padding: '16px', marginBottom: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>Upload Schedule</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div style={{ background: '#252525', borderRadius: '6px', padding: '10px' }}>
                  <div style={{ fontSize: '9px', color: '#888' }}>BEST DAY</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginTop: '2px' }}>{scheduleAnalysis.bestDay?.day || '—'}</div>
                </div>
                <div style={{ background: '#252525', borderRadius: '6px', padding: '10px' }}>
                  <div style={{ fontSize: '9px', color: '#888' }}>BEST TIME</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginTop: '2px' }}>{scheduleAnalysis.bestTime?.hour || '—'}</div>
                </div>
              </div>
              {scheduleAnalysis.dayDistribution && (
                <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '40px' }}>
                  {scheduleAnalysis.dayDistribution.map(day => (
                    <div key={day.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <div style={{
                        width: '100%', background: '#3b82f6',
                        height: `${Math.max(day.count / Math.max(...scheduleAnalysis.dayDistribution.map(d => d.count), 1) * 30, 3)}px`,
                        borderRadius: '2px 2px 0 0',
                      }} />
                      <div style={{ fontSize: '7px', color: '#666' }}>{day.day.substring(0, 2)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Title Patterns */}
          {titleAnalysis?.patterns?.length > 0 && (
            <div className="page-section" style={{ padding: '16px', marginBottom: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '10px' }}>Title Patterns</div>
              {titleAnalysis.patterns.slice(0, 4).map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #252525' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '14px' }}>{p.icon}</span>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>{p.name}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#3b82f6' }}>{p.topPct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Column 2: Recent Uploads */}
        <div className="page-section" style={{ padding: 0, marginBottom: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={14} style={{ color: catCfg.color }} />
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>Recent Uploads</span>
            <span style={{ fontSize: '10px', color: '#666' }}>{recentUploads.length} videos</span>
          </div>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
                <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : recentUploads.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#555', fontSize: '11px' }}>No recent uploads</div>
            ) : (
              recentUploads.map((v, i) => (
                <a key={v.youtube_video_id || i} href={`https://www.youtube.com/watch?v=${v.youtube_video_id}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', gap: '10px', padding: '10px 16px',
                    borderBottom: '1px solid #222', textDecoration: 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = '#1a1a1a'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  {v.thumbnail_url ? (
                    <img src={v.thumbnail_url} alt="" style={{ width: 140, height: 79, borderRadius: '6px', objectFit: 'cover', flexShrink: 0, background: '#252525' }} />
                  ) : (
                    <div style={{ width: 140, height: 79, borderRadius: '6px', background: '#252525', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#e0e0e0', lineHeight: '1.3', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {v.title}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#888', marginTop: '3px' }}>
                      <span style={{ fontWeight: '600', color: '#ccc' }}>{fmt(v.view_count)} views</span>
                      <span>{fmtInt(v.like_count)} likes</span>
                      <span>{v.published_at ? new Date(v.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                      {v.video_type === 'short' && <span style={{ color: '#f97316', fontWeight: '600' }}>Short</span>}
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>

        {/* Column 3: Top Performing + Format Breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Top Performing Video */}
          {dbData.top && (
            <div className="page-section" style={{ padding: '16px', marginBottom: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Crown size={14} style={{ color: '#f59e0b' }} /> Top Performing
              </div>
              <a href={`https://www.youtube.com/watch?v=${dbData.top.youtube_video_id}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', textDecoration: 'none' }}>
                {dbData.top.thumbnail_url && (
                  <img src={dbData.top.thumbnail_url} alt="" style={{ width: '100%', height: 'auto', borderRadius: '6px', marginBottom: '8px' }} />
                )}
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#fff', marginBottom: '4px', lineHeight: '1.4' }}>
                  {dbData.top.title}
                </div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#f59e0b' }}>{fmt(dbData.top.view_count)} views</div>
                <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                  {fmtInt(dbData.top.like_count)} likes · {fmtInt(dbData.top.comment_count)} comments
                </div>
              </a>
            </div>
          )}

          {/* More Top Videos */}
          {dbData.topVideos?.length > 1 && (
            <div className="page-section" style={{ padding: '16px', marginBottom: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '10px' }}>Top 5 Videos</div>
              {dbData.topVideos.slice(1, 5).map((v, i) => (
                <a key={v.youtube_video_id} href={`https://www.youtube.com/watch?v=${v.youtube_video_id}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', gap: '8px', padding: '6px 0',
                    borderBottom: '1px solid #252525', textDecoration: 'none', alignItems: 'center',
                  }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: i === 0 ? '#e5e7eb' : '#555', minWidth: '16px' }}>#{i + 2}</span>
                  {v.thumbnail_url && <img src={v.thumbnail_url} alt="" style={{ width: 80, height: 45, borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10px', color: '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
                    <div style={{ fontSize: '9px', color: '#888' }}>{fmt(v.view_count)} views · {v.published_at ? new Date(v.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</div>
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* Format Breakdown */}
          {formatAnalysis?.durationStats?.length > 0 && (
            <div className="page-section" style={{ padding: '16px', marginBottom: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '10px' }}>Format Breakdown</div>
              {formatAnalysis.durationStats.map(f => (
                <div key={f.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #252525' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: f.color, fontWeight: '600' }}>{f.name}</span>
                    <span style={{ fontSize: '10px', color: '#666', marginLeft: '6px' }}>{f.count} videos</span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#ccc', fontWeight: '600' }}>{fmtInt(f.avgViews)} avg</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, color, delta }) {
  return (
    <div className="page-section" style={{ padding: '14px', marginBottom: 0, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: '800', color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: '4px' }}>
        {value}
      </div>
      {delta !== null && delta !== undefined && (
        <div style={{ fontSize: '10px', fontWeight: '600', color: delta >= 0 ? '#10b981' : '#ef4444', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
          {delta >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {delta >= 0 ? '+' : ''}{fmt(delta)}
        </div>
      )}
    </div>
  );
}
