import {useState, useEffect, useRef} from "react";
import {
  ArrowLeft,
  Loader,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import { getAudit, getAuditSections } from "../../services/auditDatabase";

const STEP_LABELS = {
  ingestion: "Data Ingestion",
  series_detection: "Series Detection",
  competitor_matching: "Peer Matching",
  benchmarking: "Benchmarking",
  opportunity_analysis: "Opportunity Analysis",
  recommendations: "Recommendations",
  executive_summary: "Executive Summary",
};

const STATUS_ICON = {
  pending: { Icon: Clock, color: "var(--faint)" },
  running: { Icon: Loader, color: "var(--warn)" },
  completed: { Icon: CheckCircle2, color: "var(--pos)" },
  failed: { Icon: XCircle, color: "var(--neg)" },
};

export default function AuditProgress({ auditId, onComplete, onFailed, onBack }) {
  const [audit, setAudit] = useState(null);
  const [sections, setSections] = useState([]);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const [auditData, sectionData] = await Promise.all([
          getAudit(auditId),
          getAuditSections(auditId),
        ]);
        setAudit(auditData);
        setSections(sectionData);

        if (auditData.status === "completed") {
          clearInterval(pollRef.current);
          onComplete(auditData);
        } else if (auditData.status === "failed") {
          clearInterval(pollRef.current);
          if (onFailed) onFailed(auditData);
        }
      } catch (err) {
        setError(err.message);
      }
    };

    // Initial fetch
    poll();

    // Poll every 2 seconds
    pollRef.current = setInterval(poll, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // Poller lives per audit; parent callbacks are intentionally not dependencies so the interval survives re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId]);

  const progress = audit?.progress;
  const pct = progress?.pct || 0;
  const message = progress?.message || "Starting...";

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "8px 14px", background: "transparent",
            border: "1px solid #444", borderRadius: "8px",
            color: "var(--muted)", cursor: "pointer", fontSize: "13px",
          }}
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <h2 style={{ fontSize: "20px", fontWeight: "700", margin: 0 }}>
          Audit in Progress
        </h2>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "12px 16px", background: "rgba(255, 85, 64, 0.1)",
          border: "1px solid rgba(255, 85, 64, 0.3)", borderRadius: "8px",
          color: "var(--neg)", fontSize: "13px", marginBottom: "16px",
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div style={{ maxWidth: "600px" }}>
        {/* Channel info */}
        {audit?.channel && (
          <div style={{
            display: "flex", alignItems: "center", gap: "12px",
            padding: "16px 20px", background: "var(--card)", borderRadius: "24px",
            border: "1px solid var(--border)", marginBottom: "20px",
          }}>
            {audit.channel.thumbnail_url && (
              <img src={audit.channel.thumbnail_url} alt="" style={{ width: "40px", height: "40px", borderRadius: "50%" }} />
            )}
            <div>
              <div style={{ fontSize: "14px", fontWeight: "600" }}>{audit.channel.name}</div>
              <div style={{ fontSize: "12px", color: "var(--muted)", textTransform: "capitalize" }}>
                {audit.audit_type?.replace("_", " ")} audit
              </div>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div style={{
          background: "var(--card)", borderRadius: "24px", border: "1px solid var(--border)",
          padding: "24px",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "12px",
          }}>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>{message}</span>
            <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--accent-text)" }}>
              {pct >= 0 ? `${pct}%` : "—"}
            </span>
          </div>

          <div style={{
            height: "8px", background: "var(--outline-variant)", borderRadius: "4px",
            overflow: "hidden", marginBottom: "24px",
          }}>
            <div style={{
              height: "100%",
              width: `${Math.max(0, Math.min(pct, 100))}%`,
              background: audit?.status === "failed" ? "var(--neg)" : "linear-gradient(90deg, var(--blue), #4cd6ff)",
              borderRadius: "4px",
              transition: "width 0.5s ease",
            }} />
          </div>

          {/* Step list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {sections.map((section) => {
              const stepStatus = STATUS_ICON[section.status] || STATUS_ICON.pending;
              const StepIcon = stepStatus.Icon;
              const isRunning = section.status === "running";

              return (
                <div
                  key={section.section_key}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "10px 14px", background: "var(--input-bg)", borderRadius: "8px",
                    border: isRunning ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid transparent",
                  }}
                >
                  <StepIcon
                    size={16}
                    style={{
                      color: stepStatus.color,
                      flexShrink: 0,
                      ...(isRunning ? { animation: "spin 1s linear infinite" } : {}),
                    }}
                  />
                  <span style={{
                    fontSize: "13px", fontWeight: "500",
                    color: section.status === "completed" ? "var(--pos)"
                      : section.status === "running" ? "var(--warn)"
                      : section.status === "failed" ? "var(--neg)"
                      : "var(--faint)",
                  }}>
                    {STEP_LABELS[section.section_key] || section.section_key}
                  </span>

                  {section.status === "failed" && section.error_message && (
                    <span style={{ fontSize: "11px", color: "var(--neg)", marginLeft: "auto" }}>
                      {section.error_message}
                    </span>
                  )}

                  {section.status === "completed" && section.completed_at && section.started_at && (
                    <span style={{ fontSize: "11px", color: "var(--faint)", marginLeft: "auto" }}>
                      {Math.round((new Date(section.completed_at) - new Date(section.started_at)) / 1000)}s
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Cost counter */}
          {audit && (audit.total_cost > 0 || audit.youtube_api_calls > 0) && (
            <div style={{
              display: "flex", gap: "16px", marginTop: "16px",
              padding: "10px 14px", background: "var(--input-bg)", borderRadius: "8px",
              fontSize: "12px", color: "var(--muted)",
            }}>
              {audit.total_cost > 0 && (
                <span>Claude cost: ${parseFloat(audit.total_cost).toFixed(4)}</span>
              )}
              {audit.total_tokens > 0 && (
                <span>Tokens: {audit.total_tokens.toLocaleString()}</span>
              )}
              {audit.youtube_api_calls > 0 && (
                <span>YT API calls: {audit.youtube_api_calls}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
