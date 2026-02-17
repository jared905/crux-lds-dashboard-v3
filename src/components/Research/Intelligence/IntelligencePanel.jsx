import React, { useState, lazy, Suspense } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Loader } from 'lucide-react';
import BenchmarkSummaryBar from './BenchmarkSummaryBar';

const BreakoutsTab = lazy(() => import('./BreakoutsTab'));
const AudienceIntelTab = lazy(() => import('./AudienceIntelTab'));
const ThumbnailAnalysisTab = lazy(() => import('./ThumbnailAnalysisTab'));
const TitleLabTab = lazy(() => import('./TitleLabTab'));
const SeriesIdeasTab = lazy(() => import('./SeriesIdeasTab'));

const TABS = [
  { key: 'outliers', label: 'Breakouts', icon: '🔥' },
  { key: 'audience', label: 'Audience Intel', icon: '👥' },
  { key: 'thumbnails', label: 'Thumbnails', icon: '🖼️' },
  { key: 'titles', label: 'Title Lab', icon: '✍️' },
  { key: 'series', label: 'Series Ideas', icon: '🎬' },
];

function LoadingFallback() {
  return (
    <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>
      <Loader size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
      <div style={{ fontSize: '12px' }}>Loading...</div>
    </div>
  );
}

export default function IntelligencePanel({
  activeCompetitors, rows, activeClient, yourStats, benchmarks,
  categoryConfig,
  // Outlier state (passed through from CompetitorAnalysis)
  outliers, outliersLoading, outlierDays, setOutlierDays,
  outlierMinMultiplier, setOutlierMinMultiplier,
  fetchOutliers, handleViewInsight,
}) {
  const [activeTab, setActiveTab] = useState('outliers');
  const [collapsed, setCollapsed] = useState(false);
  const [titleLabTopic, setTitleLabTopic] = useState('');

  const competitorChannelIds = activeCompetitors.map(c => c.supabaseId).filter(Boolean);

  const handleNavigateToTitleLab = (topic) => {
    setTitleLabTopic(topic || '');
    setActiveTab('titles');
  };

  return (
    <div style={{
      background: '#1E1E1E', border: '1px solid #333', borderRadius: '12px',
      overflow: 'hidden', marginBottom: '16px',
    }}>
      {/* Panel header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          padding: '16px 20px', cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart3 size={16} color="#3b82f6" />
          Competitive Intelligence
        </div>
        {collapsed ? <ChevronDown size={16} color="#888" /> : <ChevronUp size={16} color="#888" />}
      </button>

      {!collapsed && (
        <div style={{ padding: '0 20px 20px' }}>
          {/* Benchmark Summary Bar */}
          <BenchmarkSummaryBar yourStats={yourStats} benchmarks={benchmarks} />

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #333', marginBottom: '16px', overflowX: 'auto' }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '8px 14px', background: 'transparent', border: 'none',
                  borderBottom: activeTab === tab.key ? '2px solid #3b82f6' : '2px solid transparent',
                  color: activeTab === tab.key ? '#fff' : '#888',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: '12px' }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <Suspense fallback={<LoadingFallback />}>
            {activeTab === 'outliers' && (
              <BreakoutsTab
                outliers={outliers}
                outliersLoading={outliersLoading}
                outlierDays={outlierDays}
                setOutlierDays={setOutlierDays}
                outlierMinMultiplier={outlierMinMultiplier}
                setOutlierMinMultiplier={setOutlierMinMultiplier}
                fetchOutliers={fetchOutliers}
                activeCompetitors={activeCompetitors}
                categoryConfig={categoryConfig}
                handleViewInsight={handleViewInsight}
                onNavigateToTitleLab={handleNavigateToTitleLab}
              />
            )}
            {activeTab === 'audience' && (
              <AudienceIntelTab
                channelIds={competitorChannelIds}
                clientId={activeClient?.id}
                activeCompetitors={activeCompetitors}
                onNavigateToTitleLab={handleNavigateToTitleLab}
              />
            )}
            {activeTab === 'thumbnails' && (
              <ThumbnailAnalysisTab
                channelIds={competitorChannelIds}
                clientId={activeClient?.id}
                rows={rows}
              />
            )}
            {activeTab === 'titles' && (
              <TitleLabTab
                channelIds={competitorChannelIds}
                clientId={activeClient?.id}
                rows={rows}
                initialTopic={titleLabTopic}
              />
            )}
            {activeTab === 'series' && (
              <SeriesIdeasTab
                channelIds={competitorChannelIds}
                clientId={activeClient?.id}
                rows={rows}
              />
            )}
          </Suspense>
        </div>
      )}
    </div>
  );
}
