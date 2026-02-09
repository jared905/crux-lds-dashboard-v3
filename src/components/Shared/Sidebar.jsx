import React, { useState, useEffect } from "react";
import {
  X,
  Upload,
  LogOut,
  ChevronDown,
  ChevronRight,
  // Tab icons
  Home,
  Layers,
  Sparkles,
  Users,
  MessageSquare,
  Lightbulb,
  Brain,
  Zap,
  FileText,
  Target,
  Calendar,
  Building,
  Key,
  Shield,
  ShieldCheck,
  Table,
  ClipboardCheck,
  // Section icons
  BarChart3,
  Search,
  FlaskConical,
  Map,
  Briefcase,
  Settings,
} from "lucide-react";

const SECTIONS = [
  {
    id: "performance",
    label: "Performance",
    icon: BarChart3,
    tabs: [
      { id: "dashboard", label: "Dashboard", icon: Home },
      { id: "series-analysis", label: "Series Analysis", icon: Layers },
      { id: "channel-summary", label: "Channel Summary", icon: Sparkles },
    ],
  },
  {
    id: "research",
    label: "Research",
    icon: Search,
    tabs: [
      { id: "competitors", label: "Competitors", icon: Users },
      { id: "comments", label: "Comments", icon: MessageSquare },
    ],
  },
  {
    id: "content-lab",
    label: "Content Lab",
    icon: FlaskConical,
    tabs: [
      { id: "ideation", label: "Ideation", icon: Lightbulb },
      { id: "intelligence", label: "Intelligence", icon: Brain },
      { id: "atomizer", label: "Atomizer", icon: Zap },
    ],
  },
  {
    id: "strategy",
    label: "Strategy",
    icon: Map,
    tabs: [
      { id: "briefs", label: "Briefs", icon: FileText },
      { id: "actions", label: "Actions", icon: Target },
      { id: "calendar", label: "Calendar", icon: Calendar },
    ],
  },
  {
    id: "onboarding",
    label: "Onboarding",
    icon: Briefcase,
    tabs: [
      { id: "audits", label: "Audits", icon: ClipboardCheck },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    tabs: [
      { id: "clients", label: "Clients", icon: Building },
      { id: "api-keys", label: "API Keys", icon: Key },
      { id: "security", label: "Security", icon: ShieldCheck },
      { id: "standardizer", label: "Data Standardizer", icon: Table },
      { id: "user-management", label: "User Management", icon: Shield, adminOnly: true },
    ],
  },
];

/**
 * Returns the section id that contains the given tab id, or null.
 */
function sectionForTab(tabId) {
  for (const section of SECTIONS) {
    if (section.tabs.some((t) => t.id === tabId)) {
      return section.id;
    }
  }
  return null;
}

const Sidebar = ({ open, onClose, tab, setTab, onUpload, canAccessTab, isAdmin, onSignOut, userEmail }) => {
  // All sections start expanded
  const [expanded, setExpanded] = useState(() => {
    const initial = {};
    SECTIONS.forEach((s) => {
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
    // If this section contains the active tab, don't allow collapsing
    const activeSectionId = sectionForTab(tab);
    if (sectionId === activeSectionId) {
      return;
    }
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
          left: open ? 0 : "-280px",
          top: 0,
          width: "280px",
          height: "100vh",
          background: "#1E1E1E",
          borderRight: "1px solid #333",
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
            borderBottom: "1px solid #333",
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
          {SECTIONS.map((section) => {
            const SectionIcon = section.icon;
            const isExpanded = expanded[section.id];

            // Filter tabs: respect canAccessTab, and hide adminOnly tabs for non-admins
            const visibleTabs = section.tabs.filter((t) => {
              if (t.adminOnly && !isAdmin) return false;
              return canAccessTab(t.id);
            });

            // If no visible tabs in this section, skip rendering it entirely
            if (visibleTabs.length === 0) return null;

            return (
              <div key={section.id} style={{ marginBottom: "8px" }}>
                {/* Section header */}
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
                    fontWeight: "600",
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

                {/* Tab items */}
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
                          padding: "12px 28px",
                          marginBottom: "4px",
                          background: isActive ? "rgba(41, 98, 255, 0.15)" : "transparent",
                          border: "none",
                          borderRadius: "8px",
                          color: isActive ? "#60a5fa" : "#9E9E9E",
                          cursor: "pointer",
                          fontWeight: "600",
                          fontSize: "14px",
                          textAlign: "left",
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

          {/* Upload CSV button for admins */}
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
                border: "1px solid #333",
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
        <div style={{ padding: "16px", borderTop: "1px solid #333" }}>
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
                background: isAdmin ? "rgba(41, 98, 255, 0.15)" : "rgba(158, 158, 158, 0.15)",
                color: isAdmin ? "#60a5fa" : "#9E9E9E",
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
