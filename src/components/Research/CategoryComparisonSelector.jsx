/**
 * CategoryComparisonSelector — Shared bar-chart category navigator
 *
 * Used across Pulse, Trends, and Leaderboard views.
 * Shows horizontal bars per parent category, click to expand subcategories,
 * click subcategory to see channels, click channel to open drawer.
 *
 * Props:
 *   lanes           — parent lane objects from buildParentLanes()
 *   onFilterChange  — ({ parentSlug, subSlug }) called when selection changes
 *   onChannelClick  — (channelId) called when a channel row is clicked
 *   metric          — optional default metric key
 */
import React, { useState, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';

const fmt = (n) => {
  if (!n || isNaN(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return Math.round(n).toLocaleString();
};

// ─── Shared hierarchy builders ─────────────────────────────────────────

export function buildCategoryHierarchy(categoryConfig) {
  const idToSlug = {};
  Object.entries(categoryConfig).forEach(([slug, cfg]) => {
    if (cfg.id) idToSlug[cfg.id] = slug;
  });
  const childToParent = {};
  Object.entries(categoryConfig).forEach(([slug, cfg]) => {
    if (cfg.parentId) {
      const parentSlug = idToSlug[cfg.parentId];
      if (parentSlug && parentSlug !== slug) childToParent[slug] = parentSlug;
    }
  });
  const parents = [];
  const childrenByParent = {};
  Object.entries(categoryConfig).forEach(([slug]) => {
    if (childToParent[slug]) {
      const ps = childToParent[slug];
      if (!childrenByParent[ps]) childrenByParent[ps] = [];
      childrenByParent[ps].push(slug);
    } else {
      parents.push(slug);
    }
  });
  return { parents, childrenByParent, childToParent };
}

export function buildParentLanes(groups, categoryConfig) {
  const idToSlug = {};
  Object.entries(categoryConfig).forEach(([slug, cfg]) => {
    if (cfg.id) idToSlug[cfg.id] = slug;
  });

  const childGroupsByParent = {};
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
    }
  });

  const parentSlugsWithChildren = new Set(Object.keys(childGroupsByParent));
  const parentGroups = [];
  const processedParents = new Set();

  groups.forEach(g => {
    if (isChildSlug.has(g.key)) return;
    processedParents.add(g.key);
    const children = childGroupsByParent[g.key] || [];
    const allChannels = [...g.channels];
    children.forEach(child => allChannels.push(...child.channels));

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
        key: g.key, config: g.config, channels: allChannels, subcategories,
        channelCount: allChannels.length,
        totalSubs: allChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0),
        totalViews: allChannels.reduce((s, c) => s + (c.viewCount || 0), 0),
        avgViews: allChannels.length > 0 ? allChannels.reduce((s, c) => s + (c.avgViewsPerVideo || 0), 0) / allChannels.length : 0,
        totalUploads30d: allChannels.reduce((s, c) => s + (c.uploadsLast30Days || 0), 0),
        hasData: allChannels.some(c => (c.subscriberCount || 0) > 0 || (c.viewCount || 0) > 0),
      });
    }
  });

  parentSlugsWithChildren.forEach(parentSlug => {
    if (processedParents.has(parentSlug)) return;
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
    const parentCfg = categoryConfig[parentSlug] || {
      label: parentSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      color: '#6366f1', icon: '📁', order: 999, description: '',
    };
    parentGroups.push({
      key: parentSlug, config: parentCfg, channels: allChannels, subcategories,
      channelCount: allChannels.length,
      totalSubs: allChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0),
      totalViews: allChannels.reduce((s, c) => s + (c.viewCount || 0), 0),
      avgViews: allChannels.length > 0 ? allChannels.reduce((s, c) => s + (c.avgViewsPerVideo || 0), 0) / allChannels.length : 0,
      totalUploads30d: allChannels.reduce((s, c) => s + (c.uploadsLast30Days || 0), 0),
      hasData: allChannels.some(c => (c.subscriberCount || 0) > 0 || (c.viewCount || 0) > 0),
    });
  });

  return parentGroups.sort((a, b) => (a.config.order || 0) - (b.config.order || 0));
}

// ─── CategoryComparisonSelector Component ──────────────────────────────

export default function CategoryComparisonSelector({
  lanes,
  onFilterChange,
  onChannelClick,
  defaultMetric = 'totalSubs',
  yourStats = null,
}) {
  const [metric, setMetric] = useState(defaultMetric);
  const [expandedKey, setExpandedKey] = useState(null);
  const [selectedSubKey, setSelectedSubKey] = useState(null);

  const metrics = [
    { key: 'totalSubs', label: 'Total Subscribers', format: fmt },
    { key: 'totalViews', label: 'Total Views', format: fmt },
    { key: 'avgViews', label: 'Avg Views/Video', format: fmt },
    { key: 'totalUploads30d', label: 'Uploads (30d)', format: (n) => String(Math.round(n || 0)) },
  ];

  const channelMetricKey = {
    totalSubs: 'subscriberCount',
    totalViews: 'viewCount',
    avgViews: 'avgViewsPerVideo',
    totalUploads30d: 'uploadsLast30Days',
  };

  const activeMetric = metrics.find(m => m.key === metric);
  const maxVal = Math.max(...lanes.map(g => g[metric] || 0), 1);

  // Your channel's value for the current metric (for position marker)
  const yourMetricValue = yourStats ? {
    totalSubs: yourStats.totalSubscribers || 0,
    totalViews: yourStats.totalViews || 0,
    avgViews: yourStats.avgViewsPerVideo || 0,
    totalUploads30d: yourStats.videosLast30Days || 0,
  }[metric] || 0 : 0;
  const yourPct = maxVal > 0 ? (yourMetricValue / maxVal) * 100 : 0;

  const handleCategoryClick = (gKey) => {
    const isExpanding = expandedKey !== gKey;
    setExpandedKey(isExpanding ? gKey : null);
    setSelectedSubKey(null);
    onFilterChange?.({ parentSlug: isExpanding ? gKey : null, subSlug: null });
  };

  const handleSubClick = (subKey, parentKey) => {
    const isSelecting = selectedSubKey !== subKey;
    setSelectedSubKey(isSelecting ? subKey : null);
    onFilterChange?.({
      parentSlug: parentKey,
      subSlug: isSelecting ? subKey : null,
    });
  };

  const handleAllClick = () => {
    setExpandedKey(null);
    setSelectedSubKey(null);
    onFilterChange?.({ parentSlug: null, subSlug: null });
  };

  return (
    <div className="page-section" style={{ padding: '16px 20px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>Category Comparison</div>
          {expandedKey && (
            <button
              onClick={handleAllClick}
              style={{
                padding: '3px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                border: '1px solid #444', background: 'transparent', color: '#888', cursor: 'pointer',
              }}
            >
              Show All
            </button>
          )}
        </div>
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
            return (
              <div key={g.key}>
                {/* Parent bar */}
                <div
                  onClick={() => handleCategoryClick(g.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    cursor: 'pointer', padding: '3px 4px', borderRadius: '4px',
                    transition: 'background 0.1s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = '#252525'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ width: '140px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                  <div style={{ flex: 1, height: '22px', background: '#252525', borderRadius: '4px', overflow: 'visible', position: 'relative' }}>
                    <div style={{
                      height: '100%', width: `${Math.max(pct, 1)}%`,
                      background: `linear-gradient(90deg, ${g.config.color}cc, ${g.config.color}88)`,
                      borderRadius: '4px', transition: 'width 0.4s ease',
                    }} />
                    {/* Your position marker */}
                    {yourStats && yourPct > 0 && (
                      <div
                        title={`Your channel: ${activeMetric.format(yourMetricValue)}`}
                        style={{
                          position: 'absolute',
                          left: `${Math.min(Math.max(yourPct, 1), 99)}%`,
                          top: '-3px', bottom: '-3px',
                          width: '3px', background: '#3b82f6',
                          borderRadius: '2px',
                          boxShadow: '0 0 6px rgba(59,130,246,0.6)',
                          zIndex: 2,
                          transition: 'left 0.4s ease',
                        }}
                      />
                    )}
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
                        const isAvg = metric === 'avgViews';
                        const subVal = isAvg
                          ? (sub.channels.length > 0 ? sub.channels.reduce((s, c) => s + (c[chField] || 0), 0) / sub.channels.length : 0)
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
                              onClick={(e) => { e.stopPropagation(); handleSubClick(sub.key, g.key); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                cursor: 'pointer', padding: '2px 4px', borderRadius: '4px',
                                background: isSubSelected ? `${sub.color}15` : 'transparent',
                                transition: 'background 0.1s',
                              }}
                              onMouseOver={e => { if (!isSubSelected) e.currentTarget.style.background = '#222'; }}
                              onMouseOut={e => { if (!isSubSelected) e.currentTarget.style.background = isSubSelected ? `${sub.color}15` : 'transparent'; }}
                            >
                              <div style={{ width: '120px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ChevronRight size={8} style={{
                                  color: isSubSelected ? sub.color : '#555', flexShrink: 0,
                                  transform: isSubSelected ? 'rotate(90deg)' : 'none',
                                  transition: 'transform 0.15s',
                                }} />
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: sub.color, flexShrink: 0 }} />
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
                                  background: `${sub.color}99`, borderRadius: '3px', transition: 'width 0.3s ease',
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

                            {/* Channel list */}
                            {isSubSelected && onChannelClick && (() => {
                              const sortedChs = [...sub.channels].sort((a, b) => (b.subscriberCount || 0) - (a.subscriberCount || 0));
                              const maxSubs = sortedChs[0]?.subscriberCount || 1;
                              return (
                                <div style={{
                                  marginLeft: '18px', marginTop: '4px', marginBottom: '8px',
                                  background: '#1a1a1a', borderRadius: '6px',
                                  border: `1px solid ${sub.color}33`, overflow: 'hidden',
                                }}>
                                  {sortedChs.map((ch, idx) => {
                                    const barPct = maxSubs > 0 ? ((ch.subscriberCount || 0) / maxSubs) * 100 : 0;
                                    return (
                                      <div
                                        key={ch.id}
                                        onClick={(e) => { e.stopPropagation(); onChannelClick(ch.id); }}
                                        style={{
                                          display: 'flex', alignItems: 'center', gap: '8px',
                                          padding: '8px 10px', cursor: 'pointer',
                                          borderBottom: '1px solid #252525', transition: 'background 0.1s',
                                          borderLeft: `3px solid ${sub.color}${idx < 3 ? 'cc' : '44'}`,
                                          position: 'relative',
                                        }}
                                        onMouseOver={e => e.currentTarget.style.background = '#222'}
                                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                      >
                                        {/* Background bar */}
                                        <div style={{
                                          position: 'absolute', left: 0, top: 0, bottom: 0,
                                          width: `${Math.max(barPct, 2)}%`,
                                          background: `linear-gradient(90deg, ${sub.color}40, ${sub.color}15)`,
                                          transition: 'width 0.3s ease',
                                        }} />
                                        <span style={{
                                          fontSize: '10px', fontWeight: '700', minWidth: '18px',
                                          color: idx < 3 ? '#f59e0b' : '#555',
                                          fontFamily: "'Barlow Condensed', sans-serif",
                                          position: 'relative',
                                        }}>
                                          #{idx + 1}
                                        </span>
                                        <img src={ch.thumbnail} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, position: 'relative' }} />
                                        <span style={{
                                          fontSize: '11px', color: '#e0e0e0', fontWeight: '500',
                                          flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                          position: 'relative',
                                        }}>
                                          {ch.name}
                                        </span>
                                        <span style={{ fontSize: '10px', color: sub.color, fontWeight: '600', flexShrink: 0, position: 'relative' }}>
                                          {fmt(ch.subscriberCount)}
                                        </span>
                                        <span style={{ fontSize: '9px', color: '#666', flexShrink: 0, position: 'relative' }}>
                                          {fmt(ch.avgViewsPerVideo)} avg
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
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
