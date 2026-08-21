import {createContext, useContext, useState, useEffect, useCallback} from 'react';
import { getDefaultPalette } from '../lib/colorExtractor.js';

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

export function ThemeProvider({ activeClient, _brandContext, children }) {
  const [palette, setPalette] = useState(() => {
    // One product-wide accent (Azure Kinetic) — no cached per-client
    // restore, which was flashing retired palettes on first paint.
    return getDefaultPalette();
  });
  const [isLoading] = useState(false);

  // Azure Kinetic (2026-08-20): ONE accent across the whole product.
  // Per-client accents were extracted from banner images that no longer
  // display, and their localStorage cache kept resurfacing the retired
  // 2962FF-era blues in the nav and footer. Extraction code lives on in
  // colorExtractor.js if per-client theming ever returns.
  const resolveAccent = useCallback(async () => {
    const def = getDefaultPalette();
    setPalette(def);
    applyPaletteToDOM(def);
  }, []);

  // One-time cleanup: the retired per-client accent extraction left
  // cached palettes in localStorage on every browser that ever loaded
  // the old theme system. Dead weight — purge on boot.
  useEffect(() => {
    try {
      const stale = Object.keys(localStorage).filter(k => k.startsWith('fullview_accent_'));
      stale.forEach(k => localStorage.removeItem(k));
    } catch { /* storage unavailable — nothing to clean */ }
  }, []);

  // Re-extract when client changes
  useEffect(() => {
    resolveAccent(activeClient);
  // Keyed on the fields the accent derives from; the client object churns per merge.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClient?.id, activeClient?.backgroundImageUrl, resolveAccent]);

  // Apply palette on mount
  useEffect(() => {
    applyPaletteToDOM(palette);
  // Mount-only initial paint; later palette changes are applied by resolveAccent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
