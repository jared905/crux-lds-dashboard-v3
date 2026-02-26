import { useMemo } from 'react';
import { Zap, ExternalLink } from 'lucide-react';

const fmtInt = (n) => (!n || isNaN(n)) ? '0' : Math.round(n).toLocaleString();

/**
 * BreakoutHighlights — Top 3-5 outlier videos shown as compact cards.
 * Answers "who is making moves and why" at a glance.
 */
export default function BreakoutHighlights({ outliers, onViewInsight }) {
  const topOutliers = useMemo(() => {
    if (!outliers || !outliers.length) return [];
    return [...outliers]
      .sort((a, b) => (b.outlierScore || 0) - (a.outlierScore || 0))
      .slice(0, 5);
  }, [outliers]);

  if (topOutliers.length === 0) return null;

  return (
    <div className="animate-in" style={{
      background: '#1E1E1E', border: '1px solid #2A2A2A', borderRadius: '8px',
      padding: '16px', marginBottom: '12px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <div style={{
          fontSize: '11px', fontWeight: '700', textTransform: 'uppercase',
          letterSpacing: '0.5px', color: '#888',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Zap size={12} color="#ef4444" />
          Breakout Videos
        </div>
        <span style={{ fontSize: '10px', color: '#666' }}>
          Top {topOutliers.length} by outlier score
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '8px',
      }}>
        {topOutliers.map((video, i) => (
          <div
            key={video.id || i}
            style={{
              display: 'flex', gap: '10px',
              background: '#252525', border: '1px solid #333', borderRadius: '8px',
              padding: '10px', transition: 'border-color 0.15s',
              cursor: 'pointer',
            }}
            onClick={() => onViewInsight && onViewInsight(video)}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#555'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#333'}
          >
            {/* Thumbnail */}
            {video.thumbnail_url ? (
              <img
                src={video.thumbnail_url}
                alt=""
                style={{
                  width: '90px', height: '50px', borderRadius: '4px',
                  objectFit: 'cover', flexShrink: 0,
                }}
              />
            ) : (
              <div style={{
                width: '90px', height: '50px', borderRadius: '4px',
                background: '#333', flexShrink: 0,
              }} />
            )}

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '11px', fontWeight: '600', color: '#fff',
                lineHeight: '1.3', marginBottom: '4px',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {video.title}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* Channel */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {video.channel?.thumbnail_url && (
                    <img
                      src={video.channel.thumbnail_url}
                      alt="" style={{ width: '14px', height: '14px', borderRadius: '50%' }}
                    />
                  )}
                  <span style={{ fontSize: '10px', color: '#999' }}>
                    {video.channel?.name || 'Unknown'}
                  </span>
                </div>

                {/* Outlier badge */}
                <span style={{
                  fontSize: '10px', fontWeight: '700',
                  color: '#ef4444',
                  background: 'rgba(239,68,68,0.12)',
                  padding: '1px 6px', borderRadius: '4px',
                }}>
                  {video.outlierScore}x
                </span>

                {/* Views */}
                <span style={{ fontSize: '10px', color: '#888' }}>
                  {fmtInt(video.view_count)} views
                </span>

                {/* YouTube link */}
                {video.youtube_video_id && (
                  <a
                    href={`https://youtube.com/watch?v=${video.youtube_video_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ color: '#666', display: 'flex' }}
                  >
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
