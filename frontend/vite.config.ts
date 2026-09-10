import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_')

  // PDFs sent to customers live at /d/ on the app's own domain, which the
  // host proxies to the storage bucket (vercel.json, _redirects). The same
  // here, so a link made while testing opens too. '/d/' with the slash: Vite
  // matches by prefix, and plain '/d' would swallow /dashboard.
  const proxy: Record<string, ProxyOptions> = env.VITE_SUPABASE_URL
    ? {
        '/d/': {
          target: env.VITE_SUPABASE_URL,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/d\//, '/storage/v1/object/public/documents/'),
        },
      }
    : {}

  return {
    plugins: [react(), tailwindcss()],
    // Bind to the LAN, not just localhost, so the dev server is reachable
    // from a phone on the same WiFi during testing.
    // PORT lets a launcher hand out a free port when 5173 is taken by another
    // dev server; plain `npm run dev` still gets 5173.
    server: {
      host: true,
      port: Number(process.env.PORT) || 5173,
      proxy,
    },
    preview: { proxy },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }
})
