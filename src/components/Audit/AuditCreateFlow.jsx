import React, { useState } from "react";
import {
  ArrowLeft,
  Search,
  Loader,
  Users,
  BarChart3,
  Play,
  AlertCircle,
} from "lucide-react";
import { youtubeAPI } from "../../services/youtubeAPI";
import { classifySizeTier, getTierConfig } from "../../services/auditIngestion";
import { runAudit } from "../../services/auditOrchestrator";

const TIER_LABELS = {
  emerging: "Emerging (0 – 10K subs)",
  growing: "Growing (10K – 100K)",
  established: "Established (100K – 500K)",
  major: "Major (500K – 1M)",
  elite: "Elite (1M+)",
};

const TIER_COLORS = {
  emerging: "#6b7280",
  growing: "#3b82f6",
  established: "#8b5cf6",
  major: "#f59e0b",
  elite: "#ef4444",
};

export default function AuditCreateFlow({ onBack, onAuditStarted }) {
  const [step, setStep] = useState(1); // 1: input, 2: preview, 3: config, 4: running
  const [channelInput, setChannelInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");

  // Resolved channel preview
  const [channelPreview, setChannelPreview] = useState(null);
  const [sizeTier, setSizeTier] = useState("");
  const [tierConfig, setTierConfig] = useState(null);

  // Config
  const [auditType, setAuditType] = useState("prospect");
  const [forceRefresh, setForceRefresh] = useState(false);

  // Running
  const [launching, setLaunching] = useState(false);

  // ── Step 1: Resolve channel ──
  const handleResolve = async () => {
    if (!channelInput.trim()) return;
    setResolving(true);
    setError("");
    try {
      const channelId = await youtubeAPI.resolveChannelId(channelInput.trim());
      const details = await youtubeAPI.fetchChannelDetails(channelId);
      const tier = classifySizeTier(details.subscriber_count);
      const config = getTierConfig(tier);

      setChannelPreview(details);
      setSizeTier(tier);
      setTierConfig(config);
      setStep(2);
    } catch (err) {
      setError(err.message || "Could not resolve channel. Check the URL or handle.");
    } finally {
      setResolving(false);
    }
  };

  // ── Step 3: Launch audit ──
  const handleLaunch = async () => {
    setLaunching(true);
    setError("");
    try {
      // We start the audit but don't await completion — the progress view handles that
      const auditPromise = runAudit({
        channelInput: channelPreview?.youtube_channel_id || channelInput.trim(),
        auditType,
        config: { forceRefresh },
      });

      // Wait briefly for the audit to be created so we can get the ID
      // The orchestrator creates the audit record immediately
      const audit = await auditPromise;
      onAuditStarted(audit.id);
    } catch (err) {
      // If it failed during creation, show error
      // If it failed during execution, we should have gotten the ID already
      setError(err.message);
      setLaunching(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            background: "transparent",
            border: "1px solid #444",
            borderRadius: "8px",
            color: "#9E9E9E",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <h2 style={{ fontSize: "20px", fontWeight: "700", margin: 0 }}>New Audit</h2>
      </div>

      {/* Step indicator */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "32px" }}>
        {["Channel", "Preview", "Configure"].map((label, i) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              background: step > i ? "rgba(34, 197, 94, 0.1)" : step === i + 1 ? "rgba(41, 98, 255, 0.15)" : "#252525",
              border: `1px solid ${step > i ? "rgba(34, 197, 94, 0.3)" : step === i + 1 ? "#2962FF" : "#333"}`,
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "600",
              color: step > i ? "#22c55e" : step === i + 1 ? "#60a5fa" : "#666",
            }}
          >
            <span style={{
              width: "20px", height: "20px", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: "700",
              background: step > i ? "#166534" : step === i + 1 ? "#2962FF" : "#444",
              color: step > i ? "#22c55e" : "#fff",
            }}>
              {step > i ? "✓" : i + 1}
            </span>
            {label}
          </div>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "12px 16px", background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px",
          color: "#ef4444", fontSize: "13px", marginBottom: "16px",
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── Step 1: Channel Input ── */}
      {step === 1 && (
        <div style={{ maxWidth: "600px" }}>
          <div style={{
            background: "#1E1E1E", borderRadius: "12px", border: "1px solid #333",
            padding: "32px",
          }}>
            <div style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>
              Enter a YouTube Channel
            </div>
            <div style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "20px" }}>
              Paste a channel URL, @handle, or channel ID
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleResolve()}
                placeholder="https://youtube.com/@channel or UCxxxxxxx"
                style={{
                  flex: 1, padding: "12px 16px", background: "#252525",
                  border: "1px solid #444", borderRadius: "8px", color: "#E0E0E0",
                  fontSize: "14px", outline: "none",
                }}
              />
              <button
                onClick={handleResolve}
                disabled={resolving || !channelInput.trim()}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "12px 20px", background: "#2962FF", border: "none",
                  borderRadius: "8px", color: "#fff", cursor: "pointer",
                  fontWeight: "600", fontSize: "14px",
                  opacity: resolving || !channelInput.trim() ? 0.5 : 1,
                }}
              >
                {resolving ? <Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Search size={16} />}
                {resolving ? "Resolving..." : "Look Up"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Channel Preview ── */}
      {step === 2 && channelPreview && (
        <div style={{ maxWidth: "600px" }}>
          <div style={{
            background: "#1E1E1E", borderRadius: "12px", border: "1px solid #333",
            padding: "32px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
              {channelPreview.thumbnail_url && (
                <img
                  src={channelPreview.thumbnail_url}
                  alt=""
                  style={{ width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover" }}
                />
              )}
              <div>
                <div style={{ fontSize: "18px", fontWeight: "700" }}>{channelPreview.name}</div>
                <div style={{ fontSize: "13px", color: "#9E9E9E" }}>
                  {channelPreview.custom_url || channelPreview.youtube_channel_id}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
              <div style={{ background: "#252525", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Subscribers</div>
                <div style={{ fontSize: "18px", fontWeight: "700" }}>
                  {(channelPreview.subscriber_count || 0).toLocaleString()}
                </div>
              </div>
              <div style={{ background: "#252525", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Total Views</div>
                <div style={{ fontSize: "18px", fontWeight: "700" }}>
                  {(channelPreview.total_view_count || 0).toLocaleString()}
                </div>
              </div>
              <div style={{ background: "#252525", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "#9E9E9E", marginBottom: "4px" }}>Videos</div>
                <div style={{ fontSize: "18px", fontWeight: "700" }}>
                  {(channelPreview.video_count || 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Tier */}
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "10px 14px", background: "#252525", borderRadius: "8px", marginBottom: "20px",
            }}>
              <div style={{
                width: "10px", height: "10px", borderRadius: "50%",
                background: TIER_COLORS[sizeTier] || "#666",
              }} />
              <span style={{ fontSize: "13px", fontWeight: "600", color: TIER_COLORS[sizeTier] || "#9E9E9E" }}>
                {TIER_LABELS[sizeTier] || sizeTier}
              </span>
              <span style={{ fontSize: "12px", color: "#666", marginLeft: "auto" }}>
                Will analyze up to {tierConfig?.maxVideos} videos
              </span>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => { setStep(1); setChannelPreview(null); setError(""); }}
                style={{
                  padding: "10px 20px", background: "transparent",
                  border: "1px solid #444", borderRadius: "8px",
                  color: "#9E9E9E", cursor: "pointer", fontSize: "13px",
                }}
              >
                Change Channel
              </button>
              <button
                onClick={() => setStep(3)}
                style={{
                  padding: "10px 24px", background: "#2962FF", border: "none",
                  borderRadius: "8px", color: "#fff", cursor: "pointer",
                  fontWeight: "600", fontSize: "14px",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Configure ── */}
      {step === 3 && (
        <div style={{ maxWidth: "600px" }}>
          <div style={{
            background: "#1E1E1E", borderRadius: "12px", border: "1px solid #333",
            padding: "32px",
          }}>
            <div style={{ fontSize: "16px", fontWeight: "600", marginBottom: "20px" }}>
              Audit Configuration
            </div>

            {/* Audit Type */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "8px" }}>Audit Type</div>
              <div style={{ display: "flex", gap: "8px" }}>
                {[
                  { id: "prospect", label: "Prospect Analysis", icon: Users, desc: "Positioning & competitive edge for sales" },
                  { id: "client_baseline", label: "Client Baseline", icon: BarChart3, desc: "Benchmark starting point for new clients" },
                ].map(({ id, label, icon: Icon, desc }) => (
                  <button
                    key={id}
                    onClick={() => setAuditType(id)}
                    style={{
                      flex: 1, padding: "16px", background: auditType === id ? "rgba(41, 98, 255, 0.15)" : "#252525",
                      border: `1px solid ${auditType === id ? "#2962FF" : "#444"}`,
                      borderRadius: "10px", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <Icon size={20} style={{ color: auditType === id ? "#60a5fa" : "#666", marginBottom: "8px" }} />
                    <div style={{ fontSize: "14px", fontWeight: "600", color: auditType === id ? "#60a5fa" : "#E0E0E0" }}>
                      {label}
                    </div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E", marginTop: "4px" }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Force Refresh */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{
                display: "flex", alignItems: "center", gap: "8px",
                fontSize: "13px", color: "#9E9E9E", cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={forceRefresh}
                  onChange={(e) => setForceRefresh(e.target.checked)}
                  style={{ accentColor: "#2962FF" }}
                />
                Force refresh YouTube data (skip cache)
              </label>
            </div>

            {/* Summary */}
            <div style={{
              padding: "14px", background: "#252525", borderRadius: "8px",
              fontSize: "13px", color: "#9E9E9E", marginBottom: "24px",
            }}>
              <div style={{ fontWeight: "600", color: "#E0E0E0", marginBottom: "6px" }}>Audit will include:</div>
              <ul style={{ margin: 0, paddingLeft: "20px", lineHeight: "1.8" }}>
                <li>Channel data ingestion & video analysis</li>
                <li>Content series detection (pattern + AI)</li>
                <li>Tier-stratified peer benchmarking</li>
                <li>AI opportunity analysis</li>
                <li>Stop/Start/Optimize recommendations</li>
                <li>Executive summary</li>
              </ul>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  padding: "10px 20px", background: "transparent",
                  border: "1px solid #444", borderRadius: "8px",
                  color: "#9E9E9E", cursor: "pointer", fontSize: "13px",
                }}
              >
                Back
              </button>
              <button
                onClick={handleLaunch}
                disabled={launching}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "10px 24px", background: "#22c55e", border: "none",
                  borderRadius: "8px", color: "#fff", cursor: "pointer",
                  fontWeight: "600", fontSize: "14px",
                  opacity: launching ? 0.6 : 1,
                }}
              >
                {launching ? (
                  <Loader size={16} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Play size={16} />
                )}
                {launching ? "Launching..." : "Run Audit"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
