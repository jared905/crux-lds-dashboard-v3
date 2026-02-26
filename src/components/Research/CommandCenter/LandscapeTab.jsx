import React, { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Minus, TrendingUp, LayoutGrid, List } from 'lucide-react';

const fmtInt = (n) => (!n || isNaN(n)) ? '0' : Math.round(n).toLocaleString();

/**
 * Mini sparkline rendered as inline SVG from snapshot data points.
 */
function Sparkline({ data, width = 60, height = 20 }) {
  if (!data || data.length < 2) return <span style={{ color: '#444', fontSize: '10px' }}>--</span>;

  const values = data.map(d => d.subscriber_count || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const trend = values[values.length - 1] > values[0];

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={trend ? '#10b981' : '#ef4444'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * LandscapeTab — Power Rankings table with pinned "Your Channel" row.
 */
export default function LandscapeTab({
  competitors, snapshots, recentVideos, categoryConfig,
  loading, onSelectChannel, yourStats, activeClient,
}) {
  const [sortKey, setSortKey] = useState('compositeScore');
  const [sortDir, setSortDir] = useState('desc');
  const [groupByCategory, setGroupByCategory] = useState(false);

  // Compute composite scores and deltas
  const ranked = useMemo(() => {
    return competitors.map(c => {
      const snaps = snapshots[c.supabaseId] || [];
      const latestVideo = recentVideos[c.supabaseId] || null;

      let subsDelta = 0;
      let growthPct = 0;
      if (snaps.length >= 2) {
        const oldest = snaps[0];
        const newest = snaps[snaps.length - 1];
        subsDelta = (newest.subscriber_count || 0) - (oldest.subscriber_count || 0);
        growthPct = oldest.subscriber_count > 0
          ? (subsDelta / oldest.subscriber_count) * 100 : 0;
      }

      const avgViews = c.avgViews || c.avg_views_per_video || 0;
      const subs = c.subscriber_count || 0;
      const uploadsLast30 = (c.shortsCount30d || 0) + (c.longsCount30d || 0);
      const engagement = c.engagement_rate || 0;

      return {
        ...c, subsDelta, growthPct, avgViews, uploadsLast30, engagement,
        latestVideo, snaps,
        categoryLabel: (categoryConfig[c.category] || {}).label || c.category || '',
        _rawSubs: subs, _rawGrowth: growthPct, _rawAvgViews: avgViews,
        _rawVelocity: uploadsLast30, _rawEngagement: engagement,
      };
    });
  }, [competitors, snapshots, recentVideos, categoryConfig]);

  // Normalize and compute composite scores
  const withScores = useMemo(() => {
    if (!ranked.length) return [];
    const maxSubs = Math.max(...ranked.map(c => c._rawSubs), 1);
    const maxGrowth = Math.max(...ranked.map(c => Math.abs(c._rawGrowth)), 0.1);
    const maxAvgViews = Math.max(...ranked.map(c => c._rawAvgViews), 1);
    const maxVelocity = Math.max(...ranked.map(c => c._rawVelocity), 1);
    const maxEngagement = Math.max(...ranked.map(c => c._rawEngagement), 0.001);

    return ranked.map(c => ({
      ...c,
      compositeScore: (
        (c._rawSubs / maxSubs) * 30 +
        (Math.max(0, c._rawGrowth) / maxGrowth) * 25 +
        (c._rawAvgViews / maxAvgViews) * 25 +
        (c._rawVelocity / maxVelocity) * 10 +
        (c._rawEngagement / maxEngagement) * 10
      ),
    }));
  }, [ranked]);

  // Sort
  const sorted = useMemo(() => {
    const list = [...withScores];
    list.sort((a, b) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [withScores, sortKey, sortDir]);

  // Group by category
  const grouped = useMemo(() => {
    if (!groupByCategory) return null;
    const groups = {};
    sorted.forEach(c => {
      const cat = c.category || 'uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    });
    return groups;
  }, [sorted, groupByCategory]);

  // Compute your channel's rank
  const yourRank = useMemo(() => {
    if (!yourStats) return null;
    const clientSubs = yourStats.subscribers || activeClient?.subscriber_count || 0;
    const allSorted = [...withScores].sort((a, b) => (b.subscriber_count || 0) - (a.subscriber_count || 0));
    const rank = allSorted.findIndex(c => (c.subscriber_count || 0) <= clientSubs) + 1;
    return rank > 0 ? rank : allSorted.length + 1;
  }, [yourStats, activeClient, withScores]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ label, field, width, align }) => (
    <th
      onClick={() => handleSort(field)}
      style={{
        padding: '10px 12px', textAlign: align || 'left', cursor: 'pointer',
        fontSize: '10px', fontWeight: '700', textTransform: 'uppercase',
        letterSpacing: '0.5px', color: sortKey === field ? '#fff' : '#888',
        width, whiteSpace: 'nowrap', userSelect: 'none', borderBottom: '1px solid #333',
      }}
    >
      {label}
      {sortKey === field && (
        <span style={{ marginLeft: '4px', fontSize: '8px' }}>
          {sortDir === 'desc' ? '\u25BC' : '\u25B2'}
        </span>
      )}
    </th>
  );

  const renderRow = (c, rank, isYou = false) => {
    const catCfg = categoryConfig[c.category] || {};
    const deltaColor = c.subsDelta > 0 ? '#10b981' : c.subsDelta < 0 ? '#ef4444' : '#666';
    const DeltaIcon = c.subsDelta > 0 ? ArrowUp : c.subsDelta < 0 ? ArrowDown : Minus;

    return (
      <tr
        key={isYou ? 'your-channel' : (c.supabaseId || c.id)}
        onClick={() => !isYou && onSelectChannel && onSelectChannel(c.supabaseId || c.id)}
        style={{
          cursor: isYou ? 'default' : 'pointer',
          borderBottom: isYou ? '2px solid var(--accent, #3b82f6)40' : '1px solid #2A2A2A',
          background: isYou ? 'rgba(59,130,246,0.06)' : 'transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (!isYou) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
        onMouseLeave={e => { if (!isYou) e.currentTarget.style.background = 'transparent'; else e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; }}
      >
        {/* Rank */}
        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
          <span style={{
            fontSize: '14px', fontWeight: '700',
            color: isYou ? 'var(--accent, #3b82f6)' : rank <= 3 ? '#fbbf24' : '#888',
            fontFamily: "'Barlow Condensed', sans-serif",
          }}>
            {isYou ? `#${rank}` : rank}
          </span>
        </td>

        {/* Channel */}
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {c.thumbnail_url ? (
              <img src={c.thumbnail_url} alt=""
                style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
                  border: isYou ? '2px solid var(--accent, #3b82f6)' : 'none' }} />
            ) : (
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#333', flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '13px', fontWeight: '600',
                color: isYou ? 'var(--accent, #3b82f6)' : '#fff',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px',
              }}>
                {isYou ? `${c.name || 'You'} (You)` : c.name || 'Unknown'}
              </div>
            </div>
          </div>
        </td>

        {/* Category */}
        <td style={{ padding: '10px 12px' }}>
          {catCfg.label ? (
            <span style={{
              fontSize: '10px', fontWeight: '600', color: catCfg.color || '#888',
              background: (catCfg.color || '#888') + '15',
              padding: '2px 8px', borderRadius: '4px', display: 'inline-block', whiteSpace: 'nowrap',
            }}>
              {catCfg.icon ? `${catCfg.icon} ` : ''}{catCfg.label}
            </span>
          ) : (
            <span style={{ fontSize: '10px', color: '#555' }}>{isYou ? 'Client' : '--'}</span>
          )}
        </td>

        {/* Subscribers */}
        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: isYou ? 'var(--accent, #3b82f6)' : '#fff', fontFamily: "'Barlow Condensed', sans-serif" }}>
            {fmtInt(c.subscriber_count)}
          </div>
          {!isYou && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
              <DeltaIcon size={10} color={deltaColor} />
              <span style={{ fontSize: '10px', color: deltaColor, fontWeight: '600' }}>
                {c.subsDelta > 0 ? '+' : ''}{fmtInt(c.subsDelta)}
              </span>
            </div>
          )}
        </td>

        {/* Momentum sparkline */}
        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
          {isYou ? <span style={{ fontSize: '10px', color: '#555' }}>--</span> : <Sparkline data={c.snaps} />}
        </td>

        {/* Avg Views */}
        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#ccc', fontFamily: "'Barlow Condensed', sans-serif" }}>
            {isYou ? (yourStats?.avgViews ? fmtInt(yourStats.avgViews) : '--') : fmtInt(c.avgViews)}
          </span>
        </td>

        {/* Latest Move */}
        <td style={{ padding: '10px 12px', maxWidth: '220px' }}>
          {isYou ? (
            <span style={{ fontSize: '11px', color: '#555' }}>--</span>
          ) : c.latestVideo ? (
            <div>
              <div style={{
                fontSize: '11px', color: '#ccc',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px',
              }}>
                {c.latestVideo.title}
              </div>
              <div style={{ fontSize: '10px', color: '#888' }}>{fmtInt(c.latestVideo.view_count)} views</div>
            </div>
          ) : (
            <span style={{ fontSize: '11px', color: '#555' }}>No recent uploads</span>
          )}
        </td>

        {/* Frequency */}
        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#ccc', fontFamily: "'Barlow Condensed', sans-serif" }}>
            {isYou ? '--' : (c.uploadsLast30 || '--')}
          </span>
        </td>
      </tr>
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px', color: '#888' }}>
        <TrendingUp size={24} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
        <div style={{ fontSize: '13px' }}>Computing power rankings...</div>
      </div>
    );
  }

  if (!competitors.length) {
    return (
      <div style={{ textAlign: 'center', padding: '48px', color: '#888' }}>
        <div style={{ fontSize: '13px' }}>Add competitors to see power rankings</div>
      </div>
    );
  }

  // Build "Your Channel" pseudo-row
  const yourRow = (yourStats || activeClient) ? {
    name: activeClient?.name || 'Your Channel',
    thumbnail_url: activeClient?.thumbnail_url,
    subscriber_count: yourStats?.subscribers || activeClient?.subscriber_count || 0,
    category: null,
    subsDelta: 0,
    avgViews: 0,
    uploadsLast30: 0,
    snaps: [],
    latestVideo: null,
  } : null;

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', color: '#888' }}>
          {sorted.length} channels ranked by composite score
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setGroupByCategory(false)}
            style={{
              padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
              border: `1px solid ${!groupByCategory ? '#3b82f6' : '#444'}`,
              background: !groupByCategory ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: !groupByCategory ? '#3b82f6' : '#888',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <List size={12} /> Ranked
          </button>
          <button
            onClick={() => setGroupByCategory(true)}
            style={{
              padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
              border: `1px solid ${groupByCategory ? '#3b82f6' : '#444'}`,
              background: groupByCategory ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: groupByCategory ? '#3b82f6' : '#888',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <LayoutGrid size={12} /> By Category
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortHeader label="#" field="compositeScore" width="40px" align="center" />
              <SortHeader label="Channel" field="name" width="200px" />
              <SortHeader label="Category" field="categoryLabel" width="120px" />
              <SortHeader label="Subscribers" field="subscriber_count" width="120px" align="right" />
              <th style={{
                padding: '10px 12px', textAlign: 'center',
                fontSize: '10px', fontWeight: '700', textTransform: 'uppercase',
                letterSpacing: '0.5px', color: '#888', width: '80px',
                borderBottom: '1px solid #333',
              }}>
                Momentum
              </th>
              <SortHeader label="Avg Views" field="avgViews" width="100px" align="right" />
              <th style={{
                padding: '10px 12px', textAlign: 'left',
                fontSize: '10px', fontWeight: '700', textTransform: 'uppercase',
                letterSpacing: '0.5px', color: '#888', width: '220px',
                borderBottom: '1px solid #333',
              }}>
                Latest Move
              </th>
              <SortHeader label="30d Uploads" field="uploadsLast30" width="80px" align="center" />
            </tr>
          </thead>
          <tbody>
            {/* Pinned "Your Channel" row */}
            {yourRow && !groupByCategory && renderRow(yourRow, yourRank || '--', true)}

            {groupByCategory && grouped ? (
              Object.entries(grouped).map(([cat, channels]) => {
                const catCfg = categoryConfig[cat] || {};
                return (
                  <React.Fragment key={cat}>
                    <tr>
                      <td colSpan={8} style={{
                        padding: '12px 12px 6px',
                        fontSize: '11px', fontWeight: '700', textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: catCfg.color || '#888',
                        borderBottom: `1px solid ${(catCfg.color || '#888') + '40'}`,
                      }}>
                        {catCfg.icon || ''} {catCfg.label || cat} ({channels.length})
                      </td>
                    </tr>
                    {channels.map((c, i) => renderRow(c, i + 1))}
                  </React.Fragment>
                );
              })
            ) : (
              sorted.map((c, i) => renderRow(c, i + 1))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
