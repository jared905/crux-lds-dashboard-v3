import React from "react";
import DiagnosticEngine from "./DiagnosticEngine.jsx";
import ContentPerformanceTiers from "./ContentPerformanceTiers.jsx";
import GrowthSimulator from "./GrowthSimulator.jsx";
import NextUpPanel from "./NextUpPanel.jsx";
import IntelligenceBriefView from "./IntelligenceBriefView.jsx";

/**
 * Unified Strategy Component
 * Combines Intelligence Brief + Recommendations + Diagnostics + Growth Simulator
 */
export default function UnifiedStrategy({ rows, activeClient, channelSubscriberCount = 0, channelSubscriberMap = {}, selectedChannel = "all" }) {
  return (
    <div style={{ padding: "0" }}>
      {/* 0. WEEKLY INTELLIGENCE BRIEF - Full view */}
      <IntelligenceBriefView activeClient={activeClient} rows={rows} />

      {/* 1. WHAT TO CREATE NEXT - Unified recommendations from all sources */}
      <NextUpPanel rows={rows} activeClient={activeClient} />

      {/* 2. PROJECTED GROWTH CHART - Visual motivation */}
      <GrowthSimulator rows={rows} currentSubscribers={channelSubscriberCount} channelSubscriberMap={channelSubscriberMap} selectedChannel={selectedChannel} />

      {/* 3. FULL DIAGNOSTICS - Detailed analysis */}
      <DiagnosticEngine rows={rows} />

      {/* 4. CONTENT PERFORMANCE TIERS - Evidence layer */}
      <ContentPerformanceTiers rows={rows} />
    </div>
  );
}
