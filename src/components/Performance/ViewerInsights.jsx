/**
 * ViewerInsights — the audience deep-dive (2026-08-20 boss request):
 * where viewers watch, on what, whether subscribers or passers-by do
 * the watching, how they arrive, and what the upload history says
 * about the shorts → long-form handoff.
 *
 * Data: audience_breakdowns (nightly /api/cron/audience-sync from the
 * YouTube Analytics API) + the client's own rows for the handoff
 * analysis. Honesty rules: only claims the public API supports; the
 * Studio-only metrics (new vs returning, viewer journeys) are named
 * as unavailable instead of being faked.
 */

import {useEffect, useMemo, useState} from "react";
import {Globe2, MonitorSmartphone, UserCheck, Compass, ArrowRightLeft} from "lucide-react";
import { getViewerBreakdowns, computeShortsHandoff } from "../../services/viewerInsightsService.js";
import { Youtube } from 'lucide-react';
import BrandLoader from '../Shared/Loading.jsx';
import { PanelSkeleton } from '../Shared/Loading.jsx';

const SHORTS_COLOR = "var(--pos)";
const LONG_COLOR = "var(--blue)";

const DEVICE_LABELS = {
  MOBILE: "Phones",
  DESKTOP: "Computers",
  TV: "TV screens",
  TABLET: "Tablets",
  GAME_CONSOLE: "Game consoles",
  UNKNOWN_PLATFORM: "Other",
};

const TRAFFIC_LABELS = {
  RELATED_VIDEO: "Suggested videos",
  YT_SEARCH: "YouTube search",
  BROWSE_FEATURES: "Home & Browse",
  SHORTS: "Shorts feed",
  EXT_URL: "External links",
  NOTIFICATION: "Notifications",
  PLAYLIST: "Playlists",
  SUBSCRIBER: "Subscriptions feed",
  CHANNEL: "Channel pages",
  END_SCREEN: "End screens",
  ANNOTATION: "Cards & annotations",
  PROMOTED: "Ads",
  YT_OTHER_PAGE: "Other YouTube pages",
  NO_LINK_EMBEDDED: "Embedded players",
  NO_LINK_OTHER: "Direct / unknown",
  SOUND_PAGE: "Sound pages",
  HASHTAGS: "Hashtag pages",
  SHORTS_CONTENT_LINKS: "Links in Shorts",
  LIVE_REDIRECT: "Live redirects",
  VIDEO_REMIXES: "Remixes",
};

const SUBSCRIBED_LABELS = {
  SUBSCRIBED: "Subscribers",
  UNSUBSCRIBED: "Not subscribed",
};

let regionNames = null;
try {
  regionNames = new Intl.DisplayNames(["en"], { type: "region" });
} catch { /* older engines: fall back to the raw code */ }

const countryName = (code) => {
  if (!code || code.length !== 2) return code;
  try { return regionNames ? regionNames.of(code.toUpperCase()) : code; } catch { return code; }
};

const fmtInt = (n) => (!n || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
const fmtCompact = (n) => {
  if (!n || isNaN(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
};
const fmtPct = (n) => `${(n * 100).toFixed(n * 100 < 10 ? 1 : 0)}%`;
const fmtMins = (secs) => {
  if (secs == null || isNaN(secs)) return null;
  const m = Math.floor(secs / 60), s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

/** Neutral horizontal bar row: label, share bar, value. */
function BarRow({ label, share, value, valueLabel, sub, color = "var(--blue)", isLast }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 150px", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: isLast ? "none" : "1px solid var(--border)" }}>
      <div style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>{label}</div>
      <div style={{ height: 8, background: "var(--input-bg)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${Math.max(share * 100, 0.5)}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <div style={{ fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {valueLabel ? (
          <span style={{ color: "var(--ink)", fontWeight: 600 }}>{valueLabel}</span>
        ) : (
          <>
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>{fmtPct(share)}</span>
            <span style={{ color: "var(--faint)", marginLeft: 6 }}>{fmtCompact(value)}</span>
          </>
        )}
        {sub && <div style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.4 }}>{sub}</div>}
      </div>
    </div>
  );
}

/** Section card with kicker + title + one-line meaning. */
function Section({ icon: Icon, kicker, title, meaning, children }) {
  return (
    <div className="section-card" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: 24, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
        {Icon && <Icon size={20} style={{ color: "var(--muted)", marginTop: 3, flexShrink: 0 }} />}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "var(--track-label)", fontFamily: "var(--font-label)", color: "var(--muted)", marginBottom: 2 }}>{kicker}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>{title}</div>
          {meaning && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, maxWidth: "70ch", lineHeight: 1.5 }}>{meaning}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Shorts vs long-form split legend chip pair. */
function FormatLegend() {
  return (
    <div style={{ display: "flex", gap: 14, fontSize: 12, marginBottom: 10 }}>
      <span style={{ color: SHORTS_COLOR, fontWeight: 600 }}>● Shorts</span>
      <span style={{ color: LONG_COLOR, fontWeight: 600 }}>● Long-form</span>
    </div>
  );
}

export default function ViewerInsights({ activeClient, rows }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    getViewerBreakdowns(activeClient?.id)
      .then((data) => { if (!cancelled) setState({ loading: false, error: null, data }); })
      .catch((e) => { if (!cancelled) setState({ loading: false, error: e.message || String(e), data: null }); });
    return () => { cancelled = true; };
  }, [activeClient?.id]);

  const handoff = useMemo(() => computeShortsHandoff(rows), [rows]);

  const dims = state.data?.byDimension || {};
  const all = (dim) => (dims[dim] || []).filter(r => r.format === "all");
  const byFormat = (dim) => (dims[dim] || []).filter(r => r.format === "shorts" || r.format === "longform");
  const hasApiData = Object.keys(dims).length > 0;

  const totalViews = (list) => list.reduce((s, r) => s + r.views, 0);

  if (state.loading) {
    return (
      <div>
        <BrandLoader label={`Reading ${activeClient?.name || "this channel"}’s audience…`} />
        <PanelSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div>
      {/* Page head */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "var(--track-label)", fontFamily: "var(--font-label)", color: "var(--muted)", marginBottom: 4 }}>Performance</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: "var(--ink)" }}>Viewers</div>
        <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4, maxWidth: "76ch", lineHeight: 1.6 }}>
          Who is actually watching {activeClient?.name} — where they are, what screen they're on,
          whether subscribers or passers-by drive the numbers, and how people find the channel.
          {state.data?.period && (
            <span style={{ color: "var(--outline)" }}> Window: {state.data.period.start} → {state.data.period.end}.</span>
          )}
        </div>
      </div>

      {state.error && (
        <div style={{ background: "rgba(207, 102, 121, 0.1)", border: "1px solid var(--neg-border)", padding: "16px 20px", borderRadius: 8, marginBottom: 20, fontSize: 13, color: "var(--text)" }}>
          Couldn't load audience data: {state.error}
        </div>
      )}

      {!state.error && !hasApiData && (
        <div className="section-card" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: 32, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <Youtube size={22} style={{ color: "var(--muted)", flexShrink: 0, marginTop: 2 }} />
            <div style={{ maxWidth: "70ch" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>No audience data synced yet</div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
                This page fills from YouTube's Analytics API, which needs the channel's own
                YouTube connection (Settings → API Keys) and the nightly audience sync to have
                run at least once. Once both are true, geography, devices, subscriber split,
                and traffic sources appear here — each split shorts vs long-form where YouTube
                allows it. The publish-cadence analysis below works from upload history alone,
                so it may already have something for you.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Where they watch */}
      {all("country").length > 0 && (
        <Section icon={Globe2} kicker="Geography" title="Where they watch"
          meaning="Top countries by views. A concentrated audience is a targeting decision; a scattered one is a reach story.">
          {(() => {
            const list = all("country").slice(0, 10);
            const total = totalViews(all("country"));
            return list.map((r, i) => (
              <BarRow key={r.value} label={countryName(r.value)} share={total > 0 ? r.views / total : 0}
                value={r.views} isLast={i === list.length - 1} />
            ));
          })()}
        </Section>
      )}

      {/* What screen */}
      {all("deviceType").length > 0 && (
        <Section icon={MonitorSmartphone} kicker="Devices" title="What screen they're on"
          meaning="Phones favour Shorts and fast hooks; TV screens reward long-form and slower pacing. Packaging should match where the audience actually is.">
          {(() => {
            const list = all("deviceType");
            const total = totalViews(list);
            const splits = byFormat("deviceType");
            return list.map((r, i) => {
              const sh = splits.find(s => s.value === r.value && s.format === "shorts");
              const lf = splits.find(s => s.value === r.value && s.format === "longform");
              const sub = (sh || lf)
                ? `${sh ? `${fmtCompact(sh.views)} shorts` : ""}${sh && lf ? " · " : ""}${lf ? `${fmtCompact(lf.views)} long` : ""}`
                : null;
              return (
                <BarRow key={r.value} label={DEVICE_LABELS[r.value] || r.value} share={total > 0 ? r.views / total : 0}
                  value={r.views} sub={sub} isLast={i === list.length - 1} />
              );
            });
          })()}
        </Section>
      )}

      {/* Who's watching */}
      {all("subscribedStatus").length > 0 && (
        <Section icon={UserCheck} kicker="Loyalty" title="Subscribers vs passers-by"
          meaning="How much of the watching is done by people who already committed. High subscriber share means a loyal core; low share means discovery is doing the work — both are strategies, but they need different content.">
          <FormatLegend />
          {(() => {
            const list = all("subscribedStatus");
            const total = totalViews(list);
            const splits = byFormat("subscribedStatus");
            return list.map((r, i) => {
              const sh = splits.find(s => s.value === r.value && s.format === "shorts");
              const lf = splits.find(s => s.value === r.value && s.format === "longform");
              const avd = fmtMins(r.avgViewDurationSeconds);
              const parts = [];
              if (sh) parts.push(`${fmtCompact(sh.views)} shorts`);
              if (lf) parts.push(`${fmtCompact(lf.views)} long`);
              if (avd) parts.push(`${avd} avg watch`);
              return (
                <BarRow key={r.value} label={SUBSCRIBED_LABELS[r.value] || r.value}
                  share={total > 0 ? r.views / total : 0} value={r.views}
                  sub={parts.join(" · ") || null} isLast={i === list.length - 1} />
              );
            });
          })()}
        </Section>
      )}

      {/* How they arrive */}
      {all("insightTrafficSourceType").length > 0 && (
        <Section icon={Compass} kicker="Discovery" title="How they find the channel"
          meaning="Views by the surface that delivered them. Suggested and Browse mean the algorithm is selling the content; Search means the topics are; External means somebody else is.">
          {(() => {
            const list = all("insightTrafficSourceType").slice(0, 10);
            const total = totalViews(all("insightTrafficSourceType"));
            return list.map((r, i) => (
              <BarRow key={r.value} label={TRAFFIC_LABELS[r.value] || r.value}
                share={total > 0 ? r.views / total : 0} value={r.views} isLast={i === list.length - 1} />
            ));
          })()}
        </Section>
      )}

      {/* Shorts → long handoff, from upload history */}
      <Section icon={ArrowRightLeft} kicker="Format handoff" title="Do shorts set up long-form?"
        meaning="YouTube doesn't let anyone outside Studio follow individual viewers from shorts to long-form. What the upload history can show: whether long-form videos published after a run of shorts start faster than ones published cold. Directional evidence, not a conversion rate.">
        {handoff ? (
          <>
            {(() => {
              const max = Math.max(...handoff.map(b => b.medianViewsPerDay || 0));
              return handoff.map((b, i) => (
                <BarRow key={b.label}
                  label={`${b.label} in prior 14d`}
                  share={max > 0 ? (b.medianViewsPerDay || 0) / max : 0}
                  valueLabel={`${fmtInt(b.medianViewsPerDay)} views/day`}
                  sub={`median of ${b.count} long-form video${b.count === 1 ? "" : "s"}`}
                  color={LONG_COLOR}
                  isLast={i === handoff.length - 1} />
              ));
            })()}
            <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 12, lineHeight: 1.6, maxWidth: "72ch" }}>
              Bars compare median views-per-day-since-publish, which removes the head start
              older videos have. Read direction, not decimals: if the busy buckets sit clearly
              higher, shorts are warming the audience up.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
            Not enough history to compare yet — this needs at least six long-form videos and a
            few shorts in the record before the comparison means anything.
          </div>
        )}
      </Section>

      {/* What we can't show — honesty section */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginBottom: 20, fontSize: 12, color: "var(--faint)", lineHeight: 1.7, maxWidth: "80ch" }}>
        Not shown, because YouTube doesn't expose it outside Studio: new vs returning viewers,
        and individual viewer journeys (how many shorts before someone tries a long-form video,
        or how long that takes). Any tool claiming those numbers from the public API is guessing.
        For those two, the channel owner's Studio → Audience tab remains the only honest source.
      </div>
    </div>
  );
}
