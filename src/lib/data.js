console.log("data.js loaded", new Date().toISOString());

import JSZip from "jszip";
import Papa from "papaparse";
import { parseDateSafe, safeStr, toLowerKeyed, pickFirst } from "./utils.js";
import { extractYouTubeVideoId, getYouTubeThumbnailUrl, getYouTubeVideoUrl } from "./schema.js";

// --- ROBUST LOCAL UTILITIES ---
function safeNumLocal(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/,/g, "").replace(/%/g, "");
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function parseDurationToSeconds(v) {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).trim());
  if (Number.isFinite(n)) return n; 
  const s = String(v).trim();
  if (!s) return 0;
  const parts = s.split(":").map((p) => Number(p));
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function normalizePctTo01(raw) {
  const n = safeNumLocal(raw);
  return n > 1.2 ? n / 100 : n; 
}

function detectType(rawType, durationSeconds, youtubeUrl = null) {
  // 1. Check raw content type field first
  const t = safeStr(rawType).toLowerCase();
  if (t.includes("short")) return "short";
  if (t.includes("long")) return "long";

  // 2. Check URL pattern: /shorts/ is definitive; /watch?v= is NOT
  // (YouTube Studio exports Shorts with /watch?v= URLs)
  if (youtubeUrl) {
    const url = String(youtubeUrl).toLowerCase();
    if (url.includes("/shorts/")) return "short";
  }

  // 3. Duration-based detection (Shorts max is 180s)
  if (durationSeconds > 0 && durationSeconds <= 180) return "short";
  return "long";
}

function getVal(row, exactKey, fuzzyKeywords) {
  if (row[exactKey] !== undefined) return row[exactKey];
  const keys = Object.keys(row);
  const found = keys.find(k => fuzzyKeywords.every(word => k.toLowerCase().includes(word)));
  return found ? row[found] : null;
}

// ---------------------------------------------------------
// 1. STANDARD FORMAT PARSER
// ---------------------------------------------------------
function parseStandardFormat(text) {
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length && !parsed.data.length) return { rows: [] };

  const rows = parsed.data || [];
  const out = [];

  for (const r of rows) {
    const row = {};
    Object.keys(r).forEach(k => { row[k.trim().toLowerCase()] = r[k]; });
    
    const title = getVal(row, "video title", ["title"]);
    if (!title || title === "Total") continue;

    const publishDateRaw = getVal(row, "video publish time", ["publish"]) || getVal(row, "publish date", ["date"]);
    const publishDate = parseDateSafe(publishDateRaw);
    if (!publishDate) continue;

    const channel = getVal(row, "channel name", ["channel"]) || "Main Channel";
    
    const durationSeconds = parseDurationToSeconds(getVal(row, "duration"));
    const views = safeNumLocal(getVal(row, "views", ["views"]));
    const avgViewPct = normalizePctTo01(getVal(row, "average percentage viewed (%)", ["percentage", "viewed"]));
    
    let watchHours = safeNumLocal(getVal(row, "watch time (hours)", ["watch", "time"]));
    if (watchHours === 0 && views > 0 && durationSeconds > 0) {
      const avgViewDur = parseDurationToSeconds(getVal(row, "average view duration", ["average", "view", "duration"]));
      if (avgViewDur > 0) {
        watchHours = (views * avgViewDur) / 3600;
      } else if (avgViewPct > 0) {
        watchHours = (views * durationSeconds * avgViewPct) / 3600;
      }
    }

    const ctr = normalizePctTo01(getVal(row, "impressions click-through rate (%)", ["click", "rate"]));
    const impressions = safeNumLocal(getVal(row, "impressions", ["impressions"]));
    const subscribers = safeNumLocal(getVal(row, "subscribers", ["subscribers"]));

    // Extract YouTube video ID from various possible fields
    const rawVideoId = getVal(row, "content", ["video id", "video"]) ||
                       getVal(row, "youtube url", ["url", "link"]) ||
                       getVal(row, "youtube video id", ["youtube id", "yt id"]);
    const youtubeVideoId = extractYouTubeVideoId(rawVideoId);
    const thumbnailUrl = getYouTubeThumbnailUrl(youtubeVideoId);
    const youtubeUrl = getYouTubeVideoUrl(youtubeVideoId);

    // Detect type using content type, URL pattern, and duration
    const rawType = getVal(row, "content type") || getVal(row, "type", ["type"]);
    const type = detectType(rawType, durationSeconds, rawVideoId);

    out.push({
      title, channel, leader: channel, publishDate,
      durationSeconds, type, views, watchHours, avgViewPct, ctr, impressions, subscribers,
      youtubeVideoId, thumbnailUrl, youtubeUrl,
    });
  }
  return { rows: out, warnings: [] };
}

// ---------------------------------------------------------
// 2. STACKED FORMAT PARSER (FIXED: Supports Multiple Blocks)
// ---------------------------------------------------------
function parseStackedFormat(text) {
  const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
  const matrix = parsed.data || [];
  const out = [];

  // 1. Identify all "Start Rows" (rows where a new table block begins)
  // A start row typically has an empty first cell, and "Content" or "Video title" in the second cell
  const startIndices = [];
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    if (row && row.some(c => c && c.toString().includes("Video title"))) {
      startIndices.push(i);
    }
  }

  if (startIndices.length === 0) return { rows: [] };

  // 2. Process each block
  for (let s = 0; s < startIndices.length; s++) {
    const headerIdx = startIndices[s];
    const endIdx = s < startIndices.length - 1 ? startIndices[s + 1] : matrix.length;
    
    // Channel name is usually in the row BEFORE the header, column 1 (B)
    const channelName = safeStr(matrix[Math.max(0, headerIdx - 1)][1]) || "Unknown Channel";
    const headers = matrix[headerIdx].map(h => safeStr(h).trim());

    // Iterate rows inside this block
    for (let i = headerIdx + 1; i < endIdx; i++) {
      const row = matrix[i];
      if (!row || row.length < headers.length) continue;

      const obj = {};
      headers.forEach((h, idx) => { obj[h] = row[idx]; });

      const title = obj["Video title"];
      // Skip totals and empty lines
      if (!title || title === "Total" || title === "Video title") continue;

      const publishDate = parseDateSafe(obj["Video publish time"] ?? obj["Publish date"]);
      if (!publishDate) continue;

      const durationSeconds = parseDurationToSeconds(obj["Duration"]);
      const views = safeNumLocal(obj["Views"]);
      
      let watchHours = safeNumLocal(obj["Watch time (hours)"] || obj["Watch time"]);
      if (watchHours === 0 && views > 0) {
           const avgViewDur = parseDurationToSeconds(obj["Average view duration"]);
           if (avgViewDur > 0) watchHours = (views * avgViewDur) / 3600;
      }

      const subscribers = safeNumLocal(obj["Subscribers"]);
      const impressions = safeNumLocal(obj["Impressions"]);
      const avgViewPct = normalizePctTo01(obj["Average percentage viewed (%)"]);
      const ctr = normalizePctTo01(obj["Impressions click-through rate (%)"]);

      // Extract YouTube video ID from various possible fields
      const rawVideoId = obj["Content"] || obj["Video ID"] || obj["Video id"] ||
                         obj["YouTube URL"] || obj["URL"] || obj["Link"];
      const youtubeVideoId = extractYouTubeVideoId(rawVideoId);
      const thumbnailUrl = getYouTubeThumbnailUrl(youtubeVideoId);
      const youtubeUrl = getYouTubeVideoUrl(youtubeVideoId);

      // Detect type using URL pattern and duration
      const type = detectType(null, durationSeconds, rawVideoId);

      out.push({
        title, channel: channelName, leader: channelName, publishDate,
        durationSeconds, type, views, watchHours, avgViewPct, ctr, impressions, subscribers,
        youtubeVideoId, thumbnailUrl, youtubeUrl,
      });
    }
  }

  return { rows: out, warnings: [] };
}

// ---------------------------------------------------------
// MAIN PARSER
// ---------------------------------------------------------
function parseCsvText(text) {
  // Try Standard First
  try {
    const res = parseStandardFormat(text);
    if (res.rows.length > 0) return res;
  } catch (e) { console.warn("Standard parse failed", e); }

  // Try Stacked Second
  try {
    const res = parseStackedFormat(text);
    if (res.rows.length > 0) return res;
  } catch (e) { console.warn("Stacked parse failed", e); }

  return { rows: [], warnings: ["Could not parse file format."] };
}

// ---------------------------------------------------------
// LOADERS
// ---------------------------------------------------------
export async function loadCsvFromUrl(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  const text = await res.text();
  return parseCsvText(text);
}

export async function loadCsvFromFile(file) {
  const text = await file.text();
  return parseCsvText(text);
}

export async function loadChannelDataFromFolder(folderPath) {
  const base = folderPath.endsWith("/") ? folderPath : folderPath + "/";
  let rows = [];
  try {
    const res = await fetch(base + "Table data.csv", { cache: "no-store" });
    if (res.ok) {
      const text = await res.text();
      const parsed = parseCsvText(text);
      rows = parsed.rows;
    }
  } catch (e) { }
  return { rows, totalsByChannel: {} };
}

export async function loadYouTubeExportsZip(file) {
  const zip = await JSZip.loadAsync(file);
  const paths = Object.keys(zip.files).filter(p => !zip.files[p].dir && p.toLowerCase().endsWith(".csv") && !p.includes("__MACOSX"));
  
  let allRows = [];
  
  for (const p of paths) {
    const text = await zip.file(p).async("string");
    if (text.includes("Video title") && (text.includes("Video publish time") || text.includes("Publish date"))) {
      const parts = p.split("/");
      const channel = parts.length > 1 ? parts[parts.length - 2] : "Uploaded Channel";
      const { rows } = parseCsvText(text);
      if (rows.length) {
        // Only override channel if the parser returned generic "Main Channel"
        // If parser found specific channels (stacked), keep them.
        const finalRows = rows.map(r => ({ 
          ...r, 
          channel: (r.channel === "Main Channel" || r.channel === "Unknown Channel") ? channel : r.channel 
        }));
        allRows.push(...finalRows);
      }
    }
  }
  
  if (allRows.length === 0) throw new Error("No data found in ZIP.");
  return { rows: allRows, totalsByChannel: {}, warnings: [] };
}