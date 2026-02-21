import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Settings, LogOut, User } from "lucide-react";
import { MAIN_SECTIONS, UTILITY_SECTIONS, sectionForTab } from "../../lib/navigation.js";

/**
 * TopNav — Horizontal top navigation bar for desktop.
 *
 * Layout:
 * [ Logo ] [ Performance ▾ ] [ Research ▾ ] [ Content Lab ▾ ] [ Strategy ▾ ]  —  [ ⚙ ] [ 👤 ]
 *
 * Each section is a dropdown button. Clicking reveals the tabs within.
 * Settings & Onboarding live behind the gear icon.
 */
export default function TopNav({ tab, setTab, canAccessTab, isAdmin, onSignOut, userEmail }) {
  const [openDropdown, setOpenDropdown] = useState(null);
  const navRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeSection = sectionForTab(tab);

  const toggleDropdown = (id) => {
    setOpenDropdown((prev) => (prev === id ? null : id));
  };

  const handleTabClick = (tabId) => {
    setTab(tabId);
    setOpenDropdown(null);
  };

  // Collect all utility tabs into a flat list for the gear dropdown
  const utilityTabs = UTILITY_SECTIONS.flatMap((s) =>
    s.tabs
      .filter((t) => {
        if (t.adminOnly && !isAdmin) return false;
        return canAccessTab(t.id);
      })
      .map((t) => ({ ...t, sectionLabel: s.label }))
  );

  return (
    <nav
      ref={navRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        flex: 1,
      }}
    >
      {/* Main section dropdowns */}
      {MAIN_SECTIONS.map((section) => {
        const SectionIcon = section.icon;
        const isActive = activeSection === section.id;
        const isOpen = openDropdown === section.id;

        const visibleTabs = section.tabs.filter((t) => {
          if (t.adminOnly && !isAdmin) return false;
          return canAccessTab(t.id);
        });

        if (visibleTabs.length === 0) return null;

        return (
          <div key={section.id} style={{ position: "relative" }}>
            <button
              onClick={() => toggleDropdown(section.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                background: isActive ? "var(--accent-dim)" : "transparent",
                border: "none",
                borderRadius: "8px",
                color: isActive ? "var(--accent-text)" : "#9E9E9E",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "13px",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = "#E0E0E0";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = "#9E9E9E";
              }}
            >
              <SectionIcon size={16} />
              {section.label}
              <ChevronDown
                size={14}
                style={{
                  transform: isOpen ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform 0.2s",
                  opacity: 0.6,
                }}
              />
            </button>

            {/* Dropdown */}
            {isOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  minWidth: "200px",
                  background: "#1E1E1E",
                  border: "1px solid #333",
                  borderRadius: "10px",
                  padding: "6px",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                  zIndex: 200,
                }}
              >
                {visibleTabs.map((t) => {
                  const TabIcon = t.icon;
                  const isTabActive = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleTabClick(t.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 14px",
                        background: isTabActive ? "var(--accent-dim)" : "transparent",
                        border: "none",
                        borderRadius: "6px",
                        color: isTabActive ? "var(--accent-text)" : "#ccc",
                        cursor: "pointer",
                        fontWeight: isTabActive ? "600" : "500",
                        fontSize: "13px",
                        textAlign: "left",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        if (!isTabActive) e.currentTarget.style.background = "#252525";
                      }}
                      onMouseLeave={(e) => {
                        if (!isTabActive) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <TabIcon size={16} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Gear icon — Settings & Onboarding */}
      {utilityTabs.length > 0 && (
        <div style={{ position: "relative" }}>
          <button
            onClick={() => toggleDropdown("utility")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              background: openDropdown === "utility" ? "var(--accent-dim)" : "transparent",
              border: "none",
              borderRadius: "8px",
              color: openDropdown === "utility" ? "var(--accent-text)" : "#9E9E9E",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#252525"; }}
            onMouseLeave={(e) => {
              if (openDropdown !== "utility") e.currentTarget.style.background = "transparent";
            }}
          >
            <Settings size={18} />
          </button>

          {openDropdown === "utility" && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                minWidth: "220px",
                background: "#1E1E1E",
                border: "1px solid #333",
                borderRadius: "10px",
                padding: "6px",
                boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                zIndex: 200,
              }}
            >
              {utilityTabs.map((t, i) => {
                const TabIcon = t.icon;
                const isTabActive = tab === t.id;
                // Show a separator between sections
                const showSeparator = i > 0 && utilityTabs[i - 1].sectionLabel !== t.sectionLabel;
                return (
                  <React.Fragment key={t.id}>
                    {showSeparator && (
                      <div style={{ height: "1px", background: "#333", margin: "4px 8px" }} />
                    )}
                    <button
                      onClick={() => handleTabClick(t.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 14px",
                        background: isTabActive ? "var(--accent-dim)" : "transparent",
                        border: "none",
                        borderRadius: "6px",
                        color: isTabActive ? "var(--accent-text)" : "#ccc",
                        cursor: "pointer",
                        fontWeight: isTabActive ? "600" : "500",
                        fontSize: "13px",
                        textAlign: "left",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        if (!isTabActive) e.currentTarget.style.background = "#252525";
                      }}
                      onMouseLeave={(e) => {
                        if (!isTabActive) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <TabIcon size={16} />
                      {t.label}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* User avatar dropdown */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => toggleDropdown("user")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            background: openDropdown === "user" ? "var(--accent-dim)" : "#252525",
            border: "1px solid #333",
            borderRadius: "50%",
            color: "#9E9E9E",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <User size={16} />
        </button>

        {openDropdown === "user" && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: "220px",
              background: "#1E1E1E",
              border: "1px solid #333",
              borderRadius: "10px",
              padding: "12px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              zIndex: 200,
            }}
          >
            <div style={{
              fontSize: "12px",
              color: "#9E9E9E",
              marginBottom: "4px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {userEmail}
            </div>
            <div style={{ marginBottom: "10px" }}>
              <span style={{
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "10px",
                fontWeight: "600",
                background: isAdmin ? "var(--accent-dim)" : "rgba(158, 158, 158, 0.15)",
                color: isAdmin ? "var(--accent-text)" : "#9E9E9E",
              }}>
                {isAdmin ? "Admin" : "Viewer"}
              </span>
            </div>
            <div style={{ height: "1px", background: "#333", margin: "8px 0" }} />
            <button
              onClick={() => {
                setOpenDropdown(null);
                onSignOut();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 10px",
                background: "transparent",
                border: "none",
                borderRadius: "6px",
                color: "#9E9E9E",
                cursor: "pointer",
                fontWeight: "500",
                fontSize: "13px",
                textAlign: "left",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#252525"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
