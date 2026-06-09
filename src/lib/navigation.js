/**
 * navigation.js — Shared navigation structure
 *
 * Single source of truth for sections and tabs.
 * Used by both TopNav (desktop) and Sidebar (mobile).
 */
import {
  Home, Layers, Sparkles,
  Users, MessageSquare,
  Lightbulb, Brain, Zap,
  FileText, Activity, Calendar,
  Building, Key, Shield, ShieldCheck, Table,
  ClipboardCheck, Palette,
  Compass, Crosshair, Target, Radar, Gauge, Users2, ScrollText, AlertCircle,
  BarChart3, Search, FlaskConical, Map, Briefcase, Settings,
} from "lucide-react";

/** Main sections shown in the top nav bar */
export const MAIN_SECTIONS = [
  {
    id: "operate",
    label: "Operate",
    icon: Briefcase,
    // P2 #9 + #10 (2026-06-08): grouped into Daily (the cross-client
    // alerts feed strategist opens to) + Clients (the portfolio +
    // onboarding artifacts that were previously under ⚙ → Onboarding).
    // Brand Context and Audits are client-onboarding artifacts that
    // belong with the client they're for, not in a utility menu.
    tabs: [
      { id: "this-week", label: "This Week", icon: AlertCircle, group: "Daily", recommended: true },
      { id: "portfolio", label: "Clients", icon: Users, group: "Clients" },
      { id: "audits", label: "Audits", icon: ClipboardCheck, group: "Clients" },
      { id: "brand-context", label: "Brand Context", icon: Palette, group: "Clients" },
    ],
  },
  {
    id: "performance",
    label: "Performance",
    icon: BarChart3,
    tabs: [
      { id: "dashboard", label: "Dashboard", icon: Home },
      { id: "series-analysis", label: "Series Analysis", icon: Layers },
      { id: "channel-summary", label: "Channel Summary", icon: Sparkles },
      { id: "saved-reports", label: "Reports", icon: FileText },
      { id: "quarterly-report", label: "Quarterly", icon: Activity },
    ],
  },
  {
    id: "research",
    label: "Research",
    icon: Search,
    tabs: [
      { id: "research-v2", label: "Competitors", icon: Users },
      { id: "gap-detection", label: "Gap Detection", icon: Crosshair },
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
      // P0-rename 2026-06-08: was "Briefs" — collided with Strategy → Brief.
      // "Production Briefs" clarifies it's the per-video shoot brief, not
      // the weekly strategist brief.
      { id: "briefs", label: "Production Briefs", icon: FileText },
    ],
  },
  {
    id: "strategy",
    label: "Strategy",
    icon: Map,
    // P2 #9 (2026-06-08): tabs grouped into three logical phases of work.
    // TopNav renders group headers between transitions in the dropdown,
    // reducing the "9 flat options" cognitive scan for new strategists.
    // Order reflects natural sequence: produce artifacts → understand
    // the channel → keep tabs on signal.
    tabs: [
      // ── Act: produce the artifacts a client sees ──
      { id: "weekly-brief", label: "Brief", icon: ScrollText, group: "Act", recommended: true },
      { id: "pre-flight", label: "Pre-flight", icon: Crosshair, group: "Act" },
      // ── Diagnose: understand the channel's strategic position ──
      { id: "cohort-roles", label: "Cohort", icon: Users2, group: "Diagnose" },
      // 2026-06-09: Audience workspace — synthesizes structured persona
      // from existing signals; lives on the Spine; inherited by every
      // downstream LLM artifact.
      { id: "audience", label: "Audience", icon: Users, group: "Diagnose" },
      { id: "repositioning", label: "Repositioning", icon: Target, group: "Diagnose" },
      { id: "competitor-scan", label: "Competitor Scan", icon: Radar, group: "Diagnose" },
      { id: "calibration", label: "Calibration", icon: Gauge, group: "Diagnose" },
      // ── Track: keep tabs on signal over time ──
      { id: "opportunities", label: "Opportunities", icon: Compass, group: "Track" },
      // P0-rename 2026-06-08: was "Feedback" — ambiguous what kind.
      { id: "actions", label: "Recent Uploads", icon: Activity, group: "Track" },
      { id: "calendar", label: "Calendar", icon: Calendar, group: "Track" },
    ],
  },
];

/** Utility sections behind the gear icon */
// P2 #10 (2026-06-08): Onboarding section removed. Audits + Brand Context
// migrated into Operate → Clients group because they're client-onboarding
// artifacts that belong with the client they're for, not a utility menu.
export const UTILITY_SECTIONS = [
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    tabs: [
      // P0 2026-06-08: removed Settings → Clients link — it pointed at
      // tab="clients" which had no handler in App.jsx (dead route).
      // Client management lives at Operate → Clients (Portfolio).
      { id: "api-keys", label: "API Keys", icon: Key },
      { id: "security", label: "Security", icon: ShieldCheck },
      { id: "standardizer", label: "Data Standardizer", icon: Table },
      { id: "user-management", label: "User Management", icon: Shield, adminOnly: true },
    ],
  },
];

/** All sections combined (for Sidebar / mobile menu) */
export const ALL_SECTIONS = [...MAIN_SECTIONS, ...UTILITY_SECTIONS];

/**
 * Returns the section id that contains the given tab id, or null.
 */
export function sectionForTab(tabId) {
  for (const section of ALL_SECTIONS) {
    if (section.tabs.some((t) => t.id === tabId)) {
      return section.id;
    }
  }
  return null;
}
