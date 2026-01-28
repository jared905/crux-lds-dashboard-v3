# Supabase Setup Guide

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose your organization
4. Enter project details:
   - **Name**: `full-view-analytics` (or your preference)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
5. Click "Create new project" and wait for setup (~2 minutes)

## 2. Run Database Migration

1. In Supabase dashboard, go to **SQL Editor**
2. Click "New query"
3. Copy the entire contents of `migrations/001_competitor_database.sql`
4. Paste into the SQL editor
5. Click "Run" (or Cmd/Ctrl + Enter)
6. You should see "Success. No rows returned" - this is correct

## 3. Get API Credentials

1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")

## 4. Configure Environment Variables

### Local Development

Create `.env.local` in your project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Vercel Deployment

1. Go to your Vercel project dashboard
2. **Settings** → **Environment Variables**
3. Add both variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Redeploy to apply changes

## 5. Install Supabase Client

```bash
npm install @supabase/supabase-js
```

## 6. Verify Connection

Start your dev server and check browser console:
- If configured correctly: No errors
- If missing config: Warning about Supabase not being configured

## 7. Migrate Existing Data (Optional)

If you have competitors in localStorage, you can migrate them:

```javascript
// In browser console or a one-time script
import { migrateFromLocalStorage } from './services/competitorDatabase';
const result = await migrateFromLocalStorage();
console.log('Migration result:', result);
```

---

## Database Schema Overview

### Tables

| Table | Purpose |
|-------|---------|
| `channels` | Competitor/channel profiles |
| `channel_snapshots` | Daily stats history |
| `videos` | Individual video records |
| `video_snapshots` | Video performance over time |
| `content_insights` | Computed analysis results |
| `sync_log` | Sync operation history |

### Key Views

| View | Purpose |
|------|---------|
| `top_competitor_videos` | Best performing videos (last 30 days) |
| `channel_comparison` | Side-by-side channel metrics |
| `title_pattern_performance` | Which title patterns drive views |

### Common Queries

```sql
-- Top 10 videos across all competitors (last 30 days)
SELECT * FROM top_competitor_videos LIMIT 10;

-- Channel performance comparison
SELECT * FROM channel_comparison ORDER BY avg_views_30d DESC;

-- Best title patterns
SELECT * FROM title_pattern_performance WHERE video_count >= 10;

-- Subscriber growth over time
SELECT
  snapshot_date,
  SUM(subscriber_change) as total_growth
FROM channel_snapshots
WHERE snapshot_date > NOW() - INTERVAL '30 days'
GROUP BY snapshot_date
ORDER BY snapshot_date;
```

---

## Troubleshooting

### "Supabase not configured" warning
- Check that `.env.local` exists and has correct values
- Restart dev server after adding env vars

### Migration fails
- Check SQL syntax errors in Supabase SQL editor
- Ensure you're running in a fresh database (no existing tables)

### API errors
- Verify your anon key is correct
- Check Supabase dashboard for rate limiting

### Row Level Security (RLS)
- By default, all operations are allowed
- To restrict access, modify policies in `001_competitor_database.sql`
