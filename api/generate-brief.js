/**
 * Weekly Intelligence Brief Generator
 * Vercel serverless function — runs via cron (Monday 8 AM UTC) or manual POST.
 *
 * POST /api/generate-brief
 *   Body: { clientId: string }  (generate for one client)
 *   No body: generates for all clients (cron mode)
 */

import { createClient } from '@supabase/supabase-js';
import { requireCronOrAdmin } from './_lib/auth.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

export default async function handler(req, res) {
  // Vercel Cron, or a signed-in admin. Previously `isManual` was simply
  // `req.method === 'POST'`, so every POST authenticated itself.
  const caller = await requireCronOrAdmin(req, res);
  if (!caller) return;
  const isCron = caller.via === 'cron';
  const isManual = !isCron;

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
          // `avg_view_percentage` is stored as a 0–1 fraction, the same
          // convention as `ctr` on the line above. This used to divide by 100
          // a second time, turning 45% retention into 0.45% — which made
          // computeDiagnostics report a retention emergency in every brief.
          retention: v.avg_view_percentage || 0,
          avgViewPct: v.avg_view_percentage || 0,
          subscribers: v.subscribers_gained || 0,
          // Column is `watch_hours`; `watch_time_minutes` does not exist on
          // `videos`, so this silently evaluated to 0 for every video.
          watchHours: v.watch_hours || 0,
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

        // Generate executive narrative.
        //
        // This used to POST {prompt, systemPrompt, taskId, maxTokens} to
        // /api/claude-proxy, but that endpoint requires {apiKey, messages}
        // and 400s on anything else - so claudeRes.ok was never true and
        // every brief silently saved the placeholder below while still being
        // marked status:'generated'. Calling Anthropic directly with the
        // server key also keeps this off the public proxy entirely.
        const placeholder = `Brief generated on ${new Date().toLocaleDateString()}. ${topPatterns.length} patterns detected.`;
        let executiveSummary = placeholder;
        let generationCost = 0;
        let narrativeError = null;

        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
          narrativeError = 'ANTHROPIC_API_KEY is not configured';
        } else {
          try {
            const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: CLAUDE_MODEL,
                max_tokens: 1024,
                system: 'You are a YouTube growth strategist writing a weekly brief. Be direct, no fluff. Never use dashes or hyphens (-) as bullet points, list markers, or separators. Use numbered lists, letters, or plain sentences instead.',
                messages: [{
                  role: 'user',
                  content: `Write a 3-4 paragraph executive summary for a weekly YouTube channel intelligence brief.

Metrics: ${rows.length} videos, ${totalViews.toLocaleString()} views, ${(avgCTR * 100).toFixed(1)}% CTR, ${(avgRet * 100).toFixed(1)}% retention.
Primary Constraint: ${primaryConstraint?.constraint || 'None'} (${primaryConstraint?.severity || 'N/A'})
Top Findings: ${topPatterns.map(p => p.finding).join('; ')}

Be concise, direct, and actionable. Lead with the most important insight.`,
                }],
              }),
            });

            if (!claudeRes.ok) {
              const detail = await claudeRes.text().catch(() => '');
              narrativeError = `Claude API ${claudeRes.status}: ${detail.slice(0, 200)}`;
            } else {
              const claudeData = await claudeRes.json();
              const text = claudeData?.content?.[0]?.text?.trim();
              if (text) {
                executiveSummary = text;
                const usage = claudeData.usage || {};
                // Sonnet 4.5 list price: $3/M input, $15/M output.
                generationCost =
                  ((usage.input_tokens || 0) / 1e6) * 3 +
                  ((usage.output_tokens || 0) / 1e6) * 15;
              } else {
                narrativeError = 'Claude returned an empty response';
              }
            }
          } catch (e) {
            narrativeError = e.message;
          }
        }
        if (narrativeError) {
          console.error(`[generate-brief] narrative failed for ${clientId}: ${narrativeError}`);
        }

        // Save brief
        const { error } = await supabase
          .from('intelligence_briefs')
          .upsert({
            client_id: clientId,
            brief_date: new Date().toISOString().split('T')[0],
            brief_type: 'weekly',
            // A brief whose narrative fell back to the placeholder is not
            // 'generated'. Marking it so made a broken pipeline invisible.
            status: narrativeError ? 'incomplete' : 'generated',
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
          status: error ? 'error' : (narrativeError ? 'incomplete' : 'generated'),
          error: error?.message || narrativeError || undefined,
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
