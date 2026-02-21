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
  Compass, Crosshair,
  BarChart3, Search, FlaskConical, Map, Briefcase, Settings,
} from "lucide-react";

/** Main sections shown in the top nav bar */
export const MAIN_SECTIONS = [
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
    ],
  },
  {
    id: "strategy",
    label: "Strategy",
    icon: Map,
    tabs: [
      { id: "opportunities", label: "Opportunities", icon: Compass },
      { id: "briefs", label: "Briefs", icon: FileText },
      { id: "actions", label: "Feedback", icon: Activity },
      { id: "calendar", label: "Calendar", icon: Calendar },
    ],
  },
];

/** Utility sections behind the gear icon */
export const UTILITY_SECTIONS = [
  {
    id: "onboarding",
    label: "Onboarding",
    icon: Briefcase,
    tabs: [
      { id: "audits", label: "Audits", icon: ClipboardCheck },
      { id: "brand-context", label: "Brand Context", icon: Palette },
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
