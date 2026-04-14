/**
 * USStateMap — Static choropleth US state density map
 * Matches the world map style — same color scale, same density treatment.
 */
import React, { useState, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
} from 'react-simple-maps';

const US_GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

// FIPS code → ISO province code mapping
const FIPS_TO_PROVINCE = {
  '01': 'US-AL', '02': 'US-AK', '04': 'US-AZ', '05': 'US-AR', '06': 'US-CA',
  '08': 'US-CO', '09': 'US-CT', '10': 'US-DE', '11': 'US-DC', '12': 'US-FL',
  '13': 'US-GA', '15': 'US-HI', '16': 'US-ID', '17': 'US-IL', '18': 'US-IN',
  '19': 'US-IA', '20': 'US-KS', '21': 'US-KY', '22': 'US-LA', '23': 'US-ME',
  '24': 'US-MD', '25': 'US-MA', '26': 'US-MI', '27': 'US-MN', '28': 'US-MS',
  '29': 'US-MO', '30': 'US-MT', '31': 'US-NE', '32': 'US-NV', '33': 'US-NH',
  '34': 'US-NJ', '35': 'US-NM', '36': 'US-NY', '37': 'US-NC', '38': 'US-ND',
  '39': 'US-OH', '40': 'US-OK', '41': 'US-OR', '42': 'US-PA', '44': 'US-RI',
  '45': 'US-SC', '46': 'US-SD', '47': 'US-TN', '48': 'US-TX', '49': 'US-UT',
  '50': 'US-VT', '51': 'US-VA', '53': 'US-WA', '54': 'US-WV', '55': 'US-WI',
  '56': 'US-WY', '72': 'US-PR',
};

// State name → province code fallback
const NAME_TO_PROVINCE = {
  'Alabama': 'US-AL', 'Alaska': 'US-AK', 'Arizona': 'US-AZ', 'Arkansas': 'US-AR',
  'California': 'US-CA', 'Colorado': 'US-CO', 'Connecticut': 'US-CT', 'Delaware': 'US-DE',
  'District of Columbia': 'US-DC', 'Florida': 'US-FL', 'Georgia': 'US-GA', 'Hawaii': 'US-HI',
  'Idaho': 'US-ID', 'Illinois': 'US-IL', 'Indiana': 'US-IN', 'Iowa': 'US-IA',
  'Kansas': 'US-KS', 'Kentucky': 'US-KY', 'Louisiana': 'US-LA', 'Maine': 'US-ME',
  'Maryland': 'US-MD', 'Massachusetts': 'US-MA', 'Michigan': 'US-MI', 'Minnesota': 'US-MN',
  'Mississippi': 'US-MS', 'Missouri': 'US-MO', 'Montana': 'US-MT', 'Nebraska': 'US-NE',
  'Nevada': 'US-NV', 'New Hampshire': 'US-NH', 'New Jersey': 'US-NJ', 'New Mexico': 'US-NM',
  'New York': 'US-NY', 'North Carolina': 'US-NC', 'North Dakota': 'US-ND', 'Ohio': 'US-OH',
  'Oklahoma': 'US-OK', 'Oregon': 'US-OR', 'Pennsylvania': 'US-PA', 'Rhode Island': 'US-RI',
  'South Carolina': 'US-SC', 'South Dakota': 'US-SD', 'Tennessee': 'US-TN', 'Texas': 'US-TX',
  'Utah': 'US-UT', 'Vermont': 'US-VT', 'Virginia': 'US-VA', 'Washington': 'US-WA',
  'West Virginia': 'US-WV', 'Wisconsin': 'US-WI', 'Wyoming': 'US-WY', 'Puerto Rico': 'US-PR',
};

// Same density color scale as world map
function getDensityColor(pct) {
  if (pct <= 0) return '#151d2e';
  if (pct < 0.5) return '#1a2d50';
  if (pct < 1) return '#1d4ed8';
  if (pct < 2) return '#2563eb';
  if (pct < 4) return '#3b82f6';
  if (pct < 8) return '#60a5fa';
  if (pct < 15) return '#93c5fd';
  return '#dbeafe';
}

function formatViews(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function USStateMap({ provinces, topCities }) {
  const [hoveredState, setHoveredState] = useState(null);
  const [tooltipData, setTooltipData] = useState(null);

  const provinceLookup = useMemo(() => {
    if (!provinces) return {};
    const lookup = {};
    for (const [code, data] of Object.entries(provinces)) {
      lookup[code] = data;
    }
    return lookup;
  }, [provinces]);

  const sortedProvinces = useMemo(() => {
    if (!provinces) return [];
    return Object.entries(provinces)
      .map(([code, val]) => ({ code, stateAbbr: code.replace('US-', ''), ...val }))
      .sort((a, b) => b.views - a.views);
  }, [provinces]);

  if (!provinces || Object.keys(provinces).length === 0) {
    return (
      <div style={{
        background: '#0c1222', borderRadius: '10px', height: '320px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#334155', fontSize: '13px',
      }}>
        No US state data available
      </div>
    );
  }

  return (
    <div data-map="us-states" style={{ position: 'relative', background: '#0c1222', borderRadius: '10px', overflow: 'hidden' }}>
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 900 }}
        style={{ width: '100%', height: '320px' }}
      >
        <Geographies geography={US_GEO_URL}>
          {({ geographies }) =>
            geographies.map(geo => {
              const fips = geo.id;
              const name = geo.properties?.name;
              const provinceCode = FIPS_TO_PROVINCE[fips] || NAME_TO_PROVINCE[name];
              const stateData = provinceCode ? provinceLookup[provinceCode] : null;
              const pct = stateData?.pct || 0;
              const isHovered = hoveredState === geo.rsmKey;

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isHovered && stateData ? '#f59e0b' : getDensityColor(pct)}
                  stroke="#0f172a"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none', transition: 'fill 0.2s ease' },
                    hover: { outline: 'none' },
                    pressed: { outline: 'none' },
                  }}
                  onMouseEnter={() => {
                    if (stateData) {
                      setHoveredState(geo.rsmKey);
                      setTooltipData({ name: name || provinceCode, ...stateData });
                    }
                  }}
                  onMouseLeave={() => { setHoveredState(null); setTooltipData(null); }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {/* Tooltip */}
      {tooltipData && (
        <div style={{
          position: 'absolute', top: '14px', right: '14px',
          background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #334155',
          borderRadius: '10px', padding: '12px 16px', minWidth: '160px',
          pointerEvents: 'none', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>
            {tooltipData.name}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
            <span style={{ color: '#60a5fa', fontWeight: '700' }}>{formatViews(tooltipData.views)}</span> views
            <span style={{ color: '#475569', margin: '0 6px' }}>|</span>
            {tooltipData.pct.toFixed(1)}%
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            {tooltipData.watchHours.toLocaleString()} watch hours
          </div>
        </div>
      )}

      {/* Top states + density scale */}
      <div style={{
        position: 'absolute', bottom: '0', left: '0', right: '0',
        padding: '10px 16px',
        background: 'linear-gradient(transparent, rgba(12, 18, 34, 0.95))',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {sortedProvinces.slice(0, 6).map((s, i) => (
            <div key={s.code} style={{
              fontSize: '11px', padding: '3px 10px', borderRadius: '5px',
              background: i === 0 ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.06)',
              border: i === 0 ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255,255,255,0.08)',
              color: i === 0 ? '#93c5fd' : '#94a3b8',
            }}>
              <span style={{ fontWeight: '700', color: i === 0 ? '#bfdbfe' : '#e2e8f0' }}>{s.stateAbbr}</span>{' '}
              {s.pct.toFixed(1)}%
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '9px', color: '#475569', flexShrink: 0 }}>
          <span>Low</span>
          {['#1a2d50', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'].map((c, i) => (
            <div key={i} style={{ width: '14px', height: '6px', background: c, borderRadius: '1px' }} />
          ))}
          <span>High</span>
        </div>
      </div>
    </div>
  );
}
