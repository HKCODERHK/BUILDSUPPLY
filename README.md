# BuildSupply

A billing / khata (ledger) app for building-material suppliers — customers, invoices, quotations, stock, payments, delivery challans, WhatsApp bill sharing, and PDF/Excel reports.

- **Frontend:** React + Vite + TypeScript + Tailwind CSS — [`/frontend`](./frontend)
- **Backend:** [Supabase](https://supabase.com) (Postgres + Auth + Storage) — no server to write or host, called directly from the frontend
- **Schema:** [`/supabase/schema.sql`](./supabase/schema.sql)

Everything here runs on free tiers. See the schema file's comments and the sections below for the one-time setup.

## 1. Create a Supabase project (free)

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. In the Supabase Dashboard, open **SQL Editor → New query**, paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates all tables, security rules, and the `logos` storage bucket.
3. In **Project Settings → API**, copy your **Project URL** and **anon public key**.

## 2. Configure the frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Fill in `.env` with the values from step 1:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Then run:

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

## 3. Create your own admin login

There is no public sign-up screen — every account is created by hand. Do this once, for yourself:

1. Dashboard → **Authentication → Users → Add user**. Set an email and password.
2. Copy the new user's **UID** from that table.
3. Dashboard → **SQL Editor**, run:

   ```sql
   insert into public.suppliers (id, business_name, role)
   values ('PASTE-THE-UID-HERE', 'BuildSupply Admin', 'admin');
   ```

4. Sign in at `/login` with that email/password — you'll land in the app with an **Admin** link in the sidebar that lists every supplier.

## 4. Onboarding a new supplier

This app has no self-signup by design — a supplier contacts you off-app, and you create their account:

1. Dashboard → **Authentication → Users → Add user**. Set their email and a password (share it with them however you like — phone, WhatsApp, etc).
2. Copy their new user's **UID**.
3. Dashboard → **SQL Editor**, run:

   ```sql
   insert into public.suppliers (id, business_name, phone, role, plan)
   values ('PASTE-THEIR-UID-HERE', 'Their Business Name', '9876543210', 'supplier', 'starter');
   ```

4. They can now sign in at `/login`. Their data (customers, invoices, stock, etc.) is private to them — no other supplier, only an admin, can see it.

## Notes on scope

- **WhatsApp**: every "Share"/"Remind" button opens `wa.me` with a pre-filled message — nothing is sent automatically, and no WhatsApp Business API or paid messaging service is used.
- **PDF/Excel exports** (Reports screen) run entirely in the browser (`jspdf`, SheetJS) — no server round-trip.
- **GST** is calculated client-side at invoice creation (18%, toggleable per invoice) — this app does not integrate with the government e-invoice API, which is only required for suppliers above a large turnover threshold.
- **Deployment**: once you're ready to put this online, `frontend/` is a static build (`npm run build` → `frontend/dist`) that can be hosted for free on Vercel or Render's Static Site — no separate backend deploy needed, since Supabase already runs the backend.
