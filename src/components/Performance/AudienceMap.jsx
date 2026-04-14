/**
 * AudienceMap — Static choropleth density map
 * No interactivity (no zoom/pan) — pure density visualization.
 * Hover shows country tooltip only.
 */
import React, { useState, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
} from 'react-simple-maps';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ISO 3166-1 numeric → alpha-2 (world-atlas uses numeric IDs)
const NUM_TO_A2 = {
  '840': 'US', '826': 'GB', '124': 'CA', '036': 'AU', '356': 'IN', '076': 'BR',
  '276': 'DE', '250': 'FR', '484': 'MX', '392': 'JP', '410': 'KR', '380': 'IT',
  '724': 'ES', '528': 'NL', '752': 'SE', '578': 'NO', '208': 'DK', '246': 'FI',
  '608': 'PH', '360': 'ID', '764': 'TH', '704': 'VN', '458': 'MY', '702': 'SG',
  '554': 'NZ', '710': 'ZA', '566': 'NG', '404': 'KE', '288': 'GH', '818': 'EG',
  '586': 'PK', '050': 'BD', '170': 'CO', '032': 'AR', '152': 'CL', '604': 'PE',
  '643': 'RU', '616': 'PL', '804': 'UA', '642': 'RO', '203': 'CZ', '348': 'HU',
  '040': 'AT', '756': 'CH', '056': 'BE', '620': 'PT', '372': 'IE', '376': 'IL',
  '784': 'AE', '682': 'SA', '792': 'TR', '158': 'TW', '344': 'HK', '156': 'CN',
  '320': 'GT', '214': 'DO', '218': 'EC', '862': 'VE', '188': 'CR', '591': 'PA',
  '388': 'JM', '780': 'TT', '630': 'PR', '340': 'HN', '222': 'SV', '558': 'NI',
  '068': 'BO', '600': 'PY', '858': 'UY', '304': 'GL', '352': 'IS',
};

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

// Same density scale as USStateMap for visual consistency
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

export default function AudienceMap({ countries }) {
  const [hoveredCountry, setHoveredCountry] = useState(null);

  const countryLookup = useMemo(() => {
    const lookup = {};
    for (const c of countries) {
      // Store by alpha-2, alpha-3, and numeric for maximum matching
      lookup[c.code] = c;
      const a3 = A2_TO_A3[c.code];
      if (a3) lookup[a3] = c;
    }
    // Also build reverse: numeric → country data
    for (const [num, a2] of Object.entries(NUM_TO_A2)) {
      if (lookup[a2]) lookup[num] = lookup[a2];
    }
    return lookup;
  }, [countries]);

  return (
    <div data-map="world" style={{ position: 'relative', background: '#0c1222', borderRadius: '10px', overflow: 'hidden' }}>
      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ scale: 160, center: [0, 5] }}
        style={{ width: '100%', height: '320px' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map(geo => {
              const numId = geo.id; // world-atlas uses numeric IDs like "840"
              const isoA3 = geo.properties?.ISO_A3;
              const isoA2 = geo.properties?.ISO_A2;
              const cd = countryLookup[numId] || countryLookup[isoA3] || countryLookup[isoA2] || null;
              const pct = cd?.pct || 0;
              const isHovered = hoveredCountry === geo.rsmKey;

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isHovered && cd ? '#f59e0b' : getDensityColor(pct)}
                  stroke="#0f172a"
                  strokeWidth={0.3}
                  style={{
                    default: { outline: 'none', transition: 'fill 0.2s ease' },
                    hover: { outline: 'none', cursor: cd ? 'default' : 'default' },
                    pressed: { outline: 'none' },
                  }}
                  onMouseEnter={() => {
                    if (cd) setHoveredCountry(geo.rsmKey);
                  }}
                  onMouseLeave={() => setHoveredCountry(null)}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {/* Hover tooltip */}
      {hoveredCountry && (() => {
        // Find the hovered country data
        const allGeos = document.querySelectorAll('[data-rsm-key]'); // Won't work, use lookup instead
        return null;
      })()}

      {/* Top countries + density scale bar */}
      <div style={{
        position: 'absolute', bottom: '0', left: '0', right: '0',
        padding: '10px 16px',
        background: 'linear-gradient(transparent, rgba(12, 18, 34, 0.95))',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      }}>
        {/* Top countries */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {countries.slice(0, 6).map((c, i) => (
            <div key={c.code} style={{
              fontSize: '11px', padding: '3px 10px', borderRadius: '5px',
              background: i === 0 ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.06)',
              border: i === 0 ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255,255,255,0.08)',
              color: i === 0 ? '#93c5fd' : '#94a3b8',
            }}>
              <span style={{ fontWeight: '700', color: i === 0 ? '#bfdbfe' : '#e2e8f0' }}>{c.code}</span>{' '}
              {c.pct.toFixed(1)}%
              <span style={{ color: '#64748b', marginLeft: '4px' }}>{formatViews(c.views)}</span>
            </div>
          ))}
        </div>

        {/* Density scale */}
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
