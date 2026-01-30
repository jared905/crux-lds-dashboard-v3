import React from "react";
import { LayoutDashboard, Lightbulb, Type, Building2 } from "lucide-react";

export default function BrandHeader({ activeTab, onTab }) {
  // Styles
  const s = {
    header: {
      display: "grid",
      gridTemplateColumns: "1fr auto 1fr", // 3 Columns: Left, Center, Right
      alignItems: "center",
      padding: "20px 0",
      marginBottom: "32px",
      borderBottom: "1px solid #374151" // Dark border
    },
    
    // LEFT: Client Brand
    brand: {
      display: "flex",
      alignItems: "center",
      gap: "16px"
    },
    logoBox: {
      height: "52px", // Increased from 44px
      width: "52px",  // Increased from 44px
      backgroundColor: "#1f2937", // Dark card bg
      borderRadius: "12px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "1px solid #4b5563",
      overflow: "hidden"
    },
    clientLogoImg: {
      height: "100%",
      width: "100%",
      objectFit: "contain", // Changed to contain so full logo is visible
      padding: "2px" // Small buffer so it doesn't touch edges
    },
    titleBlock: {
      display: "flex",
      flexDirection: "column",
      gap: "2px"
    },
    h1: {
      fontSize: "18px",
      fontWeight: "800",
      color: "#f9fafb", // White
      margin: 0,
      lineHeight: "1.2",
      letterSpacing: "-0.01em"
    },
    sub: {
      fontSize: "11px",
      color: "#9ca3af", // Muted
      fontWeight: "700",
      letterSpacing: "0.08em",
      textTransform: "uppercase"
    },

    // CENTER: Navigation
    nav: {
      display: "flex",
      backgroundColor: "#1f2937", // Dark pill container
      padding: "4px",
      borderRadius: "10px",
      border: "1px solid #374151",
      gap: "4px"
    },
    tab: (active) => ({
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 24px", // Wider buttons
      borderRadius: "8px",
      fontSize: "13px",
      fontWeight: "700",
      cursor: "pointer",
      border: "none",
      outline: "none",
      transition: "all 0.2s ease",
      backgroundColor: active ? "#374151" : "transparent", // Highlight active
      color: active ? "#fff" : "#9ca3af",
      boxShadow: active ? "0 1px 2px rgba(0,0,0,0.2)" : "none"
    }),

    // RIGHT: Powered By
    powered: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end", // Pushes content to the right
      gap: "14px",
    },
    poweredLabel: {
      fontSize: "10px",
      fontWeight: "700",
      color: "#6b7280",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      textAlign: "right"
    },
    poweredLogo: {
      height: "32px", // Increased from 24px
      width: "auto",
      // Removed filter and opacity for raw image
      display: "block"
    }
  };

  return (
    <header style={s.header}>
      {/* LEFT: CLIENT BRAND */}
      <div style={s.brand}>
        <div style={s.logoBox}>
          {/* Tries to load client-logo.png. */}
          <img 
            src="/client-logo.png" 
            alt="LDS" 
            style={s.clientLogoImg} 
            onError={(e) => {
              e.target.style.display='none'; 
              e.target.nextSibling.style.display='flex';
            }} 
          />
          {/* Fallback Icon (Hidden if image loads) */}
          <div style={{display:'none', color:'#60a5fa'}}>
            <Building2 size={28} />
          </div>
        </div>
        <div style={s.titleBlock}>
          <h1 style={s.h1}>LDS Leadership Strategist</h1>
          <div style={s.sub}>YouTube Analytics Hub</div>
        </div>
      </div>

      {/* CENTER: NAVIGATION */}
      <nav style={s.nav}>
        <button style={s.tab(activeTab === "Dashboard")} onClick={() => onTab("Dashboard")}>
          <LayoutDashboard size={16} /> Dashboard
        </button>
        <button style={s.tab(activeTab === "Strategist")} onClick={() => onTab("Strategist")}>
          <Lightbulb size={16} /> Strategist
        </button>
        <button style={s.tab(activeTab === "Title Gen")} onClick={() => onTab("Title Gen")}>
          <Type size={16} /> Title Gen
        </button>
      </nav>

      {/* RIGHT: POWERED BY CRUX */}
      <div style={s.powered}>
        <div style={s.titleBlock}>
          <span style={s.poweredLabel}>Powered By</span>
        </div>
        <img src="/crux-logo.png" alt="Crux" style={s.poweredLogo} />
      </div>
    </header>
  );
}