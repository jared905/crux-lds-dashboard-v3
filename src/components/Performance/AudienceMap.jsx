/**
 * AudienceMap — Choropleth world map showing view distribution by country
 * Uses react-simple-maps (SVG-based, no API key needed)
 */
import React, { useState, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';

// Natural Earth TopoJSON — public, no API key
const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ISO 3166-1 alpha-2 → alpha-3 mapping for common countries
// react-simple-maps uses ISO_A3, YouTube API returns ISO_A2
const A2_TO_A3 = {
  US: 'USA', GB: 'GBR', CA: 'CAN', AU: 'AUS', IN: 'IND', BR: 'BRA', DE: 'DEU',
  FR: 'FRA', MX: 'MEX', JP: 'JPN', KR: 'KOR', IT: 'ITA', ES: 'ESP', NL: 'NLD',
  SE: 'SWE', NO: 'NOR', DK: 'DNK', FI: 'FIN', PH: 'PHL', ID: 'IDN', TH: 'THA',
  VN: 'VNM', MY: 'MYS', SG: 'SGP', NZ: 'NZL', ZA: 'ZAF', NG: 'NGA', KE: 'KEN',
  GH: 'GHA', EG: 'EGY', PK: 'PAK', BD: 'BGD', CO: 'COL', AR: 'ARG', CL: 'CHL',
  PE: 'PER', RU: 'RUS', PL: 'POL', UA: 'UKR', RO: 'ROU', CZ: 'CZE', HU: 'HUN',
  AT: 'AUT', CH: 'CHE', BE: 'BEL', PT: 'PRT', IE: 'IRL', IL: 'ISR', AE: 'ARE',
  SA: 'SAU', TR: 'TUR', TW: 'TWN', HK: 'HKG', CN: 'CHN', GT: 'GTM', DO: 'DOM',
  EC: 'ECU', VE: 'VEN', CR: 'CRI', PA: 'PAN', JM: 'JAM', TT: 'TTO', PR: 'PRI',
  HN: 'HND', SV: 'SLV', NI: 'NIC', BO: 'BOL', PY: 'PRY', UY: 'URY',
};

function getColor(pct) {
  if (pct <= 0) return '#1a1a2e';
  if (pct < 1) return '#1e3a5f';
  if (pct < 3) return '#2563eb';
  if (pct < 10) return '#3b82f6';
  if (pct < 25) return '#60a5fa';
  return '#93c5fd';
}

function formatViews(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function AudienceMap({ countries }) {
  const [tooltip, setTooltip] = useState(null);

  // Build lookup: ISO_A3 → country data
  const countryLookup = useMemo(() => {
    const lookup = {};
    for (const c of countries) {
      const a3 = A2_TO_A3[c.code];
      if (a3) lookup[a3] = c;
      lookup[c.code] = c; // Also store by A2 as fallback
    }
    return lookup;
  }, [countries]);

  return (
    <div style={{ position: 'relative' }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 120, center: [0, 30] }}
        style={{ width: '100%', height: '300px', background: '#111' }}
      >
        <ZoomableGroup>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => {
                const isoA3 = geo.properties?.ISO_A3 || geo.id;
                const isoA2 = geo.properties?.ISO_A2;
                const countryData = countryLookup[isoA3] || countryLookup[isoA2] || null;
                const pct = countryData?.pct || 0;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={getColor(pct)}
                    stroke="#222"
                    strokeWidth={0.3}
                    style={{
                      hover: { fill: pct > 0 ? '#f59e0b' : '#2a2a3e', outline: 'none' },
                      pressed: { outline: 'none' },
                      default: { outline: 'none' },
                    }}
                    onMouseEnter={() => {
                      if (countryData) {
                        setTooltip({
                          name: geo.properties?.NAME || geo.properties?.name || isoA3,
                          ...countryData,
                        });
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', top: '12px', right: '12px',
          background: 'rgba(0,0,0,0.9)', border: '1px solid #333',
          borderRadius: '8px', padding: '10px 14px', minWidth: '140px',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '4px' }}>
            {tooltip.name}
          </div>
          <div style={{ fontSize: '11px', color: '#aaa' }}>
            {formatViews(tooltip.views)} views ({tooltip.pct.toFixed(1)}%)
          </div>
          <div style={{ fontSize: '11px', color: '#888' }}>
            {tooltip.watchHours.toLocaleString()} watch hours
          </div>
        </div>
      )}

      {/* Top 5 countries legend */}
      <div style={{
        position: 'absolute', bottom: '8px', left: '12px',
        display: 'flex', gap: '12px', flexWrap: 'wrap',
      }}>
        {countries.slice(0, 5).map(c => (
          <div key={c.code} style={{
            fontSize: '10px', color: '#aaa', background: 'rgba(0,0,0,0.7)',
            padding: '3px 8px', borderRadius: '4px',
          }}>
            <span style={{ fontWeight: '700', color: '#fff' }}>{c.code}</span>{' '}
            {c.pct.toFixed(1)}%
          </div>
        ))}
      </div>
    </div>
  );
}
