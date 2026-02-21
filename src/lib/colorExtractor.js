/**
 * colorExtractor.js — Canvas-based dominant color extraction
 * Extracts the dominant brand color from a client's banner image
 * and generates an accent palette for dynamic theming.
 */

const CACHE_PREFIX = 'fullview_accent_';

/**
 * Convert RGB to HSL
 */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Check if a color is too close to gray/black/white to be a useful accent
 */
function isUsableColor(r, g, b) {
  const { s, l } = rgbToHsl(r, g, b);
  // Skip near-black, near-white, and very desaturated colors
  return s > 15 && l > 15 && l < 85;
}

/**
 * Extract the dominant saturated color from an image URL using canvas sampling.
 * Returns HSL values or null if extraction fails.
 */
export async function extractDominantColor(imageUrl) {
  if (!imageUrl) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timeout = setTimeout(() => resolve(null), 5000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const size = 50;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        // Bucket pixels by hue (36 buckets of 10 degrees each)
        const buckets = new Array(36).fill(null).map(() => ({ count: 0, rSum: 0, gSum: 0, bSum: 0 }));

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (!isUsableColor(r, g, b)) continue;

          const { h } = rgbToHsl(r, g, b);
          const bucket = Math.floor(h / 10) % 36;
          buckets[bucket].count++;
          buckets[bucket].rSum += r;
          buckets[bucket].gSum += g;
          buckets[bucket].bSum += b;
        }

        // Find the most populated bucket
        let best = null;
        let bestCount = 0;
        for (const bucket of buckets) {
          if (bucket.count > bestCount) {
            bestCount = bucket.count;
            best = bucket;
          }
        }

        if (!best || best.count < 10) {
          resolve(null);
          return;
        }

        const avgR = Math.round(best.rSum / best.count);
        const avgG = Math.round(best.gSum / best.count);
        const avgB = Math.round(best.bSum / best.count);
        const hsl = rgbToHsl(avgR, avgG, avgB);

        // Boost saturation slightly for a more vibrant accent
        hsl.s = Math.min(hsl.s + 10, 90);
        // Keep lightness in a usable range for dark theme
        hsl.l = Math.max(Math.min(hsl.l, 60), 40);

        resolve(hsl);
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };

    img.src = imageUrl;
  });
}

/**
 * Parse a hex color string to HSL
 */
export function hexToHsl(hex) {
  if (!hex) return null;
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return rgbToHsl(r, g, b);
}

/**
 * Generate a full accent palette from HSL values
 */
export function generateAccentPalette(hsl) {
  if (!hsl) return getDefaultPalette();

  const { h, s, l } = hsl;
  return {
    accent: `hsl(${h}, ${s}%, ${l}%)`,
    accentDim: `hsla(${h}, ${s}%, ${l}%, 0.15)`,
    accentGlow: `hsla(${h}, ${s}%, ${l}%, 0.3)`,
    accentText: `hsl(${h}, ${Math.min(s + 10, 100)}%, ${Math.min(l + 20, 85)}%)`,
    accentBorder: `hsla(${h}, ${s}%, ${l}%, 0.4)`,
    hsl: { h, s, l },
  };
}

/**
 * Default palette (electric blue) used when no client color is available
 */
export function getDefaultPalette() {
  return {
    accent: '#2962FF',
    accentDim: 'rgba(41, 98, 255, 0.15)',
    accentGlow: 'rgba(41, 98, 255, 0.3)',
    accentText: '#60a5fa',
    accentBorder: 'rgba(41, 98, 255, 0.4)',
    hsl: { h: 224, s: 100, l: 58 },
  };
}

/**
 * Get cached accent color for a client, or null
 */
export function getCachedAccent(clientId) {
  if (!clientId) return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + clientId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Cache an extracted accent color for a client
 */
export function setCachedAccent(clientId, hsl) {
  if (!clientId || !hsl) return;
  try {
    localStorage.setItem(CACHE_PREFIX + clientId, JSON.stringify(hsl));
  } catch {
    // localStorage full or unavailable — no-op
  }
}
