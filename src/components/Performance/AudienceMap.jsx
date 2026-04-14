/**
 * AudienceMap — Choropleth world map showing view distribution by country
 */
import React, { useState, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
} from 'react-simple-maps';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

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
  if (pct <= 0) return '#1e2330';
  if (pct < 0.5) return '#1e3a5f';
  if (pct < 1) return '#1d4ed8';
  if (pct < 3) return '#2563eb';
  if (pct < 8) return '#3b82f6';
  if (pct < 20) return '#60a5fa';
  if (pct < 50) return '#93c5fd';
  return '#bfdbfe';
}

function formatViews(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function AudienceMap({ countries }) {
  const [tooltip, setTooltip] = useState(null);

  const countryLookup = useMemo(() => {
    const lookup = {};
    for (const c of countries) {
      const a3 = A2_TO_A3[c.code];
      if (a3) lookup[a3] = c;
      lookup[c.code] = c;
    }
    return lookup;
  }, [countries]);

  return (
    <div style={{ position: 'relative', background: '#0f1729', borderRadius: '10px', overflow: 'hidden' }}>
      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ scale: 160, center: [0, 5] }}
        style={{ width: '100%', height: '320px' }}
      >
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
                  stroke="#1a2744"
                  strokeWidth={0.4}
                  style={{
                    hover: { fill: pct > 0 ? '#f59e0b' : '#263354', outline: 'none', cursor: pct > 0 ? 'pointer' : 'default' },
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
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', top: '14px', right: '14px',
          background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #334155',
          borderRadius: '10px', padding: '12px 16px', minWidth: '160px',
          pointerEvents: 'none', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>
            {tooltip.name}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
            <span style={{ color: '#60a5fa', fontWeight: '700' }}>{formatViews(tooltip.views)}</span> views
            <span style={{ color: '#475569', margin: '0 6px' }}>|</span>
            {tooltip.pct.toFixed(1)}%
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            {tooltip.watchHours.toLocaleString()} watch hours
          </div>
        </div>
      )}

      {/* Top countries legend */}
      <div style={{
        position: 'absolute', bottom: '10px', left: '14px',
        display: 'flex', gap: '8px', flexWrap: 'wrap',
      }}>
        {countries.slice(0, 5).map(c => (
          <div key={c.code} style={{
            fontSize: '11px', color: '#94a3b8', background: 'rgba(15, 23, 42, 0.85)',
            padding: '4px 10px', borderRadius: '6px', border: '1px solid #1e293b',
            backdropFilter: 'blur(4px)',
          }}>
            <span style={{ fontWeight: '700', color: '#e2e8f0' }}>{c.code}</span>{' '}
            {c.pct.toFixed(1)}%
          </div>
        ))}
      </div>

      {/* Color scale legend */}
      <div style={{
        position: 'absolute', bottom: '10px', right: '14px',
        display: 'flex', alignItems: 'center', gap: '4px',
        fontSize: '9px', color: '#64748b',
      }}>
        <span>Low</span>
        {['#1e3a5f', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'].map((c, i) => (
          <div key={i} style={{ width: '16px', height: '8px', background: c, borderRadius: '2px' }} />
        ))}
        <span>High</span>
      </div>
    </div>
  );
}
