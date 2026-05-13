/**
 * Research v2 — entrypoint and lens router.
 *
 * One page, sticky scope picker, four lenses (Landscape / Patterns /
 * White Space / Movement). See mockups/research/ for the spec.
 */
import React, { useState, useEffect } from 'react';
import { Globe, BarChart3, Square, Inbox, RefreshCw, Loader } from 'lucide-react';
import ScopeBar from './ScopeBar.jsx';
import RecipesBar from './RecipesBar.jsx';
import LandscapeLens from './LandscapeLens.jsx';
import PatternsLens from './PatternsLens.jsx';
import WhiteSpaceLens from './WhiteSpaceLens.jsx';
import MovementLens from './MovementLens.jsx';
import { countActiveAlerts, resolveScopeToChannelIds } from '../../services/movementService.js';

const LENS_TABS = [
  { id: 'landscape', label: 'Landscape', icon: BarChart3, status: 'live' },
  { id: 'patterns', label: 'Patterns', icon: Globe, status: 'live' },
  { id: 'whitespace', label: 'White Space', icon: Square, status: 'live' },
  { id: 'movement', label: 'Movement', icon: Inbox, status: 'live' },
];

export default function ResearchV2() {
  const [activeLens, setActiveLens] = useState('landscape');
  const [scope, setScope] = useState({
    categoryIds: [],
    tags: [],
    tiers: ['priority', 'tracked'],
    search: '',
    windowDays: 30,
  });
  const [alertCount, setAlertCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Keep the alert badge in sync with current scope
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = await resolveScopeToChannelIds(scope);
        if (cancelled) return;
        const count = await countActiveAlerts({ scopeChannelIds: ids, windowDays: 14 });
        if (!cancelled) setAlertCount(count);
      } catch {
        if (!cancelled) setAlertCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, [
    scope.categoryIds?.join(','),
    scope.tags?.join(','),
    scope.tiers?.join(','),
    scope.clientId,
    refreshKey,
  ]);

  const handleRefresh = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);

    // Self-chain: each invocation processes a chunk; loop until queue is drained
    // or we hit a hard cap to avoid runaways. Each call should complete in <2 min.
    let totalSynced = 0;
    let totalVideos = 0;
    let totalErrors = 0;
    // 30 passes × 25 channels = 750 — comfortable headroom past 319 channels.
    // The auto-chaining cron picks up anything we miss overnight, but this
    // gives the manual click enough budget to drain in one go.
    const MAX_PASSES = 30;
    let pass = 0;

    try {
      while (pass < MAX_PASSES) {
        pass++;
        setSyncResult({ ok: true, message: `Syncing… pass ${pass} (${totalSynced} done)` });
        const resp = await fetch(
          '/api/sync-competitors?manual=true&limit=25&concurrency=3&skipIfFreshHours=12',
          { method: 'POST' }
        );
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

        totalSynced += data.channels_synced || 0;
        totalVideos += data.videos_synced || 0;
        totalErrors += (data.errors || []).length;

        // Stop when the queue is empty or no progress was made
        if ((data.channels_remaining || 0) === 0 && (data.channels_synced || 0) === 0) break;
        if ((data.channels_remaining || 0) === 0) break;
      }

      // Generate movement alerts off the freshly synced data
      let alertSummary = '';
      try {
        const alertResp = await fetch('/api/generate-competitor-alerts?manual=true', { method: 'POST' });
        if (alertResp.ok) {
          const alertData = await alertResp.json();
          if (alertData?.total > 0) alertSummary = ` · ${alertData.total} new alert${alertData.total === 1 ? '' : 's'}`;
        }
      } catch {
        // Alert generation is best-effort; sync result is the source of truth
      }

      setSyncResult({
        ok: true,
        message: `Synced ${totalSynced} channels · ${totalVideos} videos${totalErrors ? ` · ${totalErrors} errors` : ''}${alertSummary}`,
      });
      setRefreshKey(k => k + 1);
    } catch (err) {
      setSyncResult({ ok: false, message: err.message });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 10000);
    }
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1500px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>
          Research <span style={{ fontSize: '13px', fontWeight: 500, color: '#707070', marginLeft: '10px' }}>
            Competitor intelligence hub
          </span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {syncResult && (
            <span style={{
              fontSize: '12px',
              color: syncResult.ok ? '#34d399' : '#f87171',
              fontWeight: 500,
            }}>
              {syncResult.ok ? '✓ ' : '✕ '}{syncResult.message}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={syncing}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '6px',
              background: syncing ? '#1c1c20' : '#18181c',
              border: '1px solid #232328',
              color: syncing ? '#666' : '#d4d4d8',
              fontSize: '13px', fontWeight: 600,
              cursor: syncing ? 'wait' : 'pointer',
              fontFamily: 'inherit',
            }}
            title="Pull latest data for all tracked competitor channels (last 90 days)"
          >
            {syncing
              ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Syncing competitors…</>
              : <><RefreshCw size={13} /> Refresh data</>}
          </button>
        </div>
      </div>

      <RecipesBar onApply={({ lens, scope: newScope }) => {
        setScope(newScope);
        if (lens) setActiveLens(lens);
      }} />
      <ScopeBar scope={scope} onChange={setScope} />

      {/* Lens tabs */}
      <div style={{
        display: 'flex',
        gap: 2,
        margin: '16px 0 20px',
        borderBottom: '1px solid #1f1f24',
      }}>
        {LENS_TABS.map(t => {
          const isActive = activeLens === t.id;
          const isLive = t.status === 'live';
          return (
            <button
              key={t.id}
              onClick={() => isLive && setActiveLens(t.id)}
              disabled={!isLive}
              style={{
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 600,
                color: isActive ? '#fff' : (isLive ? '#888' : '#444'),
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${isActive ? '#3b82f6' : 'transparent'}`,
                marginBottom: '-1px',
                cursor: isLive ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontFamily: 'inherit',
              }}
            >
              <t.icon size={14} />
              {t.label}
              {!isLive && (
                <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '3px', background: '#1c1c20', color: '#666', letterSpacing: '0.5px' }}>SOON</span>
              )}
              {t.id === 'movement' && alertCount > 0 && (
                <span style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '99px',
                  background: 'rgba(239,68,68,0.18)',
                  color: '#f87171',
                  fontWeight: 700,
                  minWidth: '18px',
                  textAlign: 'center',
                }}>
                  {alertCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active lens content */}
      {activeLens === 'landscape' && <LandscapeLens scope={scope} refreshKey={refreshKey} />}
      {activeLens === 'patterns' && <PatternsLens scope={scope} refreshKey={refreshKey} />}
      {activeLens === 'whitespace' && <WhiteSpaceLens scope={scope} refreshKey={refreshKey} />}
      {activeLens === 'movement' && <MovementLens scope={scope} refreshKey={refreshKey} />}
    </div>
  );
}
