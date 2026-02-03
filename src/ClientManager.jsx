import React, { useState } from "react";
import { Upload, Download, Trash2, Edit2, Plus, X, Calendar, Database, Youtube, Link, Cloud, Loader2 } from "lucide-react";
import Papa from "papaparse";
import { saveClientToSupabase, deleteClientFromSupabase } from "./services/clientDataService";
import { normalizeData } from "./lib/normalizeData.js";

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
  const [parsedRows, setParsedRows] = useState(null);
  const [detectedChannels, setDetectedChannels] = useState([]);
  const [channelEdits, setChannelEdits] = useState({});
  const [channelUrls, setChannelUrls] = useState({});
  const [showChannelPreview, setShowChannelPreview] = useState(false);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so re-selecting the same file triggers onChange again
    e.target.value = "";
    setUploadedFile(file);
    detectChannels(file);
  };

  const detectChannels = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rawData = result.data;
        setParsedRows(rawData);

        const channelCounts = {};
        rawData.forEach(r => {
          const title = r['Video title'] || r.title || "";
          if (!title || title.trim().toLowerCase() === 'total' || title.trim() === "") return;
          const ch = r['Channel'] || r['Channel name'] || r.channel || "";
          const channelName = ch.trim() || "Main Channel";
          channelCounts[channelName] = (channelCounts[channelName] || 0) + 1;
        });

        const channels = Object.entries(channelCounts).map(([name, count]) => ({
          original: name,
          count,
        }));

        setDetectedChannels(channels);
        const edits = {};
        const urls = {};
        channels.forEach(ch => { edits[ch.original] = ch.original; urls[ch.original] = ""; });
        setChannelEdits(edits);
        setChannelUrls(urls);
        setShowChannelPreview(true);
      },
      error: () => {
        // Parse errors will be caught again in processCSV
        setShowChannelPreview(false);
      }
    });
  };

  const applyChannelEdits = (rawRows) => {
    return rawRows.map(row => {
      const originalChannel = (
        row['Channel'] || row['Channel name'] || row.channel || ""
      ).trim() || "Main Channel";
      const editedChannel = channelEdits[originalChannel] || originalChannel;
      return { ...row, 'Channel': editedChannel, channel: editedChannel };
    });
  };

  const processCSV = async (file, name, isUpdate = false) => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Use pre-parsed rows with channel edits applied, or fall back to fresh parse
      let rawData;
      if (parsedRows) {
        rawData = applyChannelEdits(parsedRows);
      } else {
        const result = await new Promise((resolve, reject) => {
          Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: resolve,
            error: reject,
          });
        });
        rawData = result.data;
      }

      const { rows: allRows, channelTotalSubscribers } = normalizeData(rawData);
      const normalizedRows = allRows.filter(r => !r.isTotal && r.views > 0);

      // Resolve YouTube URL: use per-channel URL from detection panel (first non-empty),
      // fall back to the global URL field, then to existing client URL on update
      const perChannelUrl = Object.values(channelUrls).find(u => u && u.trim()) || "";
      const channelUrl = perChannelUrl.trim() || youtubeChannelUrl.trim() || (isUpdate ? editingClient.youtubeChannelUrl : "");

      // Build a clean map of per-channel YouTube URLs (only non-empty entries)
      const cleanChannelUrls = {};
      for (const [ch, url] of Object.entries(channelUrls)) {
        if (url && url.trim()) cleanChannelUrls[ch] = url.trim();
      }
      // Merge with any existing per-channel URLs from a previous save
      const mergedChannelUrlsMap = {
        ...(isUpdate ? editingClient.channelUrlsMap : {}),
        ...cleanChannelUrls
      };

      console.log('[Supabase] Saving client:', name, 'with', normalizedRows.length, 'videos');

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Supabase save timed out after 15s')), 15000)
      );
      const savedClient = await Promise.race([
        saveClientToSupabase(
          name,
          normalizedRows,
          channelUrl,
          channelTotalSubscribers,
          rawData,
          mergedChannelUrlsMap
        ),
        timeoutPromise
      ]);

      console.log('[Supabase] Client saved successfully:', savedClient.id);

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
      setParsedRows(null);
      setDetectedChannels([]);
      setChannelEdits({});
      setChannelUrls({});
      setShowChannelPreview(false);
    } catch (error) {
      console.error('[Supabase] Error saving client:', error);
      setSaveError(error.message || 'Failed to save to cloud');

      const editedRows = parsedRows ? applyChannelEdits(parsedRows) : [];
      const { channelTotalSubscribers } = normalizeData(editedRows);
      const localCleanUrls = {};
      for (const [ch, url] of Object.entries(channelUrls)) {
        if (url && url.trim()) localCleanUrls[ch] = url.trim();
      }
      const localClient = {
        id: isUpdate ? editingClient.id : `client-${Date.now()}`,
        name: name,
        uploadDate: new Date().toISOString(),
        rows: editedRows,
        subscriberCount: channelTotalSubscribers,
        channels: [...new Set(editedRows.map(r => r['Channel'] || r['Channel name'] || r.channel).filter(Boolean))],
        youtubeChannelUrl: (Object.values(channelUrls).find(u => u && u.trim()) || "").trim() || youtubeChannelUrl.trim() || (isUpdate ? editingClient.youtubeChannelUrl : ""),
        channelUrlsMap: { ...(isUpdate ? editingClient.channelUrlsMap : {}), ...localCleanUrls },
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
  };

  const handleAddClient = () => {
    if (!clientName.trim() || !uploadedFile) {
      alert("Please enter a client name and upload a CSV file");
      return;
    }
    const emptyChannels = Object.entries(channelEdits).filter(([, name]) => !name.trim());
    if (emptyChannels.length > 0) {
      alert("Please provide a name for all detected channels");
      return;
    }
    processCSV(uploadedFile, clientName);
  };

  const handleUpdateClient = () => {
    if (!uploadedFile) {
      alert("Please upload a CSV file");
      return;
    }
    const emptyChannels = Object.entries(channelEdits).filter(([, name]) => !name.trim());
    if (emptyChannels.length > 0) {
      alert("Please provide a name for all detected channels");
      return;
    }
    processCSV(uploadedFile, editingClient.name, true);
  };

  const handleDeleteClient = async (clientId) => {
    console.log('[Delete] Starting delete for clientId:', clientId);
    const clientToDelete = clients.find(c => c.id === clientId);
    console.log('[Delete] Found client:', clientToDelete?.name, 'supabaseId:', clientToDelete?.supabaseId);

    // Delete from Supabase in the background - don't block local cleanup
    if (clientToDelete?.supabaseId || clientToDelete?.syncedToSupabase) {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Supabase delete timed out')), 5000)
      );
      Promise.race([
        deleteClientFromSupabase(clientToDelete.supabaseId || clientToDelete.id),
        timeoutPromise
      ])
        .then(() => console.log('[Delete] Supabase delete succeeded'))
        .catch((error) => console.error('[Delete] Supabase delete failed:', error));
    }

    // Immediately update local state regardless of Supabase result
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
    setParsedRows(null);
    setDetectedChannels([]);
    setChannelEdits({});
    setChannelUrls({});
    setShowChannelPreview(false);
    setShowModal(true);
  };

  const openUpdateModal = (client) => {
    setModalMode("update");
    setEditingClient(client);
    setUploadedFile(null);
    setYoutubeChannelUrl(client.youtubeChannelUrl || "");
    setParsedRows(null);
    setDetectedChannels([]);
    setChannelEdits({});
    setChannelUrls(client.channelUrlsMap || {});
    setShowChannelPreview(false);
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
            onClick={() => { if (!showDeleteConfirm) setShowModal(false); }}
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

                {showChannelPreview && uploadedFile && (
                  <div style={{
                    background: "#1a1a2e",
                    border: "1px solid #333",
                    borderRadius: "8px",
                    padding: "16px",
                    marginBottom: "16px"
                  }}>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                      Channel Detection
                    </div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E", marginBottom: "12px" }}>
                      {detectedChannels.length === 1 && detectedChannels[0].original === "Main Channel"
                        ? "No channel column found in CSV. Name this channel:"
                        : `Found ${detectedChannels.length} channel${detectedChannels.length !== 1 ? 's' : ''} in CSV. Confirm or edit names below:`
                      }
                    </div>
                    {detectedChannels.map((ch) => (
                      <div key={ch.original} style={{ marginBottom: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
                          <input
                            type="text"
                            value={channelEdits[ch.original] || ""}
                            onChange={(e) => setChannelEdits(prev => ({ ...prev, [ch.original]: e.target.value }))}
                            placeholder="Channel name"
                            style={{
                              flex: 1,
                              background: "#1E1E1E",
                              border: "1px solid #444",
                              borderRadius: "6px",
                              padding: "8px 12px",
                              color: "#E0E0E0",
                              fontSize: "13px"
                            }}
                          />
                          <span style={{ fontSize: "12px", color: "#666", whiteSpace: "nowrap" }}>
                            {ch.count} video{ch.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Youtube size={12} style={{ color: "#FF0000", flexShrink: 0 }} />
                          <input
                            type="text"
                            value={channelUrls[ch.original] || ""}
                            onChange={(e) => setChannelUrls(prev => ({ ...prev, [ch.original]: e.target.value }))}
                            placeholder="https://www.youtube.com/@channel (optional)"
                            style={{
                              flex: 1,
                              background: "#1E1E1E",
                              border: "1px solid #333",
                              borderRadius: "6px",
                              padding: "6px 10px",
                              color: "#9E9E9E",
                              fontSize: "12px"
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!showChannelPreview && (
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
                )}

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
                      setParsedRows(null);
                      setDetectedChannels([]);
                      setChannelEdits({});
                      setChannelUrls({});
                      setShowChannelPreview(false);
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
            onClick={(e) => e.stopPropagation()}
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
                onClick={(e) => { e.stopPropagation(); handleDeleteClient(showDeleteConfirm); }}
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