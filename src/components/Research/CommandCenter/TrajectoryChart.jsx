import { useMemo, useState } from 'react';
import { Loader } from 'lucide-react';

const fmtInt = (n) => (!n || isNaN(n)) ? '0' : Math.round(n).toLocaleString();

/**
 * TrajectoryChart — Multi-line SVG chart showing subscriber trajectories.
 * Your channel highlighted in accent color, competitors as muted lines.
 */
export default function TrajectoryChart({
  competitors, snapshots, activeClient, yourStats, loading,
}) {
  const [hoveredLine, setHoveredLine] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  const WIDTH = 700;
  const HEIGHT = 200;
  const PAD = { top: 20, right: 20, bottom: 30, left: 60 };
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  // Build line data from snapshots
  const lines = useMemo(() => {
    const result = [];

    competitors.forEach(c => {
      const snaps = snapshots[c.supabaseId] || [];
      if (snaps.length < 2) return;
      result.push({
        id: c.supabaseId,
        name: c.name || 'Unknown',
        color: '#555',
        isClient: false,
        points: snaps.map(s => ({
          date: new Date(s.snapshot_date),
          value: s.subscriber_count || 0,
        })),
      });
    });

    return result;
  }, [competitors, snapshots]);

  // Compute scale ranges
  const { allDates, minVal, maxVal } = useMemo(() => {
    let min = Infinity, max = -Infinity;
    const dates = new Set();
    lines.forEach(l => {
      l.points.forEach(p => {
        if (p.value < min) min = p.value;
        if (p.value > max) max = p.value;
        dates.add(p.date.getTime());
      });
    });
    if (min === Infinity) { min = 0; max = 100; }
    const range = max - min || 1;
    return {
      allDates: [...dates].sort((a, b) => a - b),
      minVal: min - range * 0.05,
      maxVal: max + range * 0.05,
    };
  }, [lines]);

  const xScale = (date) => {
    if (allDates.length < 2) return PAD.left;
    const t = date.getTime();
    const minT = allDates[0];
    const maxT = allDates[allDates.length - 1];
    const range = maxT - minT || 1;
    return PAD.left + ((t - minT) / range) * plotW;
  };

  const yScale = (val) => {
    const range = maxVal - minVal || 1;
    return PAD.top + plotH - ((val - minVal) / range) * plotH;
  };

  // Generate path strings
  const paths = useMemo(() => {
    return lines.map(line => {
      const d = line.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.date).toFixed(1)},${yScale(p.value).toFixed(1)}`)
        .join(' ');
      return { ...line, d };
    });
  }, [lines, allDates, minVal, maxVal]);

  // Y axis ticks
  const yTicks = useMemo(() => {
    const range = maxVal - minVal;
    const step = range / 4;
    return Array.from({ length: 5 }, (_, i) => minVal + step * i);
  }, [minVal, maxVal]);

  // X axis date labels
  const xLabels = useMemo(() => {
    if (allDates.length < 2) return [];
    const count = Math.min(6, allDates.length);
    const step = Math.floor((allDates.length - 1) / (count - 1));
    return Array.from({ length: count }, (_, i) => {
      const idx = Math.min(i * step, allDates.length - 1);
      return new Date(allDates[idx]);
    });
  }, [allDates]);

  const handleMouseMove = (e, line) => {
    const rect = e.currentTarget.closest('svg').getBoundingClientRect();
    const x = e.clientX - rect.left;
    const latest = line.points[line.points.length - 1];
    setTooltip({
      x: Math.min(x, WIDTH - 120),
      y: yScale(latest.value) - 10,
      name: line.name,
      value: latest.value,
    });
    setHoveredLine(line.id);
  };

  if (loading) {
    return (
      <div style={{
        background: '#1E1E1E', border: '1px solid #2A2A2A', borderRadius: '8px',
        padding: '24px', textAlign: 'center', color: '#888', marginBottom: '12px',
      }}>
        <Loader size={16} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 6px' }} />
        <div style={{ fontSize: '11px' }}>Loading trajectory data...</div>
      </div>
    );
  }

  if (paths.length === 0) return null;

  return (
    <div className="animate-in" style={{
      background: '#1E1E1E', border: '1px solid #2A2A2A', borderRadius: '8px',
      padding: '16px', marginBottom: '12px',
    }}>
      <div style={{
        fontSize: '11px', fontWeight: '700', textTransform: 'uppercase',
        letterSpacing: '0.5px', color: '#888', marginBottom: '8px',
      }}>
        Subscriber Trajectory
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ display: 'block' }}
        onMouseLeave={() => { setHoveredLine(null); setTooltip(null); }}
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={PAD.left} x2={WIDTH - PAD.right}
              y1={yScale(tick)} y2={yScale(tick)}
              stroke="#2A2A2A" strokeDasharray="4,4"
            />
            <text
              x={PAD.left - 8} y={yScale(tick) + 3}
              textAnchor="end" fill="#666" fontSize="9"
              fontFamily="'Barlow Condensed', sans-serif"
            >
              {tick >= 1000000 ? `${(tick / 1000000).toFixed(1)}M` :
                tick >= 1000 ? `${(tick / 1000).toFixed(0)}K` :
                  Math.round(tick)}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {xLabels.map((date, i) => (
          <text
            key={i}
            x={xScale(date)} y={HEIGHT - 8}
            textAnchor="middle" fill="#666" fontSize="9"
          >
            {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        ))}

        {/* Competitor lines (muted, behind) */}
        {paths.filter(p => !p.isClient).map(path => (
          <path
            key={path.id}
            d={path.d}
            fill="none"
            stroke={hoveredLine === path.id ? '#aaa' : '#444'}
            strokeWidth={hoveredLine === path.id ? 2 : 1}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'stroke 0.15s, stroke-width 0.15s', cursor: 'pointer' }}
            onMouseEnter={(e) => handleMouseMove(e, path)}
            onMouseMove={(e) => handleMouseMove(e, path)}
          />
        ))}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect
              x={tooltip.x} y={tooltip.y - 28}
              width={110} height={24}
              rx={4} fill="#333" stroke="#555" strokeWidth={0.5}
            />
            <text x={tooltip.x + 6} y={tooltip.y - 12} fill="#fff" fontSize="10" fontWeight="600">
              {tooltip.name}
            </text>
            <text x={tooltip.x + 104} y={tooltip.y - 12} fill="#ccc" fontSize="9" textAnchor="end">
              {fmtInt(tooltip.value)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
