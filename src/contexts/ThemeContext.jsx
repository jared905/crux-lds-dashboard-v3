import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  extractDominantColor,
  generateAccentPalette,
  getDefaultPalette,
  getCachedAccent,
  setCachedAccent,
  hexToHsl,
} from '../lib/colorExtractor.js';

const ThemeContext = createContext({
  palette: getDefaultPalette(),
  isLoading: false,
});

/**
 * Apply accent palette as CSS custom properties on :root
 */
function applyPaletteToDOM(palette) {
  const root = document.documentElement.style;
  root.setProperty('--accent', palette.accent);
  root.setProperty('--accent-dim', palette.accentDim);
  root.setProperty('--accent-glow', palette.accentGlow);
  root.setProperty('--accent-text', palette.accentText);
  root.setProperty('--accent-border', palette.accentBorder);
}

export function ThemeProvider({ activeClient, brandContext, children }) {
  const [palette, setPalette] = useState(() => {
    // Try to restore cached accent for the initial client
    if (activeClient?.id) {
      const cached = getCachedAccent(activeClient.id);
      if (cached) return generateAccentPalette(cached);
    }
    return getDefaultPalette();
  });
  const [isLoading, setIsLoading] = useState(false);

  const resolveAccent = useCallback(async (client) => {
    if (!client) {
      const def = getDefaultPalette();
      setPalette(def);
      applyPaletteToDOM(def);
      return;
    }

    // 1. Check cache first (instant)
    const cached = getCachedAccent(client.id);
    if (cached) {
      const p = generateAccentPalette(cached);
      setPalette(p);
      applyPaletteToDOM(p);
      return;
    }

    setIsLoading(true);

    // 2. Try extracting from banner image
    const imageUrl = client.backgroundImageUrl || client.background_image_url;
    let hsl = await extractDominantColor(imageUrl);

    // 3. Fallback: brand_context color palette
    if (!hsl && brandContext?.visual_identity?.color_palette?.primary?.[0]) {
      hsl = hexToHsl(brandContext.visual_identity.color_palette.primary[0]);
    }

    // 4. Generate palette (falls back to default if hsl is null)
    const p = generateAccentPalette(hsl);
    if (hsl && client.id) setCachedAccent(client.id, hsl);

    setPalette(p);
    applyPaletteToDOM(p);
    setIsLoading(false);
  }, [brandContext]);

  // Re-extract when client changes
  useEffect(() => {
    resolveAccent(activeClient);
  }, [activeClient?.id, activeClient?.backgroundImageUrl, resolveAccent]);

  // Apply palette on mount
  useEffect(() => {
    applyPaletteToDOM(palette);
  }, []);

  return (
    <ThemeContext.Provider value={{ palette, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export default ThemeContext;
