/**
 * Weekly Intelligence Brief Generator
 * Vercel serverless function — runs via cron (Monday 8 AM UTC) or manual POST.
 *
 * POST /api/generate-brief
 *   Body: { clientId: string }  (generate for one client)
 *   No body: generates for all clients (cron mode)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Verify cron secret or auth
  const cronSecret = req.headers['authorization']?.replace('Bearer ', '');
  const isCron = cronSecret === process.env.CRON_SECRET;
  const isManual = req.method === 'POST';

  if (!isCron && !isManual) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let clientIds = [];

    if (isManual && req.body?.clientId) {
      clientIds = [req.body.clientId];
    } else {
      // Cron mode: get all active clients
      const { data: clients } = await supabase
        .from('channels')
        .select('id')
        .eq('is_client', true);

      clientIds = (clients || []).map(c => c.id);
    }

    if (clientIds.length === 0) {
      return res.status(200).json({ message: 'No clients to generate briefs for', count: 0 });
    }

    const results = [];

    for (const clientId of clientIds) {
      try {
        // Fetch videos for this client
        const { data: videos } = await supabase
          .from('videos')
          .select('*')
          .eq('channel_id', clientId)
          .order('published_at', { ascending: false })
          .limit(500);

        if (!videos || videos.length < 5) {
          results.push({ clientId, status: 'skipped', reason: 'Not enough videos' });
          continue;
        }

        // Normalize rows for diagnostics
        const rows = videos.map(v => ({
          id: v.id,
          title: v.title,
          views: v.view_count || 0,
          impressions: v.impressions || 0,
          ctr: v.ctr || 0,
          retention: v.avg_view_percentage ? v.avg_view_percentage / 100 : 0,
          avgViewPct: v.avg_view_percentage ? v.avg_view_percentage / 100 : 0,
          subscribers: v.subscribers_gained || 0,
          watchHours: v.watch_time_minutes ? v.watch_time_minutes / 60 : 0,
          publishDate: v.published_at,
          type: v.video_type === 'short' ? 'short' : 'long',
          duration: v.duration_seconds || 0,
          durationSeconds: v.duration_seconds || 0,
          channel: v.channel_title,
        }));

        // Run diagnostics (pure function, no React needed)
        const { computeDiagnostics } = await import('../src/hooks/useDiagnostics.js');
        const diagnostics = computeDiagnostics(rows);

        // Build brief sections
        const totalViews = rows.reduce((s, r) => s + r.views, 0);
        const totalSubs = rows.reduce((s, r) => s + r.subscribers, 0);
        const avgCTR = rows.length > 0 ? rows.reduce((s, r) => s + r.ctr, 0) / rows.length : 0;
        const avgRet = rows.length > 0 ? rows.reduce((s, r) => s + r.retention, 0) / rows.length : 0;

        const primaryConstraint = diagnostics ? {
          constraint: diagnostics.primaryConstraint,
          severity: diagnostics.constraintSeverity,
          evidence: diagnostics.constraintEvidence,
        } : null;

        const topPatterns = (diagnostics?.patterns || []).slice(0, 5).map(p => ({
          type: p.type,
          finding: p.finding,
          recommendation: p.recommendation,
          opportunity: p.opportunity,
          effort: p.effort,
        }));

        // Generate executive narrative via Claude proxy
        let executiveSummary = `Brief generated on ${new Date().toLocaleDateString()}. ${topPatterns.length} patterns detected.`;
        let generationCost = 0;

        try {
          const claudeRes = await fetch(`${process.env.FRONTEND_URL || `https://${process.env.VERCEL_URL}`}/api/claude-proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `Write a 3-4 paragraph executive summary for a weekly YouTube channel intelligence brief.

Metrics: ${rows.length} videos, ${totalViews.toLocaleString()} views, ${(avgCTR * 100).toFixed(1)}% CTR, ${(avgRet * 100).toFixed(1)}% retention.
Primary Constraint: ${primaryConstraint?.constraint || 'None'} (${primaryConstraint?.severity || 'N/A'})
Top Findings: ${topPatterns.map(p => p.finding).join('; ')}

Be concise, direct, and actionable. Lead with the most important insight.`,
              systemPrompt: 'You are a YouTube growth strategist writing a weekly brief. Be direct, no fluff.',
              taskId: 'weekly_brief',
              maxTokens: 1024,
            }),
          });

          if (claudeRes.ok) {
            const claudeData = await claudeRes.json();
            executiveSummary = claudeData.text || executiveSummary;
            generationCost = claudeData.cost || 0;
          }
        } catch (e) {
          console.warn(`[generate-brief] Claude call failed for ${clientId}:`, e.message);
        }

        // Save brief
        const { error } = await supabase
          .from('intelligence_briefs')
          .upsert({
            client_id: clientId,
            brief_date: new Date().toISOString().split('T')[0],
            brief_type: 'weekly',
            status: 'generated',
            executive_summary: executiveSummary,
            primary_constraint: primaryConstraint,
            top_patterns: topPatterns,
            recommended_actions: topPatterns.slice(0, 5).map(p => ({
              title: p.finding,
              action: p.recommendation?.split('\n')[0] || '',
              source: 'diagnostic',
              impact: p.opportunity > 50000 ? 'high' : 'medium',
              effort: p.effort || 'Medium',
            })),
            metrics_snapshot: { totalVideos: rows.length, totalViews, totalSubs, avgCTR, avgRetention: avgRet },
            generation_cost: generationCost,
          }, { onConflict: 'client_id,brief_date,brief_type' });

        results.push({
          clientId,
          status: error ? 'error' : 'generated',
          error: error?.message,
        });
      } catch (err) {
        results.push({ clientId, status: 'error', error: err.message });
      }
    }

    return res.status(200).json({
      message: `Processed ${results.length} client(s)`,
      results,
    });
  } catch (err) {
    console.error('[generate-brief] Fatal error:', err);
    return res.status(500).json({ error: err.message });
  }
}
