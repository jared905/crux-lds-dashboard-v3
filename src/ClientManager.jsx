import React, { useState } from "react";
import { Upload, Download, Trash2, Edit2, Plus, X, Calendar, Database, Youtube, Link, Cloud, Loader2 } from "lucide-react";
import Papa from "papaparse";
import { saveClientToSupabase, deleteClientFromSupabase } from "./services/clientDataService";

// Import the normalizeData function from App.jsx
// You'll need to export it from App.jsx first, OR copy it here
const normalizeData = (rawData) => {
  if (!Array.isArray(rawData)) return { rows: [], channelTotalSubscribers: 0 };

  // Find the "Total" row first to extract channel-level data (case-insensitive)
  const totalRow = rawData.find(r => {
    const title = r['Video title'] || r.title || "";
    return title.toLowerCase().trim() === 'total';
  });

  // Extract total subscribers from the Total row
  const channelTotalSubscribers = totalRow ?
    (Number(String(totalRow['Subscribers'] || totalRow['Subscribers gained'] || totalRow.subscribers || 0).replace(/[^0-9.-]/g, "")) || 0) :
    0;

  // Filter out invalid rows BEFORE processing
  const filteredData = rawData.filter(r => {
    const title = r['Video title'] || r.title || "";
    const titleLower = title.toLowerCase().trim();

    // Remove rows with "Total" as title (case-insensitive)
    if (titleLower === "total") return false;

    // Remove rows with no title or empty title
    if (!title || title.trim() === "") return false;

    return true;
  });

  const processedRows = filteredData.map(r => {
    const num = (val) => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      return Number(String(val).replace(/[^0-9.-]/g, "")) || 0;
    };

    const title = r['Video title'] || r.title || "Untitled";
    const publishDate = r['Video publish time'] || r.publishDate;
    const views = num(r['Views'] || r.views);
    const impressions = num(r['Impressions'] || r.impressions);
    const subscribers = num(r['Subscribers gained'] || r['Subscribers'] || r.subscribers);
    const duration = num(r['Duration'] || r.duration);

    let retention = num(r['Average percentage viewed (%)'] || r.retention);
    if (retention > 1.0) retention = retention / 100;

    let ctr = num(r['Impressions click-through rate (%)'] || r.ctr);
    if (ctr > 1.0) ctr = ctr / 100;

    let watchHours = num(r.watchHours);
    if (!watchHours && r['Average view duration']) {
      const duration = r['Average view duration'];
      const parts = String(duration).split(':');
      if (parts.length === 3) {
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const seconds = parseInt(parts[2]) || 0;
        const totalHours = hours + (minutes / 60) + (seconds / 3600);
        watchHours = totalHours * views;
      }
    }

    // Determine video type: prefer explicit type from CSV, fall back to duration for very short videos only
    // Check multiple possible column names for type
    let type = r.type || r.Type || r.TYPE || r['Content Type'] || r['content type'] || "";
    if (!type) {
      // Only use duration as fallback for very short videos (≤60 seconds)
      type = (duration > 0 && duration <= 60) ? "short" : "long";
    }

    const channel = r['Content'] || r.channel || "Main Channel";

    return {
      channel: String(channel).trim(),
      title: title,
      duration: duration,
      views: views,
      watchHours: watchHours,
      subscribers: subscribers,
      impressions: impressions,
      ctr,
      retention,
      avgViewPct: retention,
      type: type.toLowerCase(),
      publishDate: publishDate ? new Date(publishDate).toISOString() : null,
      video_id: r['Content'] || r.videoId || `vid-${Date.now()}-${Math.random()}`
    };
  });

  // Filter out videos with 0 views for display purposes
  const withViews = processedRows.filter(r => r.views > 0);

  return { rows: withViews, channelTotalSubscribers };
};

export default function ClientManager({ clients, activeClient, onClientChange, onClientsUpdate }) {
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [editingClient, setEditingClient] = useState(null);
  const [clientName, setClientName] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
  };

  const processCSV = async (file, name, isUpdate = false) => {
    setIsSaving(true);
    setSaveError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        try {
          // Extract subscriber count and normalize data
          const { rows: normalizedRows, channelTotalSubscribers } = normalizeData(result.data);
          const channelUrl = youtubeChannelUrl.trim() || (isUpdate ? editingClient.youtubeChannelUrl : "");

          // Save to Supabase
          const savedClient = await saveClientToSupabase(
            name,
            normalizedRows,
            channelUrl,
            channelTotalSubscribers,
            result.data // Raw rows for backward compatibility
          );

          // Update local state
          let updatedClients;
          if (isUpdate) {
            updatedClients = clients.map(c =>
              (c.id === editingClient.id || c.supabaseId === editingClient.supabaseId)
                ? savedClient
                : c
            );
          } else {
            updatedClients = [...clients, savedClient];
          }

          onClientsUpdate(updatedClients);
          onClientChange(savedClient);

          setShowModal(false);
          setClientName("");
          setUploadedFile(null);
          setEditingClient(null);
          setYoutubeChannelUrl("");
        } catch (error) {
          console.error('Error saving to Supabase:', error);
          setSaveError(error.message || 'Failed to save to cloud');

          // Fallback: save locally if Supabase fails
          const localClient = {
            id: isUpdate ? editingClient.id : `client-${Date.now()}`,
            name: name,
            uploadDate: new Date().toISOString(),
            rows: result.data,
            subscriberCount: channelTotalSubscribers,
            channels: [...new Set(result.data.map(r => r['Content'] || r.channel).filter(Boolean))],
            youtubeChannelUrl: youtubeChannelUrl.trim() || (isUpdate ? editingClient.youtubeChannelUrl : ""),
            syncedToSupabase: false,
          };

          let updatedClients;
          if (isUpdate) {
            updatedClients = clients.map(c => c.id === editingClient.id ? localClient : c);
          } else {
            updatedClients = [...clients, localClient];
          }

          onClientsUpdate(updatedClients);
          onClientChange(localClient);
        } finally {
          setIsSaving(false);
        }
      },
      error: (error) => {
        setIsSaving(false);
        setSaveError(error.message);
        alert(`Error parsing CSV: ${error.message}`);
      }
    });
  };

  const handleAddClient = () => {
    if (!clientName.trim() || !uploadedFile) {
      alert("Please enter a client name and upload a CSV file");
      return;
    }
    processCSV(uploadedFile, clientName);
  };

  const handleUpdateClient = () => {
    if (!uploadedFile) {
      alert("Please upload a CSV file");
      return;
    }
    processCSV(uploadedFile, editingClient.name, true);
  };

  const handleDeleteClient = async (clientId) => {
    const clientToDelete = clients.find(c => c.id === clientId);

    // Delete from Supabase if it was synced
    if (clientToDelete?.supabaseId || clientToDelete?.syncedToSupabase) {
      try {
        await deleteClientFromSupabase(clientToDelete.supabaseId || clientToDelete.id);
      } catch (error) {
        console.error('Error deleting from Supabase:', error);
        // Continue with local delete even if Supabase fails
      }
    }

    const updatedClients = clients.filter(c => c.id !== clientId);
    onClientsUpdate(updatedClients);

    if (activeClient?.id === clientId && updatedClients.length > 0) {
      onClientChange(updatedClients[0]);
    } else if (updatedClients.length === 0) {
      onClientChange(null);
    }

    setShowDeleteConfirm(null);
  };

  const handleExportBackup = () => {
    const backup = {
      version: "1.0",
      exportDate: new Date().toISOString(),
      clients: clients
    };
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fullview-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const backup = JSON.parse(event.target.result);
        
        if (!backup.clients || !Array.isArray(backup.clients)) {
          alert("Invalid backup file format");
          return;
        }

        onClientsUpdate(backup.clients);
        
        if (backup.clients.length > 0) {
          onClientChange(backup.clients[0]);
        }
        
        alert(`Successfully imported ${backup.clients.length} client(s)`);
      } catch (error) {
        alert(`Error importing backup: ${error.message}`);
      }
    };
    reader.readAsText(file);
  };

  const openAddModal = () => {
    setModalMode("add");
    setClientName("");
    setUploadedFile(null);
    setEditingClient(null);
    setYoutubeChannelUrl("");
    setShowModal(true);
  };

  const openUpdateModal = (client) => {
    setModalMode("update");
    setEditingClient(client);
    setUploadedFile(null);
    setYoutubeChannelUrl(client.youtubeChannelUrl || "");
    setShowModal(true);
  };

  const formatDate = (isoDate) => {
    return new Date(isoDate).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{
          background: "#2962FF",
          border: "none",
          borderRadius: "8px",
          padding: "10px 16px",
          fontWeight: "600",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "#fff"
        }}
      >
        <Database size={16} />
        Manage Clients
      </button>

      {showModal && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              zIndex: 1000
            }}
            onClick={() => setShowModal(false)}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#1E1E1E",
              border: "1px solid #333",
              borderRadius: "12px",
              width: "90%",
              maxWidth: "900px",
              maxHeight: "90vh",
              overflow: "auto",
              zIndex: 1001,
              padding: "32px"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <div>
                <div style={{ fontSize: "24px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                  Client Management
                </div>
                <div style={{ fontSize: "13px", color: "#9E9E9E" }}>
                  Manage client data, upload updates, and backup your dashboard
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "transparent", border: "none", color: "#9E9E9E", cursor: "pointer" }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ display: "flex", gap: "12px", marginBottom: "32px" }}>
              <button
                onClick={openAddModal}
                style={{
                  flex: 1,
                  background: "#2962FF",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  color: "#fff"
                }}
              >
                <Plus size={18} />
                Add New Client
              </button>

              <button
                onClick={handleExportBackup}
                disabled={clients.length === 0}
                style={{
                  flex: 1,
                  background: clients.length === 0 ? "#252525" : "#10b981",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px",
                  fontWeight: "600",
                  cursor: clients.length === 0 ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  color: clients.length === 0 ? "#666" : "#fff",
                  opacity: clients.length === 0 ? 0.5 : 1
                }}
              >
                <Download size={18} />
                Export Backup
              </button>

              <label
                style={{
                  flex: 1,
                  background: "#8b5cf6",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  color: "#fff"
                }}
              >
                <Upload size={18} />
                Import Backup
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            {(modalMode === "add" || editingClient) && (
              <div style={{
                background: "#252525",
                border: "1px solid #333",
                borderRadius: "12px",
                padding: "24px",
                marginBottom: "24px"
              }}>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "16px" }}>
                  {modalMode === "add" ? "Add New Client" : `Update ${editingClient.name}`}
                </div>

                {modalMode === "add" && (
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", color: "#9E9E9E", fontWeight: "600", marginBottom: "8px" }}>
                      Client Name
                    </label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="e.g., LDS Leadership"
                      style={{
                        width: "100%",
                        background: "#1E1E1E",
                        border: "1px solid #333",
                        borderRadius: "8px",
                        padding: "12px",
                        color: "#E0E0E0",
                        fontSize: "14px"
                      }}
                    />
                  </div>
                )}

                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "13px", color: "#9E9E9E", fontWeight: "600", marginBottom: "8px" }}>
                    Upload CSV Data
                  </label>
                  <label
                    style={{
                      display: "block",
                      width: "100%",
                      background: "#1E1E1E",
                      border: "2px dashed #333",
                      borderRadius: "8px",
                      padding: "32px",
                      cursor: "pointer",
                      textAlign: "center"
                    }}
                  >
                    <Upload size={32} style={{ color: "#666", margin: "0 auto 12px" }} />
                    <div style={{ color: "#E0E0E0", fontWeight: "600", marginBottom: "4px" }}>
                      {uploadedFile ? uploadedFile.name : "Click to upload CSV file"}
                    </div>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      {uploadedFile ? "Click to replace" : "YouTube Studio export format"}
                    </div>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "13px", color: "#9E9E9E", fontWeight: "600", marginBottom: "8px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Youtube size={14} style={{ color: "#FF0000" }} />
                      YouTube Channel URL (Optional)
                    </span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      value={youtubeChannelUrl}
                      onChange={(e) => setYoutubeChannelUrl(e.target.value)}
                      placeholder="https://www.youtube.com/@channelname or channel URL"
                      style={{
                        width: "100%",
                        background: "#1E1E1E",
                        border: "1px solid #333",
                        borderRadius: "8px",
                        padding: "12px",
                        paddingLeft: "40px",
                        color: "#E0E0E0",
                        fontSize: "14px"
                      }}
                    />
                    <Link size={16} style={{
                      position: "absolute",
                      left: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#666"
                    }} />
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "6px" }}>
                    Adding a channel URL enables video thumbnails and direct YouTube links in the dashboard
                  </div>
                </div>

                {saveError && (
                  <div style={{
                    background: "#ef444420",
                    border: "1px solid #ef4444",
                    borderRadius: "8px",
                    padding: "12px",
                    marginBottom: "16px",
                    color: "#ef4444",
                    fontSize: "13px"
                  }}>
                    Cloud save failed: {saveError}. Data saved locally.
                  </div>
                )}

                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    onClick={modalMode === "add" ? handleAddClient : handleUpdateClient}
                    disabled={isSaving}
                    style={{
                      flex: 1,
                      background: isSaving ? "#1e40af" : "#2962FF",
                      border: "none",
                      borderRadius: "8px",
                      padding: "12px",
                      fontWeight: "600",
                      cursor: isSaving ? "not-allowed" : "pointer",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px"
                    }}
                  >
                    {isSaving && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
                    {isSaving ? "Saving to Cloud..." : (modalMode === "add" ? "Add Client" : "Update Data")}
                  </button>
                  <button
                    onClick={() => {
                      setModalMode("add");
                      setEditingClient(null);
                      setClientName("");
                      setUploadedFile(null);
                      setYoutubeChannelUrl("");
                    }}
                    style={{
                      background: "#333",
                      border: "none",
                      borderRadius: "8px",
                      padding: "12px 24px",
                      fontWeight: "600",
                      cursor: "pointer",
                      color: "#E0E0E0"
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "16px" }}>
                Existing Clients ({clients.length})
              </div>

              {clients.length === 0 ? (
                <div style={{
                  background: "#252525",
                  border: "1px solid #333",
                  borderRadius: "12px",
                  padding: "40px",
                  textAlign: "center",
                  color: "#9E9E9E"
                }}>
                  No clients yet. Add your first client to get started.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {clients.map((client) => (
                    <div
                      key={client.id}
                      style={{
                        background: activeClient?.id === client.id ? "#2962FF15" : "#252525",
                        border: activeClient?.id === client.id ? "1px solid #2962FF" : "1px solid #333",
                        borderRadius: "12px",
                        padding: "20px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff", marginBottom: "8px" }}>
                          {client.name}
                          {activeClient?.id === client.id && (
                            <span style={{
                              marginLeft: "12px",
                              fontSize: "11px",
                              background: "#2962FF",
                              color: "#fff",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontWeight: "600"
                            }}>
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "13px", color: "#9E9E9E", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Calendar size={14} />
                            {formatDate(client.uploadDate)}
                          </div>
                          <div>
                            {client.rows.length} videos
                          </div>
                          {client.subscriberCount > 0 && (
                            <div>
                              {client.subscriberCount.toLocaleString()} subscribers
                            </div>
                          )}
                          <div>
                            {client.channels?.length || 0} channel{(client.channels?.length || 0) !== 1 ? 's' : ''}
                          </div>
                          {client.youtubeChannelUrl && (
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#FF0000" }}>
                              <Youtube size={12} />
                              Linked
                            </div>
                          )}
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            color: client.syncedToSupabase ? "#10b981" : "#f59e0b"
                          }}>
                            <Cloud size={12} />
                            {client.syncedToSupabase ? "Synced" : "Local"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "8px" }}>
                        {activeClient?.id !== client.id && (
                          <button
                            onClick={() => onClientChange(client)}
                            style={{
                              background: "#333",
                              border: "none",
                              borderRadius: "8px",
                              padding: "8px 16px",
                              fontWeight: "600",
                              cursor: "pointer",
                              color: "#E0E0E0",
                              fontSize: "13px"
                            }}
                          >
                            View
                          </button>
                        )}
                        <button
                          onClick={() => openUpdateModal(client)}
                          style={{
                            background: "transparent",
                            border: "1px solid #333",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            cursor: "pointer",
                            color: "#9E9E9E"
                          }}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(client.id)}
                          style={{
                            background: "transparent",
                            border: "1px solid #ef4444",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            cursor: "pointer",
                            color: "#ef4444"
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {showDeleteConfirm && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.8)",
              zIndex: 1002
            }}
            onClick={() => setShowDeleteConfirm(null)}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#1E1E1E",
              border: "2px solid #ef4444",
              borderRadius: "12px",
              padding: "32px",
              maxWidth: "400px",
              zIndex: 1003
            }}
          >
            <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", marginBottom: "12px" }}>
              Delete Client?
            </div>
            <div style={{ fontSize: "14px", color: "#9E9E9E", marginBottom: "24px" }}>
              Are you sure you want to delete "{clients.find(c => c.id === showDeleteConfirm)?.name}"? This action cannot be undone.
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => handleDeleteClient(showDeleteConfirm)}
                style={{
                  flex: 1,
                  background: "#ef4444",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  color: "#fff"
                }}
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                style={{
                  flex: 1,
                  background: "#333",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  color: "#E0E0E0"
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}