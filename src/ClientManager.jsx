import React, { useState } from "react";
import { Upload, Download, Trash2, Edit2, Plus, X, Calendar, Database, Youtube, Link, Cloud, Loader2, Clock, CalendarDays, ChevronDown, ChevronUp, Image } from "lucide-react";
import Papa from "papaparse";
import { saveClientToSupabase, deleteClientFromSupabase, saveReportPeriod, getReportPeriod, deleteReportPeriod, setActivePeriod, PERIOD_TYPES, calculatePeriodDates, periodVideoDataToRows } from "./services/clientDataService";
import { normalizeData } from "./lib/normalizeData.js";

export default function ClientManager({ clients, activeClient, onClientChange, onClientsUpdate }) {
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("add"); // "add" | "update" | "addPeriod"
  const [editingClient, setEditingClient] = useState(null);
  const [clientName, setClientName] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState("");
  const [backgroundImageUrl, setBackgroundImageUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [parsedRows, setParsedRows] = useState(null);
  const [detectedChannels, setDetectedChannels] = useState([]);
  const [channelEdits, setChannelEdits] = useState({});
  const [channelUrls, setChannelUrls] = useState({});
  const [showChannelPreview, setShowChannelPreview] = useState(false);

  // Report period state
  const [periodType, setPeriodType] = useState(PERIOD_TYPES.MONTHLY);
  const [periodName, setPeriodName] = useState("");
  const [periodStartDate, setPeriodStartDate] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");
  const [expandedClientPeriods, setExpandedClientPeriods] = useState({});

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
          mergedChannelUrlsMap,
          backgroundImageUrl.trim() || (isUpdate ? editingClient.backgroundImageUrl : null)
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
        backgroundImageUrl: backgroundImageUrl.trim() || (isUpdate ? editingClient.backgroundImageUrl : null),
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

  const handleUpdateClient = async () => {
    // If CSV uploaded, process it with full update
    if (uploadedFile) {
      const emptyChannels = Object.entries(channelEdits).filter(([, name]) => !name.trim());
      if (emptyChannels.length > 0) {
        alert("Please provide a name for all detected channels");
        return;
      }
      processCSV(uploadedFile, editingClient.name, true);
      return;
    }

    // No CSV - just update metadata (background image, YouTube URL, etc.)
    setIsSaving(true);
    setSaveError(null);

    try {
      const updatedClient = {
        ...editingClient,
        youtubeChannelUrl: youtubeChannelUrl.trim() || editingClient.youtubeChannelUrl,
        backgroundImageUrl: backgroundImageUrl.trim() || null,
      };

      // Update in Supabase if synced
      if (editingClient.syncedToSupabase && editingClient.supabaseId) {
        const { supabase } = await import('./services/supabaseClient');
        if (supabase) {
          await supabase
            .from('channels')
            .update({
              custom_url: updatedClient.youtubeChannelUrl || null,
              background_image_url: updatedClient.backgroundImageUrl || null,
            })
            .eq('id', editingClient.supabaseId);
        }
      }

      // Update local state
      const updatedClients = clients.map(c =>
        c.id === editingClient.id ? updatedClient : c
      );

      onClientsUpdate(updatedClients);
      onClientChange(updatedClient);

      setShowModal(false);
      resetModalState();
    } catch (error) {
      console.error('Error updating client metadata:', error);
      setSaveError(error.message || 'Failed to update');
    } finally {
      setIsSaving(false);
    }
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
    setBackgroundImageUrl("");
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
    setBackgroundImageUrl(client.backgroundImageUrl || "");
    setParsedRows(null);
    setDetectedChannels([]);
    setChannelEdits({});
    setChannelUrls(client.channelUrlsMap || {});
    setShowChannelPreview(false);
    setShowModal(true);
  };

  const openAddPeriodModal = (client) => {
    setModalMode("addPeriod");
    setEditingClient(client);
    setUploadedFile(null);
    setParsedRows(null);
    setDetectedChannels([]);
    setChannelEdits({});
    setChannelUrls(client.channelUrlsMap || {});
    setShowChannelPreview(false);
    // Set default period to last month
    const defaults = calculatePeriodDates(PERIOD_TYPES.MONTHLY);
    setPeriodType(PERIOD_TYPES.MONTHLY);
    setPeriodName(defaults.name);
    setPeriodStartDate(defaults.startDate || "");
    setPeriodEndDate(defaults.endDate || "");
    setShowModal(true);
  };

  const handlePeriodTypeChange = (newType) => {
    setPeriodType(newType);
    const defaults = calculatePeriodDates(newType);
    setPeriodName(defaults.name);
    setPeriodStartDate(defaults.startDate || "");
    setPeriodEndDate(defaults.endDate || "");
  };

  const handleAddPeriod = async () => {
    if (!uploadedFile || !editingClient) {
      alert("Please upload a CSV file");
      return;
    }
    if (!periodName.trim()) {
      alert("Please enter a period name");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      // Use pre-parsed rows with channel edits applied
      let rawData;
      if (parsedRows) {
        rawData = applyChannelEdits(parsedRows);
      } else {
        const result = await new Promise((resolve, reject) => {
          Papa.parse(uploadedFile, {
            header: true,
            skipEmptyLines: true,
            complete: resolve,
            error: reject,
          });
        });
        rawData = result.data;
      }

      const { rows: allRows } = normalizeData(rawData);
      const normalizedRows = allRows.filter(r => !r.isTotal && r.views > 0);

      // Save as a report period
      const periodInfo = {
        name: periodName.trim(),
        periodType: periodType,
        startDate: periodStartDate || null,
        endDate: periodEndDate || null,
        isBaseline: periodType === PERIOD_TYPES.LIFETIME,
      };

      const savedPeriod = await saveReportPeriod(
        editingClient.id,
        periodInfo,
        normalizedRows
      );

      console.log('[Supabase] Period saved successfully:', savedPeriod.id);

      // Update client with new period info and load the period's data
      const updatedClient = {
        ...editingClient,
        rows: periodVideoDataToRows(normalizedRows),
        reportPeriods: [...(editingClient.reportPeriods || []), {
          id: savedPeriod.id,
          name: savedPeriod.name,
          period_type: savedPeriod.period_type,
          start_date: savedPeriod.start_date,
          end_date: savedPeriod.end_date,
          video_count: savedPeriod.video_count,
          total_views: savedPeriod.total_views,
          uploaded_at: savedPeriod.uploaded_at,
          is_baseline: savedPeriod.is_baseline,
        }],
        activePeriod: {
          id: savedPeriod.id,
          name: savedPeriod.name,
          periodType: savedPeriod.period_type,
          startDate: savedPeriod.start_date,
          endDate: savedPeriod.end_date,
          isBaseline: savedPeriod.is_baseline,
        },
        activePeriodId: savedPeriod.id,
      };

      const updatedClients = clients.map(c =>
        c.id === editingClient.id ? updatedClient : c
      );

      onClientsUpdate(updatedClients);
      onClientChange(updatedClient);

      // Reset and close modal
      setShowModal(false);
      resetModalState();
    } catch (error) {
      console.error('[Supabase] Error saving period:', error);
      setSaveError(error.message || 'Failed to save period');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSwitchPeriod = async (client, period) => {
    try {
      // Load the period's full data
      const fullPeriod = await getReportPeriod(period.id);
      if (!fullPeriod) return;

      // Update active period in database
      await setActivePeriod(client.id, period.id);

      // Update client with period data
      const updatedClient = {
        ...client,
        rows: periodVideoDataToRows(fullPeriod.video_data || []),
        activePeriod: {
          id: fullPeriod.id,
          name: fullPeriod.name,
          periodType: fullPeriod.period_type,
          startDate: fullPeriod.start_date,
          endDate: fullPeriod.end_date,
          isBaseline: fullPeriod.is_baseline,
        },
        activePeriodId: fullPeriod.id,
      };

      const updatedClients = clients.map(c =>
        c.id === client.id ? updatedClient : c
      );

      onClientsUpdate(updatedClients);
      onClientChange(updatedClient);
    } catch (error) {
      console.error('Error switching period:', error);
      alert('Failed to switch period: ' + error.message);
    }
  };

  const handleDeletePeriod = async (client, periodId) => {
    if (!confirm("Delete this report period? This cannot be undone.")) return;

    try {
      await deleteReportPeriod(periodId);

      // Update client's periods list
      const updatedPeriods = (client.reportPeriods || []).filter(p => p.id !== periodId);
      const updatedClient = {
        ...client,
        reportPeriods: updatedPeriods,
        // If we deleted the active period, clear it
        ...(client.activePeriodId === periodId ? { activePeriod: null, activePeriodId: null } : {}),
      };

      const updatedClients = clients.map(c =>
        c.id === client.id ? updatedClient : c
      );

      onClientsUpdate(updatedClients);
      if (activeClient?.id === client.id) {
        onClientChange(updatedClient);
      }
    } catch (error) {
      console.error('Error deleting period:', error);
      alert('Failed to delete period: ' + error.message);
    }
  };

  const resetModalState = () => {
    setModalMode("add");
    setEditingClient(null);
    setClientName("");
    setUploadedFile(null);
    setYoutubeChannelUrl("");
    setBackgroundImageUrl("");
    setParsedRows(null);
    setDetectedChannels([]);
    setChannelEdits({});
    setChannelUrls({});
    setShowChannelPreview(false);
    setPeriodType(PERIOD_TYPES.MONTHLY);
    setPeriodName("");
    setPeriodStartDate("");
    setPeriodEndDate("");
  };

  const toggleClientPeriods = (clientId) => {
    setExpandedClientPeriods(prev => ({
      ...prev,
      [clientId]: !prev[clientId]
    }));
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

            {/* Add Period Form */}
            {modalMode === "addPeriod" && editingClient && (
              <div style={{
                background: "#252525",
                border: "1px solid #10b981",
                borderRadius: "12px",
                padding: "24px",
                marginBottom: "24px"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                  <CalendarDays size={24} style={{ color: "#10b981" }} />
                  <div>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff" }}>
                      Add Report Period for {editingClient.name}
                    </div>
                    <div style={{ fontSize: "12px", color: "#9E9E9E" }}>
                      Upload period-specific data (weekly, monthly, etc.)
                    </div>
                  </div>
                </div>

                {/* Period Type Selection */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "13px", color: "#9E9E9E", fontWeight: "600", marginBottom: "8px" }}>
                    Period Type
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px" }}>
                    {[
                      { type: PERIOD_TYPES.LIFETIME, label: "Lifetime", icon: "∞" },
                      { type: PERIOD_TYPES.WEEKLY, label: "Weekly", icon: "7d" },
                      { type: PERIOD_TYPES.MONTHLY, label: "Monthly", icon: "30d" },
                      { type: PERIOD_TYPES.QUARTERLY, label: "Quarterly", icon: "Q" },
                      { type: PERIOD_TYPES.CUSTOM, label: "Custom", icon: "📅" },
                    ].map(({ type, label, icon }) => (
                      <button
                        key={type}
                        onClick={() => handlePeriodTypeChange(type)}
                        style={{
                          padding: "12px 8px",
                          background: periodType === type ? "#10b98130" : "#1E1E1E",
                          border: periodType === type ? "2px solid #10b981" : "1px solid #333",
                          borderRadius: "8px",
                          cursor: "pointer",
                          color: periodType === type ? "#10b981" : "#9E9E9E",
                          fontWeight: "600",
                          fontSize: "12px",
                          textAlign: "center"
                        }}
                      >
                        <div style={{ fontSize: "18px", marginBottom: "4px" }}>{icon}</div>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Period Name */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "13px", color: "#9E9E9E", fontWeight: "600", marginBottom: "8px" }}>
                    Period Name
                  </label>
                  <input
                    type="text"
                    value={periodName}
                    onChange={(e) => setPeriodName(e.target.value)}
                    placeholder="e.g., January 2025, Week of Jan 6-12"
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

                {/* Date Range (for custom or to override defaults) */}
                {periodType !== PERIOD_TYPES.LIFETIME && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "13px", color: "#9E9E9E", fontWeight: "600", marginBottom: "8px" }}>
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={periodStartDate}
                        onChange={(e) => setPeriodStartDate(e.target.value)}
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
                    <div>
                      <label style={{ display: "block", fontSize: "13px", color: "#9E9E9E", fontWeight: "600", marginBottom: "8px" }}>
                        End Date
                      </label>
                      <input
                        type="date"
                        value={periodEndDate}
                        onChange={(e) => setPeriodEndDate(e.target.value)}
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
                  </div>
                )}

                {/* CSV Upload */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "13px", color: "#9E9E9E", fontWeight: "600", marginBottom: "8px" }}>
                    Upload CSV Data for This Period
                  </label>
                  <label
                    style={{
                      display: "block",
                      width: "100%",
                      background: "#1E1E1E",
                      border: "2px dashed #10b981",
                      borderRadius: "8px",
                      padding: "24px",
                      cursor: "pointer",
                      textAlign: "center"
                    }}
                  >
                    <Upload size={28} style={{ color: "#10b981", margin: "0 auto 8px" }} />
                    <div style={{ color: "#E0E0E0", fontWeight: "600", marginBottom: "4px" }}>
                      {uploadedFile ? uploadedFile.name : "Click to upload CSV file"}
                    </div>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      Export from YouTube Studio with "{periodType === PERIOD_TYPES.LIFETIME ? 'Lifetime' : periodName}" date range selected
                    </div>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>

                {/* Channel Preview (same as before) */}
                {showChannelPreview && uploadedFile && detectedChannels.length > 0 && (
                  <div style={{
                    background: "#1a1a2e",
                    border: "1px solid #333",
                    borderRadius: "8px",
                    padding: "12px",
                    marginBottom: "16px",
                    fontSize: "13px",
                    color: "#9E9E9E"
                  }}>
                    Detected {detectedChannels.length} channel(s): {detectedChannels.map(c => c.original).join(", ")}
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
                    {saveError}
                  </div>
                )}

                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    onClick={handleAddPeriod}
                    disabled={isSaving || !uploadedFile}
                    style={{
                      flex: 1,
                      background: isSaving ? "#065f46" : (!uploadedFile ? "#333" : "#10b981"),
                      border: "none",
                      borderRadius: "8px",
                      padding: "12px",
                      fontWeight: "600",
                      cursor: isSaving || !uploadedFile ? "not-allowed" : "pointer",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px"
                    }}
                  >
                    {isSaving && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
                    {isSaving ? "Saving Period..." : "Save Report Period"}
                  </button>
                  <button
                    onClick={resetModalState}
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

            {(modalMode === "add" || (modalMode === "update" && editingClient)) && (
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

                {/* Background Image URL */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "13px", color: "#9E9E9E", fontWeight: "600", marginBottom: "8px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Image size={14} style={{ color: "#8b5cf6" }} />
                      Background Image URL (Optional)
                    </span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      value={backgroundImageUrl}
                      onChange={(e) => setBackgroundImageUrl(e.target.value)}
                      placeholder="https://example.com/hero-image.jpg"
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
                    <Image size={16} style={{
                      position: "absolute",
                      left: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#666"
                    }} />
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "6px" }}>
                    Add a hero image URL to personalize the dashboard header for this client
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
                      setBackgroundImageUrl("");
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
                  {clients.map((client) => {
                    const hasPeriods = client.reportPeriods && client.reportPeriods.length > 0;
                    const isExpanded = expandedClientPeriods[client.id];

                    return (
                      <div
                        key={client.id}
                        style={{
                          background: activeClient?.id === client.id ? "#2962FF15" : "#252525",
                          border: activeClient?.id === client.id ? "1px solid #2962FF" : "1px solid #333",
                          borderRadius: "12px",
                          overflow: "hidden"
                        }}
                      >
                        {/* Main client row */}
                        <div style={{
                          padding: "20px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "16px", fontWeight: "700", color: "#fff", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              {client.name}
                              {activeClient?.id === client.id && (
                                <span style={{
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
                              {client.activePeriod && (
                                <span style={{
                                  fontSize: "11px",
                                  background: "#10b98130",
                                  color: "#10b981",
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  fontWeight: "600",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px"
                                }}>
                                  <Clock size={10} />
                                  {client.activePeriod.name}
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
                              {hasPeriods && (
                                <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#10b981" }}>
                                  <CalendarDays size={12} />
                                  {client.reportPeriods.length} period{client.reportPeriods.length !== 1 ? 's' : ''}
                                </div>
                              )}
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
                            {/* Add Period Button */}
                            <button
                              onClick={() => openAddPeriodModal(client)}
                              style={{
                                background: "#10b98120",
                                border: "1px solid #10b981",
                                borderRadius: "8px",
                                padding: "8px 12px",
                                fontWeight: "600",
                                cursor: "pointer",
                                color: "#10b981",
                                fontSize: "12px",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                            >
                              <CalendarDays size={14} />
                              Add Period
                            </button>
                            {/* Expand/Collapse periods */}
                            {hasPeriods && (
                              <button
                                onClick={() => toggleClientPeriods(client.id)}
                                style={{
                                  background: "transparent",
                                  border: "1px solid #333",
                                  borderRadius: "8px",
                                  padding: "8px 12px",
                                  cursor: "pointer",
                                  color: "#9E9E9E",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "12px"
                                }}
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                Periods
                              </button>
                            )}
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

                        {/* Expanded Periods Section */}
                        {isExpanded && hasPeriods && (
                          <div style={{
                            borderTop: "1px solid #333",
                            padding: "16px 20px",
                            background: "#1a1a1a"
                          }}>
                            <div style={{ fontSize: "13px", fontWeight: "600", color: "#9E9E9E", marginBottom: "12px" }}>
                              Report Periods
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                              {client.reportPeriods.map((period) => {
                                const isActive = client.activePeriodId === period.id;
                                return (
                                  <div
                                    key={period.id}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      padding: "12px 16px",
                                      background: isActive ? "#10b98115" : "#252525",
                                      border: isActive ? "1px solid #10b981" : "1px solid #333",
                                      borderRadius: "8px"
                                    }}
                                  >
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                        <span style={{ fontWeight: "600", color: "#fff", fontSize: "14px" }}>
                                          {period.name}
                                        </span>
                                        {period.is_baseline && (
                                          <span style={{
                                            fontSize: "10px",
                                            background: "#8b5cf630",
                                            color: "#8b5cf6",
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                            fontWeight: "600"
                                          }}>
                                            BASELINE
                                          </span>
                                        )}
                                        {isActive && (
                                          <span style={{
                                            fontSize: "10px",
                                            background: "#10b98130",
                                            color: "#10b981",
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                            fontWeight: "600"
                                          }}>
                                            VIEWING
                                          </span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: "12px", color: "#666", display: "flex", gap: "12px" }}>
                                        <span>{period.video_count} videos</span>
                                        <span>{(period.total_views || 0).toLocaleString()} views</span>
                                        {period.start_date && period.end_date && (
                                          <span>
                                            {new Date(period.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(period.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div style={{ display: "flex", gap: "8px" }}>
                                      {!isActive && (
                                        <button
                                          onClick={() => handleSwitchPeriod(client, period)}
                                          style={{
                                            background: "#333",
                                            border: "none",
                                            borderRadius: "6px",
                                            padding: "6px 12px",
                                            cursor: "pointer",
                                            color: "#E0E0E0",
                                            fontSize: "12px",
                                            fontWeight: "600"
                                          }}
                                        >
                                          View
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleDeletePeriod(client, period.id)}
                                        style={{
                                          background: "transparent",
                                          border: "1px solid #ef444450",
                                          borderRadius: "6px",
                                          padding: "6px 8px",
                                          cursor: "pointer",
                                          color: "#ef4444"
                                        }}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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