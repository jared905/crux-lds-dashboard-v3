import React from "react";
import { Search, RotateCw, UploadCloud, ChevronDown, Video, Smartphone, ListFilter } from "lucide-react";

export default function FiltersBar({
  range,
  setRange,
  typeFilter,
  setTypeFilter,
  channels,
  setChannels,
  channelOptions,
  query,
  setQuery,
  onReload,
  onUpload,
  datasets,
  activeDataset,
  onSelectDataset
}) {
  // --- STYLES (Midnight Theme) ---
  const s = {
    container: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      backgroundColor: "#1e293b", // Slate 800
      border: "1px solid #334155", // Slate 700
      borderRadius: "12px",
      padding: "12px 16px",
      marginBottom: "24px",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
      flexWrap: "wrap",
    },
    // Input Group wrapper
    group: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      paddingRight: "12px",
      borderRight: "1px solid #334155", // Divider
      marginRight: "4px",
    },
    // The Dark Input/Select Style
    inputBase: {
      backgroundColor: "#0f172a", // Slate 900 (Inset)
      border: "1px solid #334155",
      color: "#f8fafc",
      borderRadius: "8px",
      padding: "8px 12px",
      fontSize: "13px",
      fontWeight: "500",
      outline: "none",
      transition: "border-color 0.2s",
      height: "36px",
      display: "flex",
      alignItems: "center",
    },
    // Search Box specific
    searchWrapper: {
      position: "relative",
      flex: 1,
      minWidth: "200px",
    },
    searchIcon: {
      position: "absolute",
      left: "10px",
      top: "50%",
      transform: "translateY(-50%)",
      color: "#64748b",
      pointerEvents: "none",
    },
    searchInput: {
      width: "100%",
      paddingLeft: "34px", // Space for icon
    },
    // Segmented Control (The Toggle)
    segmentedControl: {
      display: "flex",
      backgroundColor: "#0f172a",
      padding: "3px",
      borderRadius: "8px",
      border: "1px solid #334155",
      height: "36px",
    },
    segmentBtn: (isActive) => ({
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "0 12px",
      borderRadius: "6px",
      fontSize: "12px",
      fontWeight: "600",
      cursor: "pointer",
      border: "none",
      // Active = Slate 700 (Lighter), Inactive = Transparent
      backgroundColor: isActive ? "#334155" : "transparent",
      color: isActive ? "#fff" : "#94a3b8",
      transition: "all 0.2s ease",
    }),
    // Action Buttons
    iconBtn: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "36px",
      height: "36px",
      borderRadius: "8px",
      border: "1px solid #334155",
      backgroundColor: "#1e293b",
      color: "#94a3b8",
      cursor: "pointer",
      transition: "all 0.2s",
    },
    primaryBtn: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      backgroundColor: "#4f46e5", // Indigo 600
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      padding: "0 16px",
      height: "36px",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
    },
    divider: {
      height: "24px",
      width: "1px",
      backgroundColor: "#334155",
      margin: "0 4px"
    }
  };

  // Helper for dataset select
  const handleDatasetChange = (e) => {
    const selected = datasets.find(d => d.id === e.target.value);
    if (selected) onSelectDataset(selected);
  };

  return (
    <div style={s.container}>
      
      {/* 1. DATASET SELECTOR */}
      <div style={s.group}>
        <div style={{ position: "relative" }}>
           {/* Custom styled select */}
          <select 
            style={{ ...s.inputBase, paddingRight: "30px", minWidth: "140px", cursor: "pointer" }}
            value={activeDataset?.id}
            onChange={handleDatasetChange}
          >
            {datasets.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <ChevronDown size={14} style={{ position: "absolute", right: 10, top: 11, color: "#64748b", pointerEvents: "none" }} />
        </div>
      </div>

      {/* 2. DATE RANGE */}
      <div style={{ position: "relative" }}>
        <select
          style={{ ...s.inputBase, cursor: "pointer" }}
          value={range.kind}
          onChange={(e) => setRange({ kind: e.target.value })}
        >
          <option value="all">All Time</option>
          <option value="last7">Last 7 Days</option>
          <option value="last30">Last 30 Days</option>
          <option value="last90">Last 90 Days</option>
          <option value="ytd">Year to Date</option>
        </select>
      </div>

      <div style={s.divider} />

      {/* 3. TYPE TOGGLE (Segmented Control) */}
      <div style={s.segmentedControl}>
        <button 
          style={s.segmentBtn(typeFilter === "all")} 
          onClick={() => setTypeFilter("all")}
        >
          All
        </button>
        <button 
          style={s.segmentBtn(typeFilter === "short")} 
          onClick={() => setTypeFilter("short")}
        >
          <Smartphone size={12} /> Shorts
        </button>
        <button 
          style={s.segmentBtn(typeFilter === "long")} 
          onClick={() => setTypeFilter("long")}
        >
          <Video size={12} /> Long
        </button>
      </div>

      {/* 4. SEARCH BAR */}
      <div style={s.searchWrapper}>
        <Search size={14} style={s.searchIcon} />
        <input
          type="text"
          placeholder="Search titles or leaders..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...s.inputBase, ...s.searchInput }}
        />
      </div>

      {/* 5. CHANNEL FILTER */}
      <div style={{ position: "relative" }}>
        <select
          style={{ ...s.inputBase, maxWidth: "160px", cursor: "pointer" }}
          value={channels[0] || ""}
          onChange={(e) => setChannels(e.target.value ? [e.target.value] : [])}
        >
          <option value="">All Channels</option>
          {channelOptions.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div style={{ flex: 1 }} /> {/* Spacer */}

      {/* 6. ACTIONS */}
      <button 
        style={s.iconBtn} 
        onClick={onReload} 
        title="Reload Data"
        onMouseEnter={(e) => e.currentTarget.style.color = "#f8fafc"}
        onMouseLeave={(e) => e.currentTarget.style.color = "#94a3b8"}
      >
        <RotateCw size={16} />
      </button>

      <button 
        style={s.primaryBtn} 
        onClick={() => onUpload(null)}
      >
        <UploadCloud size={16} />
        <span>Upload Data</span>
      </button>

    </div>
  );
}