import React, { useState } from "react";
import Papa from "papaparse";
import { UploadCloud, Download, X, FileCheck, FileWarning, AlertTriangle } from "lucide-react";

export default function DataStandardizer() {
  const [processedRows, setProcessedRows] = useState([]);
  const [filesLog, setFilesLog] = useState([]); 
  const [isProcessing, setIsProcessing] = useState(false);

  // --- 1. SMART PARSERS ---
  const parseDuration = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const str = String(val).trim();
    if (str.includes(':')) {
      const parts = str.split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
    return Number(str.replace(/[^0-9.]/g, "")) || 0;
  };

  // YouTube exports timestamps in Pacific Time (PST/PDT)
  // We need to interpret them as Pacific and convert to proper UTC for storage
  const parseDate = (val) => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";

    // The date was parsed as local time, but YouTube exports in Pacific Time
    // Get the "naive" components and reinterpret as Pacific
    const naiveYear = d.getFullYear();
    const naiveMonth = d.getMonth();
    const naiveDay = d.getDate();
    const naiveHour = d.getHours();
    const naiveMinute = d.getMinutes();
    const naiveSecond = d.getSeconds();

    // Find Pacific offset for this date/time
    const pacificDateStr = `${naiveYear}-${String(naiveMonth + 1).padStart(2, '0')}-${String(naiveDay).padStart(2, '0')}T${String(naiveHour).padStart(2, '0')}:${String(naiveMinute).padStart(2, '0')}:00`;
    const pacificFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit', hour12: false
    });
    const testDate = new Date(pacificDateStr + 'Z');
    const pacificParts = pacificFormatter.formatToParts(testDate);
    const pacificHour = parseInt(pacificParts.find(p => p.type === 'hour')?.value || '0', 10);
    const utcHour = testDate.getUTCHours();
    let offsetHours = utcHour - pacificHour;
    if (offsetHours < 0) offsetHours += 24;
    if (offsetHours > 12) offsetHours -= 24;

    // Create correct UTC: naive time (which is Pacific) + offset = UTC
    const correctUtc = new Date(Date.UTC(naiveYear, naiveMonth, naiveDay, naiveHour + offsetHours, naiveMinute, naiveSecond));
    return correctUtc.toISOString();
  };

  const cleanHeader = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

  // --- 2. FILE PROCESSOR ---
  const handleFiles = (incomingFiles) => {
    setIsProcessing(true);
    let allRows = [...processedRows];
    let newLog = [];

    Array.from(incomingFiles).forEach(file => {
      const lowerName = file.name.toLowerCase();

      // SKIP JUNK
      if (lowerName.includes("chart data") || lowerName.includes("totals")) {
        newLog.push({ name: file.name, status: "skipped", reason: "Ignored (Chart/Total file)" });
        return;
      }

      // GUESS CHANNEL
      let channelName = file.name.split('.')[0]
        .replace(/_?Data/i, "")
        .replace(/_?Table data/i, "")
        .replace(/_/g, " ")
        .trim();

      if (!channelName || channelName.toLowerCase() === "table" || channelName.toLowerCase() === "table data") {
        newLog.push({ name: file.name, status: "error", reason: "⚠️ Generic Filename. Rename to 'LeaderName.csv' first." });
        return;
      }

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rawData = results.data;
          
          const cleanData = rawData.map(row => {
            const lookup = {};
            Object.keys(row).forEach(k => {
              lookup[cleanHeader(k)] = row[k];
            });

            // 1. Core Metrics
            const rawDur = lookup['duration'] || lookup['videoduration'] || lookup['length'] || lookup['durationsec'];
            const duration = parseDuration(rawDur);

            const rawDate = lookup['time'] || lookup['date'] || lookup['publishdate'] || lookup['videopublishtime'] || lookup['contentcreateddate'];
            const publishDate = parseDate(rawDate);

            // 2. Performance Metrics
            const views = Number(lookup['views'] || lookup['watchtimeminutes'] || 0);
            const watchHours = Number(lookup['watchhours'] || lookup['watchtimehours'] || 0);
            const subs = Number(lookup['subscribers'] || lookup['subscribersgained'] || 0);
            
            // ✅ NEW: Retention & CTR
            const impressions = Number(lookup['impressions'] || 0);
            const ctr = Number(lookup['impressionsclickthroughrate'] || 0);
            const retention = Number(lookup['averagepercentageviewed'] || 0);

            // 3. Type Logic
            let type = "Long";
            if (duration > 0 && duration <= 180) type = "Short";

            const title = lookup['videotitle'] || lookup['title'] || "Unknown Video";
            const videoId = lookup['videoid'] || lookup['content'] || "";

            return {
              channel: channelName,
              title, // Fixed: using 'title' instead of 'videoTitle'
              publishDate,
              duration,
              views,
              watchHours,
              subscribers: subs,
              impressions,
              ctr,
              retention,
              type,
              videoId
            };
          });

          const validRows = cleanData.filter(r => r.publishDate && r.views >= 0);
          
          if (validRows.length > 0) {
            allRows = [...allRows, ...validRows];
            setFilesLog(prev => [...prev, { name: file.name, status: "success", count: validRows.length, channel: channelName }]);
            setProcessedRows(allRows);
          } else {
            setFilesLog(prev => [...prev, { name: file.name, status: "warning", reason: "No valid video rows found" }]);
          }
        }
      });
      
      if (newLog.length > 0) setFilesLog(prev => [...prev, ...newLog]);
    });
    
    setIsProcessing(false);
  };

  const downloadCSV = () => {
    if (processedRows.length === 0) return;
    const csv = Papa.unparse(processedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `standardized_data_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // UI RENDER
  const s = {
    container: { padding: "40px", maxWidth: "800px", margin: "0 auto", color: "#f8fafc", fontFamily: "sans-serif" },
    dropZone: {
      border: "2px dashed #475569", borderRadius: "16px", padding: "40px",
      textAlign: "center", backgroundColor: "#1e293b", cursor: "pointer", transition: "all 0.2s"
    },
    btn: {
      backgroundColor: "#4f46e5", color: "white", padding: "12px 24px",
      borderRadius: "8px", border: "none", fontWeight: "bold",
      display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginTop: "24px"
    },
    logItem: (status) => ({
      display: "flex", alignItems: "center", gap: "10px", fontSize: "13px",
      padding: "10px", borderBottom: "1px solid #334155",
      backgroundColor: status === "error" ? "rgba(239, 68, 68, 0.1)" : "transparent",
      color: status === "success" ? "#4ade80" : status === "skipped" ? "#64748b" : "#fca5a5"
    })
  };

  return (
    <div style={s.container}>
      <h1 style={{fontSize: "24px", marginBottom: "8px"}}>Data Standardizer Tool (v2)</h1>
      <p style={{color: "#94a3b8", marginBottom: "32px"}}>
        Drop your raw YouTube CSVs here. <br/>
        <span style={{color: "#f59e0b", fontWeight: "600"}}>Important:</span> Rename files to Leader Name first (e.g. <code>Bednar.csv</code>).
      </p>

      <div style={s.dropZone}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "#818cf8"; }}
        onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "#475569"; }}
        onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "#475569"; handleFiles(e.dataTransfer.files); }}
      >
        <UploadCloud size={48} color="#94a3b8" style={{margin: "0 auto 16px"}} />
        <div style={{fontWeight: 600, fontSize: "16px"}}>Drag & Drop CSVs here</div>
        <div style={{color: "#64748b", fontSize: "14px", marginTop: "8px"}}>Ignoring Chart/Total files automatically.</div>
      </div>

      {filesLog.length > 0 && (
        <div style={{marginTop: "24px", backgroundColor: "#0f172a", borderRadius: "8px", border: "1px solid #334155", overflow: "hidden"}}>
          <div style={{fontSize: "12px", fontWeight: "bold", color: "#94a3b8", padding: "12px", backgroundColor: "#1e293b"}}>PROCESSING LOG</div>
          {filesLog.map((f, i) => (
            <div key={i} style={s.logItem(f.status)}>
              {f.status === "success" ? <FileCheck size={16} /> : f.status === "skipped" ? <FileWarning size={16} /> : <AlertTriangle size={16} />}
              <div style={{flex: 1, fontWeight: f.status === "success" ? "600" : "400"}}>
                {f.name} {f.channel && <span style={{marginLeft: "8px", fontSize: "11px", backgroundColor: "#334155", padding: "2px 6px", borderRadius: "4px", color: "#f8fafc"}}>{f.channel}</span>}
              </div>
              <span>{f.status === "success" ? `${f.count} rows` : f.reason}</span>
            </div>
          ))}
        </div>
      )}

      {processedRows.length > 0 && (
        <div style={{marginTop: "32px"}}>
          <button style={s.btn} onClick={downloadCSV}>
            <Download size={20} /> Download Standardized CSV
          </button>
        </div>
      )}
    </div>
  );
}