/**
 * CompetitorPulse — Redesigned master/default view for Competitor Analysis
 *
 * Replaces the old CategoryHubCards + HubDrilldown with:
 * 1. CategoryComparisonStrip — side-by-side bar charts comparing categories
 * 2. CategoryLanes — Netflix-style horizontal rows showing channels per parent category
 *    with subcategory grouping when expanded
 * 3. ActivityFeed — recent uploads with thumbnails across all competitors
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Users, Eye, Video, Play, Clock, ChevronRight, ChevronDown, Loader } from 'lucide-react';

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

// ─── Build parent-level lanes from flat groups ─────────────────────────
// Groups subcategory groups under their parent using categoryConfig.parentId
function buildParentLanes(groups, categoryConfig) {
  // Build a lookup: slug -> parentId (from categoryConfig which has parentId from DB)
  // Also build id -> slug lookup
  const idToSlug = {};
  Object.entries(categoryConfig).forEach(([slug, cfg]) => {
    if (cfg.id) idToSlug[cfg.id] = slug;
  });

  // Determine which groups are children and which are parents/standalone
  const childGroupsByParent = {}; // parentSlug -> [childGroups]
  const parentGroups = [];        // groups that are top-level
  const isChildSlug = new Set();

  groups.forEach(g => {
    const cfg = categoryConfig[g.key];
    if (cfg?.parentId) {
      const parentSlug = idToSlug[cfg.parentId];
      if (parentSlug) {
        if (!childGroupsByParent[parentSlug]) childGroupsByParent[parentSlug] = [];
        childGroupsByParent[parentSlug].push(g);
        isChildSlug.add(g.key);
      }
    }
  });

  // Build parent lanes — merge children into parent
  groups.forEach(g => {
    if (isChildSlug.has(g.key)) return; // skip children, they're bundled

    const children = childGroupsByParent[g.key] || [];
    const allChannels = [...g.channels];
    children.forEach(child => allChannels.push(...child.channels));

    // Build subcategory breakdown
    const subcategories = [];
    if (g.channels.length > 0) {
      subcategories.push({
        key: g.key,
        label: categoryConfig[g.key]?.label || g.config.label,
        color: g.config.color,
        channels: g.channels,
      });
    }
    children.forEach(child => {
      if (child.channels.length > 0) {
        subcategories.push({
          key: child.key,
          label: categoryConfig[child.key]?.label || child.config.label,
          color: child.config.color,
          channels: child.channels,
        });
      }
    });

    parentGroups.push({
      key: g.key,
      config: g.config,
      channels: allChannels,
      subcategories,
      channelCount: allChannels.length,
      totalSubs: allChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0),
      totalViews: allChannels.reduce((s, c) => s + (c.viewCount || 0), 0),
      avgViews: allChannels.length > 0
        ? allChannels.reduce((s, c) => s + (c.avgViewsPerVideo || 0), 0) / allChannels.length
        : 0,
      totalUploads30d: allChannels.reduce((s, c) => s + (c.uploadsLast30Days || 0), 0),
      hasData: allChannels.some(c => (c.subscriberCount || 0) > 0 || (c.viewCount || 0) > 0),
    });
  });

  return parentGroups.sort((a, b) => (a.config.order || 0) - (b.config.order || 0));
}

// ─── CategoryComparisonStrip ───────────────────────────────────────────
function CategoryComparisonStrip({ lanes }) {
  const [metric, setMetric] = useState('totalSubs');

  const metrics = [
    { key: 'totalSubs', label: 'Total Subscribers', format: fmt },
    { key: 'totalViews', label: 'Total Views', format: fmt },
    { key: 'avgViews', label: 'Avg Views/Video', format: fmt },
    { key: 'totalUploads30d', label: 'Uploads (30d)', format: (n) => String(Math.round(n || 0)) },
  ];

  const activeMetric = metrics.find(m => m.key === metric);
  const maxVal = Math.max(...lanes.map(g => g[metric] || 0), 1);

  return (
    <div className="page-section" style={{ padding: '16px 20px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>Category Comparison</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {metrics.map(m => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                border: `1px solid ${metric === m.key ? '#3b82f6' : '#444'}`,
                background: metric === m.key ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: metric === m.key ? '#60a5fa' : '#888',
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {lanes
          .filter(g => g.channelCount > 0 && g.hasData)
          .sort((a, b) => (b[metric] || 0) - (a[metric] || 0))
          .map(g => {
            const val = g[metric] || 0;
            const pct = (val / maxVal) * 100;
            return (
              <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '130px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <span style={{ fontSize: '14px' }}>{g.config.icon}</span>
                  <span style={{
                    fontSize: '11px', fontWeight: '600', color: '#ccc',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {g.config.label.split(' ')[0]}
                  </span>
                  <span style={{ fontSize: '10px', color: '#666' }}>({g.channelCount})</span>
                </div>
                <div style={{ flex: 1, height: '22px', background: '#252525', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    height: '100%', width: `${Math.max(pct, 1)}%`,
                    background: `linear-gradient(90deg, ${g.config.color}cc, ${g.config.color}88)`,
                    borderRadius: '4px',
                    transition: 'width 0.4s ease',
                  }} />
                  <span style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    fontSize: '11px', fontWeight: '700', color: '#fff',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                  }}>
                    {activeMetric.format(val)}
                  </span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ─── CategoryLanes ─────────────────────────────────────────────────────
function CategoryLanes({ lanes, onChannelClick, expandedCategory, onExpandCategory }) {
  const visibleLanes = expandedCategory
    ? lanes.filter(g => g.key === expandedCategory)
    : lanes.filter(g => g.channelCount > 0 && g.hasData);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
      {visibleLanes.map(lane => (
        <CategoryLane
          key={lane.key}
          lane={lane}
          isExpanded={expandedCategory === lane.key}
          onChannelClick={onChannelClick}
          onExpand={() => onExpandCategory(expandedCategory === lane.key ? null : lane.key)}
        />
      ))}
    </div>
  );
}

function CategoryLane({ lane, isExpanded, onChannelClick, onExpand }) {
  const { config, subcategories } = lane;
  const hasSubcategories = subcategories.length > 1;

  // Sort all channels by subscriber count for collapsed view
  const sortedChannels = useMemo(() =>
    [...lane.channels].sort((a, b) => (b.subscriberCount || 0) - (a.subscriberCount || 0)),
    [lane.channels]
  );

  const displayChannels = isExpanded ? sortedChannels : sortedChannels.slice(0, 12);

  return (
    <div className="page-section" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Lane header */}
      <div
        onClick={onExpand}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px',
          cursor: 'pointer',
          borderBottom: '1px solid #2a2a2a',
        }}
      >
        <span style={{ fontSize: '16px' }}>{config.icon}</span>
        <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>
          {config.label}
        </span>
        {/* Subcategory count badge */}
        {hasSubcategories && (
          <span style={{
            fontSize: '9px', color: '#888', background: '#2a2a2a',
            padding: '2px 6px', borderRadius: '4px',
          }}>
            {subcategories.length} groups
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: '#666' }}>
          {lane.channelCount} channels
        </span>
        <span style={{ fontSize: '10px', color: '#888', marginLeft: '4px' }}>
          {fmt(lane.totalSubs)} total subs
        </span>
        {isExpanded ? (
          <ChevronDown size={14} style={{ color: '#666' }} />
        ) : (
          <ChevronRight size={14} style={{ color: '#666' }} />
        )}
      </div>

      {/* Collapsed: horizontal scroll of all channels mixed */}
      {!isExpanded && (
        <div style={{
          display: 'flex', gap: '2px', padding: '8px',
          overflowX: 'auto', scrollbarWidth: 'thin',
        }}>
          {displayChannels.map(ch => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              categoryColor={config.color}
              subcategoryLabel={hasSubcategories ? ch.category : null}
              categoryConfig={null}
              onClick={() => onChannelClick(ch.id)}
            />
          ))}
          {sortedChannels.length > 12 && (
            <div
              onClick={onExpand}
              style={{
                minWidth: '80px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '12px', cursor: 'pointer', color: '#888', fontSize: '11px',
                background: '#1a1a1a', borderRadius: '8px',
              }}
            >
              +{sortedChannels.length - 12} more
            </div>
          )}
        </div>
      )}

      {/* Expanded: grouped by subcategory */}
      {isExpanded && hasSubcategories && (
        <div style={{ padding: '8px' }}>
          {subcategories
            .sort((a, b) => b.channels.length - a.channels.length)
            .map(sub => (
              <div key={sub.key} style={{ marginBottom: '12px' }}>
                {/* Subcategory header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 8px', marginBottom: '6px',
                }}>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: sub.color, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#ccc' }}>
                    {sub.label}
                  </span>
                  <span style={{ fontSize: '10px', color: '#666' }}>
                    {sub.channels.length} channels
                  </span>
                  <span style={{ fontSize: '10px', color: '#555', marginLeft: 'auto' }}>
                    {fmt(sub.channels.reduce((s, c) => s + (c.subscriberCount || 0), 0))} subs
                  </span>
                </div>
                {/* Subcategory channels grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '4px', paddingLeft: '16px',
                }}>
                  {[...sub.channels]
                    .sort((a, b) => (b.subscriberCount || 0) - (a.subscriberCount || 0))
                    .map(ch => (
                      <ChannelCard
                        key={ch.id}
                        channel={ch}
                        categoryColor={sub.color}
                        onClick={() => onChannelClick(ch.id)}
                      />
                    ))
                  }
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* Expanded with no subcategories: just grid all channels */}
      {isExpanded && !hasSubcategories && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '4px', padding: '8px',
        }}>
          {sortedChannels.map(ch => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              categoryColor={config.color}
              onClick={() => onChannelClick(ch.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelCard({ channel, categoryColor, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        minWidth: '160px', maxWidth: '200px',
        padding: '10px 12px',
        background: '#1a1a1a',
        borderRadius: '8px',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: '6px',
        flexShrink: 0,
        transition: 'background 0.15s',
        borderLeft: `3px solid ${categoryColor}33`,
      }}
      onMouseOver={e => e.currentTarget.style.background = '#222'}
      onMouseOut={e => e.currentTarget.style.background = '#1a1a1a'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img
          src={channel.thumbnail}
          alt=""
          style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '11px', fontWeight: '600', color: '#fff',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {channel.name}
          </div>
          {channel.subcategory && (
            <div style={{ fontSize: '9px', color: '#666', marginTop: '1px' }}>
              {channel.subcategory}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#999' }}>
        <span style={{ fontWeight: '600', color: '#ccc' }}>{fmt(channel.subscriberCount)}</span>
        <span>subs</span>
      </div>
      <div style={{ display: 'flex', gap: '10px', fontSize: '9px', color: '#666' }}>
        <span>{fmt(channel.avgViewsPerVideo)} avg</span>
        <span>{channel.uploadsLast30Days || 0}/mo</span>
      </div>
    </div>
  );
}

// ─── ActivityFeed ──────────────────────────────────────────────────────
function ActivityFeed({ activeCompetitors, categoryConfig }) {
  const [recentVideos, setRecentVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

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

        // Flatten map and attach channel info
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

  return (
    <div className="page-section" style={{ padding: '16px 20px', marginBottom: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Clock size={14} style={{ color: '#3b82f6' }} />
        Recent Uploads (14 days)
        <span style={{ fontSize: '10px', color: '#666', fontWeight: '400' }}>{recentVideos.length} videos</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '10px',
      }}>
        {recentVideos.map((video, idx) => {
          const ch = video.channel;
          const catCfg = ch ? categoryConfig[ch.category] : null;
          return (
            <div
              key={video.id || idx}
              style={{
                display: 'flex', gap: '10px',
                padding: '10px',
                background: '#1a1a1a',
                borderRadius: '8px',
                cursor: 'default',
              }}
            >
              {/* Thumbnail */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {video.thumbnail_url ? (
                  <img
                    src={video.thumbnail_url}
                    alt=""
                    style={{ width: 120, height: 68, borderRadius: '6px', objectFit: 'cover', background: '#252525' }}
                  />
                ) : (
                  <div style={{ width: 120, height: 68, borderRadius: '6px', background: '#252525', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Play size={20} style={{ color: '#555' }} />
                  </div>
                )}
                {video.video_type === 'short' && (
                  <span style={{
                    position: 'absolute', top: 4, right: 4,
                    background: '#f97316', color: '#fff',
                    fontSize: '8px', fontWeight: '700', padding: '1px 5px', borderRadius: '3px',
                  }}>
                    SHORT
                  </span>
                )}
              </div>

              {/* Details */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: '600', color: '#e0e0e0',
                  lineHeight: '1.3',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {video.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: 'auto' }}>
                  {ch?.thumbnail && (
                    <img src={ch.thumbnail} alt="" style={{ width: 14, height: 14, borderRadius: '50%' }} />
                  )}
                  <span style={{
                    fontSize: '10px', color: catCfg?.color || '#888', fontWeight: '500',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
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
}) {
  // Bundle subcategory groups under their parent category
  const parentLanes = useMemo(
    () => buildParentLanes(groupedCompetitors, categoryConfig),
    [groupedCompetitors, categoryConfig]
  );

  return (
    <>
      <CategoryComparisonStrip lanes={parentLanes} />
      <CategoryLanes
        lanes={parentLanes}
        onChannelClick={onChannelClick}
        expandedCategory={expandedHubCategory}
        onExpandCategory={onExpandCategory}
      />
      <ActivityFeed
        activeCompetitors={activeCompetitors}
        categoryConfig={categoryConfig}
      />
    </>
  );
}
