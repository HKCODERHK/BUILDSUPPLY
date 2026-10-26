import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.ts so the app's build is untouched. Only the
// pure helpers in src/lib are tested; nothing here may reach Supabase.
export default defineConfig({
  // The app's own '@/…' imports, as in vite.config.ts.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Never read frontend/.env: it holds the live project's URL and key.
  envDir: false,
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/noNetwork.ts'],
    env: { TZ: 'Asia/Kolkata' }, // dates are tested in IST, like the suppliers' phones
  },
})
