import {useState, useEffect, useCallback} from "react";
import {
  ClipboardCheck,
  Plus,
  Trash2,
  Eye,
  Loader,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { listAudits, deleteAudit, getAuditWithVideos } from "../../services/auditDatabase";
import AuditCreateFlow from './AuditCreateFlow.jsx';
import AuditProgress from './AuditProgress.jsx';
import AuditResults from './AuditResults.jsx';

const STATUS_BADGE = {
  created:   { label: "Created",   color: "var(--faint)", bg: "var(--outline-variant)" },
  running:   { label: "Running",   color: "var(--warn)", bg: "var(--warn-text)" },
  completed: { label: "Completed", color: "var(--pos)", bg: "var(--pos-text)" },
  failed:    { label: "Failed",    color: "var(--neg)", bg: "var(--neg-bg)" },
};

export default function AuditPage({ activeClient }) {
  const [view, setView] = useState("list"); // list | create | progress | results
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAudit, setSelectedAudit] = useState(null);

  const fetchAudits = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listAudits({ limit: 50 });
      setAudits(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudits();
  }, [fetchAudits]);

  const handleDelete = async (auditId) => {
    if (!confirm("Delete this audit? This cannot be undone.")) return;
    try {
      await deleteAudit(auditId);
      setAudits((prev) => prev.filter((a) => a.id !== auditId));
    } catch (err) {
      setError("Failed to delete: " + err.message);
    }
  };

  const handleAuditStarted = (auditId) => {
    setSelectedAudit({ id: auditId });
    setView("progress");
  };

  const handleAuditComplete = async (audit) => {
    // Load full audit with videos
    try {
      const fullAudit = await getAuditWithVideos(audit.id);
      setSelectedAudit(fullAudit);
    } catch {
      // Fallback to audit without videos
      setSelectedAudit(audit);
    }
    setView("results");
    fetchAudits();
  };

  const handleAuditFailed = () => {
    fetchAudits();
    setView("list");
  };

  const handleViewAudit = async (audit) => {
    if (audit.status === "running") {
      setSelectedAudit(audit);
      setView("progress");
    } else if (audit.status === "completed") {
      // Load full audit with videos for results view
      setLoading(true);
      try {
        const fullAudit = await getAuditWithVideos(audit.id);
        setSelectedAudit(fullAudit);
        setView("results");
      } catch (err) {
        setError("Failed to load audit: " + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  // ── Create View ──
  if (view === "create") {
    return (
      <AuditCreateFlow
        onBack={() => setView("list")}
        onAuditStarted={handleAuditStarted}
        activeClient={activeClient}
      />
    );
  }

  // ── Progress View ──
  if (view === "progress" && selectedAudit) {
    return (
      <AuditProgress
        auditId={selectedAudit.id}
        onComplete={handleAuditComplete}
        onFailed={handleAuditFailed}
        onBack={() => { setView("list"); fetchAudits(); }}
      />
    );
  }

  // ── Results View ──
  if (view === "results" && selectedAudit) {
    return (
      <AuditResults
        audit={selectedAudit}
        onBack={() => { setView("list"); fetchAudits(); }}
      />
    );
  }

  // ── List View ──
  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <ClipboardCheck size={24} style={{ color: "var(--accent-text)" }} />
          <h2 style={{ fontSize: "20px", fontWeight: "700", margin: 0 }}>
            Channel Audits
          </h2>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={fetchAudits}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              background: "transparent",
              border: "1px solid #444",
              borderRadius: "8px",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => setView("create")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              background: "var(--blue)",
              border: "none",
              borderRadius: "8px",
              color: "var(--ink)",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "13px",
            }}
          >
            <Plus size={16} />
            New Audit
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 16px",
            background: "rgba(255, 85, 64, 0.1)",
            border: "1px solid rgba(255, 85, 64, 0.3)",
            borderRadius: "8px",
            color: "var(--neg)",
            fontSize: "13px",
            marginBottom: "16px",
          }}
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--muted)" }}>
          <Loader size={24} style={{ animation: "spin 1s linear infinite" }} />
          <div style={{ marginTop: "12px" }}>Loading audits...</div>
        </div>
      )}

      {/* Empty State */}
      {!loading && audits.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "80px 40px",
            background: "var(--card)",
            borderRadius: "24px",
            border: "1px solid var(--border)",
          }}
        >
          <ClipboardCheck size={48} style={{ color: "var(--outline-variant)", marginBottom: "16px" }} />
          <div style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px" }}>
            No audits yet
          </div>
          <div style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "24px" }}>
            Run your first channel audit to analyze a prospect or establish a client baseline.
          </div>
          <button
            onClick={() => setView("create")}
            style={{
              padding: "10px 24px",
              background: "var(--blue)",
              border: "none",
              borderRadius: "8px",
              color: "var(--ink)",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            <Plus size={16} style={{ marginRight: "6px", verticalAlign: "middle" }} />
            New Audit
          </button>
        </div>
      )}

      {/* Audit List */}
      {!loading && audits.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {audits.map((audit) => {
            const badge = STATUS_BADGE[audit.status] || STATUS_BADGE.created;
            const channel = audit.channel;
            return (
              <div
                key={audit.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  padding: "16px 20px",
                  background: "var(--card)",
                  borderRadius: "24px",
                  border: "1px solid var(--border)",
                }}
              >
                {/* Channel thumbnail */}
                {channel?.thumbnail_url ? (
                  <img
                    src={channel.thumbnail_url}
                    alt=""
                    style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      background: "var(--outline-variant)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ClipboardCheck size={18} style={{ color: "var(--faint)" }} />
                  </div>
                )}

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "4px" }}>
                    {channel?.name || audit.config?.channel_input || "Unknown Channel"}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <span style={{ textTransform: "capitalize" }}>{audit.audit_type?.replace("_", " ")}</span>
                    <span>{new Date(audit.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    {audit.total_cost > 0 && (
                      <span>${parseFloat(audit.total_cost).toFixed(3)}</span>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: badge.color,
                    background: badge.bg,
                  }}
                >
                  {badge.label}
                </span>

                {/* Actions */}
                <div style={{ display: "flex", gap: "6px" }}>
                  {(audit.status === "completed" || audit.status === "running") && (
                    <button
                      onClick={() => handleViewAudit(audit)}
                      style={{
                        padding: "6px 12px",
                        background: "rgba(0, 209, 255, 0.15)",
                        border: "none",
                        borderRadius: "6px",
                        color: "var(--accent-text)",
                        cursor: "pointer",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Eye size={14} />
                      View
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(audit.id)}
                    style={{
                      padding: "6px",
                      background: "transparent",
                      border: "1px solid #444",
                      borderRadius: "6px",
                      color: "var(--muted)",
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CSS for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
