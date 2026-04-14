/**
 * AudienceIntelligence — Demographics, Geography, Traffic Sources, Devices
 *
 * Displays channel-level audience data from YouTube Analytics API.
 * Positioned between Performance Timeline and Brand Funnel.
 * All sections always visible — no expand/collapse.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Globe, Users, Smartphone, Monitor, Tv, Tablet, Gamepad2,
  Search, ExternalLink, Play, List, Bell, BarChart3, Loader, Map,
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

const LazyMap = React.lazy(() => import('./AudienceMap.jsx'));

const TRAFFIC_SOURCE_LABELS = {
  YT_SEARCH: 'YouTube Search', SUBSCRIBER: 'Subscribers', SUGGESTED: 'Suggested',
  BROWSE: 'Browse', EXT_URL: 'External', NOTIFICATION: 'Notifications',
  PLAYLIST: 'Playlists', YT_OTHER_PAGE: 'Other YouTube', NO_LINK_OTHER: 'Direct',
  SHORTS: 'Shorts Feed', CAMPAIGN_CARD: 'Cards', END_SCREEN: 'End Screens',
  YT_CHANNEL: 'Channel Page', HASHTAGS: 'Hashtags',
};

const TRAFFIC_SOURCE_ICONS = {
  YT_SEARCH: Search, SUBSCRIBER: Bell, SUGGESTED: Play, BROWSE: BarChart3,
  EXT_URL: ExternalLink, NOTIFICATION: Bell, PLAYLIST: List, SHORTS: Smartphone,
};

const DEVICE_ICONS = {
  MOBILE: Smartphone, DESKTOP: Monitor, TV: Tv, TABLET: Tablet, GAME_CONSOLE: Gamepad2,
};

const AGE_ORDER = ['age13-17', 'age18-24', 'age25-34', 'age35-44', 'age45-54', 'age55-64', 'age65-'];
const AGE_LABELS = { 'age13-17': '13-17', 'age18-24': '18-24', 'age25-34': '25-34', 'age35-44': '35-44', 'age45-54': '45-54', 'age55-64': '55-64', 'age65-': '65+' };

const GENDER_COLORS = { male: '#3b82f6', female: '#ec4899', user_specified: '#8b5cf6' };

function fmtViews(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function AudienceIntelligence({ activeClient, dateRange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeClient?.id) return;
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      const channelIds = activeClient.isNetwork && activeClient.networkMembers
        ? activeClient.networkMembers.map(m => m.id)
        : [activeClient.id];

      const allData = { gender: {}, age: {}, country: {}, trafficSources: {}, deviceTypes: {} };

      for (const chId of channelIds) {
        const { data: snapshot } = await supabase
          .from('channel_audience_snapshots')
          .select('*')
          .eq('channel_id', chId)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .single();

        if (!snapshot) continue;

        if (snapshot.gender_distribution) {
          for (const [k, v] of Object.entries(snapshot.gender_distribution)) allData.gender[k] = (allData.gender[k] || 0) + v;
        }
        if (snapshot.age_distribution) {
          for (const [k, v] of Object.entries(snapshot.age_distribution)) allData.age[k] = (allData.age[k] || 0) + v;
        }
        if (snapshot.country_data) {
          for (const [code, d] of Object.entries(snapshot.country_data)) {
            if (!allData.country[code]) allData.country[code] = { views: 0, watchHours: 0 };
            allData.country[code].views += d.views || 0;
            allData.country[code].watchHours += d.watchHours || 0;
          }
        }
        if (snapshot.traffic_sources) {
          for (const [src, d] of Object.entries(snapshot.traffic_sources)) {
            if (!allData.trafficSources[src]) allData.trafficSources[src] = { views: 0, watchHours: 0 };
            allData.trafficSources[src].views += d.views || 0;
            allData.trafficSources[src].watchHours += d.watchHours || 0;
          }
        }
        if (snapshot.device_types) {
          for (const [dev, d] of Object.entries(snapshot.device_types)) {
            if (!allData.deviceTypes[dev]) allData.deviceTypes[dev] = { views: 0, watchHours: 0 };
            allData.deviceTypes[dev].views += d.views || 0;
            allData.deviceTypes[dev].watchHours += d.watchHours || 0;
          }
        }
      }

      const chCount = channelIds.length;
      if (chCount > 1) {
        for (const k of Object.keys(allData.gender)) allData.gender[k] /= chCount;
        for (const k of Object.keys(allData.age)) allData.age[k] /= chCount;
      }

      const totalCountryViews = Object.values(allData.country).reduce((s, c) => s + c.views, 0);
      for (const c of Object.values(allData.country)) c.pct = totalCountryViews > 0 ? (c.views / totalCountryViews) * 100 : 0;
      const totalTrafficViews = Object.values(allData.trafficSources).reduce((s, t) => s + t.views, 0);
      for (const t of Object.values(allData.trafficSources)) t.pct = totalTrafficViews > 0 ? (t.views / totalTrafficViews) * 100 : 0;
      const totalDeviceViews = Object.values(allData.deviceTypes).reduce((s, d) => s + d.views, 0);
      for (const d of Object.values(allData.deviceTypes)) d.pct = totalDeviceViews > 0 ? (d.views / totalDeviceViews) * 100 : 0;

      if (!cancelled) {
        const hasData = Object.keys(allData.gender).length > 0 || Object.keys(allData.country).length > 0;
        setData(hasData ? allData : null);
        setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [activeClient?.id, activeClient?.isNetwork, dateRange]);

  const sortedTraffic = useMemo(() => {
    if (!data?.trafficSources) return [];
    return Object.entries(data.trafficSources)
      .map(([key, val]) => ({ key, label: TRAFFIC_SOURCE_LABELS[key] || key.replace(/_/g, ' '), ...val }))
      .sort((a, b) => b.views - a.views);
  }, [data?.trafficSources]);

  const sortedDevices = useMemo(() => {
    if (!data?.deviceTypes) return [];
    return Object.entries(data.deviceTypes)
      .map(([key, val]) => ({ key, label: key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' '), ...val }))
      .sort((a, b) => b.views - a.views);
  }, [data?.deviceTypes]);

  const sortedCountries = useMemo(() => {
    if (!data?.country) return [];
    return Object.entries(data.country).map(([code, val]) => ({ code, ...val })).sort((a, b) => b.views - a.views);
  }, [data?.country]);

  const sortedAge = useMemo(() => {
    if (!data?.age) return [];
    return AGE_ORDER.filter(k => data.age[k] != null).map(k => ({ key: k, label: AGE_LABELS[k] || k, value: data.age[k] }));
  }, [data?.age]);

  if (loading) return null;
  if (!data) return null;

  const maxAge = Math.max(...sortedAge.map(a => a.value), 1);
  const maxTrafficPct = sortedTraffic.length > 0 ? sortedTraffic[0].pct : 1;
  const genderEntries = Object.entries(data.gender || {}).sort(([, a], [, b]) => b - a);
  const totalGender = genderEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <div style={{
      background: '#1E1E1E', border: '1px solid #2A2A2A', borderRadius: '10px',
      marginBottom: '24px', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid #2A2A2A',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <Globe size={18} style={{ color: '#3b82f6' }} />
        <span style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>Audience Intelligence</span>
        <span style={{ fontSize: '11px', color: '#555', fontWeight: '500', marginLeft: '4px' }}>
          {sortedCountries.length} countries
        </span>
      </div>

      {/* Map + Demographics side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', minHeight: '320px' }}>
        {/* Map */}
        <React.Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1729' }}>
            <Loader size={20} style={{ color: '#334155' }} />
          </div>
        }>
          <LazyMap countries={sortedCountries} />
        </React.Suspense>

        {/* Demographics sidebar */}
        <div style={{ borderLeft: '1px solid #2A2A2A', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Gender */}
          <div>
            <div style={{ fontSize: '11px', color: '#666', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Gender</div>
            {genderEntries.map(([gender, pct]) => {
              const label = gender === 'user_specified' ? 'Other' : gender.charAt(0).toUpperCase() + gender.slice(1);
              const barPct = totalGender > 0 ? (pct / totalGender) * 100 : 0;
              return (
                <div key={gender} style={{ marginBottom: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontSize: '12px', color: '#ccc', fontWeight: '500' }}>{label}</span>
                    <span style={{ fontSize: '12px', color: '#fff', fontWeight: '700' }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: '6px', background: '#252525', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${barPct}%`, height: '100%', background: GENDER_COLORS[gender] || '#666', borderRadius: '3px', transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Age */}
          <div>
            <div style={{ fontSize: '11px', color: '#666', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Age Distribution</div>
            {sortedAge.map(a => (
              <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ width: '38px', fontSize: '11px', color: '#888', textAlign: 'right', fontWeight: '600' }}>{a.label}</span>
                <div style={{ flex: 1, height: '14px', background: '#252525', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max((a.value / maxAge) * 100, 2)}%`, height: '100%',
                    background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                    borderRadius: '3px', transition: 'width 0.5s ease',
                  }} />
                </div>
                <span style={{ width: '40px', fontSize: '11px', color: '#fff', fontWeight: '700', textAlign: 'right' }}>{a.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Traffic Sources + Devices row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #2A2A2A' }}>
        {/* Traffic Sources */}
        <div style={{ padding: '16px 20px', borderRight: '1px solid #2A2A2A' }}>
          <div style={{ fontSize: '11px', color: '#666', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
            Traffic Sources
          </div>
          {sortedTraffic.slice(0, 6).map(t => {
            const Icon = TRAFFIC_SOURCE_ICONS[t.key];
            const barWidth = maxTrafficPct > 0 ? (t.pct / maxTrafficPct) * 100 : 0;
            return (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '14px', display: 'flex', justifyContent: 'center' }}>
                  {Icon && <Icon size={12} style={{ color: '#555' }} />}
                </div>
                <span style={{ width: '100px', fontSize: '12px', color: '#ccc', fontWeight: '500' }}>{t.label}</span>
                <div style={{ flex: 1, height: '12px', background: '#252525', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max(barWidth, 2)}%`, height: '100%',
                    background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                    borderRadius: '3px', transition: 'width 0.5s ease',
                  }} />
                </div>
                <span style={{ width: '45px', fontSize: '11px', color: '#888', textAlign: 'right' }}>{fmtViews(t.views)}</span>
                <span style={{ width: '38px', fontSize: '12px', color: '#fff', fontWeight: '700', textAlign: 'right' }}>{t.pct.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>

        {/* Devices */}
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', color: '#666', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
            Devices
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {sortedDevices.map(d => {
              const Icon = DEVICE_ICONS[d.key] || Monitor;
              return (
                <div key={d.key} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', background: '#252525', borderRadius: '8px',
                }}>
                  <Icon size={16} style={{ color: '#10b981' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: '#fff', fontWeight: '600' }}>{d.label}</div>
                    <div style={{ fontSize: '10px', color: '#555' }}>{fmtViews(d.views)}</div>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: '#10b981' }}>{d.pct.toFixed(0)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
