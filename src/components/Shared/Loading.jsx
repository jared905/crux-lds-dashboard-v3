
/**
 * Loading system.
 *
 * Three rules, from the interface-polish review that prompted this file:
 *
 * 1. Skeletons match the shape of what they stand in for. A generic
 *    spinner tells the user "something, somewhere, eventually"; a
 *    skeleton of the actual layout tells them "your dashboard is coming,
 *    and it looks like this".
 * 2. The brand mark breathes while work happens. Breathing, not spinning:
 *    a slow scale-and-opacity swell (one breath ~2.4s) reads as alive;
 *    a spinning logo reads as clip-art. Reduced-motion users get a
 *    static mark.
 * 3. Loaders speak. Every loader carries a short sentence about what is
 *    actually happening, because a wordless wait feels like being
 *    processed by a machine.
 */

/** The round Full View mark, breathing. */
export function BrandLoader({ label, size = 40, style }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "48px 20px",
        ...style,
      }}
    >
      <img
        className="brand-loader"
        src="/Full_View_favicon.png"
        alt=""
        width={size}
        height={size}
        style={{ display: "block" }}
      />
      {label && (
        <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", maxWidth: "40ch", lineHeight: 1.5 }}>
          {label}
        </div>
      )}
    </div>
  );
}

/** One pulsing placeholder block. */
export function Skeleton({ w = "100%", h = 14, r, style }) {
  return (
    <div
      aria-hidden="true"
      className="skeleton"
      style={{ width: w, height: h, ...(r !== undefined ? { borderRadius: r } : {}), ...style }}
    />
  );
}

/**
 * Stand-in for the dashboard while a client's rows load: the KPI
 * instrument row, then list rows — the same bones as the real page.
 */
export function DashboardSkeleton({ label }) {
  return (
    <div aria-hidden="true">
      {label && (
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>{label}</div>
      )}
      {/* KPI row: one bordered strip of six cells, like the real one */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ padding: "16px 18px", borderLeft: i > 0 ? "1px solid var(--border)" : "none" }}>
            <Skeleton w="60%" h={9} style={{ marginBottom: 12 }} />
            <Skeleton w="45%" h={22} />
          </div>
        ))}
      </div>
      {/* list rows, like Top Videos */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px" }}>
        <Skeleton w={140} h={12} style={{ marginBottom: 18 }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
            <Skeleton w={86} h={48} r={6} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <Skeleton w="70%" h={11} style={{ marginBottom: 8 }} />
              <Skeleton w="35%" h={9} />
            </div>
            <Skeleton w={54} h={11} style={{ flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Generic stand-in for a workspace panel (brief, research, settings). */
export function PanelSkeleton({ rows = 4 }) {
  return (
    <div aria-hidden="true" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 22px" }}>
      <Skeleton w={180} h={13} style={{ marginBottom: 18 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} w={`${88 - i * 9}%`} h={11} style={{ marginBottom: 12 }} />
      ))}
    </div>
  );
}

export default BrandLoader;
