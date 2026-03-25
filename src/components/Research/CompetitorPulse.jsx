/**
 * CompetitorPulse — Default view for Competitor Analysis
 *
 * Uses shared CategoryComparisonSelector for category navigation.
 * 1. CategoryComparisonSelector — bar chart category/subcategory/channel drill-down
 * 2. CategoryLanes — Netflix-style horizontal rows showing channels per category
 * 3. ActivityFeed — recent uploads with thumbnails across all competitors
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Play, Clock, ChevronRight, ChevronDown, Loader } from 'lucide-react';
import CategoryComparisonSelector, { buildParentLanes } from './CategoryComparisonSelector';

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
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
};

// ─── CategoryLanes ─────────────────────────────────────────────────────
function CategoryLanes({ lanes, onChannelClick, expandedCategory, onExpandCategory, latestVideos, subDeltas }) {
  const visibleLanes = expandedCategory
    ? lanes.filter(g => g.key === expandedCategory)
    : lanes.filter(g => g.channelCount > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
      {visibleLanes.map(lane => (
        <CategoryLane
          key={lane.key}
          lane={lane}
          isExpanded={expandedCategory === lane.key}
          onChannelClick={onChannelClick}
          onExpand={() => onExpandCategory(expandedCategory === lane.key ? null : lane.key)}
          latestVideos={latestVideos}
          subDeltas={subDeltas}
        />
      ))}
    </div>
  );
}

function CategoryLane({ lane, isExpanded, onChannelClick, onExpand, latestVideos, subDeltas }) {
  const { config, subcategories } = lane;
  const hasSubcategories = subcategories.length > 1;

  const sortedChannels = useMemo(() =>
    [...lane.channels]
      .sort((a, b) => (b.subscriberCount || 0) - (a.subscriberCount || 0))
      .map((ch, i) => ({ ...ch, _rank: i + 1 })),
    [lane.channels]
  );

  const displayChannels = isExpanded ? sortedChannels : sortedChannels.slice(0, 12);

  return (
    <div className="page-section" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        onClick={onExpand}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a',
        }}
      >
        <span style={{ fontSize: '16px' }}>{config.icon}</span>
        <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>{config.label}</span>
        {hasSubcategories && (
          <span style={{ fontSize: '9px', color: '#888', background: '#2a2a2a', padding: '2px 6px', borderRadius: '4px' }}>
            {subcategories.length} groups
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: '#666' }}>{lane.channelCount} channels</span>
        <span style={{ fontSize: '10px', color: '#888', marginLeft: '4px' }}>{fmt(lane.totalSubs)} total subs</span>
        {isExpanded ? <ChevronDown size={14} style={{ color: '#666' }} /> : <ChevronRight size={14} style={{ color: '#666' }} />}
      </div>

      {!isExpanded && (
        <div style={{ display: 'flex', gap: '2px', padding: '8px', overflowX: 'auto', scrollbarWidth: 'thin' }}>
          {displayChannels.map(ch => (
            <ChannelCard key={ch.id} channel={ch} categoryColor={config.color} rank={ch._rank}
              latestVideo={latestVideos[ch.supabaseId] || null} subDelta={subDeltas[ch.supabaseId]}
              onClick={() => onChannelClick(ch.id)} />
          ))}
          {sortedChannels.length > 12 && (
            <div onClick={onExpand} style={{
              minWidth: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '12px', cursor: 'pointer', color: '#888', fontSize: '11px', background: '#1a1a1a', borderRadius: '8px',
            }}>
              +{sortedChannels.length - 12} more
            </div>
          )}
        </div>
      )}

      {isExpanded && hasSubcategories && (
        <div style={{ padding: '8px' }}>
          {subcategories.sort((a, b) => b.channels.length - a.channels.length).map(sub => (
            <div key={sub.key} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', marginBottom: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sub.color, flexShrink: 0 }} />
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#ccc' }}>{sub.label}</span>
                <span style={{ fontSize: '10px', color: '#666' }}>{sub.channels.length} channels</span>
                <span style={{ fontSize: '10px', color: '#555', marginLeft: 'auto' }}>
                  {fmt(sub.channels.reduce((s, c) => s + (c.subscriberCount || 0), 0))} subs
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '4px', paddingLeft: '16px' }}>
                {[...sub.channels].sort((a, b) => (b.subscriberCount || 0) - (a.subscriberCount || 0)).map((ch, i) => (
                  <ChannelCard key={ch.id} channel={ch} categoryColor={sub.color} rank={ch._rank || (i + 1)}
                    latestVideo={latestVideos[ch.supabaseId] || null} subDelta={subDeltas[ch.supabaseId]}
                    onClick={() => onChannelClick(ch.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {isExpanded && !hasSubcategories && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '4px', padding: '8px' }}>
          {sortedChannels.map(ch => (
            <ChannelCard key={ch.id} channel={ch} categoryColor={config.color} rank={ch._rank}
              latestVideo={latestVideos[ch.supabaseId] || null} subDelta={subDeltas[ch.supabaseId]}
              onClick={() => onChannelClick(ch.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ChannelCard ───────────────────────────────────────────────────────
function ChannelCard({ channel, categoryColor, onClick, rank, latestVideo, subDelta }) {
  const deltaVal = subDelta || 0;
  const deltaColor = deltaVal > 0 ? '#10b981' : deltaVal < 0 ? '#ef4444' : '#666';
  const deltaLabel = deltaVal > 0 ? `+${fmt(deltaVal)}` : deltaVal < 0 ? fmt(deltaVal) : '—';

  return (
    <div
      onClick={onClick}
      style={{
        minWidth: '220px', maxWidth: '280px', padding: '10px 12px',
        background: '#1a1a1a', borderRadius: '8px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0,
        transition: 'background 0.15s', borderLeft: `3px solid ${categoryColor}44`,
        opacity: latestVideo === null ? 0.6 : 1,
      }}
      onMouseOver={e => e.currentTarget.style.background = '#222'}
      onMouseOut={e => e.currentTarget.style.background = '#1a1a1a'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {rank && (
          <span style={{
            fontSize: '10px', fontWeight: '700', color: rank <= 3 ? '#f59e0b' : '#555',
            fontFamily: "'Barlow Condensed', sans-serif", minWidth: '18px',
          }}>
            #{rank}
          </span>
        )}
        <img src={channel.thumbnail} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {channel.name}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#ccc' }}>{fmt(channel.subscriberCount)}</div>
          <div style={{ fontSize: '9px', fontWeight: '600', color: deltaColor }}>{deltaLabel}</div>
        </div>
      </div>

      {latestVideo && (
        <div style={{ display: 'flex', gap: '8px' }}>
          {latestVideo.thumbnail_url ? (
            <img src={latestVideo.thumbnail_url} alt="" style={{ width: 72, height: 40, borderRadius: '4px', objectFit: 'cover', background: '#252525', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 72, height: 40, borderRadius: '4px', background: '#252525', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '9px', color: '#ccc', lineHeight: '1.3', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {latestVideo.title}
            </div>
            <div style={{ display: 'flex', gap: '6px', fontSize: '9px', color: '#888', marginTop: '2px' }}>
              <span>{fmt(latestVideo.view_count)} views</span>
              <span>{timeAgo(latestVideo.published_at)}</span>
            </div>
          </div>
        </div>
      )}

      {!latestVideo && (
        <div style={{ fontSize: '9px', color: '#555', fontStyle: 'italic', padding: '4px 0' }}>No recent uploads</div>
      )}
    </div>
  );
}

// ─── ActivityFeed ──────────────────────────────────────────────────────
function ActivityFeed({ activeCompetitors, categoryConfig }) {
  const [recentVideos, setRecentVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const channelIds = activeCompetitors.map(c => c.supabaseId).filter(Boolean);
    if (channelIds.length === 0) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { getRecentVideosByChannels } = await import('../../services/competitorDatabase');
        const videoMap = await getRecentVideosByChannels(channelIds, { days: 14 });
        if (cancelled) return;
        const channelLookup = {};
        activeCompetitors.forEach(c => { if (c.supabaseId) channelLookup[c.supabaseId] = c; });
        const allVideos = Object.entries(videoMap).flatMap(([channelId, videos]) => {
          const ch = channelLookup[channelId];
          const arr = Array.isArray(videos) ? videos : [videos];
          return arr.map(v => ({ ...v, channel: ch }));
        });
        allVideos.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
        setRecentVideos(allVideos.slice(0, 30));
        setLoaded(true);
      } catch (err) {
        console.error('[ActivityFeed] Failed to load:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activeCompetitors]);

  if (loading && !loaded) {
    return (
      <div className="page-section" style={{ padding: '32px', textAlign: 'center', marginBottom: '16px' }}>
        <Loader size={20} style={{ color: '#555', margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: '12px', color: '#888' }}>Loading recent uploads...</div>
      </div>
    );
  }

  if (recentVideos.length === 0) return null;

  // Filter to signal-only: videos performing >2x their channel's average
  const signalVideos = useMemo(() => {
    const chLookup = {};
    activeCompetitors.forEach(c => { if (c.supabaseId) chLookup[c.supabaseId] = c; });
    return recentVideos.filter(v => {
      const ch = v.channel || chLookup[v.channel_id];
      if (!ch) return true; // keep if we can't check
      const avg = ch.avgViewsPerVideo || 0;
      return avg === 0 || (v.view_count || 0) >= avg * 2;
    });
  }, [recentVideos, activeCompetitors]);

  const displayVideos = showAll ? recentVideos : (signalVideos.length > 0 ? signalVideos : recentVideos.slice(0, 6));

  return (
    <div className="page-section" style={{ padding: '16px 20px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Clock size={14} style={{ color: '#3b82f6' }} />
        <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>
          {showAll ? 'All Recent Uploads' : 'Notable Uploads'} (14 days)
        </span>
        <span style={{ fontSize: '10px', color: '#666', fontWeight: '400' }}>
          {displayVideos.length}{!showAll && signalVideos.length > 0 ? ` signal / ${recentVideos.length} total` : ' videos'}
        </span>
        <button
          onClick={() => setShowAll(!showAll)}
          style={{
            marginLeft: 'auto', fontSize: '10px', color: '#888',
            background: 'transparent', border: '1px solid #333',
            borderRadius: '4px', padding: '3px 8px', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#60a5fa'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#888'; }}
        >
          {showAll ? 'Signal Only' : 'View All'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
        {displayVideos.map((video, idx) => {
          const ch = video.channel;
          const catCfg = ch ? categoryConfig[ch.category] : null;
          return (
            <div key={video.id || idx} style={{ display: 'flex', gap: '10px', padding: '10px', background: '#1a1a1a', borderRadius: '8px' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {video.thumbnail_url ? (
                  <img src={video.thumbnail_url} alt="" style={{ width: 120, height: 68, borderRadius: '6px', objectFit: 'cover', background: '#252525' }} />
                ) : (
                  <div style={{ width: 120, height: 68, borderRadius: '6px', background: '#252525', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Play size={20} style={{ color: '#555' }} />
                  </div>
                )}
                {video.video_type === 'short' && (
                  <span style={{ position: 'absolute', top: 4, right: 4, background: '#f97316', color: '#fff', fontSize: '8px', fontWeight: '700', padding: '1px 5px', borderRadius: '3px' }}>SHORT</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#e0e0e0', lineHeight: '1.3', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {video.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: 'auto' }}>
                  {ch?.thumbnail && <img src={ch.thumbnail} alt="" style={{ width: 14, height: 14, borderRadius: '50%' }} />}
                  <span style={{ fontSize: '10px', color: catCfg?.color || '#888', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ch?.name || 'Unknown'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '10px', color: '#888' }}>
                  <span>{fmt(video.view_count)} views</span>
                  <span>{timeAgo(video.published_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Export ────────────────────────────────────────────────────────
export default function CompetitorPulse({
  activeCompetitors,
  groupedCompetitors,
  categoryConfig,
  expandedHubCategory,
  onExpandCategory,
  onChannelClick,
  yourStats = null,
}) {
  const [latestVideos, setLatestVideos] = useState({});
  const [subDeltas, setSubDeltas] = useState({});

  useEffect(() => {
    const channelIds = activeCompetitors.map(c => c.supabaseId).filter(Boolean);
    if (channelIds.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const { getRecentVideosByChannels } = await import('../../services/competitorDatabase');
        const videoMap = await getRecentVideosByChannels(channelIds, { days: 180 });
        if (!cancelled) setLatestVideos(videoMap);
      } catch (err) {
        console.error('[Pulse] Failed to load latest videos:', err);
      }

      try {
        const { supabase } = await import('../../services/supabaseClient');
        if (supabase) {
          const { data } = await supabase
            .from('channel_snapshots')
            .select('channel_id, subscriber_count, snapshot_date')
            .in('channel_id', channelIds)
            .order('snapshot_date', { ascending: false })
            .limit(channelIds.length * 2);

          if (!cancelled && data) {
            const deltas = {};
            const seen = {};
            data.forEach(snap => {
              if (!seen[snap.channel_id]) seen[snap.channel_id] = [];
              if (seen[snap.channel_id].length < 2) seen[snap.channel_id].push(snap);
            });
            Object.entries(seen).forEach(([chId, snaps]) => {
              if (snaps.length >= 2) {
                deltas[chId] = (snaps[0].subscriber_count || 0) - (snaps[1].subscriber_count || 0);
              }
            });
            setSubDeltas(deltas);
          }
        }
      } catch (err) {
        console.error('[Pulse] Failed to load deltas:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [activeCompetitors]);

  const parentLanes = useMemo(() => {
    try {
      const lanes = buildParentLanes(groupedCompetitors, categoryConfig);
      // Verify all lanes have string labels and icons
      lanes.forEach(lane => {
        if (lane.config && typeof lane.config.label !== 'string') {
          console.error('[Pulse] NON-STRING lane label:', lane.key, lane.config.label, typeof lane.config.label);
          lane.config.label = String(lane.config.label || lane.key || 'Unknown');
        }
        if (lane.config && typeof lane.config.icon !== 'string') {
          console.error('[Pulse] NON-STRING lane icon:', lane.key, lane.config.icon, typeof lane.config.icon);
          lane.config.icon = '📁';
        }
        (lane.subcategories || []).forEach(sub => {
          if (typeof sub.label !== 'string') {
            console.error('[Pulse] NON-STRING sub label:', sub.key, sub.label, typeof sub.label);
            sub.label = String(sub.label || sub.key || 'Unknown');
          }
        });
      });
      return lanes;
    } catch (e) {
      console.error('[Pulse] buildParentLanes crashed:', e);
      return [];
    }
  }, [groupedCompetitors, categoryConfig]);

  return (
    <>
      <div style={{ padding: '20px', color: '#888', fontSize: '12px' }}>
        Competitor Pulse: {activeCompetitors.length} competitors, {parentLanes.length} lanes, {Object.keys(latestVideos).length} videos loaded
      </div>
      <CategoryComparisonSelector
        lanes={parentLanes}
        onChannelClick={onChannelClick}
        onFilterChange={() => {}}
      />
      <CategoryLanes
        lanes={parentLanes}
        onChannelClick={onChannelClick}
        expandedCategory={expandedHubCategory}
        onExpandCategory={onExpandCategory}
        latestVideos={latestVideos}
        subDeltas={subDeltas}
      />
      <ActivityFeed activeCompetitors={activeCompetitors} categoryConfig={categoryConfig} />
    </>
  );
}
