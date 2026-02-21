import React, { useState, useEffect } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { X, Upload, LogOut, ChevronDown, ChevronRight } from "lucide-react";
import { ALL_SECTIONS, sectionForTab } from "../../lib/navigation.js";

const Sidebar = ({ open, onClose, tab, setTab, onUpload, canAccessTab, isAdmin, onSignOut, userEmail }) => {
  const { isMobile } = useMediaQuery();
  // All sections start expanded
  const [expanded, setExpanded] = useState(() => {
    const initial = {};
    ALL_SECTIONS.forEach((s) => {
      initial[s.id] = true;
    });
    return initial;
  });

  // Force the section containing the active tab to be open whenever tab changes
  useEffect(() => {
    const activeSectionId = sectionForTab(tab);
    if (activeSectionId && !expanded[activeSectionId]) {
      setExpanded((prev) => ({ ...prev, [activeSectionId]: true }));
    }
  }, [tab]);

  const toggleSection = (sectionId) => {
    const activeSectionId = sectionForTab(tab);
    if (sectionId === activeSectionId) return;
    setExpanded((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  return (
    <>
      {/* Overlay backdrop */}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 998 }}
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : isMobile ? "-85vw" : "-280px",
          top: 0,
          width: isMobile ? "min(280px, 85vw)" : "280px",
          height: "100vh",
          background: "#1E1E1E",
          borderRight: "1px solid #2A2A2A",
          transition: "left 0.3s",
          zIndex: 999,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Logo header */}
        <div
          style={{
            padding: "24px",
            borderBottom: "1px solid #2A2A2A",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <img
              src="/Full_View_Logo.png"
              alt="Full View Analytics"
              style={{ height: "75px", objectFit: "contain" }}
            />
            <div
              style={{
                fontSize: "9px",
                color: "#666",
                fontWeight: "600",
                letterSpacing: "0.5px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              POWERED BY{" "}
              <img
                src="/crux-logo.png"
                alt="CRUX"
                style={{ height: "10px", objectFit: "contain", opacity: 0.6 }}
              />
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#9E9E9E", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Sectioned navigation */}
        <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
          {ALL_SECTIONS.map((section) => {
            const SectionIcon = section.icon;
            const isExpanded = expanded[section.id];

            const visibleTabs = section.tabs.filter((t) => {
              if (t.adminOnly && !isAdmin) return false;
              return canAccessTab(t.id);
            });

            if (visibleTabs.length === 0) return null;

            return (
              <div key={section.id} style={{ marginBottom: "8px" }}>
                <button
                  onClick={() => toggleSection(section.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 8px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "10px",
                    color: "#666",
                    fontWeight: "700",
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    textAlign: "left",
                  }}
                >
                  <SectionIcon size={12} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{section.label}</span>
                  {isExpanded ? (
                    <ChevronDown size={12} style={{ flexShrink: 0, transition: "transform 0.2s" }} />
                  ) : (
                    <ChevronRight size={12} style={{ flexShrink: 0, transition: "transform 0.2s" }} />
                  )}
                </button>

                {isExpanded &&
                  visibleTabs.map((t) => {
                    const TabIcon = t.icon;
                    const isActive = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTab(t.id);
                          onClose();
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: isMobile ? "14px 20px" : "12px 28px",
                          marginBottom: "4px",
                          background: isActive ? "var(--accent-dim)" : "transparent",
                          border: "none",
                          borderRadius: "8px",
                          color: isActive ? "var(--accent-text)" : "#9E9E9E",
                          cursor: "pointer",
                          fontWeight: "600",
                          fontSize: "14px",
                          textAlign: "left",
                          minHeight: isMobile ? "44px" : "auto",
                        }}
                      >
                        <TabIcon size={18} />
                        {t.label}
                      </button>
                    );
                  })}
              </div>
            );
          })}

          {isAdmin && (
            <button
              onClick={() => {
                onUpload();
                onClose();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "10px 16px",
                background: "#1E1E1E",
                border: "1px solid #2A2A2A",
                borderRadius: "8px",
                color: "#E0E0E0",
                cursor: "pointer",
                fontWeight: "600",
                marginTop: "24px",
              }}
            >
              <Upload size={16} />
              Upload CSV
            </button>
          )}
        </div>

        {/* User info and sign out */}
        <div style={{ padding: "16px", borderTop: "1px solid #2A2A2A" }}>
          <div
            style={{
              fontSize: "12px",
              color: "#9E9E9E",
              marginBottom: "8px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {userEmail}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "10px",
                fontWeight: "600",
                background: isAdmin ? "var(--accent-dim)" : "rgba(158, 158, 158, 0.15)",
                color: isAdmin ? "var(--accent-text)" : "#9E9E9E",
              }}
            >
              {isAdmin ? "Admin" : "Viewer"}
            </span>
          </div>
          <button
            onClick={onSignOut}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "10px 16px",
              background: "transparent",
              border: "1px solid #444",
              borderRadius: "8px",
              color: "#9E9E9E",
              cursor: "pointer",
              fontWeight: "500",
              fontSize: "13px",
              marginTop: "12px",
            }}
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
