import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Loader, Activity, Users, Brain, Wrench } from 'lucide-react';
import CompetitivePulse from './CompetitivePulse';
import TrajectoryChart from './TrajectoryChart';
import LandscapeTab from './LandscapeTab';
import BreakoutHighlights from './BreakoutHighlights';
import CompetitorGroupSelector from '../Intelligence/CompetitorGroupSelector';

const MovesTab = lazy(() => import('./MovesTab'));
const AudienceWhiteSpaceTab = lazy(() => import('./AudienceWhiteSpaceTab'));
const AIBriefingTab = lazy(() => import('./AIBriefingTab'));

// Lazy-load existing tool tabs
const TitleLabTab = lazy(() => import('../Intelligence/TitleLabTab'));
const ThumbnailAnalysisTab = lazy(() => import('../Intelligence/ThumbnailAnalysisTab'));
const SeriesIdeasTab = lazy(() => import('../Intelligence/SeriesIdeasTab'));

const TIME_RANGES = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];

const DEEP_TABS = [
  { key: 'moves', label: 'Moves & Signals', icon: Activity },
  { key: 'audience', label: 'Audience & White Space', icon: Users },
  { key: 'briefing', label: 'AI Briefing', icon: Brain },
];

const TOOL_TABS = [
  { key: 'titles', label: 'Title Lab' },
  { key: 'thumbnails', label: 'Thumbnails' },
  { key: 'series', label: 'Series Ideas' },
];

function LoadingFallback() {
  return (
    <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
      <Loader size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
      <div style={{ fontSize: '12px' }}>Loading...</div>
    </div>
  );
}

export default function CommandCenter({
  activeCompetitors, rows, activeClient, yourStats, benchmarks,
  categoryConfig,
  outliers, outliersLoading, outlierDays, setOutlierDays,
  outlierMinMultiplier, setOutlierMinMultiplier,
  fetchOutliers, handleViewInsight,
  onSelectChannel,
}) {
  // --- Global time range ---
  const [timeRange, setTimeRange] = useState(30);

  // --- Deep-dive tabs ---
  const [activeDeepTab, setActiveDeepTab] = useState(null);
  const [showTools, setShowTools] = useState(false);
  const [activeTool, setActiveTool] = useState(null);

  // --- Shared data: bulk snapshots + recent videos ---
  const [snapshots, setSnapshots] = useState({});
  const [recentVideos, setRecentVideos] = useState({});
  const [dataLoading, setDataLoading] = useState(true);

  // --- Competitor Groups ---
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  const competitorIds = useMemo(
    () => activeCompetitors.map(c => c.supabaseId).filter(Boolean),
    [activeCompetitors]
  );

  // Fetch shared data — respects global time range
  useEffect(() => {
    if (!competitorIds.length) {
      setSnapshots({});
      setRecentVideos({});
      setDataLoading(false);
      return;
    }

    let cancelled = false;
    setDataLoading(true);

    (async () => {
      try {
        const { getBulkChannelSnapshots, getRecentVideosByChannels } = await import('../../../services/competitorDatabase');
        const [snaps, vids] = await Promise.all([
          getBulkChannelSnapshots(competitorIds, { days: timeRange }),
          getRecentVideosByChannels(competitorIds, { days: timeRange }),
        ]);
        if (!cancelled) {
          setSnapshots(snaps);
          setRecentVideos(vids);
        }
      } catch (e) {
        console.warn('[CommandCenter] Data fetch failed:', e.message);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [competitorIds.join(','), timeRange]);

  // Load groups from Supabase
  useEffect(() => {
    if (!activeClient?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { getCompetitorGroups } = await import('../../../services/competitorDatabase');
        const data = await getCompetitorGroups(activeClient.id);
        if (!cancelled) setGroups(data);
      } catch (e) {
        console.warn('[CommandCenter] Group load failed:', e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [activeClient?.id]);

  // Filter competitors by selected group
  const filteredCompetitors = useMemo(() => {
    if (!selectedGroupId) return activeCompetitors;
    const group = groups.find(g => g.id === selectedGroupId);
    if (!group) return activeCompetitors;
    const memberSet = new Set(group.channelIds);
    return activeCompetitors.filter(c => c.supabaseId && memberSet.has(c.supabaseId));
  }, [selectedGroupId, groups, activeCompetitors]);

  const filteredIds = useMemo(
    () => filteredCompetitors.map(c => c.supabaseId).filter(Boolean),
    [filteredCompetitors]
  );

  // Filter snapshots and recent videos by group
  const filteredSnapshots = useMemo(() => {
    if (!selectedGroupId) return snapshots;
    const idSet = new Set(filteredIds);
    const filtered = {};
    Object.entries(snapshots).forEach(([k, v]) => { if (idSet.has(k)) filtered[k] = v; });
    return filtered;
  }, [snapshots, filteredIds, selectedGroupId]);

  const filteredRecentVideos = useMemo(() => {
    if (!selectedGroupId) return recentVideos;
    const idSet = new Set(filteredIds);
    const filtered = {};
    Object.entries(recentVideos).forEach(([k, v]) => { if (idSet.has(k)) filtered[k] = v; });
    return filtered;
  }, [recentVideos, filteredIds, selectedGroupId]);

  return (
    <div style={{ marginBottom: '16px' }}>

      {/* ── GLOBAL CONTROLS ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        {/* Time Range */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {TIME_RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setTimeRange(r.days)}
              style={{
                padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '700',
                border: `1px solid ${timeRange === r.days ? 'var(--accent, #3b82f6)' : '#444'}`,
                background: timeRange === r.days ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: timeRange === r.days ? 'var(--accent, #3b82f6)' : '#888',
                cursor: 'pointer',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Group selector */}
        <CompetitorGroupSelector
          groups={groups}
          selectedGroupId={selectedGroupId}
          onGroupChange={setSelectedGroupId}
          onManageGroups={() => {}}
          competitorCount={activeCompetitors.length}
        />
      </div>

      {/* ── SECTION 1: COMPETITIVE PULSE ── */}
      <CompetitivePulse
        activeCompetitors={filteredCompetitors}
        snapshots={filteredSnapshots}
        outliers={outliers}
        yourStats={yourStats}
        activeClient={activeClient}
        onSelectChannel={onSelectChannel}
        loading={dataLoading}
      />

      {/* ── SECTION 2: TRAJECTORY CHART ── */}
      <TrajectoryChart
        competitors={filteredCompetitors}
        snapshots={filteredSnapshots}
        activeClient={activeClient}
        yourStats={yourStats}
        loading={dataLoading}
      />

      {/* ── SECTION 3: POWER RANKINGS ── */}
      <div style={{
        background: '#1E1E1E', border: '1px solid #2A2A2A', borderRadius: '8px',
        padding: '16px', marginBottom: '12px',
      }}>
        <LandscapeTab
          competitors={filteredCompetitors}
          snapshots={filteredSnapshots}
          recentVideos={filteredRecentVideos}
          categoryConfig={categoryConfig}
          loading={dataLoading}
          onSelectChannel={onSelectChannel}
          yourStats={yourStats}
          activeClient={activeClient}
        />
      </div>

      {/* ── SECTION 4: BREAKOUT HIGHLIGHTS ── */}
      <BreakoutHighlights
        outliers={outliers}
        onViewInsight={handleViewInsight}
      />

      {/* ── SECTION 5: DEEP-DIVE TABS ── */}
      <div style={{
        background: '#1E1E1E', border: '1px solid #2A2A2A', borderRadius: '8px',
        overflow: 'hidden',
      }}>
        {/* Tab bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0',
          borderBottom: '1px solid #333', padding: '0 16px',
          overflowX: 'auto',
        }}>
          {DEEP_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeDeepTab === tab.key && !activeTool;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveDeepTab(activeDeepTab === tab.key ? null : tab.key);
                  setActiveTool(null);
                  setShowTools(false);
                }}
                style={{
                  padding: '12px 16px', background: 'transparent', border: 'none',
                  borderBottom: isActive ? '2px solid var(--accent, #3b82f6)' : '2px solid transparent',
                  color: isActive ? '#fff' : '#888',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                }}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}

          {/* Tools dropdown */}
          <div style={{ position: 'relative', marginLeft: 'auto' }}>
            <button
              onClick={() => setShowTools(!showTools)}
              style={{
                padding: '12px 16px', background: 'transparent', border: 'none',
                borderBottom: activeTool ? '2px solid var(--accent, #3b82f6)' : '2px solid transparent',
                color: activeTool ? '#fff' : '#666',
                fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
              }}
            >
              <Wrench size={14} />
              Tools
            </button>
            {showTools && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, zIndex: 20,
                background: '#252525', border: '1px solid #444', borderRadius: '8px',
                padding: '4px', minWidth: '140px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                {TOOL_TABS.map(t => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setActiveTool(activeTool === t.key ? null : t.key);
                      setActiveDeepTab(null);
                      setShowTools(false);
                    }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 12px',
                      background: activeTool === t.key ? 'rgba(59,130,246,0.15)' : 'transparent',
                      border: 'none', borderRadius: '6px',
                      color: activeTool === t.key ? '#3b82f6' : '#ccc',
                      fontSize: '12px', fontWeight: '500', cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tab content — only renders when a deep tab is selected */}
        {(activeDeepTab || activeTool) && (
          <div style={{ padding: '16px 20px 20px' }}>
            <Suspense fallback={<LoadingFallback />}>
              {activeDeepTab === 'moves' && !activeTool && (
                <MovesTab
                  competitors={filteredCompetitors}
                  snapshots={filteredSnapshots}
                  outliers={outliers}
                  outliersLoading={outliersLoading}
                  fetchOutliers={fetchOutliers}
                  handleViewInsight={handleViewInsight}
                  categoryConfig={categoryConfig}
                  loading={dataLoading}
                />
              )}
              {activeDeepTab === 'audience' && !activeTool && (
                <AudienceWhiteSpaceTab
                  competitors={filteredCompetitors}
                  snapshots={filteredSnapshots}
                  activeClient={activeClient}
                  categoryConfig={categoryConfig}
                />
              )}
              {activeDeepTab === 'briefing' && !activeTool && (
                <AIBriefingTab
                  competitors={filteredCompetitors}
                  snapshots={filteredSnapshots}
                  outliers={outliers}
                  recentVideos={filteredRecentVideos}
                  activeClient={activeClient}
                  yourStats={yourStats}
                />
              )}

              {activeTool === 'titles' && (
                <TitleLabTab
                  activeCompetitors={filteredCompetitors}
                  channelIds={filteredIds}
                  initialTopic=""
                />
              )}
              {activeTool === 'thumbnails' && (
                <ThumbnailAnalysisTab
                  activeCompetitors={filteredCompetitors}
                  channelIds={filteredIds}
                />
              )}
              {activeTool === 'series' && (
                <SeriesIdeasTab
                  activeCompetitors={filteredCompetitors}
                  channelIds={filteredIds}
                />
              )}
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
