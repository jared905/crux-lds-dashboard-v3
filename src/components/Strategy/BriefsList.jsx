import React, { useState, useEffect, useCallback } from "react";
import { FileText, Plus, Trash2, ChevronDown, Loader } from "lucide-react";
import { supabase } from "../../services/supabaseClient";

const STATUS_CONFIG = {
  draft:         { label: "Draft",         color: "#6b7280", bg: "#374151" },
  ready:         { label: "Ready",         color: "#3b82f6", bg: "#1e3a5f" },
  in_production: { label: "In Production", color: "#f59e0b", bg: "#854d0e" },
  published:     { label: "Published",     color: "#22c55e", bg: "#166534" },
  archived:      { label: "Archived",      color: "#9ca3af", bg: "#1f2937" },
};

const SOURCE_LABELS = {
  creative_brief: "Creative Brief",
  atomizer: "Atomizer",
  manual: "Manual",
  competitor_inspired: "Competitor",
};

export default function BriefsList({ activeClient }) {
  const [briefs, setBriefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");

  const fetchBriefs = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let query = supabase
        .from("briefs")
        .select("*")
        .order("created_at", { ascending: false });

      if (activeClient?.id) {
        query = query.eq("client_id", activeClient.id);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;
      setBriefs(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeClient?.id, statusFilter]);

  useEffect(() => {
    fetchBriefs();
  }, [fetchBriefs]);

  const updateStatus = async (briefId, newStatus) => {
    try {
      const { error: updateErr } = await supabase
        .from("briefs")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", briefId);

      if (updateErr) throw updateErr;
      setBriefs(prev => prev.map(b => b.id === briefId ? { ...b, status: newStatus } : b));
    } catch (err) {
      setError("Failed to update: " + err.message);
    }
  };

  const deleteBrief = async (briefId) => {
    try {
      const { error: delErr } = await supabase
        .from("briefs")
        .delete()
        .eq("id", briefId);

      if (delErr) throw delErr;
      setBriefs(prev => prev.filter(b => b.id !== briefId));
    } catch (err) {
      setError("Failed to delete: " + err.message);
    }
  };

  return (
    <div style={{ padding: "0" }}>
      {/* Header */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <FileText size={20} color="#3b82f6" />
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff" }}>Briefs</div>
            </div>
            <div style={{ fontSize: "12px", color: "#888" }}>
              Planned content items from the Atomizer, Creative Brief, or manual creation
            </div>
          </div>
        </div>
      </div>

      {/* Status Filter */}
      <div style={{
        display: "flex",
        gap: "6px",
        marginBottom: "20px",
        flexWrap: "wrap"
      }}>
        {[
          { id: "all", label: "All" },
          ...Object.entries(STATUS_CONFIG).map(([id, cfg]) => ({ id, label: cfg.label })),
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            style={{
              background: statusFilter === f.id ? "#3b82f6" : "#252525",
              border: `1px solid ${statusFilter === f.id ? "#3b82f6" : "#444"}`,
              borderRadius: "16px",
              padding: "6px 14px",
              color: statusFilter === f.id ? "#fff" : "#b0b0b0",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          background: "#2d1b1b",
          border: "1px solid #7f1d1d",
          borderRadius: "8px",
          padding: "12px",
          color: "#fca5a5",
          fontSize: "13px",
          marginBottom: "16px"
        }}>
          {error}
        </div>
      )}

      {/* Briefs List */}
      <div style={{
        background: "#1E1E1E",
        border: "1px solid #333",
        borderRadius: "12px",
        overflow: "hidden"
      }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
            <Loader size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
            <div style={{ fontSize: "13px" }}>Loading briefs...</div>
          </div>
        ) : briefs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "#666" }}>
            <FileText size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
            <div style={{ fontSize: "15px", marginBottom: "6px" }}>No briefs yet</div>
            <div style={{ fontSize: "12px" }}>
              Use the Atomizer or Creative Brief to generate content briefs
            </div>
          </div>
        ) : (
          <div>
            {/* Table Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 120px 140px 80px",
              gap: "12px",
              padding: "12px 20px",
              borderBottom: "1px solid #333",
              fontSize: "11px",
              fontWeight: "600",
              color: "#888",
              textTransform: "uppercase",
            }}>
              <div>Title</div>
              <div>Status</div>
              <div>Source</div>
              <div>Created</div>
              <div></div>
            </div>

            {/* Rows */}
            {briefs.map(brief => {
              const statusCfg = STATUS_CONFIG[brief.status] || STATUS_CONFIG.draft;
              return (
                <div key={brief.id} style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 120px 140px 80px",
                  gap: "12px",
                  padding: "14px 20px",
                  borderBottom: "1px solid #2a2a2a",
                  alignItems: "center",
                  fontSize: "13px",
                }}>
                  <div style={{
                    color: "#fff",
                    fontWeight: "500",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}>
                    {brief.title}
                  </div>

                  {/* Status dropdown */}
                  <div style={{ position: "relative" }}>
                    <select
                      value={brief.status}
                      onChange={(e) => updateStatus(brief.id, e.target.value)}
                      style={{
                        background: statusCfg.bg,
                        border: `1px solid ${statusCfg.color}`,
                        borderRadius: "6px",
                        padding: "4px 24px 4px 8px",
                        color: statusCfg.color,
                        fontSize: "11px",
                        fontWeight: "600",
                        cursor: "pointer",
                        appearance: "none",
                        width: "100%",
                      }}
                    >
                      {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                        <option key={val} value={val}>{cfg.label}</option>
                      ))}
                    </select>
                    <ChevronDown
                      size={12}
                      style={{
                        position: "absolute",
                        right: "6px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        pointerEvents: "none",
                        color: statusCfg.color,
                      }}
                    />
                  </div>

                  <div style={{ color: "#b0b0b0", fontSize: "12px" }}>
                    {SOURCE_LABELS[brief.source_type] || brief.source_type || "—"}
                  </div>

                  <div style={{ color: "#888", fontSize: "12px" }}>
                    {brief.created_at
                      ? new Date(brief.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </div>

                  <div>
                    <button
                      onClick={() => deleteBrief(brief.id)}
                      style={{
                        background: "transparent",
                        border: "1px solid #555",
                        borderRadius: "6px",
                        padding: "4px 8px",
                        color: "#888",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                      }}
                      title="Delete brief"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
