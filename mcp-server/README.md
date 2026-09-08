# Full View Analytics — MCP Server

Connect your YouTube analytics data to Claude Desktop. Ask questions about client performance, competitors, audits, and quarterly reports — all from a conversation.

## Setup

### 1. Install dependencies

```bash
cd mcp-server
npm install
```

### 2. Set environment variables

The server needs your Supabase credentials (same ones your dashboard uses):

```bash
export FULLVIEW_SUPABASE_URL="https://your-project.supabase.co"
export FULLVIEW_SUPABASE_KEY="your-anon-key"
```

These are the same values as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your `.env.local`.

### 3. Register with Claude

**Claude Code (CLI):**
```bash
claude mcp add --transport stdio fullview-analytics -- \
  env FULLVIEW_SUPABASE_URL=https://your-project.supabase.co \
  FULLVIEW_SUPABASE_KEY=your-anon-key \
  node /absolute/path/to/mcp-server/index.js
```

**Claude Desktop App:**
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fullview-analytics": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/index.js"],
      "env": {
        "FULLVIEW_SUPABASE_URL": "https://your-project.supabase.co",
        "FULLVIEW_SUPABASE_KEY": "your-anon-key"
      }
    }
  }
}
```

### 4. Verify

In Claude Code: `claude mcp list` should show `fullview-analytics`.
In Claude Desktop: Restart the app — you should see tools in the toolbar.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_clients` | List all clients with subscriber counts and tier info |
| `get_channel_performance` | Metrics for a client over a time period (views, engagement, CTR, retention) |
| `get_top_videos` | Top-performing videos sorted by views, engagement, CTR, retention, or recency |
| `search_videos` | Search video titles across a client's channels |
| `get_quarterly_report` | Quarter-over-quarter performance comparison |
| `get_competitors` | Competitive landscape — how a client stacks up against category peers |
| `get_brand_context` | Brand intelligence profile (voice, audience, themes, goals) |
| `list_audits` | Every audit newest-completed first, with the `audit_id` each one needs. Includes prospect audits, which `list_clients` cannot reach |
| `get_audit_summary` | One audit — executive summary, benchmarks, and recommendations. Takes `audit_id` **or** `client_id` |

### Reaching prospect audits

`get_audit_summary` originally took only a `client_id`, which is a **channels**
UUID. The audit query itself never cared whether that channel was a client —
but the only way to discover a channel UUID through this server was
`list_clients`, which filters `is_client = true`. Audits of prospects
(doTERRA, Cotopaxi, Utah Jazz and the rest) target channels that are not
clients, so their audits were unreachable even though the rows existed.

`list_audits` closes that: it lists audits directly and hands back an
`audit_id`, which `get_audit_summary` now accepts. `client_id` still works
and still means "the most recent completed audit for that client channel".

## Example Prompts

Once connected, try asking Claude:

- "Who are my clients and how are they performing?"
- "Show me the top 10 videos for [client] in the last 28 days"
- "How did [client] do in Q1 2026 compared to Q4 2025?"
- "What does the competitive landscape look like for [client]?"
- "What did the last audit recommend for [client]?"
- "List every completed audit" — then "pull up the doTERRA one"
- "Search for videos about [topic] across [client]'s channels"

## Architecture

```
Claude Desktop / Claude Code
        │
        ├── stdio transport
        │
   MCP Server (this)
        │
        ├── Supabase queries
        │
   Full View Database
   (channels, videos, audits, brand context, competitors)
```

The server is read-only — it queries your existing Full View database but never writes to it.
