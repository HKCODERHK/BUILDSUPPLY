# BuildSupply

A billing and khata (ledger) app for building-material suppliers in India — customers, invoices, quotations, stock, payments, WhatsApp bill sharing and PDF statements.

**Live:** [buildsupplyin.vercel.app](https://buildsupplyin.vercel.app)

The app exists to make a supplier's day easier — less typing, fewer disputes. Anything that makes it feel like accounting software is a step backwards.

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4 — [`/frontend`](./frontend)
- **Backend:** [Supabase](https://supabase.com) (Postgres + Auth + Storage), called directly from the browser — there is no server of our own
- **Hosting:** Vercel, auto-deploying from `main`

**Everything runs on free tiers.** No Stripe, no Twilio, no WhatsApp Business API, no paid libraries. WhatsApp works through free `wa.me` links and the device share sheet, which means the supplier always taps send themselves.

## What it does

**For the supplier** — customers with a running khata, GST invoices, quotations, stock that moves on delivery rather than on billing, split payments, payment reminders sorted oldest-first, and a customer ledger as a PDF on their own letterhead.

Built around not re-typing things: repeat the last bill for a customer, a tappable chip showing the rate you last charged them for that material, a WhatsApp receipt the moment money changes hands, and an optional credit limit that warns while billing but never blocks a sale.

Runs in **English, Hindi or Marathi** — though bills and statements always print in English, because they go to customers, engineers and banks.

**Installable as an app.** It's a PWA: add it to a phone's home screen and it opens fullscreen and keeps working on a weak shop connection.

**For the platform admin** — a panel that answers three questions and nothing else: *who needs attention, who needs renewing, who do I contact*. Creating a supplier account, resetting a password, suspending, renewing a subscription, and a shared material catalog every supplier prices against.

The admin is a platform operator, not a super-user: they can reach subscriptions and the catalog, and **cannot** read any supplier's customers, invoices, payments or stock. That boundary is enforced by row-level security in the database, not by hiding buttons.

## Running it locally

You need Node 20+ and a free Supabase project.

### 1. Create the database

In your Supabase project's **SQL Editor**, run these in order:

1. [`supabase/schema.sql`](./supabase/schema.sql) — base tables, RLS policies, storage buckets
2. Every file in [`supabase/migrations/`](./supabase/migrations) **in numerical order**, `002` through `023`
3. Every file in [`supabase/seed/`](./supabase/seed) — fills the shared material catalog with real Indian cement, steel, sand and aggregate products

There is no `001`; the base schema predates the migrations folder.

### 2. Configure and run the frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Put your project's URL and publishable (anon) key into `.env` — both are in **Project Settings → API**:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

These are read at **build** time, not runtime — so on a hosting provider they must be set before the first build.

```bash
npm run dev
```

Runs at `http://localhost:5173`.

The service worker only registers in a production build, so to test offline behaviour use `npm run build` followed by `npm run preview`.

### 3. Create the first admin

There is no public sign-up. The first account has to be made by hand, once:

1. **Authentication → Users → Add user.** Set an email and password, and tick *Auto Confirm User*.
2. Copy the new user's **UID**.
3. In the **SQL Editor**:

   ```sql
   insert into public.suppliers (id, business_name, role)
   values ('PASTE-THE-UID-HERE', 'BuildSupply Admin', 'admin');
   ```

Sign in and you'll have the admin panel.

### 4. Everyone after that

Suppliers are created **from inside the app** — Admin → Suppliers → *Add supplier*. It provisions the login, generates a password, and shows the credentials once with a "Send on WhatsApp" button. Nothing needs to be done by hand in the dashboard.

The generated passwords deliberately avoid `O`, `0`, `I`, `l` and `1`, because the admin reads them aloud and the supplier types them on a phone.

## Deploying

`frontend/` builds to static files, so any static host works. Host config for Vercel ([`frontend/vercel.json`](./frontend/vercel.json)) and for Netlify / Cloudflare Pages ([`frontend/public/_redirects`](./frontend/public/_redirects), [`_headers`](./frontend/public/_headers)) is committed — whichever host you use ignores the others' files.

Two things that will bite you:

- **The host must serve `index.html` for unknown paths.** This is a single-page app, so `/invoices/123` and the installed app's own start URL only exist in the browser. Without that rewrite the app 404s the moment it's installed. That's what those config files do; on Vercel, set the project's **Root Directory to `frontend`** or it never finds them.
- **Set `Site URL` and `Redirect URLs`** in Supabase's Authentication settings to your deployed domain, or password reset fails silently.

## Scope, deliberately

- **WhatsApp** — every share and reminder opens `wa.me` with a message pre-filled. Nothing is ever sent automatically. Numbers are normalised to full international form, since `wa.me` rejects an Indian number with its leading trunk zero.
- **Documents are PDFs.** Excel export was removed along with the `xlsx` dependency — known vulnerabilities, and a format suppliers weren't asking for.
- **GST** is calculated in the browser, toggleable per invoice. There is no integration with the government e-invoice API, which only applies above a turnover threshold well beyond this app's users.
- **The confirmation PIN** asked before irreversible actions is a *confirmation gate, not a security boundary* — 10,000 combinations answers "is the right person holding this phone" and nothing more. Supabase Auth and RLS remain the real boundary.

## Repository

```
frontend/            React app
supabase/
  schema.sql         base schema
  migrations/        002-023, run in order
  seed/              material catalog data
  functions/         Edge Function for supplier account management
  config.toml        auth URL configuration, pushed with `supabase config push`
```

[`CLAUDE.md`](./CLAUDE.md) carries the deeper engineering context — why things are built the way they are, the traps, and what's been tried.
