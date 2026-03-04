import React, { useState, useEffect, useCallback } from "react";
import { FileText, Trash2, ExternalLink, Clock, CheckCircle2, Loader2 } from "lucide-react";

export default function SavedReports({ activeClient, setPendingDraftToLoad, setTab }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const fetchDrafts = useCallback(async () => {
    if (!activeClient?.id) {
      setDrafts([]);
      setLoading(false);
      return;
    }
    try {
      const { listDrafts } = await import("../../services/reportDraftService");
      const result = await listDrafts(activeClient.id);
      setDrafts(result);
    } catch (e) {
      console.error("Failed to load drafts:", e);
    } finally {
      setLoading(false);
    }
  }, [activeClient?.id]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleDelete = async (id) => {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const { deleteDraft } = await import("../../services/reportDraftService");
      await deleteDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      console.error("Failed to delete draft:", e);
      alert("Failed to delete draft.");
    } finally {
      setDeleting(null);
    }
  };

  const handleOpen = (draft) => {
    setPendingDraftToLoad(draft);
    setTab("dashboard");
  };

  const getDateLabel = (d) => {
    switch (d.dateRange) {
      case "7d": return "Last 7 Days";
      case "28d": return "Last 28 Days";
      case "90d": return "Last 90 Days";
      case "ytd": return "Year to Date";
      case "all": return "All Time";
      case "custom": {
        if (d.customDateRange?.start && d.customDateRange?.end) {
          const fmt = (s) => new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return `${fmt(d.customDateRange.start)} – ${fmt(d.customDateRange.end)}`;
        }
        return "Custom Range";
      }
      default: return d.dateRange || "—";
    }
  };

  const fmtDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  };

  const s = {
    page: { padding: "32px 40px", maxWidth: "1100px" },
    header: { fontSize: "28px", fontWeight: "700", color: "#f8fafc", marginBottom: "8px" },
    subtitle: { fontSize: "14px", color: "#64748b", marginBottom: "32px" },
    grid: { display: "flex", flexDirection: "column", gap: "16px" },
    card: {
      background: "#1e293b",
      border: "1px solid #334155",
      borderRadius: "12px",
      padding: "24px",
      display: "flex",
      alignItems: "flex-start",
      gap: "20px",
      transition: "border-color 0.2s",
    },
    icon: {
      width: "48px",
      height: "48px",
      borderRadius: "12px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    name: { fontSize: "16px", fontWeight: "600", color: "#f1f5f9", marginBottom: "6px" },
    meta: { fontSize: "13px", color: "#64748b", display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "8px" },
    badge: (status) => ({
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "2px 10px",
      borderRadius: "20px",
      fontSize: "11px",
      fontWeight: "600",
      letterSpacing: "0.3px",
      background: status === "exported" ? "rgba(16, 185, 129, 0.15)" : "rgba(147, 197, 253, 0.15)",
      color: status === "exported" ? "#34d399" : "#93c5fd",
    }),
    actions: { display: "flex", gap: "8px", marginLeft: "auto", flexShrink: 0, alignSelf: "center" },
    btn: (variant) => ({
      padding: "8px 16px",
      borderRadius: "8px",
      border: variant === "primary" ? "none" : "1px solid #444",
      background: variant === "primary" ? "#2563eb" : "transparent",
      color: variant === "primary" ? "#fff" : variant === "danger" ? "#f87171" : "#94a3b8",
      fontSize: "13px",
      fontWeight: "500",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      whiteSpace: "nowrap",
    }),
    empty: {
      textAlign: "center",
      padding: "80px 40px",
      color: "#475569",
    },
  };

  if (!activeClient?.id) {
    return (
      <div style={s.page}>
        <h1 style={s.header}>Saved Reports</h1>
        <div style={s.empty}>
          <FileText size={48} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
          <div style={{ fontSize: "16px", fontWeight: "500" }}>Select a client to view saved reports</div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <h1 style={s.header}>Saved Reports</h1>
      <p style={s.subtitle}>{activeClient.name || "Client"} — {drafts.length} saved report{drafts.length !== 1 ? "s" : ""}</p>

      {loading ? (
        <div style={{ ...s.empty, display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: "15px", color: "#64748b" }}>Loading drafts...</span>
        </div>
      ) : drafts.length === 0 ? (
        <div style={s.empty}>
          <FileText size={48} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
          <div style={{ fontSize: "16px", fontWeight: "500", marginBottom: "8px" }}>No saved reports yet</div>
          <div style={{ fontSize: "14px" }}>Reports are auto-saved when you close the PDF export modal, or you can manually save them.</div>
        </div>
      ) : (
        <div style={s.grid}>
          {drafts.map((draft) => {
            const recCount = (draft.opportunities || []).length;
            const iconBg = draft.status === "exported"
              ? "linear-gradient(135deg, #10b981, #059669)"
              : "linear-gradient(135deg, #3b82f6, #2563eb)";

            return (
              <div
                key={draft.id}
                style={s.card}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#475569"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#334155"; }}
              >
                <div style={{ ...s.icon, background: iconBg }}>
                  {draft.status === "exported" ? <CheckCircle2 size={22} color="#fff" /> : <FileText size={22} color="#fff" />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.name}>{draft.name}</div>
                  <div style={s.meta}>
                    <span>{getDateLabel(draft)}</span>
                    <span>{recCount} recommendation{recCount !== 1 ? "s" : ""}</span>
                    {draft.selectedChannel && draft.selectedChannel !== "all" && (
                      <span>{draft.selectedChannel}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={s.badge(draft.status)}>
                      {draft.status === "exported" ? <><CheckCircle2 size={11} /> Exported</> : <><Clock size={11} /> Draft</>}
                    </span>
                    <span style={{ fontSize: "12px", color: "#475569" }}>
                      Updated {fmtDate(draft.updatedAt)}
                    </span>
                    {draft.lastExportedAt && (
                      <span style={{ fontSize: "12px", color: "#475569" }}>
                        Exported {fmtDate(draft.lastExportedAt)}
                      </span>
                    )}
                  </div>
                </div>

                <div style={s.actions}>
                  <button
                    onClick={() => handleOpen(draft)}
                    style={s.btn("primary")}
                  >
                    <ExternalLink size={14} /> Open
                  </button>
                  <button
                    onClick={() => handleDelete(draft.id)}
                    disabled={deleting === draft.id}
                    style={s.btn("danger")}
                  >
                    <Trash2 size={14} /> {deleting === draft.id ? "..." : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
