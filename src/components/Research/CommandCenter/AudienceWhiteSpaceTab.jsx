import { useMemo, useState, useEffect } from 'react';
import { Loader, Target, BarChart3, Layers } from 'lucide-react';

const fmtInt = (n) => (!n || isNaN(n)) ? '0' : Math.round(n).toLocaleString();

/**
 * Extract keywords from video titles for topic clustering.
 */
function extractTopics(videos) {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'about',
    'and', 'but', 'or', 'nor', 'not', 'no', 'so', 'if', 'than', 'too',
    'very', 'just', 'this', 'that', 'these', 'those', 'it', 'its',
    'my', 'your', 'his', 'her', 'our', 'their', 'what', 'which', 'who',
    'how', 'why', 'when', 'where', 'all', 'each', 'every', 'both',
    'i', 'me', 'you', 'he', 'she', 'we', 'they', 'them', 'us',
    'up', 'out', 'off', 'over', 'down', 'after', 'before',
    'new', 'first', 'last', 'long', 'great', 'get', 'got', 'one',
    'video', 'watch', 'subscribe', 'like', 'part', 'episode', 'ep',
  ]);

  const topicMap = {};

  videos.forEach(v => {
    if (!v.title) return;
    // Extract 2-3 word phrases and single meaningful words
    const words = v.title.toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    // Single words
    words.forEach(word => {
      if (!topicMap[word]) topicMap[word] = { count: 0, totalViews: 0, videos: [] };
      topicMap[word].count++;
      topicMap[word].totalViews += v.view_count || 0;
      topicMap[word].videos.push(v);
    });

    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (!topicMap[bigram]) topicMap[bigram] = { count: 0, totalViews: 0, videos: [] };
      topicMap[bigram].count++;
      topicMap[bigram].totalViews += v.view_count || 0;
      topicMap[bigram].videos.push(v);
    }
  });

  return Object.entries(topicMap)
    .filter(([, v]) => v.count >= 3) // Minimum 3 appearances
    .map(([topic, data]) => ({
      topic,
      count: data.count,
      avgViews: data.totalViews / data.count,
      totalViews: data.totalViews,
      channels: new Set(data.videos.map(v => v.channel_id)).size,
    }))
    .sort((a, b) => b.avgViews - a.avgViews);
}

/**
 * AudienceWhiteSpaceTab — Topic intelligence + white space analysis.
 */
export default function AudienceWhiteSpaceTab({
  competitors, snapshots, activeClient, categoryConfig,
}) {
  const [section, setSection] = useState('topics');
  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [gaps, setGaps] = useState([]);
  const [gapsLoading, setGapsLoading] = useState(false);

  const competitorIds = useMemo(
    () => competitors.map(c => c.supabaseId).filter(Boolean),
    [competitors]
  );

  // Fetch videos for topic analysis
  useEffect(() => {
    if (!competitorIds.length) {
      setVideos([]);
      setVideosLoading(false);
      return;
    }
    let cancelled = false;
    setVideosLoading(true);
    (async () => {
      try {
        const { getTopCompetitorVideos } = await import('../../../services/competitorDatabase');
        const data = await getTopCompetitorVideos({ days: 90, limit: 500 });
        // Filter to our competitors
        const idSet = new Set(competitorIds);
        if (!cancelled) setVideos((data || []).filter(v => idSet.has(v.channel_id)));
      } catch (e) {
        console.warn('[AudienceWhiteSpace] Video fetch failed:', e.message);
      } finally {
        if (!cancelled) setVideosLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [competitorIds.join(',')]);

  // Topic heatmap data
  const topics = useMemo(() => extractTopics(videos), [videos]);

  // Format distribution
  const formatDist = useMemo(() => {
    const byChannel = {};
    videos.forEach(v => {
      if (!byChannel[v.channel_id]) byChannel[v.channel_id] = { shorts: 0, longs: 0, shortsViews: 0, longsViews: 0 };
      if (v.video_type === 'short') {
        byChannel[v.channel_id].shorts++;
        byChannel[v.channel_id].shortsViews += v.view_count || 0;
      } else {
        byChannel[v.channel_id].longs++;
        byChannel[v.channel_id].longsViews += v.view_count || 0;
      }
    });

    return competitors.map(c => {
      const stats = byChannel[c.supabaseId] || { shorts: 0, longs: 0, shortsViews: 0, longsViews: 0 };
      const total = stats.shorts + stats.longs;
      return {
        ...c,
        shorts: stats.shorts,
        longs: stats.longs,
        shortsPct: total > 0 ? (stats.shorts / total) * 100 : 0,
        shortsAvgViews: stats.shorts > 0 ? stats.shortsViews / stats.shorts : 0,
        longsAvgViews: stats.longs > 0 ? stats.longsViews / stats.longs : 0,
      };
    }).sort((a, b) => (b.shorts + b.longs) - (a.shorts + a.longs));
  }, [videos, competitors]);

  // Load gap detection (on-demand when tab selected)
  useEffect(() => {
    if (section !== 'whitespace' || gaps.length > 0 || !activeClient?.id) return;
    if (videosLoading) return;
    setGapsLoading(true);
    (async () => {
      try {
        const { detectAllGaps } = await import('../../../services/gapDetectionService');
        // detectAllGaps expects client's own videos + clientId, fetches competitors internally
        const { getTopCompetitorVideos } = await import('../../../services/competitorDatabase');
        // Get client's own videos as clientVideos parameter
        const { supabase } = await import('../../../services/supabaseClient');
        let clientVideos = [];
        if (supabase && activeClient?.id) {
          const { data } = await supabase
            .from('videos')
            .select('id, title, channel_id, video_type, is_short, view_count, like_count, comment_count, engagement_rate, published_at, detected_format, title_patterns, duration_seconds')
            .eq('channel_id', activeClient.id)
            .order('published_at', { ascending: false })
            .limit(200);
          clientVideos = data || [];
        }
        const result = await detectAllGaps(clientVideos, activeClient.id);
        setGaps(result?.gaps || []);
      } catch (e) {
        console.warn('[AudienceWhiteSpace] Gap detection failed:', e.message);
        setGaps([]);
      } finally {
        setGapsLoading(false);
      }
    })();
  }, [section, activeClient?.id, videosLoading]);

  const SECTIONS = [
    { key: 'topics', label: 'Topic Heatmap', icon: Target },
    { key: 'whitespace', label: 'White Space', icon: Layers },
    { key: 'formats', label: 'Format Distribution', icon: BarChart3 },
  ];

  return (
    <div>
      {/* Section toggle */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {SECTIONS.map(s => {
          const Icon = s.icon;
          const active = section === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                border: `1px solid ${active ? 'var(--accent, #3b82f6)' : '#444'}`,
                background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: active ? 'var(--accent, #3b82f6)' : '#888',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <Icon size={12} /> {s.label}
            </button>
          );
        })}
      </div>

      {/* Topic Heatmap */}
      {section === 'topics' && (
        videosLoading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#888' }}>
            <Loader size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
            <div style={{ fontSize: '12px' }}>Analyzing competitor content...</div>
          </div>
        ) : topics.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#888', fontSize: '13px' }}>
            Not enough data to extract topic patterns
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>
              Topics ranked by average view performance across {competitors.length} channels
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
              {topics.slice(0, 30).map((t, i) => {
                const maxViews = topics[0]?.avgViews || 1;
                const intensity = Math.min(1, t.avgViews / maxViews);
                return (
                  <div
                    key={t.topic}
                    className="animate-in"
                    style={{
                      animationDelay: `${i * 0.03}s`,
                      background: '#252525', border: '1px solid #333', borderRadius: '8px',
                      padding: '12px', position: 'relative', overflow: 'hidden',
                    }}
                  >
                    {/* Intensity bar */}
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0,
                      width: `${intensity * 100}%`, height: '2px',
                      background: `linear-gradient(90deg, var(--accent, #3b82f6), var(--accent, #3b82f6)${Math.round(intensity * 100)}%, transparent)`,
                    }} />

                    <div style={{
                      fontSize: '13px', fontWeight: '600', color: '#fff',
                      textTransform: 'capitalize', marginBottom: '4px',
                    }}>
                      {t.topic}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: '#888' }}>
                      <span>{fmtInt(t.avgViews)} avg views</span>
                      <span>{t.count} videos</span>
                      <span>{t.channels} channels</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* White Space */}
      {section === 'whitespace' && (
        gapsLoading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#888' }}>
            <Loader size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
            <div style={{ fontSize: '12px' }}>Detecting white space...</div>
          </div>
        ) : gaps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#888', fontSize: '13px' }}>
            {activeClient ? 'No significant gaps detected' : 'Select a client to see white space analysis'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {gaps.map((gap, i) => (
              <div
                key={i}
                className="animate-in"
                style={{
                  animationDelay: `${i * 0.05}s`,
                  background: '#252525', border: '1px solid #333', borderRadius: '8px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff' }}>
                    {gap.title || gap.type}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {gap.impact && (
                      <span style={{
                        fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px',
                        background: gap.impact === 'High' ? 'rgba(239,68,68,0.15)' :
                          gap.impact === 'Medium' ? 'rgba(251,191,36,0.15)' : 'rgba(136,136,136,0.1)',
                        color: gap.impact === 'High' ? '#ef4444' :
                          gap.impact === 'Medium' ? '#fbbf24' : '#888',
                      }}>
                        {gap.impact}
                      </span>
                    )}
                    {gap.effort && (
                      <span style={{
                        fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px',
                        background: 'rgba(136,136,136,0.1)', color: '#888',
                      }}>
                        {gap.effort} effort
                      </span>
                    )}
                  </div>
                </div>
                {gap.description && (
                  <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px', lineHeight: '1.5' }}>
                    {gap.description}
                  </div>
                )}
                {gap.recommendation && (
                  <div style={{
                    fontSize: '11px', color: 'var(--accent, #3b82f6)',
                    background: 'rgba(59,130,246,0.08)', padding: '8px 12px',
                    borderRadius: '6px', lineHeight: '1.4',
                  }}>
                    {gap.recommendation}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Format Distribution */}
      {section === 'formats' && (
        videosLoading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#888' }}>
            <Loader size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
            <div style={{ fontSize: '12px' }}>Loading format data...</div>
          </div>
        ) : formatDist.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#888', fontSize: '13px' }}>
            No video data available
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>
              Shorts vs Long-form mix across the competitor set (last 90 days)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {formatDist.filter(c => c.shorts + c.longs > 0).map((c, i) => {
                const total = c.shorts + c.longs;
                return (
                  <div
                    key={c.supabaseId}
                    className="animate-in"
                    style={{ animationDelay: `${i * 0.03}s` }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      {c.thumbnail_url && (
                        <img
                          src={c.thumbnail_url}
                          alt=""
                          style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                      )}
                      <span style={{ fontSize: '11px', color: '#ccc', fontWeight: '500', width: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </span>

                      {/* Format bar */}
                      <div style={{ flex: 1, display: 'flex', height: '16px', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${c.shortsPct}%`, background: '#f97316',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {c.shortsPct > 15 && (
                            <span style={{ fontSize: '8px', color: '#fff', fontWeight: '700' }}>
                              {Math.round(c.shortsPct)}%
                            </span>
                          )}
                        </div>
                        <div style={{
                          width: `${100 - c.shortsPct}%`, background: '#0ea5e9',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {(100 - c.shortsPct) > 15 && (
                            <span style={{ fontSize: '8px', color: '#fff', fontWeight: '700' }}>
                              {Math.round(100 - c.shortsPct)}%
                            </span>
                          )}
                        </div>
                      </div>

                      <span style={{ fontSize: '10px', color: '#888', width: '40px', textAlign: 'right' }}>
                        {total} vids
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', gap: '16px', marginTop: '12px', justifyContent: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#888' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#f97316' }} /> Shorts
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#888' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#0ea5e9' }} /> Long-form
              </span>
            </div>
          </div>
        )
      )}
    </div>
  );
}
