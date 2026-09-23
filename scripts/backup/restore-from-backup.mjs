// Turns a BuildSupply backup into a SQL script that will actually load.
//
//   node scripts/backup/restore-from-backup.mjs <folder-with-the-json-files> --out restore.sql
//   psql "<connection string>" -v ON_ERROR_STOP=1 -f restore.sql
//
// Use --out rather than redirecting stdout on Windows: PowerShell's `>` and
// `|` re-encode text, which is exactly how the September 2026 backups lost
// their em-dashes. With --out, Node writes the UTF-8 bytes itself.
//
// Written after the Phase 2 audit (2026-09-22) found that the archives could
// not be restored at all. Loading the JSON files in any order fails, for three
// separate reasons, and this is what each one needs:
//
//   1. **A circular foreign key.** `quotations.converted_invoice_id` points at
//      `invoices`, and `invoices.quotation_id` points back at `quotations`, so
//      neither table can go first. Quotations are therefore loaded with
//      `converted_invoice_id` held back, the invoices go in, and the column is
//      filled by an UPDATE at the end. That keeps the restore portable: no
//      superuser, no `session_replication_role`, no deferrable constraints —
//      none of which are available on a managed Supabase project.
//
//   2. **Seeded tables.** The migrations insert a row into `platform_settings`
//      and `order_guard_secret`, so a plain INSERT collides on the primary
//      key. Those two are loaded with ON CONFLICT DO UPDATE, so the backup's
//      row wins and re-running is harmless.
//
//   3. **Order.** Parents before children, all the way down.
//
//   4. **The app's own triggers fight the load.** Inserting `payments` fires
//      `payments_legacy_allocation`, which writes allocations of its own; the
//      backed-up allocations then land on top and the deferred check refuses
//      the whole transaction with "A bill can't be paid more than its total."
//      The guards, the keep-triggers and the stock log would all fire too. So
//      user triggers are switched off on the tables being loaded and switched
//      back on at the end, inside the same transaction. That needs table
//      ownership, which the `postgres` role has on a Supabase project - and
//      unlike `session_replication_role` it does not need superuser.
//
//   5. **Columns the backup predates.** A migration that adds a NOT NULL
//      column with a default (035 added `materials.gst_rate`) breaks a
//      `select *` load of any older archive. Every insert names only the
//      columns the backup carries, so anything added later takes its default.
//
// What this does NOT restore: `auth.users`. Password hashes are deliberately
// not in the backup. The logins have to exist, with the same ids, before this
// script runs, or every `suppliers` row fails its foreign key - run
// restore-logins.mjs first, which recreates them from suppliers.json. See
// DISASTER-RECOVERY.md.
//
// Nothing here writes to a database. It prints SQL; you choose where to run it.
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const outAt = args.indexOf('--out')
const outFile = outAt === -1 ? null : args[outAt + 1]
const dir = args.find((a, i) => !a.startsWith('--') && (outAt === -1 || i !== outAt + 1))
if (!dir || (outAt !== -1 && !outFile)) {
  console.error('usage: node restore-from-backup.mjs <folder-with-the-json-files> [--out restore.sql]')
  process.exit(2)
}

// Collected and written once at the end, so --out produces one UTF-8 file.
const out = []
const print = (line) => out.push(line)

// Parents first. A table absent from the archive is skipped, so an older
// backup (one taken before `stock_logs` existed, say) still restores.
const ORDER = [
  'suppliers',
  'material_categories',
  'material_types',
  'brands',
  'master_material_variants',
  'platform_settings',
  'order_guard_secret',
  'customers',
  'materials',
  'quotations',
  'invoices',
  'quotation_items',
  'invoice_items',
  'payments',
  'payment_allocations',
  'order_requests',
  'order_request_clients',
  'order_blocked_phones',
  'drivers',
  'supplier_pins',
  'client_requests',
  'stock_logs',
  'activity_log',
]

// A table the backup holds but ORDER has never heard of - one a later
// migration added - is restored too, after everything above, rather than
// silently left out. If it needs a parent that comes later, the restore stops
// with a foreign-key error, which the restore drill reports: loud, not lost.
// Files starting with `_` (the encoding check, the column list) and the
// manifest are not tables.
const known = new Set(ORDER)
const unknown = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_') && f !== 'manifest.json')
  .map((f) => f.slice(0, -5))
  .filter((t) => !known.has(t))
  .sort()
if (unknown.length) {
  console.error(`note: restoring ${unknown.join(', ')} after the known tables - add them to ORDER in restore-from-backup.mjs`)
}
const TABLES = [...ORDER, ...unknown]

// The two the migrations seed. Their backed-up row replaces the seeded one.
// Backups made since 2026-09-23 deliberately leave out order_guard_secret
// (and supplier_pins), so for those the fresh key the migration made stays.
// Older backups still carry it and it is restored as before.
const SEEDED = new Set(['platform_settings', 'order_guard_secret'])

// Held back on the way in and filled by an UPDATE once invoices exist.
const CIRCULAR = { quotations: 'converted_invoice_id' }

const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`

function emit(table, rows) {
  if (!rows.length) {
    print(`-- ${table}: nothing in the backup`)
    return
  }
  const held = CIRCULAR[table]
  const payload = held ? rows.map((r) => ({ ...r, [held]: null })) : rows
  const json = sqlString(JSON.stringify(payload))

  // Only the columns this backup actually carries. Anything a later migration
  // added is left out so its default applies; naming every column instead
  // writes NULL into it, and an explicit NULL beats a column default - which
  // is what made a 15 September archive fail against materials.gst_rate,
  // added by 035 as NOT NULL DEFAULT 18.
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const list = columns.join(', ')

  print(`-- ${table}: ${rows.length} row(s), ${columns.length} column(s)${held ? ` (${held} filled in at the end)` : ''}`)
  print(`insert into public.${table} (${list})
  select ${list} from jsonb_populate_recordset(null::public.${table}, ${json}::jsonb)`)
  if (SEEDED.has(table)) {
    // The migrations already put a row here, so the backup's row replaces it
    // rather than colliding. Re-running the script stays harmless.
    print('  on conflict (id) do update set')
    const sets = columns.filter((c) => c !== 'id')
    for (let i = 0; i < sets.length; i++) {
      print(`    ${sets[i]} = excluded.${sets[i]}${i < sets.length - 1 ? ',' : ';'}`)
    }
  } else {
    print(';')
  }
  print('')
}

print(`-- BuildSupply restore, generated ${new Date().toISOString()}`)
print(`-- from: ${path.resolve(dir)}`)
print('--')
print('-- Run against a database that already has the schema and every migration')
print('-- applied, and whose auth.users rows already exist with the same ids.')
// psql decides how to read this file from its own client_encoding, which on
// Windows is a legacy codepage unless told otherwise. Left alone it reads the
// UTF-8 bytes as Windows-1252 and stores an em-dash as three characters -
// silently, exactly the way the backups themselves were corrupted. Pinned
// here so the restore cannot depend on whose shell runs it.
print("set client_encoding = 'UTF8';")
print('')
print('begin;')
print('')

const present = TABLES.filter((t) => fs.existsSync(path.join(dir, `${t}.json`)))

// Off for the load, on again before commit. Without this the app's own
// triggers rewrite what is being restored.
print("-- The app triggers must not run while its own history is being put back.")
for (const table of present) print(`alter table public.${table} disable trigger user;`)
print('')

for (const table of TABLES) {
  const file = path.join(dir, `${table}.json`)
  if (!fs.existsSync(file)) {
    print(`-- ${table}: not in this backup, skipped`)
    continue
  }
  emit(table, JSON.parse(fs.readFileSync(file, 'utf8')))
}

// The second half of the circular pair, now that both tables hold rows.
for (const [table, column] of Object.entries(CIRCULAR)) {
  const file = path.join(dir, `${table}.json`)
  if (!fs.existsSync(file)) continue
  const rows = JSON.parse(fs.readFileSync(file, 'utf8')).filter((r) => r[column])
  if (!rows.length) {
    print(`-- ${table}.${column}: nothing to fill in`)
    continue
  }
  const pairs = rows.map((r) => ({ id: r.id, [column]: r[column] }))
  print(`-- ${table}.${column}: ${rows.length} row(s), now that invoices exist`)
  print(`update public.${table} t set ${column} = v.${column}
  from jsonb_to_recordset(${sqlString(JSON.stringify(pairs))}::jsonb) as v(id uuid, ${column} uuid)
  where t.id = v.id;`)
  print('')
}

print('-- Triggers back on before the transaction closes.')
for (const table of present) print(`alter table public.${table} enable trigger user;`)
print('')
print('commit;')
print('')
print(`-- restored: ${present.join(', ')}`)

const text = out.join('\n') + '\n'
if (outFile) fs.writeFileSync(outFile, text, 'utf8')
else process.stdout.write(text)
