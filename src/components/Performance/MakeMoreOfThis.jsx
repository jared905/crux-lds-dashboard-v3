/**
 * MakeMoreOfThis — the "what should we make next?" strip the expert
 * review said belongs above the fold (2026-08-20). Two data-backed
 * columns, nothing generated:
 *
 *   OUTLIERS — videos beating the channel's median by 2×+ in this
 *   window. The panel's read: outliers are idea source, not trophy
 *   case, so each row names the repeatable trait (format + length).
 *
 *   AUDIENCE DEMAND — unserved asks mined from the client's own
 *   comments (demandSignalService, re-homed here after the Ideas tab
 *   was cut). The audience literally writing the content calendar.
 *
 * Renders nothing when there is nothing honest to say.
 */

import {useEffect, useMemo, useState} from "react";
import { getActiveDemandSignals } from "../../services/demandSignalService.js";
import { Flame, MessageSquareQuote } from 'lucide-react';

const fmtCompact = (n) => {
  if (!n || isNaN(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
};

const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const lengthBucket = (secs) => {
  if (!secs) return null;
  if (secs <= 60) return "under 1 min";
  if (secs <= 180) return "1–3 min";
  if (secs <= 600) return "3–10 min";
  if (secs <= 1800) return "10–30 min";
  return "30+ min";
};

export default function MakeMoreOfThis({ filtered, activeClient }) {
  const [demand, setDemand] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setDemand(null);
    // The aggregate has no single client to mine comments for.
    if (!activeClient?.id || activeClient.isAggregate) return;
    getActiveDemandSignals(activeClient.id)
      .then(row => { if (!cancelled) setDemand(row); })
      .catch(() => { /* no signals yet — column simply doesn't render */ });
    return () => { cancelled = true; };
  }, [activeClient?.id, activeClient?.isAggregate]);

  const outliers = useMemo(() => {
    const withViews = (filtered || []).filter(v => (v.views || 0) > 0);
    if (withViews.length < 8) return [];
    const med = median(withViews.map(v => v.views));
    if (med <= 0) return [];
    return withViews
      .map(v => ({ ...v, multiple: v.views / med }))
      .filter(v => v.multiple >= 2)
      .sort((a, b) => b.multiple - a.multiple)
      .slice(0, 3);
  }, [filtered]);

  const demandSignals = useMemo(() => {
    // Row shape: { signals: { unserved_requests: [{topic, mentions,
    // sample_quote}], recurring_themes, engagement_peaks } }
    const sig = demand?.signals;
    if (!sig) return [];
    const unserved = (sig.unserved_requests || []).map(u => ({
      title: u.topic,
      meta: u.mentions ? `${u.mentions} commenters asked` : null,
      quote: u.sample_quote,
    }));
    const themes = (sig.recurring_themes || []).map(t => ({
      title: t.pattern,
      meta: t.count ? `${t.count} occurrences` : null,
      quote: t.examples?.[0],
    }));
    return [...unserved, ...themes].slice(0, 2);
  }, [demand]);

  if (outliers.length === 0 && demandSignals.length === 0) return null;

  return (
    <div className="section-card" style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: "24px",
      padding: "22px 24px", marginBottom: "20px",
    }}>
      <div style={{ fontFamily: "var(--font-label)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 4 }}>
        Make more of this
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, maxWidth: "80ch", lineHeight: 1.5 }}>
        What this window's data says to double down on — breakout formats from the numbers,
        unmade content straight from the audience's comments.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: demandSignals.length > 0 && outliers.length > 0 ? "1fr 1fr" : "1fr", gap: 20 }}>
        {outliers.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-label)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pos)", marginBottom: 10 }}>
              <Flame size={12} /> Breakouts — beat the channel median 2×+
            </div>
            {outliers.map((v, i) => {
              const trait = [v.type === "short" ? "Short" : "Long-form", lengthBucket(v.duration)].filter(Boolean).join(" · ");
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.title}>{v.title}</div>
                    <div style={{ fontSize: 11, color: "var(--outline)", marginTop: 2 }}>{trait}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pos)", fontVariantNumeric: "tabular-nums" }}>{v.multiple.toFixed(1)}×</div>
                    <div style={{ fontSize: 11, color: "var(--faint)", fontVariantNumeric: "tabular-nums" }}>{fmtCompact(v.views)} views</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {demandSignals.length > 0 && (
          <div style={outliers.length > 0 ? { borderLeft: "1px solid var(--border)", paddingLeft: 20 } : {}}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-label)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent-text)", marginBottom: 10 }}>
              <MessageSquareQuote size={12} /> The audience is asking for
            </div>
            {demandSignals.map((sig, i) => (
              <div key={i} style={{ padding: "9px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4 }}>
                  {sig.title}
                </div>
                {sig.meta && (
                  <div style={{ fontSize: 11, color: "var(--accent-text)", marginTop: 2 }}>{sig.meta}</div>
                )}
                {sig.quote && (
                  <div style={{ fontSize: 11, color: "var(--outline)", marginTop: 3, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={sig.quote}>
                    “{sig.quote}”
                  </div>
                )}
              </div>
            ))}
            <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 8 }}>
              Mined from this channel's own comments.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
