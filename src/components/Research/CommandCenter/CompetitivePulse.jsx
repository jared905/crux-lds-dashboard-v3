import { useMemo } from 'react';
import { TrendingUp, Zap, Shield, Crown, Loader } from 'lucide-react';

const fmtInt = (n) => (!n || isNaN(n)) ? '0' : Math.round(n).toLocaleString();
const fmtPct = (n) => (!n || isNaN(n)) ? '0%' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

/**
 * CompetitivePulse — Static hero insight cards. No rotation, no animation gimmicks.
 * All 4 cards visible at once. Zero API cost.
 */
export default function CompetitivePulse({
  activeCompetitors, snapshots, outliers, yourStats, activeClient,
  onSelectChannel, loading,
}) {
  const cards = useMemo(() => {
    if (!activeCompetitors.length) return [];
    const items = [];

    // --- Momentum Leader: biggest 30d subscriber growth % ---
    const withGrowth = activeCompetitors.map(c => {
      const snaps = snapshots[c.supabaseId] || [];
      if (snaps.length < 2) return { ...c, growthPct: 0, subsDelta: 0 };
      const oldest = snaps[0];
      const newest = snaps[snaps.length - 1];
      const delta = (newest.subscriber_count || 0) - (oldest.subscriber_count || 0);
      const pct = oldest.subscriber_count > 0 ? (delta / oldest.subscriber_count) * 100 : 0;
      return { ...c, growthPct: pct, subsDelta: delta };
    }).filter(c => c.growthPct > 0);

    if (withGrowth.length > 0) {
      const leader = withGrowth.sort((a, b) => b.growthPct - a.growthPct)[0];
      items.push({
        key: 'momentum',
        label: 'Momentum Leader',
        icon: Crown,
        color: '#fbbf24',
        channel: leader,
        value: fmtPct(leader.growthPct),
        detail: `+${fmtInt(leader.subsDelta)} subscribers in 30 days`,
        channelId: leader.supabaseId,
      });
    }

    // --- Breakout Signal: highest outlier score ---
    if (outliers && outliers.length > 0) {
      const top = [...outliers].sort((a, b) => (b.outlierScore || 0) - (a.outlierScore || 0))[0];
      items.push({
        key: 'breakout',
        label: 'Breakout Signal',
        icon: Zap,
        color: '#ef4444',
        channel: top.channel,
        value: `${top.outlierScore}x avg`,
        detail: top.title,
        subDetail: `${fmtInt(top.view_count)} views \u00B7 ${top.channel?.name || 'Unknown'}`,
        channelId: top.channel_id,
      });
    }

    // --- Rising Threat: most consecutive growth snapshots ---
    const withStreaks = activeCompetitors.map(c => {
      const snaps = snapshots[c.supabaseId] || [];
      if (snaps.length < 3) return { ...c, streak: 0 };
      let streak = 0;
      for (let i = snaps.length - 1; i > 0; i--) {
        if ((snaps[i].subscriber_count || 0) > (snaps[i - 1].subscriber_count || 0)) {
          streak++;
        } else break;
      }
      return { ...c, streak };
    }).filter(c => c.streak >= 3);

    if (withStreaks.length > 0) {
      const threat = withStreaks.sort((a, b) => {
        if (b.streak !== a.streak) return b.streak - a.streak;
        const aSnaps = snapshots[a.supabaseId] || [];
        const bSnaps = snapshots[b.supabaseId] || [];
        const aGrowth = aSnaps.length >= 2 ? (aSnaps[aSnaps.length - 1].subscriber_count - aSnaps[0].subscriber_count) : 0;
        const bGrowth = bSnaps.length >= 2 ? (bSnaps[bSnaps.length - 1].subscriber_count - bSnaps[0].subscriber_count) : 0;
        return bGrowth - aGrowth;
      })[0];

      if (!items.find(i => i.key === 'momentum' && i.channelId === threat.supabaseId)) {
        items.push({
          key: 'threat',
          label: 'Rising Threat',
          icon: TrendingUp,
          color: '#f97316',
          channel: threat,
          value: `${threat.streak}-day streak`,
          detail: `Consecutive growth across ${threat.streak} snapshots`,
          channelId: threat.supabaseId,
        });
      }
    }

    // --- Your Position ---
    if (yourStats) {
      const sorted = [...activeCompetitors].sort((a, b) =>
        (b.subscriber_count || 0) - (a.subscriber_count || 0)
      );
      const clientSubs = yourStats.subscribers || activeClient?.subscriber_count || 0;
      const rank = sorted.findIndex(c => (c.subscriber_count || 0) <= clientSubs) + 1;
      const displayRank = rank > 0 ? rank : sorted.length + 1;
      const leader = sorted[0];
      const gap = leader ? (leader.subscriber_count || 0) - clientSubs : 0;

      items.push({
        key: 'position',
        label: 'Your Position',
        icon: Shield,
        color: '#3b82f6',
        value: `#${displayRank} of ${sorted.length + 1}`,
        detail: gap > 0 ? `${fmtInt(gap)} subscribers behind ${leader?.name || '#1'}` : 'Leading the pack',
        channelId: null,
      });
    }

    return items;
  }, [activeCompetitors, snapshots, outliers, yourStats, activeClient]);

  if (loading) {
    return (
      <div className="animate-in" style={{
        background: '#1E1E1E', border: '1px solid #2A2A2A', borderRadius: '8px',
        padding: '24px', marginBottom: '12px', textAlign: 'center', color: '#888',
      }}>
        <Loader size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
        <div style={{ fontSize: '12px' }}>Computing competitive pulse...</div>
      </div>
    );
  }

  if (cards.length === 0) return null;

  return (
    <div className="animate-in" style={{ marginBottom: '12px' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(cards.length, 4)}, 1fr)`,
        gap: '10px',
      }}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              onClick={() => {
                if (card.channelId && onSelectChannel) onSelectChannel(card.channelId);
              }}
              style={{
                background: '#1E1E1E',
                border: `1px solid ${card.color}30`,
                borderLeft: `3px solid ${card.color}`,
                borderRadius: '8px',
                padding: '16px',
                cursor: card.channelId ? 'pointer' : 'default',
                textAlign: 'left',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                if (card.channelId) e.currentTarget.style.background = '#252525';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#1E1E1E';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '6px',
                  background: card.color + '20',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={14} color={card.color} />
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: '700', textTransform: 'uppercase',
                  letterSpacing: '0.5px', color: card.color,
                }}>
                  {card.label}
                </span>
              </div>

              {card.channel && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  {card.channel.thumbnail_url && (
                    <img
                      src={card.channel.thumbnail_url}
                      alt=""
                      style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  )}
                  <span style={{ fontSize: '12px', color: '#ccc', fontWeight: '500' }}>
                    {card.channel.name || 'Unknown'}
                  </span>
                </div>
              )}

              <div style={{
                fontSize: '22px', fontWeight: '700', color: '#fff',
                fontFamily: "'Barlow Condensed', sans-serif", marginBottom: '4px',
              }}>
                {card.value}
              </div>

              <div style={{ fontSize: '11px', color: '#999', lineHeight: '1.4' }}>
                {card.detail}
              </div>
              {card.subDetail && (
                <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                  {card.subDetail}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
