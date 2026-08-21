/**
 * VelocityCurves — how launches compare in their first 14 days
 * (expert-review roadmap item, built 2026-08-21).
 *
 * Uses per-video daily snapshots that the nightly sync already writes:
 * each recent video becomes a cumulative-views curve over days 0–14
 * from publish. The newest video draws in electric blue against the
 * channel's recent launches in quiet grey — "is this one starting
 * faster or slower than our normal?" answered at a glance.
 *
 * Honest by construction: only videos with 5+ snapshot days qualify,
 * the section hides entirely when fewer than three qualify, and the
 * aggregate view is excluded (mixed channels aren't a launch cohort).
 */

import {useEffect, useMemo, useState} from "react";
import { supabase } from "../../services/supabaseClient.js";
import { Rocket } from 'lucide-react';

const DAYS = 14;

const fmtCompact = (n) => {
  if (!n || isNaN(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
};

export default function VelocityCurves({ activeClient }) {
  const [curves, setCurves] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setCurves(null);
    if (!supabase || !activeClient?.id || activeClient.isAggregate) return;

    (async () => {
      // Recent launches old enough to have some run-up
      const { data: vids, error: vErr } = await supabase
        .from("videos")
        .select("id, title, published_at, video_type")
        .eq("channel_id", activeClient.id)
        .gte("published_at", new Date(Date.now() - 120 * 86400000).toISOString())
        .order("published_at", { ascending: false })
        .limit(8);
      if (vErr || !vids?.length || cancelled) return;

      // Snapshots, chunked to stay under the row cap
      const snaps = [];
      for (let i = 0; i < vids.length; i += 4) {
        const { data, error } = await supabase
          .from("video_snapshots")
          .select("video_id, snapshot_date, view_count")
          .in("video_id", vids.slice(i, i + 4).map(v => v.id))
          .order("snapshot_date", { ascending: true });
        if (error) return; // table gap → section stays hidden
        snaps.push(...(data || []));
      }
      if (cancelled) return;

      const byVideo = new Map();
      for (const s of snaps) {
        if (!byVideo.has(s.video_id)) byVideo.set(s.video_id, []);
        byVideo.get(s.video_id).push(s);
      }

      const built = [];
      for (const v of vids) {
        const rows = byVideo.get(v.id) || [];
        const pub = new Date(v.published_at).getTime();
        let cum = 0;
        const pts = [];
        for (const r of rows) {
          const day = Math.floor((new Date(r.snapshot_date).getTime() - pub) / 86400000);
          if (day < 0 || day > DAYS) continue;
          cum += r.view_count || 0;
          pts.push([day, cum]);
        }
        if (pts.length >= 5) {
          built.push({ title: v.title, isShort: v.video_type === "short", published: v.published_at, pts, final: pts[pts.length - 1][1] });
        }
      }
      if (!cancelled) setCurves(built.length >= 3 ? built : []);
    })();

    return () => { cancelled = true; };
  }, [activeClient?.id, activeClient?.isAggregate]);

  const geom = useMemo(() => {
    if (!curves?.length) return null;
    const W = 800, H = 230, P = { l: 10, r: 14, t: 12, b: 26 };
    const maxY = Math.max(...curves.flatMap(c => c.pts.map(p => p[1])), 1);
    const px = (d) => P.l + (d / DAYS) * (W - P.l - P.r);
    const py = (v) => P.t + (1 - v / maxY) * (H - P.t - P.b);
    return { W, H, P, maxY, px, py };
  }, [curves]);

  if (!curves || curves.length === 0 || !geom) return null;
  const newest = curves[0];

  return (
    <div className="section-card" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "24px", padding: "24px", marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(0, 209, 255, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Rocket size={20} style={{ color: "#4cd6ff" }} />
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-label)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 2 }}>Launch velocity</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>The first 14 days, compared</div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 14px", maxWidth: "78ch", lineHeight: 1.5 }}>
        Cumulative views from publish day for the last {curves.length} launches with daily
        tracking — the newest in blue against the channel's recent normal in grey.
      </div>

      <svg width="100%" viewBox={`0 0 ${geom.W} ${geom.H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {[0.5, 1].map(f => (
          <line key={f} x1={geom.P.l} x2={geom.W - geom.P.r}
            y1={geom.py(geom.maxY * f)} y2={geom.py(geom.maxY * f)}
            stroke="var(--border)" strokeDasharray="4,6" strokeWidth="1" />
        ))}
        {curves.slice(1).map((c, i) => (
          <polyline key={i} fill="none" stroke="#3c494e" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round"
            points={c.pts.map(p => `${geom.px(p[0])},${geom.py(p[1])}`).join(" ")}>
            <title>{`${c.title} — ${fmtCompact(c.final)} views by day ${c.pts[c.pts.length - 1][0]}`}</title>
          </polyline>
        ))}
        <polyline fill="none" stroke="#00D1FF" strokeWidth="4"
          strokeLinejoin="round" strokeLinecap="round"
          points={newest.pts.map(p => `${geom.px(p[0])},${geom.py(p[1])}`).join(" ")}>
          <title>{`${newest.title} — ${fmtCompact(newest.final)} views by day ${newest.pts[newest.pts.length - 1][0]}`}</title>
        </polyline>
        <circle cx={geom.px(newest.pts[newest.pts.length - 1][0])} cy={geom.py(newest.final)} r="5"
          fill="#00D1FF" stroke="#0e1417" strokeWidth="2" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 11, color: "#67747b" }}>day 0 → day {DAYS} from publish</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          Newest: <b style={{ color: "var(--ink)", fontWeight: 600 }}>{newest.title?.slice(0, 48)}{newest.title?.length > 48 ? "…" : ""}</b>
          <span style={{ color: "#4cd6ff", fontVariantNumeric: "tabular-nums" }}> · {fmtCompact(newest.final)} views so far</span>
        </span>
      </div>
    </div>
  );
}
