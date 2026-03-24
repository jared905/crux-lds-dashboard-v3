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
      if (parentSlug && parentSlug !== g.key) {
        if (!childGroupsByParent[parentSlug]) childGroupsByParent[parentSlug] = [];
        childGroupsByParent[parentSlug].push(g);
        isChildSlug.add(g.key);
      }
      // If parentSlug not found, treat as standalone (don't mark as child)
    }
  });

  // Collect all parent slugs that have children (even if parent group doesn't exist in input)
  const parentSlugsWithChildren = new Set(Object.keys(childGroupsByParent));

  // Build parent lanes — merge children into parent
  // First, process groups that are present in the input
  const processedParents = new Set();

  groups.forEach(g => {
    if (isChildSlug.has(g.key)) return; // skip children, they're bundled

    processedParents.add(g.key);
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

    if (allChannels.length > 0) {
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
    }
  });

  // Second pass: create synthetic parent lanes for parents that weren't in groups
  // (parent has no direct channels, but children do)
  parentSlugsWithChildren.forEach(parentSlug => {
    if (processedParents.has(parentSlug)) return; // already handled

    const children = childGroupsByParent[parentSlug];
    const allChannels = [];
    const subcategories = [];

    children.forEach(child => {
      allChannels.push(...child.channels);
      if (child.channels.length > 0) {
        subcategories.push({
          key: child.key,
          label: categoryConfig[child.key]?.label || child.config.label,
          color: child.config.color,
          channels: child.channels,
        });
      }
    });

    if (allChannels.length === 0) return;

    // Build config from categoryConfig for the parent slug
    const parentCfg = categoryConfig[parentSlug] || {
      label: parentSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      color: '#6366f1', icon: '📁', order: 999, description: '',
    };

    parentGroups.push({
      key: parentSlug,
      config: parentCfg,
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
function CategoryComparisonStrip({ lanes, onChannelClick }) {
  const [metric, setMetric] = useState('totalSubs');
  const [expandedKey, setExpandedKey] = useState(null);
  const [selectedSubKey, setSelectedSubKey] = useState(null);

  const metrics = [
    { key: 'totalSubs', label: 'Total Subscribers', format: fmt },
    { key: 'totalViews', label: 'Total Views', format: fmt },
    { key: 'avgViews', label: 'Avg Views/Video', format: fmt },
    { key: 'totalUploads30d', label: 'Uploads (30d)', format: (n) => String(Math.round(n || 0)) },
  ];

  // Map metric keys to channel-level field names
  const channelMetricKey = {
    totalSubs: 'subscriberCount',
    totalViews: 'viewCount',
    avgViews: 'avgViewsPerVideo',
    totalUploads30d: 'uploadsLast30Days',
  };

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {lanes
          .filter(g => g.channelCount > 0)
          .sort((a, b) => (b[metric] || 0) - (a[metric] || 0))
          .map(g => {
            const val = g[metric] || 0;
            const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
            const isExpanded = expandedKey === g.key;
            const hasSubcats = g.subcategories && g.subcategories.length > 1;
            return (
              <div key={g.key}>
                {/* Parent bar — entire row is clickable */}
                <div
                  onClick={() => setExpandedKey(isExpanded ? null : g.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    cursor: 'pointer',
                    padding: '3px 4px',
                    borderRadius: '4px',
                    transition: 'background 0.1s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = '#252525'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: '140px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <ChevronRight size={10} style={{
                      color: isExpanded ? '#60a5fa' : '#666', flexShrink: 0,
                      transform: isExpanded ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.15s',
                    }} />
                    <span style={{ fontSize: '14px' }}>{g.config.icon}</span>
                    <span style={{
                      fontSize: '11px', fontWeight: '600',
                      color: isExpanded ? '#fff' : '#ccc',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {g.config.label}
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

                {/* Subcategory breakout bars */}
                {isExpanded && g.subcategories && g.subcategories.length > 0 && (
                  <div style={{ paddingLeft: '20px', marginTop: '2px', marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {g.subcategories
                      .map(sub => {
                        const chField = channelMetricKey[metric];
                        // For "total" metrics, sum channels. For "avg" metrics, average them.
                        const isAvg = metric === 'avgViews';
                        const subVal = isAvg
                          ? (sub.channels.length > 0
                            ? sub.channels.reduce((s, c) => s + (c[chField] || 0), 0) / sub.channels.length
                            : 0)
                          : sub.channels.reduce((s, c) => s + (c[chField] || 0), 0);
                        return { ...sub, metricVal: subVal };
                      })
                      .sort((a, b) => b.metricVal - a.metricVal)
                      .map(sub => {
                        const subPct = (sub.metricVal / Math.max(val, 1)) * 100;
                        const isSubSelected = selectedSubKey === sub.key;
                        return (
                          <div key={sub.key}>
                            <div
                              onClick={(e) => { e.stopPropagation(); setSelectedSubKey(isSubSelected ? null : sub.key); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                cursor: 'pointer', padding: '2px 4px', borderRadius: '4px',
                                background: isSubSelected ? `${sub.color}15` : 'transparent',
                                transition: 'background 0.1s',
                              }}
                              onMouseOver={e => { if (!isSubSelected) e.currentTarget.style.background = '#222'; }}
                              onMouseOut={e => { if (!isSubSelected) e.currentTarget.style.background = 'transparent'; }}
                            >
                              <div style={{
                                width: '110px', flexShrink: 0,
                                display: 'flex', alignItems: 'center', gap: '6px',
                              }}>
                                <ChevronRight size={8} style={{
                                  color: isSubSelected ? sub.color : '#555', flexShrink: 0,
                                  transform: isSubSelected ? 'rotate(90deg)' : 'none',
                                  transition: 'transform 0.15s',
                                }} />
                                <div style={{
                                  width: '6px', height: '6px', borderRadius: '50%',
                                  background: sub.color, flexShrink: 0,
                                }} />
                                <span style={{
                                  fontSize: '10px', color: isSubSelected ? '#fff' : '#999',
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                  fontWeight: isSubSelected ? '600' : '400',
                                }}>
                                  {sub.label}
                                </span>
                                <span style={{ fontSize: '9px', color: '#555' }}>({sub.channels.length})</span>
                              </div>
                              <div style={{ flex: 1, height: '14px', background: '#1e1e1e', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
                                <div style={{
                                  height: '100%', width: `${Math.max(subPct, 1)}%`,
                                  background: `${sub.color}99`,
                                  borderRadius: '3px',
                                  transition: 'width 0.3s ease',
                                }} />
                                <span style={{
                                  position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
                                  fontSize: '9px', fontWeight: '600', color: '#ccc',
                                  fontFamily: "'Barlow Condensed', sans-serif",
                                }}>
                                  {activeMetric.format(sub.metricVal)}
                                </span>
                              </div>
                            </div>

                            {/* Channel list for selected subcategory */}
                            {isSubSelected && (
                              <div style={{
                                marginLeft: '18px', marginTop: '4px', marginBottom: '8px',
                                background: '#1a1a1a', borderRadius: '6px',
                                border: `1px solid ${sub.color}33`,
                                overflow: 'hidden',
                              }}>
                                {[...sub.channels]
                                  .sort((a, b) => (b.subscriberCount || 0) - (a.subscriberCount || 0))
                                  .map(ch => (
                                    <div
                                      key={ch.id}
                                      onClick={(e) => { e.stopPropagation(); onChannelClick(ch.id); }}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '6px 10px',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #252525',
                                        transition: 'background 0.1s',
                                      }}
                                      onMouseOver={e => e.currentTarget.style.background = '#222'}
                                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                      <img
                                        src={ch.thumbnail}
                                        alt=""
                                        style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                      />
                                      <span style={{
                                        fontSize: '11px', color: '#e0e0e0', fontWeight: '500',
                                        flex: 1, minWidth: 0,
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                      }}>
                                        {ch.name}
                                      </span>
                                      <span style={{ fontSize: '10px', color: '#888', flexShrink: 0 }}>
                                        {fmt(ch.subscriberCount)} subs
                                      </span>
                                      <span style={{ fontSize: '10px', color: '#666', flexShrink: 0 }}>
                                        {fmt(ch.avgViewsPerVideo)} avg
                                      </span>
                                    </div>
                                  ))
                                }
                              </div>
                            )}
                          </div>
                        );
                      })
                    }
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

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

  // Sort all channels by subscriber count and compute ranks
  const sortedChannels = useMemo(() =>
    [...lane.channels]
      .sort((a, b) => (b.subscriberCount || 0) - (a.subscriberCount || 0))
      .map((ch, i) => ({ ...ch, _rank: i + 1 })),
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
              rank={ch._rank}
              latestVideo={latestVideos[ch.supabaseId] || null}
              subDelta={subDeltas[ch.supabaseId]}
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
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: '4px', paddingLeft: '16px',
                }}>
                  {[...sub.channels]
                    .sort((a, b) => (b.subscriberCount || 0) - (a.subscriberCount || 0))
                    .map((ch, i) => (
                      <ChannelCard
                        key={ch.id}
                        channel={ch}
                        categoryColor={sub.color}
                        rank={ch._rank || (i + 1)}
                        latestVideo={latestVideos[ch.supabaseId] || null}
                        subDelta={subDeltas[ch.supabaseId]}
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
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '4px', padding: '8px',
        }}>
          {sortedChannels.map(ch => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              categoryColor={config.color}
              rank={ch._rank}
              latestVideo={latestVideos[ch.supabaseId] || null}
              subDelta={subDeltas[ch.supabaseId]}
              onClick={() => onChannelClick(ch.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelCard({ channel, categoryColor, onClick, rank, latestVideo, subDelta }) {
  const deltaVal = subDelta || 0;
  const deltaColor = deltaVal > 0 ? '#10b981' : deltaVal < 0 ? '#ef4444' : '#666';
  const deltaLabel = deltaVal > 0 ? `+${fmt(deltaVal)}` : deltaVal < 0 ? fmt(deltaVal) : '—';

  return (
    <div
      onClick={onClick}
      style={{
        minWidth: '220px', maxWidth: '280px',
        padding: '10px 12px',
        background: '#1a1a1a',
        borderRadius: '8px',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: '6px',
        flexShrink: 0,
        transition: 'background 0.15s',
        borderLeft: `3px solid ${categoryColor}44`,
        opacity: latestVideo === null ? 0.6 : 1, // dim if no recent activity data
      }}
      onMouseOver={e => e.currentTarget.style.background = '#222'}
      onMouseOut={e => e.currentTarget.style.background = '#1a1a1a'}
    >
      {/* Row 1: Rank + Avatar + Name + Subs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {rank && (
          <span style={{
            fontSize: '10px', fontWeight: '700', color: rank <= 3 ? '#f59e0b' : '#555',
            fontFamily: "'Barlow Condensed', sans-serif",
            minWidth: '18px',
          }}>
            #{rank}
          </span>
        )}
        <img
          src={channel.thumbnail}
          alt=""
          style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '11px', fontWeight: '600', color: '#fff',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {channel.name}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#ccc' }}>{fmt(channel.subscriberCount)}</div>
          <div style={{ fontSize: '9px', fontWeight: '600', color: deltaColor }}>{deltaLabel}</div>
        </div>
      </div>

      {/* Row 2: Latest video thumbnail + info */}
      {latestVideo && (
        <div style={{ display: 'flex', gap: '8px' }}>
          {latestVideo.thumbnail_url ? (
            <img
              src={latestVideo.thumbnail_url}
              alt=""
              style={{ width: 72, height: 40, borderRadius: '4px', objectFit: 'cover', background: '#252525', flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 72, height: 40, borderRadius: '4px', background: '#252525', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{
              fontSize: '9px', color: '#ccc', lineHeight: '1.3',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {latestVideo.title}
            </div>
            <div style={{ display: 'flex', gap: '6px', fontSize: '9px', color: '#888', marginTop: '2px' }}>
              <span>{fmt(latestVideo.view_count)} views</span>
              <span>{timeAgo(latestVideo.published_at)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Row 2 fallback: no recent video */}
      {!latestVideo && (
        <div style={{ fontSize: '9px', color: '#555', fontStyle: 'italic', padding: '4px 0' }}>
          No recent uploads
        </div>
      )}
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
  // Fetch latest video per channel + subscriber deltas
  const [latestVideos, setLatestVideos] = useState({});   // supabaseId -> video
  const [subDeltas, setSubDeltas] = useState({});         // supabaseId -> delta number

  useEffect(() => {
    const channelIds = activeCompetitors.map(c => c.supabaseId).filter(Boolean);
    if (channelIds.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        // Fetch latest videos (look back 180 days so we can show "dormant" vs "active")
        const { getRecentVideosByChannels } = await import('../../services/competitorDatabase');
        const videoMap = await getRecentVideosByChannels(channelIds, { days: 180 });
        if (!cancelled) setLatestVideos(videoMap);
      } catch (err) {
        console.error('[Pulse] Failed to load latest videos:', err);
      }

      try {
        // Fetch latest 2 snapshots per channel to compute delta
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
            const seen = {}; // channel_id -> [newest, prev]
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

  // Bundle subcategory groups under their parent category
  const parentLanes = useMemo(
    () => buildParentLanes(groupedCompetitors, categoryConfig),
    [groupedCompetitors, categoryConfig]
  );

  return (
    <>
      <CategoryComparisonStrip lanes={parentLanes} onChannelClick={onChannelClick} />
      <CategoryLanes
        lanes={parentLanes}
        onChannelClick={onChannelClick}
        expandedCategory={expandedHubCategory}
        onExpandCategory={onExpandCategory}
        latestVideos={latestVideos}
        subDeltas={subDeltas}
      />
      <ActivityFeed
        activeCompetitors={activeCompetitors}
        categoryConfig={categoryConfig}
      />
    </>
  );
}
