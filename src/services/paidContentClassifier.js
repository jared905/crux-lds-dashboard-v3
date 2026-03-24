/**
 * Paid Content Classifier
 * Full View Analytics - Crux Media
 *
 * Classifies videos as paid or organic based on client-configured signals.
 * No hardcoded patterns — all detection rules come from the client profile.
 *
 * Two classification mechanisms:
 * 1. Keyword matching: checks video title + description against paid_content_signals
 * 2. Manual override: checks video ID against paid_content_override list
 *
 * Usage:
 *   import { classifyVideos, classifyVideo, loadClientSignals } from './paidContentClassifier';
 *   const signals = await loadClientSignals(channelId);
 *   const classified = classifyVideos(videos, signals);
 */

import { supabase } from './supabaseClient';

/**
 * Load paid content signals for a channel from brand_context
 * @param {string} channelId - Supabase channel ID
 * @returns {{ keywords: string[], overrideIds: string[] }}
 */
export async function loadClientSignals(channelId) {
  if (!supabase || !channelId) {
    return { keywords: [], overrideIds: [] };
  }

  try {
    const { data } = await supabase
      .from('brand_context')
      .select('paid_content_signals, paid_content_override')
      .eq('channel_id', channelId)
      .eq('is_current', true)
      .single();

    return {
      keywords: Array.isArray(data?.paid_content_signals) ? data.paid_content_signals : [],
      overrideIds: Array.isArray(data?.paid_content_override) ? data.paid_content_override : [],
    };
  } catch {
    return { keywords: [], overrideIds: [] };
  }
}

/**
 * Classify a single video as paid or organic
 * @param {object} video - Video object with title, description, youtube_video_id
 * @param {{ keywords: string[], overrideIds: string[] }} signals - Client signals
 * @returns {{ is_paid: boolean, paid_classification_source: string, matched_signal: string|null }}
 */
export function classifyVideo(video, signals) {
  const { keywords, overrideIds } = signals;

  // No signals configured — everything is unclassified (treated as organic)
  if (keywords.length === 0 && overrideIds.length === 0) {
    return { is_paid: false, paid_classification_source: 'unclassified', matched_signal: null };
  }

  // Check manual override first (highest priority)
  const videoId = video.youtube_video_id || video.id;
  if (overrideIds.includes(videoId)) {
    return { is_paid: true, paid_classification_source: 'manual_override', matched_signal: videoId };
  }

  // Check keyword patterns against title and description
  const searchText = [
    video.title || '',
    video.description || '',
  ].join(' ').toLowerCase();

  for (const keyword of keywords) {
    if (searchText.includes(keyword.toLowerCase())) {
      return { is_paid: true, paid_classification_source: 'keyword_match', matched_signal: keyword };
    }
  }

  // No match — organic
  return { is_paid: false, paid_classification_source: 'classified_organic', matched_signal: null };
}

/**
 * Classify an array of videos
 * @param {object[]} videos - Array of video objects
 * @param {{ keywords: string[], overrideIds: string[] }} signals - Client signals
 * @returns {object[]} Videos with is_paid, paid_classification_source, matched_signal added
 */
export function classifyVideos(videos, signals) {
  return videos.map(video => {
    const classification = classifyVideo(video, signals);
    return { ...video, ...classification };
  });
}

/**
 * Persist paid classifications to the videos table in Supabase
 * @param {object[]} classifiedVideos - Videos with is_paid and paid_classification_source
 * @returns {{ updated: number, errors: number }}
 */
export async function persistClassifications(classifiedVideos) {
  if (!supabase || classifiedVideos.length === 0) {
    return { updated: 0, errors: 0 };
  }

  let updated = 0;
  let errors = 0;

  // Batch update in chunks of 50
  for (let i = 0; i < classifiedVideos.length; i += 50) {
    const batch = classifiedVideos.slice(i, i + 50);
    const videoIds = batch
      .map(v => v.youtube_video_id || v.id)
      .filter(Boolean);

    if (videoIds.length === 0) continue;

    // Get Supabase IDs for these youtube_video_ids
    const { data: existingVideos } = await supabase
      .from('videos')
      .select('id, youtube_video_id')
      .in('youtube_video_id', videoIds);

    if (!existingVideos) continue;

    for (const dbVideo of existingVideos) {
      const classified = batch.find(v =>
        (v.youtube_video_id || v.id) === dbVideo.youtube_video_id
      );
      if (!classified) continue;

      const { error } = await supabase
        .from('videos')
        .update({
          is_paid: classified.is_paid,
          paid_classification_source: classified.paid_classification_source,
        })
        .eq('id', dbVideo.id);

      if (error) {
        errors++;
      } else {
        updated++;
      }
    }
  }

  return { updated, errors };
}

/**
 * Split videos into organic and paid arrays
 * @param {object[]} videos - Videos with is_paid field
 * @returns {{ organic: object[], paid: object[] }}
 */
export function splitByPaidStatus(videos) {
  const organic = [];
  const paid = [];

  videos.forEach(v => {
    if (v.is_paid) {
      paid.push(v);
    } else {
      organic.push(v);
    }
  });

  return { organic, paid };
}

export default {
  loadClientSignals,
  classifyVideo,
  classifyVideos,
  persistClassifications,
  splitByPaidStatus,
};
