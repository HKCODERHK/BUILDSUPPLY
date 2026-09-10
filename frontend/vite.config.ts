import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Bind to the LAN, not just localhost, so the dev server is reachable
  // from a phone on the same WiFi during testing.
  // PORT lets a launcher hand out a free port when 5173 is taken by another
  // dev server; plain `npm run dev` still gets 5173.
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
