/**
 * Outliers — daily breakout finder (2026-08-21, user request).
 *
 * "What are up-and-coming channels doing on YouTube right now?" Pulls
 * the trending chart via /api/youtube-outliers, then keeps only videos
 * from channels inside a subscriber band and ranks them by the outlier
 * multiple — views as a multiple of the channel's subscribers. A 40K-sub
 * channel with a 2M-view video is the signal; a 40M-sub channel with the
 * same video is just Tuesday.
 *
 * Honesty rules: music is excluded at the source, trailers/label/auto-
 * generated channels by pattern, and the note below the title says
 * exactly what's filtered — the heuristics catch most noise, not all of
 * it. Inform and inspire; no homework.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Telescope, ExternalLink, RefreshCw } from "lucide-react";

const CACHE_KEY = "fv_outliers_v1";
const CACHE_TTL = 6 * 3600 * 1000; // matches the server's edge cache

const BANDS = [
  { id: "all", label: "10K – 2M", min: 10_000, max: 2_000_000 },
  { id: "small", label: "10K – 100K", min: 10_000, max: 100_000 },
  { id: "mid", label: "100K – 500K", min: 100_000, max: 500_000 },
  { id: "large", label: "500K – 2M", min: 500_000, max: 2_000_000 },
];

// Title / channel patterns for the chart noise the category filter misses.
const EXCLUDE_TITLE = /\b(official (music )?video|official trailer|teaser trailer|official teaser|lyric video|full album|visualizer|official audio|episode \d+ (promo|preview))\b/i;
const EXCLUDE_CHANNEL = /(vevo$|\s-\s?topic$|movieclips|trailers?$)/i;
// Film & Animation is studio-promo territory when the title reads like one.
const TRAILERY_CATEGORY = new Set(["1"]);

function isoToSeconds(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

const fmtCompact = (n) => {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return Math.round(n).toLocaleString();
};

const fmtAge = (iso) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
};

export default function Outliers() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [band, setBand] = useState("all");
  const [format, setFormat] = useState("all");

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (!force) {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
        if (cached && Date.now() - cached.at < CACHE_TTL) {
          setData(cached.data);
          setLoading(false);
          return;
        }
      }
      const resp = await fetch("/api/youtube-outliers?region=US");
      if (!resp.ok) throw new Error(`feed unavailable (${resp.status})`);
      if (!/json/.test(resp.headers.get("content-type") || "")) {
        throw new Error("the API layer only runs on the deployed site");
      }
      const payload = await resp.json();
      setData(payload);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: payload })); } catch { /* storage full — cache is optional */ }
    } catch (e) {
      setError(e?.message || "feed unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    if (!data?.videos) return [];
    const b = BANDS.find(x => x.id === band) || BANDS[0];
    return data.videos
      .filter(v => {
        if (v.subs == null || v.subs < b.min || v.subs > b.max) return false;
        if (EXCLUDE_TITLE.test(v.title)) return false;
        if (EXCLUDE_CHANNEL.test(v.channelTitle)) return false;
        if (TRAILERY_CATEGORY.has(v.categoryId) && /trailer|teaser/i.test(v.title)) return false;
        const secs = isoToSeconds(v.duration);
        if (format === "short" && secs > 60) return false;
        if (format === "long" && secs <= 60) return false;
        return true;
      })
      .map(v => ({ ...v, multiple: v.subs > 0 ? v.views / v.subs : 0 }))
      .sort((a, z) => z.multiple - a.multiple)
      .slice(0, 25);
  }, [data, band, format]);

  const selStyle = {
    background: "var(--input-bg)", color: "var(--text)",
    border: "1px solid var(--outline-variant)", borderRadius: 8,
    fontSize: 12, padding: "6px 10px", fontFamily: "inherit", cursor: "pointer",
  };

  return (
    <div className="section-card" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 24, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(0, 209, 255, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Telescope size={20} style={{ color: "var(--accent-text)" }} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "var(--font-label)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 2 }}>Content Lab</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>Daily Outliers</div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          title="Refresh the feed"
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid var(--outline-variant)", borderRadius: 8, padding: "6px 12px", color: "var(--muted)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
        >
          <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Refresh
        </button>
      </div>

      <div style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 4px", maxWidth: "82ch", lineHeight: 1.55 }}>
        What's breaking out on YouTube today from channels your clients' size — ranked by the
        outlier multiple (views as a multiple of the channel's subscribers), because a small
        channel pulling big numbers is the inspiration signal.
      </div>
      <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 16, maxWidth: "82ch", lineHeight: 1.5 }}>
        Filtered out: music, trailers/teasers, label and auto-generated channels, and anything
        outside the subscriber band. Heuristics catch most of the noise, not all of it.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={band} onChange={e => setBand(e.target.value)} style={selStyle}>
          {BANDS.map(b => <option key={b.id} value={b.id}>{b.label} subs</option>)}
        </select>
        <select value={format} onChange={e => setFormat(e.target.value)} style={selStyle}>
          <option value="all">All formats</option>
          <option value="long">Long-form</option>
          <option value="short">Shorts</option>
        </select>
        {data?.fetchedAt && (
          <span style={{ fontSize: 11, color: "var(--faint)" }}>
            feed from {new Date(data.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · refreshes every 6h
          </span>
        )}
      </div>

      {loading && (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          Reading today's chart…
        </div>
      )}

      {!loading && error && (
        <div style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", fontSize: 13, color: "var(--muted)", lineHeight: 1.6, maxWidth: "72ch" }}>
          <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>The outliers feed isn't reachable from here.</div>
          This page reads YouTube's trending chart through the deployed server API
          (<code style={{ color: "var(--accent-text)" }}>/api/youtube-outliers</code>), which doesn't run in local
          development. On the deployed site it lights up automatically — this is a connection
          gap, not an empty chart. <span style={{ color: "var(--faint)" }}>({error})</span>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div style={{ padding: "30px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          Nothing in this subscriber band on today's chart — try a wider band.
        </div>
      )}

      {!loading && !error && rows.map((v, i) => (
        <div key={v.videoId} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: i < 3 ? "var(--ink)" : "var(--faint)", minWidth: 26, textAlign: "right" }}>{i + 1}</span>
          <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
            <img src={`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`} alt="" loading="lazy"
              style={{ width: 96, height: 54, borderRadius: 8, objectFit: "cover", display: "block" }} />
          </a>
          <div style={{ flex: 1, minWidth: 0 }}>
            <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.title}</span>
              <ExternalLink size={11} style={{ color: "var(--faint)", flexShrink: 0 }} />
            </a>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {v.channelTitle} · {fmtCompact(v.subs)} subs · {fmtAge(v.publishedAt)}
              {isoToSeconds(v.duration) <= 60 ? " · Short" : ""}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: v.multiple >= 20 ? "var(--pos-text)" : "var(--accent-text)", fontVariantNumeric: "tabular-nums" }}>
              {v.multiple >= 100 ? Math.round(v.multiple) : v.multiple.toFixed(1)}×
            </div>
            <div style={{ fontSize: 11, color: "var(--faint)", fontVariantNumeric: "tabular-nums" }}>{fmtCompact(v.views)} views</div>
          </div>
        </div>
      ))}
    </div>
  );
}
