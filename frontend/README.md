# BuildSupply — frontend

React 19 + Vite + TypeScript + Tailwind CSS v4. See the [root README](../README.md) for what the app is and how to set up the database.

```bash
npm install
cp .env.example .env   # fill in your Supabase URL and publishable key
npm run dev            # http://localhost:5173
```

`VITE_*` variables are read at **build** time, not runtime. A missing one throws on boot rather than warning.

## Scripts

| | |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build — **needed to test the service worker**, which only registers in a production build |
| `npm run lint` | Oxlint. Should stay at 0 errors |
| `npx tsc -b` | Type-check |

## Layout

```
src/
  routes/      one file per screen; routes/admin/ is the platform panel
  components/  shared UI, with the primitives in components/ui/
  services/    every Supabase call — components don't query the database directly
  lib/         pure logic: PDFs, i18n, dates, money, WhatsApp links
  context/     auth, theme, language, confirmation PIN
public/
  sw.js               service worker, hand-written
  manifest.webmanifest
  _redirects/_headers Netlify + Cloudflare Pages config
vercel.json           Vercel config
```

## Things worth knowing before changing something

**`lib/` holds single sources of truth.** `whatsapp.ts` builds every `wa.me` link in the app (24 call sites), `localDate.ts` decides which calendar day a UTC timestamp belongs to, `pdfTheme.ts` styles every PDF, `overdue.ts` owns overdue ages. Each fixes a bug that would come straight back if a caller reimplemented it — the comments say which.

**Numeric inputs are `type="text"` with `inputMode`**, never `type="number"`, and go through `lib/numberInput.ts`. Native number inputs don't support `.select()` reliably and happily accept `"05"`.

**Supplier-facing strings go through `t()`** with a key in `lib/i18n.ts` in all three languages. Admin screens stay English, and PDFs stay English regardless of the app's language — a bill goes to customers and banks.

**Tailwind v4 is CSS-first.** There's no config file; the palette lives in `@theme` in `index.css`, and both themes are defined there as semantic tokens.

Run `npx tsc -b` and a full `npm run build` before calling anything done.
