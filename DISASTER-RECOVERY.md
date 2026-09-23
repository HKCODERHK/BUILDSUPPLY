# BuildSupply — backups and disaster recovery

Written 23 September 2026. Read the first section if nothing else.

## The short version

- **The live database is backed up automatically, every day at 9 PM**, from this
  laptop into OneDrive. You do not need to do anything.
- **Every backup checks itself** before it is kept, and **once a week one is
  restored** into a throwaway test database to prove it really works.
- **Nothing is ever deleted automatically.** Every verified backup is kept.
- **If something goes wrong, Windows tells you** with a notification, and a
  file called `PROBLEM-READ-ME.txt` appears in the backup folder. If you see
  neither, everything is fine.
- **To check at any time**, open `STATUS.txt` in
  `OneDrive\BuildSupply Verified Backups`.
- **If the live database is ever lost or damaged: do not delete, reset or
  "fix" anything yourself.** Follow [Restoring](#restoring) below, or ask for
  help first. The backups are safe where they are.

## What happens automatically

| When | What | Task in Task Scheduler |
|---|---|---|
| Every day, 21:00 | A verified backup of the whole live database | `BuildSupply Backup` |
| Every Sunday, 21:30 | A restore drill on the newest backup | `BuildSupply Restore Drill` |
| Every 4 hours, and 10 min after you sign in | A health check that warns you if anything is wrong | `BuildSupply Backup Health Check` |

A black window may flash for a moment when a task starts. That is expected:
the way of starting the tasks with no window at all turned out to hide
failures from Windows, so it is not used.

If the laptop is off or asleep at those times, the missed run happens as soon
as it is next on and you are signed in. A backup that hits a network blip
tries again by itself, three times over about a minute and a half; if it
still fails, the next scheduled run tries again, and you are warned straight
away that the last attempt failed.

### What one backup does

1. Reads the list of tables from the live database — never a hand-typed
   list, so a new table is never missed.
2. Reads **every table in one read-only statement**. That makes the backup one
   consistent moment of the database (a payment saved halfway through cannot
   leave it half-updated), and the read-only mode means **Postgres itself
   refuses any change** — the backup cannot modify production even by
   mistake.
3. Checks that a test string of special characters — em-dash (—), bullet (•),
   rupee sign (₹) and Marathi text — came back exactly. If not, it stops and
   saves nothing. (Every backup made before 22 September 2026 had silently
   damaged these characters. This is the check that makes that impossible to
   miss again.)
4. Saves one file per table and a **manifest**: how many rows each table has
   and a SHA-256 fingerprint of every file.
5. Re-checks every file, zips them, **unzips the zip again and re-checks
   that**, then copies it to OneDrive under a temporary name, checks the copy's
   fingerprint, and only then gives it its real name.
6. Compares the row counts with the previous backup. If bills, payments,
   customers, estimates, materials or orders **went down**, you get a
   notification — that is how an accidental deletion gets noticed while the
   older backups still have the records.
7. **Deletes its working folder** — which holds plaintext customer data —
   whether the run succeeded or failed.

A backup only counts as a backup when its `.zip` has both a `.sha256` and a
`.manifest.json` beside it. A half-written file can never pass for a good one.

### What one restore drill does

1. Takes the newest verified backup and checks its fingerprint.
2. Starts a brand-new Postgres database in Docker **with no network at all**
   (`--network none`) — it physically cannot reach the live database.
3. Builds the app's structure from `schema.sql` and every migration.
4. Recreates every account's login with its original id.
5. Restores every row, as the ordinary `postgres` role — the same limited role
   a real restore into Supabase would use.
6. Compares the result with the backup: every table's row count, the exact set
   of row ids, names and sites character for character, the money totals to
   the paisa, and the app's own integrity rules (no bill paid past its total,
   every payment's split adding up, no data crossing between suppliers).
7. Destroys the database and everything in it, and writes a report to
   `drills\`.

The first drill, on 23 September 2026, passed **73 of 73 checks**.

Drills need Docker Desktop. If it is not running, the drill starts it; if it
will not start, the drill is skipped (not failed), and you are warned only if
no drill has passed for 14 days.

### What you would be warned about

- No verified backup for **48 hours**.
- The last backup attempt failed (with the reason).
- A backup no longer matches its fingerprint — changed or damaged on disk.
- No restore drill has passed for 14 days, or the last one failed.
- One of the three scheduled tasks has been switched off or deleted.
  (The old nightly task was found switched off on 23 September 2026 with no
  warning at all. This is the check that would have caught it.)
- The installed backup scripts were changed after being installed.

Notifications repeat every 12 hours while the problem lasts, and stop by
themselves once it is fixed. `STATUS.txt` also lists smaller notes: OneDrive
not running, the folder getting large, records that went down.

## Where the backups are, who can reach them, how long they last

**Where:** `C:\Users\Himan\OneDrive\BuildSupply Verified Backups`, synced to
OneDrive, so a copy also lives in Microsoft's cloud.

```
BuildSupply Verified Backups\
  STATUS.txt              <- open this
  PROBLEM-READ-ME.txt     <- only while something is wrong
  README.txt
  history.log             <- every run, good or bad; never trimmed
  backups\2026-09\buildsupply-2026-09-23-1602.zip   (+ .sha256, .manifest.json)
  drills\drill-2026-09-23-1608-PASSED.txt
```

**Who can read them:**

- Anyone who can sign in to this laptop as **Himan**.
- Anyone with the password of the OneDrive account
  **himanshu_khalatkar@outlook.com** (a different account from the Supabase
  and Google logins). **Turn on two-step verification for that Outlook
  account** — it is now the key to a full copy of every supplier's business.
- Microsoft, as OneDrive's host.

The files are **not encrypted**. They hold every customer's name, phone and
site, and every bill and payment. They do **not** hold any login password or
password hash — on purpose, see [Logins](#logins-after-a-restore) — nor, since
23 September 2026, the two security secrets below. (Backups made before that
evening, including the older folders, still contain the confirmation PIN
hashes and the spam-guard key; they are left exactly as they are.) Do not
share the folder or send a backup to anyone.

## Deliberately NOT in backups (this is intended, not missing data)

Exactly two tables are left out of every backup, by the owner's decision on
23 September 2026. They are **security secrets, not business data**: no bill,
payment, customer, supplier, driver, estimate, order or any other record
refers to them, so leaving them out loses no business data. Every other
table — and any table added in future — is in every backup.

| Table | What it holds | Why it is left out | What happens after a restore |
|---|---|---|---|
| `supplier_pins` | The confirmation PIN of each account that set one, scrambled | A 4-digit PIN has only 10,000 possibilities, so anyone with a backup could work the PIN out in seconds. | The restored app has **no PINs**, so it asks for none until each supplier sets a new one in **Settings → Confirmation PIN** (no old PIN is needed when none is on record). The backup records **which** accounts had a PIN, and `STATUS.txt` names them, so the admin knows whom to ask. |
| `order_guard_secret` | The private key that anonymises customers' internet addresses for the order spam limit | It is a key; a backup does not need it. | **A fresh random key is created automatically** when the database is rebuilt from the migrations (032). The only effect: the "5 orders an hour per device" limit starts counting again. |

Each backup's `.manifest.json` lists both under `excluded`, with the number
of rows each had in production and the reason. `STATUS.txt` shows the same.
The weekly restore drill checks both outcomes: no PIN hashes after the
restore, and exactly one fresh spam-guard key. A backup that ever contained
either table's contents would fail its own verification.

**How long they are kept:** forever. Nothing deletes a verified backup. Each
is about 200 KB today, so one a day is roughly 75 MB a year against
OneDrive's free 5 GB. `STATUS.txt` warns once the folder passes 2 GB; at that
point a retention rule should be agreed — it will not be introduced without
your approval.

If a backup file itself is deleted by mistake, OneDrive keeps deleted files
in its recycle bin (onedrive.live.com → Recycle bin) for 30 days.

**The installed backup program** lives in
`C:\Users\Himan\BuildSupply Backup System\program`, outside the project's Git folder, so
switching branches, editing the code or pulling changes never alters what the
scheduled tasks run. Only running the installer again does.

## Accounts in production

Found by reading the live data, **not** from notes — as of 23 September 2026:

| Business | Login email | Role | Status |
|---|---|---|---|
| Shree Balaji Building Materials | shreebalaji@buildsupply.test | supplier (test account) | active |
| BuildSupply Admin | himanshukhalatkar6@gmail.com | admin | active |
| KALYANI TRADERS | gajendrakhalatkar6@gmail.com | supplier | active |
| Rahul Traders | nimbalkar.rahul96@gmail.com | supplier | active |

**Do not rely on this table.** Every backup's `.manifest.json` lists the
accounts it actually contains, and `STATUS.txt` shows the list from the
newest backup. A restore recreates whatever the backup holds — however many
accounts that is. All of them, including the Shree Balaji test account, are
protected the same way.

## Restoring

> **Stop first.** A restore that writes over the live database replaces
> whatever is there now. Never run one on the live project because a few
> records look wrong — that would throw away everything entered since the
> backup. Ask first.

### First, is the database really lost?

- **Free Supabase projects pause after a week without use.** A paused project
  looks broken but is not lost: open the
  [dashboard](https://supabase.com/dashboard/project/pefarymejlfdsmwusbbq) and
  press **Restore project**. No backup needed.
- **A few records deleted or changed by mistake:** do **not** restore the whole
  database. Find the newest backup from *before* the mistake (`history.log`
  and the `NOTICE` lines say when counts dropped); the missing rows can be put
  back one by one from its files, without touching anything else. Ask for
  help with this — it is a careful, targeted job.
- **The whole database gone, or damaged beyond repair:** follow the full
  recovery below.

### Full recovery into a new Supabase project

What you need: this laptop (or any Windows PC with Node and Docker), the
newest verified backup, and the project files from GitHub.

1. **Pick the backup.** Open `STATUS.txt`; the newest verified backup is
   named there. Copy it (the `.zip`, `.sha256` and `.manifest.json`) to a
   working folder. Do not work inside the OneDrive folder.
2. **Check it** — in PowerShell, the fingerprint must equal the first word of
   the `.sha256` file:
   ```
   (Get-FileHash buildsupply-XXXX.zip -Algorithm SHA256).Hash
   ```
   Then unzip it to a folder, say `C:\restore\data`.
3. **Create a new Supabase project** in the dashboard. Note its project ref,
   its URL, its `service_role` key (Settings → API) and its database
   connection string (Connect → Session pooler).
4. **Build the structure.** In the new project's SQL editor, run
   `supabase/schema.sql`, then every file in `supabase/migrations` in number
   order.
5. **Recreate the logins, with their original ids.** First a dry run, which
   changes nothing:
   ```
   set SUPABASE_SERVICE_ROLE_KEY=<new project's service_role key>
   node scripts\backup\restore-logins.mjs --backup C:\restore\data --url https://<new-ref>.supabase.co
   ```
   Then the same command with `--apply`. It prints a **temporary password**
   for each account — shown once, saved nowhere. Suspended or deactivated
   suppliers come back banned, as they were.
6. **Restore the data:**
   ```
   node scripts\backup\restore-from-backup.mjs C:\restore\data --out C:\restore\restore.sql
   docker run --rm -v C:\restore:/w public.ecr.aws/supabase/postgres:17.6.1.167 psql "<connection string>" -v ON_ERROR_STOP=1 -f /w/restore.sql
   ```
   It runs in one transaction: it either all goes in, or none of it does.
7. **Check it** the way the drill does:
   ```
   node scripts\backup\backup-tool.js expect-sql C:\restore\data C:\restore\checks.sql
   docker run --rm -v C:\restore:/w public.ecr.aws/supabase/postgres:17.6.1.167 psql "<connection string>" -f /w/checks.sql
   ```
   Each line reads `check|t|expected|actual`. Every one must have `t` (true)
   in the second position.
8. **Point the app at the new project:** on Vercel, change
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and redeploy; update
   `frontend/.env`; deploy the Edge Function
   (`npx supabase functions deploy admin-manage-supplier --project-ref <new-ref>`);
   in the new project's Auth settings, set the site URL and redirect URLs as
   the old project had them.
9. **Give everyone their temporary password** on WhatsApp and ask them to
   change it in Settings.
10. **Re-install the backup** against the new project: update
    `supabase/.temp/project-ref` (run `npx supabase link --project-ref <new-ref>`),
    then run `scripts\backup\install-backup.ps1`.
11. **Re-establish confirmation PINs.** `STATUS.txt` (or the backup's
    `.manifest.json`, under `pin_accounts`) names the accounts that had one.
    Ask each to set a new PIN in Settings. Nothing asks for a PIN until they
    do. The spam-guard key needs nothing: step 4 already made a fresh one.
12. Delete `C:\restore` — it holds plaintext customer data.

**What a restore does not bring back:**

- **Supplier logos.** They are files in Supabase Storage, which a database
  backup does not include. Suppliers upload them again in Settings.
- **Passwords.** Deliberately — see below.
- **Confirmation PINs and the spam-guard key.** Deliberately — see
  [Deliberately NOT in backups](#deliberately-not-in-backups-this-is-intended-not-missing-data).
- Supabase project settings (auth URLs, email templates, Edge Function
  secrets). Steps 8 and 10 cover the ones this app uses.

Steps 5–7 are exactly what the weekly drill does, and were tested against a
local Supabase on 23 September 2026 (all four accounts recreated with their
original ids and able to sign in). Restoring into a *hosted* project has not
been rehearsed end to end, since that needs a second Supabase project; the
drill uses the same Postgres version and the same limited `postgres` role.

## Logins after a restore

Supabase keeps logins in a separate place (`auth.users`) from the business
data. BuildSupply's backups **deliberately do not contain passwords or
password hashes**: a backup that did would turn one stolen OneDrive file
into something an attacker could crack offline, against accounts that guard
real money.

Instead, each backup's `suppliers` table already holds what a login needs —
the account's id, email and whether it is suspended — and Supabase's Admin API
accepts **the original id** when creating an account. So after a disaster,
`restore-logins.mjs` recreates every login exactly where the restored data
expects it; the only thing lost is each person's password, and they get a new
temporary one, the same way the admin panel's Reset Password already works.
The app reads nothing else from the login records.

If Google sign-in is added later, recovery gets easier, not harder: a
supplier who signs in with Google has no password to lose.

## What the free setup cannot do — and Supabase Pro

The free setup above is solid for what it is. Its limits are real, though:

| | Free setup (this) | Supabase Pro, $25/month |
|---|---|---|
| Backups | Twice a day, from this laptop | Daily, by Supabase, whatever this laptop is doing |
| Kept | Forever | 7 days |
| Depends on this laptop being on and signed in | **Yes** | No |
| Logins and passwords restored | No — new temporary passwords | The whole database is backed up, so logins should come back with their passwords (Supabase's backup page does not spell this out; confirm before relying on it) |
| Restore | A person following the steps above, about an hour | A button in the dashboard, onto the same project (the app is offline while it runs) |
| Most you can lose | Up to ~24 hours, longer if the laptop is off | Up to 24 hours |
| Project paused after a week idle | Yes | No |

Point-in-time recovery — back to any second, losing at most about 2 minutes —
is a further add-on on top of Pro: about **$100/month** for 7 days (and it
needs a paid compute size too).

**Is the free setup safe enough for now?** For today's size — four accounts,
one real supplier with a handful of bills, and the owner's own laptop on most
days — yes, provided the laptop is used regularly and the Outlook account has
two-step verification. The gap that matters is that **everything depends on
one laptop**: if it is off for a week, there are no backups that week (you
would be warned at 48 hours). Once suppliers are paying and billing daily,
Pro's $25/month is worth it for backups that do not depend on anyone's laptop
— and keeping this system running alongside it costs nothing and gives the
long history Pro does not.

## Maintenance

- **After pasting a new migration into the live database**, run
  `scripts\backup\install-backup.ps1` again once it is merged, so the weekly
  drill builds the new structure. If you forget, the drill says exactly that
  ("the drill's copy of the migrations is older than production") — the
  backups themselves keep working.
- **After changing anything in `scripts\backup\`**, run the installer again.
  Until then the old installed copy keeps running, unchanged.
- **If the Supabase CLI login expires**, backups fail and you are warned.
  Fix: `npx supabase login` in a terminal, then run
  `powershell -ExecutionPolicy Bypass -File "%USERPROFILE%\BuildSupply Backup System\program\run-backup.ps1"`
  once to confirm.
- **Run a backup or drill now** (optional; they run by themselves): right-click
  the task in Task Scheduler → Run.
- **To switch the system off**:
  `Unregister-ScheduledTask -TaskName 'BuildSupply Backup','BuildSupply Restore Drill','BuildSupply Backup Health Check'`.
  This stops future runs; it deletes no backup.

## The old backups (before 23 September 2026)

`OneDrive\BuildSupply Backups` holds the backups from the old nightly script.
**None of them is fully trustworthy:** those from 13–21 September have every
em-dash and bullet replaced by `?` (the original characters are gone), and the
hand-run ones show them as garbled `â€"` (repairable). The one taken at 23:58
on 22 September is correct. `OneDrive\BuildSupply Backups KEEP` holds five
repairable ones. They are left exactly as they are — nothing in the new system
reads, moves or deletes them.

The old scheduled task **BuildSupply Daily Backup** is switched off and must
stay off: its script does not verify anything and deletes all but its newest
14 archives. The health check warns if it is ever switched back on.
