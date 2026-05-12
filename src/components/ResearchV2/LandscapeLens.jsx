/**
 * Landscape lens — the master channel table.
 * Inline category norms, sortable columns, click-row → drawer.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Loader } from 'lucide-react';
import {
  fetchLandscapeChannels,
  computeCategoryNorms,
  computeNormDelta,
} from '../../services/researchV2Service.js';
import ChannelDrawer from './ChannelDrawer.jsx';

const SORTS = {
  velocity: { label: 'View velocity', get: c => c.viewVelocity ?? -1 },
  medianViews: { label: 'Median views', get: c => c.medianViews ?? -1 },
  subs: { label: 'Subscribers', get: c => c.subscriberCount ?? -1 },
  deltaSubs: { label: 'Δ Subs', get: c => c.deltaSubs ?? -Infinity },
  engagement: { label: 'Engagement', get: c => c.engagementRate ?? -1 },
  cadence: { label: 'Cadence', get: c => c.uploadsPerWeek ?? -1 },
  lastUpload: { label: 'Last upload', get: c => c.lastUpload ? new Date(c.lastUpload).getTime() : 0 },
};

export default function LandscapeLens({ scope, refreshKey = 0 }) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('velocity');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(new Set());
  const [openChannel, setOpenChannel] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLandscapeChannels(scope)
      .then(data => { if (!cancelled) { setChannels(data); setLoading(false); } })
      .catch(err => { console.error('[Landscape] fetch failed:', err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [
    scope.categoryIds?.join(','),
    scope.tags?.join(','),
    scope.tiers?.join(','),
    scope.search,
    scope.windowDays,
    refreshKey,
  ]);

  const norms = useMemo(() => computeCategoryNorms(channels), [channels]);

  const sorted = useMemo(() => {
    const get = SORTS[sortKey]?.get;
    if (!get) return channels;
    const arr = [...channels].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av === bv) return 0;
      return sortDir === 'desc' ? (bv - av) : (av - bv);
    });
    return arr;
  }, [channels, sortKey, sortDir]);

  const toggleSelected = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#666' }}>
        <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <div style={{ marginTop: '8px', fontSize: '12px' }}>Loading channels…</div>
      </div>
    );
  }

  if (!channels.length) {
    return (
      <EmptyState scope={scope} />
    );
  }

  return (
    <>
      <div style={{
        background: '#131316',
        border: '1px solid #1f1f24',
        borderRadius: '10px',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
          <thead style={{ background: '#16161a' }}>
            <tr>
              <Th width="32px" />
              <Th width="240px">Channel</Th>
              <Th width="130px">Category</Th>
              <Th align="right" width="80px">Subs</Th>
              <Th align="right" width="100px" sortKey="deltaSubs" current={sortKey} dir={sortDir} onSort={handleSort}>Δ Subs</Th>
              <Th align="right" width="110px" sortKey="velocity" current={sortKey} dir={sortDir} onSort={handleSort}>View velocity</Th>
              <Th align="right" width="110px" sortKey="medianViews" current={sortKey} dir={sortDir} onSort={handleSort}>Median views</Th>
              <Th align="right" width="90px" sortKey="engagement" current={sortKey} dir={sortDir} onSort={handleSort}>Engagement</Th>
              <Th width="110px">Format mix</Th>
              <Th width="80px" sortKey="cadence" current={sortKey} dir={sortDir} onSort={handleSort}>Cadence</Th>
              <Th width="80px" sortKey="lastUpload" current={sortKey} dir={sortDir} onSort={handleSort}>Last↑</Th>
              <Th width="24px" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(ch => (
              <Row
                key={ch.id}
                channel={ch}
                norms={norms}
                selected={selected.has(ch.id)}
                onSelect={() => toggleSelected(ch.id)}
                onOpen={() => setOpenChannel(ch)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', marginTop: '14px',
          background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: '8px',
        }}>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '13px' }}>
            {selected.size} selected
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <TinyBtn primary>Compare</TinyBtn>
            <TinyBtn>Tag</TinyBtn>
            <TinyBtn>Tier</TinyBtn>
            <TinyBtn>Archive</TinyBtn>
            <TinyBtn onClick={() => setSelected(new Set())}>Clear</TinyBtn>
          </div>
        </div>
      )}

      <div style={{ padding: '14px 4px', color: '#888', fontSize: '12px' }}>
        Showing {sorted.length} channel{sorted.length !== 1 ? 's' : ''} in scope
      </div>

      {openChannel && (
        <ChannelDrawer channel={openChannel} norms={norms} onClose={() => setOpenChannel(null)} />
      )}
    </>
  );
}

// ───────────────────────────────────────────
// Row
// ───────────────────────────────────────────
function Row({ channel, norms, selected, onSelect, onOpen }) {
  // Find best matching category for norm comparison (first one with norms)
  const primaryCategory = channel.categories.find(c => norms[c.id]);
  const norm = primaryCategory ? norms[primaryCategory.id] : null;

  return (
    <tr
      onClick={onOpen}
      style={{
        borderBottom: '1px solid #1c1c20',
        cursor: 'pointer',
        background: selected ? 'rgba(59,130,246,0.05)' : 'transparent',
      }}
      onMouseEnter={e => e.currentTarget.style.background = selected ? 'rgba(59,130,246,0.08)' : '#16161a'}
      onMouseLeave={e => e.currentTarget.style.background = selected ? 'rgba(59,130,246,0.05)' : 'transparent'}
    >
      <Td>
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          onClick={e => e.stopPropagation()}
        />
      </Td>
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Avatar name={channel.name} thumbnail={channel.thumbnail} />
          <div>
            <div style={{ fontWeight: 600, color: '#fff' }}>{channel.name}</div>
            {channel.handle && <div style={{ fontSize: '11px', color: '#666' }}>{channel.handle}</div>}
          </div>
        </div>
      </Td>
      <Td>
        {channel.categories.length === 0 ? (
          <span style={{
            fontSize: '11px', color: '#555', fontStyle: 'italic',
          }}>Uncategorized</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {channel.categories.map(c => (
              <CategoryTag key={c.id} category={c} />
            ))}
          </div>
        )}
      </Td>
      <Td align="right">{formatNumber(channel.subscriberCount)}</Td>
      <Td align="right">
        {channel.deltaSubs != null
          ? <span style={{ color: channel.deltaSubs > 0 ? '#34d399' : channel.deltaSubs < 0 ? '#f87171' : '#888', fontWeight: 600 }}>
              {channel.deltaSubs > 0 ? '+' : ''}{formatNumber(channel.deltaSubs)}
            </span>
          : <span style={{ color: '#555' }}>—</span>
        }
      </Td>
      <Td align="right">
        <MetricCell value={channel.viewVelocity} norm={norm?.viewVelocity} normName={primaryCategory?.name} suffix=" /day" />
      </Td>
      <Td align="right">
        <MetricCell value={channel.medianViews} norm={norm?.medianViews} normName={primaryCategory?.name} />
      </Td>
      <Td align="right">
        <MetricCell value={channel.engagementRate} norm={norm?.engagementRate} normName={primaryCategory?.name} format="percent" />
      </Td>
      <Td>
        {channel.formatMix && (
          <FormatBar mix={channel.formatMix} />
        )}
      </Td>
      <Td>
        <span style={{ color: '#888' }}>
          {channel.uploadsPerWeek > 1
            ? `${channel.uploadsPerWeek.toFixed(1)}/wk`
            : channel.uploadsPerWeek > 0
              ? `${(channel.uploadsPerWeek * 7 / 30).toFixed(1)}/mo`
              : '—'}
        </span>
      </Td>
      <Td>
        <span style={{ color: '#888', fontSize: '12px' }}>
          {formatLastUpload(channel.lastUpload)}
        </span>
      </Td>
      <Td><span style={{ color: '#555' }}>›</span></Td>
    </tr>
  );
}

// ───────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────
function Th({ children, width, align = 'left', sortKey, current, dir, onSort }) {
  const sortable = !!sortKey;
  const isActive = sortKey === current;
  return (
    <th
      onClick={sortable ? () => onSort(sortKey) : undefined}
      style={{
        width, textAlign: align,
        padding: '11px 14px',
        fontSize: '10px', fontWeight: 700, color: isActive ? '#fff' : '#707070',
        letterSpacing: '0.7px', textTransform: 'uppercase',
        borderBottom: '1px solid #1f1f24',
        cursor: sortable ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        {children}
        {isActive && (dir === 'desc' ? <ChevronDown size={11} /> : <ChevronUp size={11} />)}
      </span>
    </th>
  );
}

function Td({ children, align = 'left' }) {
  return (
    <td style={{
      padding: '13px 14px',
      textAlign: align,
      verticalAlign: 'middle',
      color: '#d4d4d4',
      fontVariantNumeric: 'tabular-nums',
    }}>{children}</td>
  );
}

function MetricCell({ value, norm, normName, suffix = '', format = 'number' }) {
  if (value == null) return <span style={{ color: '#555' }}>—</span>;
  const delta = norm != null ? computeNormDelta(value, norm) : null;
  const display = format === 'percent'
    ? `${(value * 100).toFixed(1)}%`
    : `${formatNumber(value)}${suffix}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
      <span style={{ color: '#fff', fontWeight: 600 }}>{display}</span>
      {delta && (
        <span style={{
          fontSize: '10px',
          fontWeight: delta.direction === 'flat' ? 400 : 600,
          color: delta.direction === 'pos' ? '#34d399' : delta.direction === 'neg' ? '#f87171' : '#707070',
        }}>
          {delta.direction === 'pos' && '▲ '}
          {delta.direction === 'neg' && '▼ '}
          {delta.direction === 'flat' ? '— at avg' : `${Math.abs(delta.pct).toFixed(0)}% vs ${shortName(normName)}`}
        </span>
      )}
    </div>
  );
}

function FormatBar({ mix }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: '1px', width: '60px', height: '8px', borderRadius: '2px', overflow: 'hidden', background: '#1c1c20', marginRight: '6px' }}>
        <div style={{ width: `${mix.long * 100}%`, background: '#0ea5e9' }} />
        <div style={{ width: `${mix.short * 100}%`, background: '#f97316' }} />
      </div>
      <span style={{ fontSize: '10px', color: '#888' }}>
        {Math.round(mix.long * 100)}% / {Math.round(mix.short * 100)}%
      </span>
    </div>
  );
}

function Avatar({ name, thumbnail, size = 28 }) {
  const initials = (name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const hue = Math.abs(hash(name)) % 360;
  const base = {
    width: size, height: size, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: Math.max(10, Math.floor(size * 0.4)),
    fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden',
    background: `linear-gradient(135deg, hsl(${hue},65%,45%), hsl(${(hue + 40) % 360},65%,55%))`,
  };
  if (thumbnail) {
    return (
      <div style={base}>
        <img
          src={thumbnail}
          alt=""
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }
  return <div style={base}>{initials}</div>;
}

function CategoryTag({ category }) {
  const hue = Math.abs(hash(category.name)) % 360;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
      fontSize: '11px', fontWeight: 500,
      background: `hsla(${hue}, 60%, 50%, 0.1)`,
      color: `hsl(${hue}, 70%, 70%)`,
      border: `1px solid hsla(${hue}, 60%, 50%, 0.25)`,
    }}>{category.name}</span>
  );
}

function TinyBtn({ children, primary, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 11px', borderRadius: '5px', fontSize: '12px', fontWeight: 600,
        background: primary ? '#2563eb' : 'transparent',
        color: primary ? '#fff' : '#d4d4d8',
        border: primary ? 'none' : '1px solid #3b82f6',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >{children}</button>
  );
}

function EmptyState({ scope }) {
  const hasFilters = scope.categoryIds?.length || scope.tags?.length;
  return (
    <div style={{ padding: '80px 20px', textAlign: 'center', color: '#888', background: '#131316', border: '1px solid #1f1f24', borderRadius: '10px' }}>
      <div style={{ fontSize: '16px', color: '#fff', marginBottom: '8px' }}>
        {hasFilters ? 'No channels match this scope' : 'No competitor channels yet'}
      </div>
      <div style={{ fontSize: '13px', color: '#666', maxWidth: '360px', margin: '0 auto', lineHeight: 1.6 }}>
        {hasFilters
          ? 'Try removing a filter, expanding the window, or including more tiers.'
          : 'Add competitor channels via the Manage page to start populating Research.'}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────
// formatters
// ───────────────────────────────────────────
function formatNumber(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return Math.round(n).toLocaleString();
}
function formatLastUpload(iso) {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return 'Today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}yr ago`;
}
function shortName(name) {
  if (!name) return '';
  if (name.length <= 12) return name;
  return name.slice(0, 12) + '…';
}
function hash(s) {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return h;
}
