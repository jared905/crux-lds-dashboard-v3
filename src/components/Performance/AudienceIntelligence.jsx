/**
 * AudienceIntelligence — Demographics, Geography, Traffic Sources, Devices
 *
 * Displays channel-level audience data from YouTube Analytics API.
 * Positioned between Performance Timeline and Brand Funnel.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Globe, Users, Smartphone, Monitor, Tv, Tablet, Gamepad2,
  Search, ExternalLink, Play, List, Share2, Bell, BarChart3,
  ChevronDown, ChevronUp, Loader,
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

// Lazy-load map to avoid SSR issues and reduce initial bundle
const LazyMap = React.lazy(() => import('./AudienceMap.jsx'));

const TRAFFIC_SOURCE_LABELS = {
  YT_SEARCH: 'YouTube Search',
  SUBSCRIBER: 'Subscribers',
  SUGGESTED: 'Suggested Videos',
  BROWSE: 'Browse Features',
  EXT_URL: 'External',
  NOTIFICATION: 'Notifications',
  PLAYLIST: 'Playlists',
  YT_OTHER_PAGE: 'Other YouTube',
  NO_LINK_OTHER: 'Direct / Unknown',
  SHORTS: 'Shorts Feed',
  CAMPAIGN_CARD: 'Campaign Cards',
  END_SCREEN: 'End Screens',
  YT_CHANNEL: 'Channel Page',
  HASHTAGS: 'Hashtags',
  ANNOTATION: 'Annotations',
  LIVE_REDIRECT: 'Live Redirect',
  PRODUCT_PAGE: 'Product Page',
};

const TRAFFIC_SOURCE_ICONS = {
  YT_SEARCH: Search,
  SUBSCRIBER: Bell,
  SUGGESTED: Play,
  BROWSE: BarChart3,
  EXT_URL: ExternalLink,
  NOTIFICATION: Bell,
  PLAYLIST: List,
  SHORTS: Smartphone,
};

const DEVICE_ICONS = {
  MOBILE: Smartphone,
  DESKTOP: Monitor,
  TV: Tv,
  TABLET: Tablet,
  GAME_CONSOLE: Gamepad2,
};

const AGE_LABELS = {
  'age13-17': '13-17',
  'age18-24': '18-24',
  'age25-34': '25-34',
  'age35-44': '35-44',
  'age45-54': '45-54',
  'age55-64': '55-64',
  'age65-': '65+',
};

const GENDER_COLORS = {
  male: '#3b82f6',
  female: '#ec4899',
  user_specified: '#8b5cf6',
};

function SectionCard({ title, icon: Icon, children, accentColor = '#3b82f6' }) {
  return (
    <div style={{
      background: '#1E1E1E', border: '1px solid #2A2A2A', borderRadius: '10px',
      borderTop: `3px solid ${accentColor}`,
    }}>
      <div style={{
        padding: '14px 18px', borderBottom: '1px solid #2A2A2A',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        {Icon && <Icon size={16} style={{ color: accentColor }} />}
        <span style={{ fontSize: '14px', fontWeight: '700', color: '#fff' }}>{title}</span>
      </div>
      <div style={{ padding: '16px 18px' }}>
        {children}
      </div>
    </div>
  );
}

function HorizontalBar({ label, value, maxValue, color = '#3b82f6', suffix = '%' }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
      <div style={{ width: '60px', fontSize: '12px', color: '#aaa', fontWeight: '600', textAlign: 'right' }}>{label}</div>
      <div style={{ flex: 1, height: '20px', background: '#252525', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.max(pct, 1)}%`, height: '100%', background: color, borderRadius: '4px',
          transition: 'width 0.6s ease',
        }} />
      </div>
      <div style={{ width: '45px', fontSize: '12px', color: '#fff', fontWeight: '700', textAlign: 'right' }}>
        {value.toFixed(1)}{suffix}
      </div>
    </div>
  );
}

function TrafficSourceRow({ label, icon: Icon, views, pct, maxPct }) {
  const barWidth = maxPct > 0 ? (pct / maxPct) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
      <div style={{ width: '16px', display: 'flex', justifyContent: 'center' }}>
        {Icon && <Icon size={13} style={{ color: '#666' }} />}
      </div>
      <div style={{ width: '130px', fontSize: '12px', color: '#ccc', fontWeight: '500' }}>{label}</div>
      <div style={{ flex: 1, height: '16px', background: '#252525', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.max(barWidth, 1)}%`, height: '100%',
          background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
          borderRadius: '3px', transition: 'width 0.6s ease',
        }} />
      </div>
      <div style={{ width: '70px', fontSize: '11px', color: '#888', textAlign: 'right' }}>
        {views >= 1000 ? `${(views / 1000).toFixed(1)}K` : views}
      </div>
      <div style={{ width: '40px', fontSize: '12px', color: '#fff', fontWeight: '700', textAlign: 'right' }}>
        {pct.toFixed(1)}%
      </div>
    </div>
  );
}

export default function AudienceIntelligence({ activeClient, dateRange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Fetch audience data from Supabase
  useEffect(() => {
    if (!activeClient?.id) return;
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);

      // Build channel IDs (handle network clients)
      const channelIds = activeClient.isNetwork && activeClient.networkMembers
        ? activeClient.networkMembers.map(m => m.id)
        : [activeClient.id];

      // Get most recent audience snapshot for each channel
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

        // Merge gender (average percentages)
        if (snapshot.gender_distribution) {
          for (const [k, v] of Object.entries(snapshot.gender_distribution)) {
            allData.gender[k] = (allData.gender[k] || 0) + v;
          }
        }

        // Merge age
        if (snapshot.age_distribution) {
          for (const [k, v] of Object.entries(snapshot.age_distribution)) {
            allData.age[k] = (allData.age[k] || 0) + v;
          }
        }

        // Merge country (sum views)
        if (snapshot.country_data) {
          for (const [code, d] of Object.entries(snapshot.country_data)) {
            if (!allData.country[code]) allData.country[code] = { views: 0, watchHours: 0, pct: 0 };
            allData.country[code].views += d.views || 0;
            allData.country[code].watchHours += d.watchHours || 0;
          }
        }

        // Merge traffic sources (sum views)
        if (snapshot.traffic_sources) {
          for (const [src, d] of Object.entries(snapshot.traffic_sources)) {
            if (!allData.trafficSources[src]) allData.trafficSources[src] = { views: 0, watchHours: 0 };
            allData.trafficSources[src].views += d.views || 0;
            allData.trafficSources[src].watchHours += d.watchHours || 0;
          }
        }

        // Merge devices (sum views)
        if (snapshot.device_types) {
          for (const [dev, d] of Object.entries(snapshot.device_types)) {
            if (!allData.deviceTypes[dev]) allData.deviceTypes[dev] = { views: 0, watchHours: 0 };
            allData.deviceTypes[dev].views += d.views || 0;
            allData.deviceTypes[dev].watchHours += d.watchHours || 0;
          }
        }
      }

      // Normalize averaged demographics by channel count
      const chCount = channelIds.length;
      if (chCount > 1) {
        for (const k of Object.keys(allData.gender)) allData.gender[k] /= chCount;
        for (const k of Object.keys(allData.age)) allData.age[k] /= chCount;
      }

      // Recalculate percentages for country/traffic/device
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

  // Sorted data for rendering
  const sortedTraffic = useMemo(() => {
    if (!data?.trafficSources) return [];
    return Object.entries(data.trafficSources)
      .map(([key, val]) => ({ key, label: TRAFFIC_SOURCE_LABELS[key] || key, ...val }))
      .sort((a, b) => b.views - a.views);
  }, [data?.trafficSources]);

  const sortedDevices = useMemo(() => {
    if (!data?.deviceTypes) return [];
    return Object.entries(data.deviceTypes)
      .map(([key, val]) => ({ key, label: key.charAt(0) + key.slice(1).toLowerCase(), ...val }))
      .sort((a, b) => b.views - a.views);
  }, [data?.deviceTypes]);

  const sortedCountries = useMemo(() => {
    if (!data?.country) return [];
    return Object.entries(data.country)
      .map(([code, val]) => ({ code, ...val }))
      .sort((a, b) => b.views - a.views);
  }, [data?.country]);

  const sortedAge = useMemo(() => {
    if (!data?.age) return [];
    const order = ['age13-17', 'age18-24', 'age25-34', 'age35-44', 'age45-54', 'age55-64', 'age65-'];
    return order
      .filter(k => data.age[k] != null)
      .map(k => ({ key: k, label: AGE_LABELS[k] || k, value: data.age[k] }));
  }, [data?.age]);

  if (loading) {
    return (
      <div style={{ background: '#1E1E1E', border: '1px solid #2A2A2A', borderRadius: '10px', padding: '40px', textAlign: 'center', marginBottom: '24px' }}>
        <Loader size={20} style={{ color: '#555', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: '12px', color: '#555', marginTop: '8px' }}>Loading audience data...</div>
      </div>
    );
  }

  if (!data) {
    return null; // No audience data yet — section hidden until sync runs
  }

  const maxAge = Math.max(...sortedAge.map(a => a.value), 1);
  const maxTrafficPct = sortedTraffic.length > 0 ? sortedTraffic[0].pct : 1;

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Section Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '16px', cursor: 'pointer',
      }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Globe size={20} style={{ color: '#3b82f6' }} />
          <span style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>Audience Intelligence</span>
          <span style={{ fontSize: '11px', color: '#555', fontWeight: '500' }}>
            {sortedCountries.length} countries
          </span>
        </div>
        {expanded ? <ChevronUp size={18} style={{ color: '#555' }} /> : <ChevronDown size={18} style={{ color: '#555' }} />}
      </div>

      {/* Global Map — always visible */}
      <div style={{
        background: '#1E1E1E', border: '1px solid #2A2A2A', borderRadius: '10px',
        padding: '4px', marginBottom: '16px', overflow: 'hidden',
      }}>
        <React.Suspense fallback={
          <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader size={20} style={{ color: '#555', animation: 'spin 1s linear infinite' }} />
          </div>
        }>
          <LazyMap countries={sortedCountries} />
        </React.Suspense>
      </div>

      {/* Expandable detail cards */}
      {expanded && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Demographics: Age */}
          <SectionCard title="Age Distribution" icon={Users} accentColor="#f59e0b">
            {sortedAge.map(a => (
              <HorizontalBar key={a.key} label={a.label} value={a.value} maxValue={maxAge} color="#f59e0b" />
            ))}
          </SectionCard>

          {/* Demographics: Gender */}
          <SectionCard title="Gender" icon={Users} accentColor="#ec4899">
            {Object.entries(data.gender || {})
              .sort(([, a], [, b]) => b - a)
              .map(([gender, pct]) => (
                <HorizontalBar
                  key={gender}
                  label={gender === 'user_specified' ? 'Other' : gender.charAt(0).toUpperCase() + gender.slice(1)}
                  value={pct}
                  maxValue={100}
                  color={GENDER_COLORS[gender] || '#666'}
                />
              ))
            }
          </SectionCard>

          {/* Traffic Sources */}
          <SectionCard title="Traffic Sources" icon={Search} accentColor="#3b82f6">
            {sortedTraffic.slice(0, 8).map(t => (
              <TrafficSourceRow
                key={t.key}
                label={t.label}
                icon={TRAFFIC_SOURCE_ICONS[t.key]}
                views={t.views}
                pct={t.pct}
                maxPct={maxTrafficPct}
              />
            ))}
          </SectionCard>

          {/* Device Types */}
          <SectionCard title="Devices" icon={Smartphone} accentColor="#10b981">
            {sortedDevices.map(d => {
              const Icon = DEVICE_ICONS[d.key] || Monitor;
              return (
                <div key={d.key} style={{
                  display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px',
                  padding: '10px 12px', background: '#252525', borderRadius: '8px',
                }}>
                  <Icon size={18} style={{ color: '#10b981' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600' }}>{d.label}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      {d.views >= 1000 ? `${(d.views / 1000).toFixed(1)}K` : d.views} views
                    </div>
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#10b981' }}>
                    {d.pct.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
