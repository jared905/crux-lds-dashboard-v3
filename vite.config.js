import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory
  const env = loadEnv(mode, process.cwd(), '');

  // For Vercel builds, env vars come from process.env, not .env files
  // Fall back to process.env if loadEnv doesn't find them
  const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  return {
    plugins: [react()],
    server: { port: 5173 },
    // Ship-readiness (2026-08-20): the 49 console.log/info diagnostics
    // are useful in dev and noise in production — esbuild treats these
    // as pure and drops them from builds. warn/error survive so real
    // incidents still leave a trail.
    esbuild: {
      pure: mode === "production" ? ["console.log", "console.info", "console.debug"] : [],
    },
    build: {
      // Split the big third-party deps out of the entry chunk so they cache
      // independently and don't get re-downloaded on every app deploy.
      //
      // Note this alone does NOT shrink the initial payload — a statically
      // imported chunk is still fetched on load. The payload win comes from
      // the React.lazy boundaries in App.jsx; this is about cache granularity
      // and parallel fetching.
      rollupOptions: {
        output: {
          // Only chunk libraries that are genuinely on the critical path.
          //
          // recharts, jspdf and papaparse are deliberately NOT listed. Naming
          // a manual chunk promotes it into the entry's import graph, so Vite
          // emits a <link rel="modulepreload"> for it in index.html and the
          // browser eagerly downloads it — 811 kB of charting and PDF code
          // fetched by a login screen that never renders either. Leaving them
          // unnamed lets Rollup attach them to the lazy route chunks that
          // actually import them, which is the whole point of the splitting.
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            supabase: ['@supabase/supabase-js'],
            icons: ['lucide-react'],
          },
        },
      },
      // The entry chunk was ~3.2 MB; warn well below that so a regression
      // is visible in the build log rather than discovered in production.
      chunkSizeWarningLimit: 700,
    },
    define: {
      // Explicitly pass through VITE_ prefixed env vars from either source
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseKey || ''),
    }
  };
});
