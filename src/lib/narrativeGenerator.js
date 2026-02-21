/**
 * narrativeGenerator.js — Generates human-readable performance narratives
 *
 * Takes KPI data and generates a headline + subheadline that tells
 * the story of this period's performance in plain English.
 */

import { fmtInt } from "./formatters.js";

/**
 * Calculate percentage change, handling edge cases
 */
function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Generate a narrative headline and subheadline from KPI data.
 *
 * @param {object} kpis - Current period KPIs
 * @param {object} previousKpis - Previous period KPIs
 * @param {object} filtered - Filtered video rows
 * @returns {{ headline: string, subheadline: string, sentiment: 'positive'|'negative'|'neutral' }}
 */
export function generateNarrative(kpis, previousKpis, filtered) {
  if (!kpis || !previousKpis || !filtered?.length) {
    return {
      headline: "Your channel performance at a glance",
      subheadline: "",
      sentiment: "neutral",
    };
  }

  const viewsDelta = pctChange(kpis.views, previousKpis.views);
  const watchDelta = pctChange(kpis.watchHours, previousKpis.watchHours);
  const subsDelta = pctChange(kpis.subs, previousKpis.subs);

  // Determine format split
  const shortsViews = kpis.shortsMetrics?.views || 0;
  const longsViews = kpis.longsMetrics?.views || 0;
  const totalViews = kpis.views || 1;
  const shortsPct = Math.round((shortsViews / totalViews) * 100);

  // Find the dominant story
  const stories = [];

  // Views story
  if (Math.abs(viewsDelta) >= 5) {
    const direction = viewsDelta > 0 ? "grew" : "declined";
    const driver = shortsPct > 60
      ? ", with Shorts driving the majority of traffic"
      : shortsPct < 30
        ? ", powered by long-form content"
        : "";
    stories.push({
      priority: Math.abs(viewsDelta),
      headline: `Your channel ${direction} ${Math.abs(viewsDelta).toFixed(0)}% in views this period${driver}.`,
      sentiment: viewsDelta > 0 ? "positive" : "negative",
    });
  }

  // Watch hours story
  if (Math.abs(watchDelta) >= 10 && Math.abs(watchDelta) > Math.abs(viewsDelta)) {
    const direction = watchDelta > 0 ? "up" : "down";
    stories.push({
      priority: Math.abs(watchDelta) * 0.9,
      headline: `Watch hours are ${direction} ${Math.abs(watchDelta).toFixed(0)}% — your ${watchDelta > 0 ? "content is resonating" : "audience retention needs attention"}.`,
      sentiment: watchDelta > 0 ? "positive" : "negative",
    });
  }

  // Subscriber story
  if (kpis.subs > 0 && Math.abs(subsDelta) >= 15) {
    const verb = subsDelta > 0 ? "accelerated" : "slowed";
    stories.push({
      priority: Math.abs(subsDelta) * 0.8,
      headline: `Subscriber growth ${verb} to ${kpis.subs >= 0 ? "+" : ""}${fmtInt(kpis.subs)} this period.`,
      sentiment: subsDelta > 0 ? "positive" : "negative",
    });
  }

  // Pick the best story
  stories.sort((a, b) => b.priority - a.priority);
  const bestStory = stories[0];

  if (!bestStory) {
    return {
      headline: `${fmtInt(kpis.views)} views across ${filtered.length} videos this period`,
      subheadline: buildSubheadline(kpis, filtered, shortsPct),
      sentiment: "neutral",
    };
  }

  return {
    headline: bestStory.headline,
    subheadline: buildSubheadline(kpis, filtered, shortsPct),
    sentiment: bestStory.sentiment,
  };
}

/**
 * Build a secondary line with supporting context
 */
function buildSubheadline(kpis, filtered, shortsPct) {
  const parts = [];

  if (filtered.length > 0) {
    parts.push(`${filtered.length} videos analyzed`);
  }

  if (kpis.watchHours > 0) {
    parts.push(`${fmtInt(kpis.watchHours)} watch hours`);
  }

  if (shortsPct > 0 && shortsPct < 100) {
    parts.push(`${shortsPct}% from Shorts`);
  }

  return parts.join("  ·  ");
}
