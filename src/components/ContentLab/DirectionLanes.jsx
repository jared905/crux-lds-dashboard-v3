import React, { useState, useEffect } from "react";
import { Film, Smartphone } from "lucide-react";
import DirectionCard from "./DirectionCard";

/**
 * Two-column layout for long-form and short-form directions.
 * Falls back to tabs on narrow screens (<1200px).
 */
export default function DirectionLanes({
  longFormDirs, shortFormDirs,
  expandedCards, onToggleExpand,
  selections, onToggleElement,
  onCreateBrief, briefCreating,
  onDeploy, deploying, deployedData,
  onRecut, recutting, recutData,
  beatAnalysis,
}) {
  const [isWide, setIsWide] = useState(window.innerWidth >= 1200);
  const [activeTab, setActiveTab] = useState("long_form");

  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= 1200);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const renderCards = (dirs, isLongForm) => {
    const accent = isLongForm ? "#3b82f6" : "#ec4899";
    const prefix = isLongForm ? "lf" : "sf";
    if (dirs.length === 0) {
      return (
        <div style={{ padding: "32px", textAlign: "center", color: "#555", fontSize: "12px" }}>
          No {isLongForm ? "long-form" : "short-form"} directions generated
        </div>
      );
    }
    return dirs.map((dir, idx) => {
      const dirKey = `${prefix}_${idx}`;
      return (
        <DirectionCard
          key={dirKey}
          dir={dir}
          dirKey={dirKey}
          isLongForm={isLongForm}
          expanded={expandedCards.has(dirKey)}
          onToggleExpand={onToggleExpand}
          selectedElements={selections[dirKey]?.elements || new Set()}
          onToggleElement={onToggleElement}
          onCreateBrief={onCreateBrief}
          briefCreating={briefCreating}
          accentColor={accent}
          onDeploy={onDeploy}
          deploying={deploying}
          deployedData={deployedData[dir._savedId] || null}
          onRecut={onRecut}
          recutting={recutting}
          recutData={recutData[dir._savedId] || null}
          beatAnalysis={beatAnalysis}
        />
      );
    });
  };

  const LaneHeader = ({ icon: Icon, label, count, color }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: "8px",
      padding: "10px 0", marginBottom: "8px",
      borderBottom: `2px solid ${color}22`,
    }}>
      <Icon size={16} color={color} />
      <span style={{ fontSize: "13px", fontWeight: "700", color: "#fff" }}>{label}</span>
      <span style={{
        fontSize: "10px", fontWeight: "600", color, background: color + "18",
        borderRadius: "10px", padding: "1px 8px",
      }}>
        {count}
      </span>
    </div>
  );

  // Wide: two columns side by side
  if (isWide) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div>
          <LaneHeader icon={Film} label="Long-Form" count={longFormDirs.length} color="#3b82f6" />
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {renderCards(longFormDirs, true)}
          </div>
        </div>
        <div>
          <LaneHeader icon={Smartphone} label="Short-Form" count={shortFormDirs.length} color="#ec4899" />
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {renderCards(shortFormDirs, false)}
          </div>
        </div>
      </div>
    );
  }

  // Narrow: tabs
  const tabDirs = activeTab === "long_form" ? longFormDirs : shortFormDirs;
  const isLong = activeTab === "long_form";
  return (
    <div>
      <div style={{ display: "flex", gap: "4px", marginBottom: "12px" }}>
        {[
          { key: "long_form", label: "Long-Form", icon: Film, count: longFormDirs.length, color: "#3b82f6" },
          { key: "short_form", label: "Short-Form", icon: Smartphone, count: shortFormDirs.length, color: "#ec4899" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: "10px", background: activeTab === tab.key ? "#2a2a2a" : "transparent",
              border: `1px solid ${activeTab === tab.key ? tab.color + "44" : "#333"}`,
              borderBottom: activeTab === tab.key ? `2px solid ${tab.color}` : "2px solid transparent",
              borderRadius: "6px 6px 0 0", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              color: activeTab === tab.key ? tab.color : "#888", fontSize: "12px", fontWeight: "600",
            }}
          >
            <tab.icon size={14} />
            {tab.label}
            <span style={{
              fontSize: "10px", fontWeight: "600",
              background: (activeTab === tab.key ? tab.color : "#666") + "18",
              color: activeTab === tab.key ? tab.color : "#888",
              borderRadius: "10px", padding: "1px 8px",
            }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {renderCards(tabDirs, isLong)}
      </div>
    </div>
  );
}
