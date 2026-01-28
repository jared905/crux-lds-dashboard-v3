import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory
  const env = loadEnv(mode, process.cwd(), '');

  // For Vercel builds, env vars come from process.env, not .env files
  // Fall back to process.env if loadEnv doesn't find them
  const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  // Debug: log during build - show all VITE_ env vars
  console.log('Build env check - URL defined:', !!supabaseUrl);
  console.log('Build env check - Key defined:', !!supabaseKey);
  console.log('All process.env keys with VITE:', Object.keys(process.env).filter(k => k.includes('VITE') || k.includes('SUPA')));
  console.log('loadEnv keys:', Object.keys(env).filter(k => k.includes('VITE') || k.includes('SUPA')));

  return {
    plugins: [react()],
    server: { port: 5173 },
    define: {
      // Explicitly pass through VITE_ prefixed env vars from either source
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseKey || ''),
    }
  };
});
