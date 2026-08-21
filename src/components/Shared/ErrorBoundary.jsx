import React from "react";

/**
 * ErrorBoundary — stops one thrown render from blanking the whole app.
 *
 * There was no boundary anywhere, so any throw during render unmounted the
 * entire tree and left a blank page with no indication of what happened. The
 * cheapest way to trigger it: a video row whose publish date won't parse.
 * `normalizeData.js` calls `new Date(publishDate).toISOString()`, which throws
 * RangeError on input like "N/A" or a d/m/Y string, and it runs inside an
 * effect with no try/catch.
 *
 * A blank screen is the worst failure mode for an analytics tool, because it
 * looks identical to "still loading" and to "this client has no data".
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the component stack — it's the part that says which surface broke.
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const label = this.props.label ? ` in ${this.props.label}` : "";

    return (
      <div
        role="alert"
        style={{
          margin: "24px auto",
          maxWidth: "640px",
          background: "var(--card)",
          border: "1px solid #4a2c2c",
          borderRadius: "24px",
          padding: "22px 24px",
          color: "var(--text)",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: "17px", fontWeight: 600, color: "var(--ink)" }}>
          Something broke{label}
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: "14px", lineHeight: 1.55, color: "var(--muted)" }}>
          This screen failed to render, so nothing below is showing. The rest of
          the app still works &mdash; the details are below and in the browser
          console.
        </p>

        <pre
          style={{
            margin: "0 0 16px",
            padding: "10px 12px",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "var(--neg-text)",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {String(error?.message || error)}
        </pre>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={this.handleReset}
            style={{
              padding: "9px 16px",
              background: "var(--blue)",
              border: "none",
              borderRadius: "6px",
              color: "var(--ink)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "9px 16px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: "var(--muted)",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
