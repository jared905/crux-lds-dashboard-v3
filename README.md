# CRUX LDS Leadership Dashboard v2

## Run locally
```bash
npm install
npm run dev
```

Then open: http://localhost:5173

## Data
This project loads `public/data/leadership.csv` by default.

You can also use **Upload CSV** in the UI to test a different export.

## Why this fixes your mismatch
Your file is a YouTube Studio **Table data** export that stacks each channel as a block (channel name row, header row, totals row, then per-video rows).
This app detects that format and parses every video row for every channel. No placeholder totals.


## ZIP exports (recommended)
If you have multiple channels, the cleanest workflow is:

1) In YouTube Studio → Analytics → **Advanced mode**
2) Set the date range (e.g., 90 days)
3) Use **Export current view** for:
   - **Table data** (per-video metrics) — this is the main dataset
   - **Totals** (optional) — this powers the daily trend chart (often Average view duration)

Put each channel’s export files into a folder, then zip the top-level folder.

Example zip structure:
```
Yt Exports/
  David A. Bednar/
    Table data.csv
    Totals.csv
  Dieter F. Uchtdorf/
    Table data.csv
    Totals.csv
```

In the dashboard UI, click **Upload ZIP/CSV** and choose your `.zip`.

Notes:
- If your Totals.csv uses time like `0:28`, the app will treat it as seconds and format it as `m:ss`.
- Trend charts are shown only when a single channel is selected (Totals.csv is channel-specific).
