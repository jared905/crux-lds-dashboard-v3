/**
 * Channel profile drawer — slides over the Landscape table.
 * 480px wide, portaled to body to escape parent stacking contexts.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Loader } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { computeNormDelta } from '../../services/researchV2Service.js';

export default function ChannelDrawer({ channel, norms, onClose }) {
  const [recentVideos, setRecentVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!channel?.id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('videos')
        .select('id, youtube_video_id, title, thumbnail_url, view_count, like_count, comment_count, published_at, duration_seconds')
        .eq('channel_id', channel.id)
        .order('view_count', { ascending: false })
        .limit(5);
      if (!cancelled) { setRecentVideos(data || []); setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [channel?.id]);

  // Escape closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const primaryCategory = channel.categories.find(c => norms[c.id]);
  const norm = primaryCategory ? norms[primaryCategory.id] : null;

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 9999, display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div style={{
        width: '480px',
        height: '100vh',
        background: '#131316',
        borderLeft: '1px solid #2a2a30',
        overflowY: 'auto',
        boxShadow: '-16px 0 40px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #1f1f24', position: 'sticky', top: 0, background: '#131316', zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ◀ Close
            </button>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
            <BigAvatar name={channel.name} />
            <div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                {channel.name}
              </div>
              {channel.handle && <div style={{ color: '#666', fontSize: '13px' }}>{channel.handle}</div>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <TierBadge tier={channel.tier} />
            {channel.categories.map(c => (
              <CategoryChip key={c.id} category={c} />
            ))}
            {channel.tags.map(t => (
              <span key={t} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#1c1c20', border: '1px solid #2a2a30', color: '#aaa' }}>{t}</span>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px 60px' }}>
          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
            <StatBlock label="Subscribers" value={formatNumber(channel.subscriberCount)} />
            <StatBlock label="Δ Subs (window)" value={channel.deltaSubs != null ? `${channel.deltaSubs >= 0 ? '+' : ''}${formatNumber(channel.deltaSubs)}` : '—'} positive={channel.deltaSubs > 0} negative={channel.deltaSubs < 0} />
            <StatBlock label="Videos in window" value={channel.videosInWindow} />
          </div>

          {/* Performance metrics with norms */}
          <SectionTitle>Performance in window</SectionTitle>
          <MetricRow label="View velocity" value={channel.viewVelocity != null ? `${formatNumber(channel.viewVelocity)} /day` : '—'} delta={norm ? computeNormDelta(channel.viewVelocity, norm.viewVelocity) : null} normName={primaryCategory?.name} />
          <MetricRow label="Median views" value={channel.medianViews != null ? formatNumber(channel.medianViews) : '—'} delta={norm ? computeNormDelta(channel.medianViews, norm.medianViews) : null} normName={primaryCategory?.name} />
          <MetricRow label="Engagement rate" value={channel.engagementRate != null ? `${(channel.engagementRate * 100).toFixed(1)}%` : '—'} delta={norm ? computeNormDelta(channel.engagementRate, norm.engagementRate) : null} normName={primaryCategory?.name} />
          <MetricRow label="Uploads / week" value={channel.uploadsPerWeek > 0 ? channel.uploadsPerWeek.toFixed(1) : '—'} />
          <MetricRow label="Format mix"
            value={channel.formatMix
              ? `${Math.round(channel.formatMix.long * 100)}% long / ${Math.round(channel.formatMix.short * 100)}% short`
              : '—'} />
          <MetricRow label="Last upload" value={formatLastUpload(channel.lastUpload)} />

          {/* Top videos */}
          <SectionTitle style={{ marginTop: '22px' }}>Top videos (window)</SectionTitle>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              <Loader size={16} />
            </div>
          ) : recentVideos.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '12px' }}>
              No videos in window
            </div>
          ) : recentVideos.map(v => <VideoRow key={v.id} video={v} />)}

          {/* Footer actions */}
          <div style={{ marginTop: '22px', paddingTop: '16px', borderTop: '1px solid #1f1f24', display: 'flex', gap: '8px' }}>
            <a
              href={`https://youtube.com/channel/${channel.youtubeChannelId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '7px 14px', borderRadius: '6px',
                background: '#2563eb', color: '#fff', textDecoration: 'none',
                fontSize: '13px', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: '6px',
              }}
            >
              <ExternalLink size={13} /> Open on YouTube
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ───────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────
function SectionTitle({ children, style }) {
  return (
    <div style={{
      fontSize: '11px', fontWeight: 700, letterSpacing: '1.2px',
      color: '#555', textTransform: 'uppercase', margin: '0 0 12px',
      ...(style || {}),
    }}>{children}</div>
  );
}

function StatBlock({ label, value, positive, negative }) {
  return (
    <div style={{ background: '#1a1a1f', border: '1px solid #1f1f24', borderRadius: '8px', padding: '10px 12px' }}>
      <div style={{ fontSize: '10px', color: '#666', fontWeight: 600, letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: positive ? '#34d399' : negative ? '#f87171' : '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function MetricRow({ label, value, delta, normName }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #1c1c20', fontSize: '13px' }}>
      <span style={{ color: '#aaa' }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <div style={{ color: '#fff', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {delta && (
          <div style={{
            fontSize: '10px',
            color: delta.direction === 'pos' ? '#34d399' : delta.direction === 'neg' ? '#f87171' : '#707070',
            fontWeight: delta.direction === 'flat' ? 400 : 600,
          }}>
            {delta.direction === 'pos' && '▲ '}
            {delta.direction === 'neg' && '▼ '}
            {delta.direction === 'flat' ? '— at avg' : `${Math.abs(delta.pct).toFixed(0)}% vs ${normName}`}
          </div>
        )}
      </div>
    </div>
  );
}

function VideoRow({ video }) {
  const thumb = video.thumbnail_url || `https://i.ytimg.com/vi/${video.youtube_video_id}/mqdefault.jpg`;
  const url = `https://youtu.be/${video.youtube_video_id}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #1c1c20', textDecoration: 'none' }}>
      <img src={thumb} alt="" style={{ width: '56px', height: '32px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', color: '#fff', lineHeight: 1.35, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {video.title}
        </div>
        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
          {formatNumber(video.view_count)} views · {video.like_count?.toLocaleString() || 0} likes
        </div>
      </div>
    </a>
  );
}

function BigAvatar({ name }) {
  const initials = (name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const h = hash(name) % 360;
  return (
    <div style={{
      width: 52, height: 52, borderRadius: '12px',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 18, fontWeight: 700, color: '#fff',
      background: `linear-gradient(135deg, hsl(${h},65%,45%), hsl(${(h + 40) % 360},65%,55%))`,
    }}>{initials}</div>
  );
}

function CategoryChip({ category }) {
  const h = hash(category.name) % 360;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
      fontSize: '11px', fontWeight: 500,
      background: `hsla(${h}, 60%, 50%, 0.1)`,
      color: `hsl(${h}, 70%, 70%)`,
      border: `1px solid hsla(${h}, 60%, 50%, 0.25)`,
    }}>{category.name}</span>
  );
}

function TierBadge({ tier }) {
  const config = {
    priority: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.3)', label: '⭐ PRIORITY' },
    tracked:  { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'rgba(100,116,139,0.3)', label: 'TRACKED' },
    archive:  { bg: 'rgba(100,116,139,0.08)', color: '#64748b', border: 'rgba(100,116,139,0.2)', label: 'ARCHIVE' },
  }[tier] || { bg: '#1c1c20', color: '#888', border: '#2a2a30', label: tier?.toUpperCase() || 'TRACKED' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '4px',
      fontSize: '11px', fontWeight: 600, letterSpacing: '0.3px',
      background: config.bg, color: config.color, border: `1px solid ${config.border}`,
    }}>{config.label}</span>
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
function hash(s) {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
}
