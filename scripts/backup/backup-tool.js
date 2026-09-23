// The data half of the BuildSupply backup: everything that touches the
// exported rows is done here, in Node, because Node reads and writes UTF-8
// itself. Windows PowerShell 5.1 does not: routing row data through it is what
// silently turned every em-dash into '?' in the September 2026 backups. The
// PowerShell scripts only move files around and never see the data as text.
//
//   node backup-tool.js catalog      <cli-output> <out.json>
//   node backup-tool.js snapshot-sql <catalog.json> <out.sql>
//   node backup-tool.js split        <cli-output> <catalog.json> <dir> <project-ref>
//   node backup-tool.js verify       <dir>
//   node backup-tool.js logins-sql   <dir> <out.sql>
//   node backup-tool.js expect-sql   <dir> <out.sql>
//
// Every command prints one short ASCII line and exits 0, or prints the reason
// and exits 1. Output is ASCII on purpose, so the caller's console encoding
// cannot matter.
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const FORMAT = 1

// A string the database builds from code points and must hand back exactly:
// em-dash, bullet, rupee sign and Devanagari. Written with \u escapes so this
// file stays ASCII. If any of these arrive changed, the export path is lossy
// and the run stops before anything is saved.
const CANARY = 'M-Sand \u2014 Tractor \u2022 400 CFT \u20b9 \u092e\u0930\u093e\u0920\u0940'
const CANARY_SQL = "'M-Sand ' || chr(8212) || ' Tractor ' || chr(8226) || ' 400 CFT ' || chr(8377) || ' ' || " +
  'chr(2350) || chr(2352) || chr(2366) || chr(2336) || chr(2368)'

// Tables a backup is useless without. If the table list comes back without
// one of them, something is wrong with the query, not with the database.
const MUST_HAVE = ['suppliers', 'customers', 'invoices', 'invoice_items', 'payments', 'payment_allocations']

const SAFE_NAME = /^[a-z_][a-z0-9_]{0,62}$/

// The ONLY tables deliberately left out of backups (the user's decision,
// 2026-09-23): security secrets, not business data. Nothing references
// either of them. Every other table - including any added in future - is
// backed up. The manifest and STATUS.txt name these two, so nobody later
// mistakes them for data that went missing by accident.
const EXCLUDED = {
  supplier_pins:
    'confirmation PIN hashes. A 4-digit PIN has only 10,000 possibilities, so a stored hash is as good as the PIN. ' +
    'After a restore, suppliers simply set a new PIN in Settings; until then nothing asks for one.',
  order_guard_secret:
    'the spam guard\'s private key. Rebuilding the database from the migrations (032) creates a fresh random key by itself; ' +
    'the only effect is that the one-hour per-device order limit starts counting again.',
}

function fail(msg) {
  console.log('ERROR ' + String(msg).replace(/[^\x20-\x7e]/g, '?').slice(0, 600))
  process.exit(1)
}
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const md5 = (s) => crypto.createHash('md5').update(Buffer.from(s, 'utf8')).digest('hex')
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const byId = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0)

// The CLI answers in one of two shapes depending on how it was started:
// {rows:[{data}]} interactively, or a bare [{data}] under Task Scheduler.
// Accept both, and refuse anything else rather than writing an empty file
// that would look like a successful backup.
function cliData(file) {
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const starts = [raw.indexOf('{'), raw.indexOf('[')].filter((i) => i !== -1)
  if (!starts.length) fail('no JSON in the CLI output: ' + raw.trim().slice(0, 200))
  let parsed
  try {
    parsed = JSON.parse(raw.slice(Math.min(...starts)))
  } catch (e) {
    fail('CLI output is not JSON: ' + e.message)
  }
  if (parsed && parsed.error) fail('the query failed: ' + (parsed.error.message || JSON.stringify(parsed.error)))
  const row = Array.isArray(parsed) ? parsed[0] : parsed && parsed.rows && parsed.rows[0]
  if (!row || !('data' in row)) fail('the CLI output has no result row')
  return row.data
}

const commands = {
  // The list of tables and columns, read fresh every run. A hand-typed list
  // once silently missed two money tables.
  catalog([cliOut, outFile]) {
    const cat = cliData(cliOut)
    if (!cat || !Array.isArray(cat.tables)) fail('the table list is missing')
    const bad = cat.tables.filter((t) => !SAFE_NAME.test(t))
    if (bad.length) fail('unexpected table names: ' + bad.join(', '))
    const missing = MUST_HAVE.filter((t) => !cat.tables.includes(t))
    if (missing.length) fail('the table list came back without ' + missing.join(', '))
    fs.writeFileSync(outFile, JSON.stringify(cat, null, 1))
    console.log('OK ' + cat.tables.length + ' tables')
  },

  // Every table in ONE statement, so the whole backup is a single consistent
  // moment of the database. Exported table by table, a payment saved halfway
  // through would leave an allocation pointing at a bill the backup never
  // saw, and that backup would refuse to restore. The read-only line makes
  // Postgres itself refuse any write, whatever this file contains.
  'snapshot-sql'([catalogFile, outFile]) {
    const cat = readJson(catalogFile)
    const parts = cat.tables
      .filter((t) => !EXCLUDED[t])
      .map((t) => {
        if (!SAFE_NAME.test(t)) fail('unsafe table name ' + t)
        return `'${JSON.stringify(t)}:' || coalesce((select json_agg(x) from public."${t}" x)::text, '[]')`
      })
    // For an excluded table only its row count is read, never its contents;
    // for the PIN table, also which accounts have a PIN (so they can be asked
    // to set it again after a restore) - never the hash.
    for (const t of cat.tables.filter((x) => EXCLUDED[x])) {
      parts.push(`'${JSON.stringify('_count_' + t)}:' || (select count(*) from public."${t}")::text`)
    }
    if (cat.tables.includes('supplier_pins')) {
      parts.push(`'"_pin_accounts":' || coalesce((select json_agg(supplier_id order by supplier_id) from public.supplier_pins)::text, '[]')`)
    }
    const sql =
      'set transaction read only;\n' +
      `select ('{"_taken_at":' || to_json(now())::text || ',"_canary":' || to_json(${CANARY_SQL})::text || ',' ||\n  ` +
      parts.join(" || ',' ||\n  ") +
      " || '}')::json as data;\n"
    fs.writeFileSync(outFile, sql)
    console.log('OK ' + cat.tables.length + ' tables in one statement')
  },

  // Writes one file per table plus the manifest: what was taken, when, how
  // many rows and the SHA-256 of every file, so the backup can prove later
  // that nothing in it has changed.
  split([cliOut, catalogFile, dir, projectRef]) {
    const snap = cliData(cliOut)
    const cat = readJson(catalogFile)
    if (!snap || typeof snap !== 'object') fail('the snapshot is empty')
    if (snap._canary !== CANARY) {
      fail('the encoding check failed - special characters did not survive the export, so nothing was saved')
    }
    fs.mkdirSync(dir, { recursive: true })
    const tables = {}
    let total = 0
    const excluded = {}
    for (const t of cat.tables.filter((x) => EXCLUDED[x])) {
      if (t in snap) fail('the snapshot contains the contents of ' + t + ', which must never be backed up')
      excluded[t] = { reason: EXCLUDED[t], rows_in_production: Number(snap['_count_' + t]) }
    }
    for (const t of cat.tables) {
      if (EXCLUDED[t]) continue
      const rows = snap[t]
      if (!Array.isArray(rows)) fail('table ' + t + ' is missing from the snapshot')
      const body = Buffer.from(JSON.stringify(rows, null, 1), 'utf8')
      fs.writeFileSync(path.join(dir, t + '.json'), body)
      tables[t] = { rows: rows.length, bytes: body.length, sha256: sha256(body) }
      total += rows.length
    }
    const extras = {
      '_canary.json': Buffer.from(JSON.stringify({ canary: CANARY }), 'utf8'),
      '_schema.json': Buffer.from(JSON.stringify({ pg: cat.pg, columns: cat.columns }, null, 1), 'utf8'),
    }
    const files = {}
    for (const [name, body] of Object.entries(extras)) {
      fs.writeFileSync(path.join(dir, name), body)
      files[name] = sha256(body)
    }
    // Every login a restore would have to recreate, discovered from the data
    // itself rather than from anyone's notes.
    const accounts = (snap.suppliers || []).map((s) => ({
      id: s.id,
      business_name: s.business_name,
      email: s.email,
      role: s.role,
      status: s.status,
    }))
    // Which accounts had a confirmation PIN - names only - so the admin knows
    // whom to ask to set one again after a restore.
    const pinIds = new Set(Array.isArray(snap._pin_accounts) ? snap._pin_accounts : [])
    const pinAccounts = accounts.filter((a) => pinIds.has(a.id)).map((a) => ({ id: a.id, business_name: a.business_name }))
    const manifest = {
      format: FORMAT,
      project_ref: projectRef,
      taken_at: snap._taken_at,
      created_at: new Date().toISOString(),
      postgres: cat.pg,
      table_count: Object.keys(tables).length,
      tables_in_production: cat.tables.length,
      total_rows: total,
      canary: 'passed',
      tables,
      files,
      excluded,
      pin_accounts: pinAccounts,
      accounts,
    }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1))
    console.log('OK ' + total + ' rows ' + Object.keys(tables).length + ' tables ' + accounts.length + ' accounts ' +
      Object.keys(excluded).length + ' secret tables excluded')
  },

  // Re-reads a folder of backup files from disk and checks each against the
  // manifest: the right files, byte-identical, valid JSON, the right number
  // of rows, and no sign of the two ways text has been damaged before.
  verify([dir]) {
    const mf = path.join(dir, 'manifest.json')
    if (!fs.existsSync(mf)) fail('manifest.json is missing')
    const m = readJson(mf)
    if (m.format !== FORMAT) fail('unknown manifest format ' + m.format)
    // A secret table's file must never be in a backup that says it excluded it.
    for (const t of Object.keys(m.excluded || {})) {
      if (fs.existsSync(path.join(dir, t + '.json'))) fail(t + '.json is in the backup although it must be excluded (it holds secrets)')
    }
    const expected = new Set(['manifest.json', ...Object.keys(m.tables).map((t) => t + '.json'), ...Object.keys(m.files)])
    const extra = fs.readdirSync(dir).filter((f) => !expected.has(f))
    if (extra.length) fail('unexpected files in the backup: ' + extra.join(', '))
    let total = 0
    for (const [t, info] of Object.entries(m.tables)) {
      const p = path.join(dir, t + '.json')
      if (!fs.existsSync(p)) fail(t + '.json is missing')
      const body = fs.readFileSync(p)
      if (sha256(body) !== info.sha256) fail(t + '.json does not match its checksum')
      const text = body.toString('utf8')
      if (text.includes('\ufffd')) fail(t + '.json contains damaged characters (U+FFFD)')
      if (text.includes('\u00e2\u20ac')) fail(t + '.json contains mis-decoded characters (mojibake)')
      let rows
      try {
        rows = JSON.parse(text)
      } catch (e) {
        fail(t + '.json is not valid JSON')
      }
      if (!Array.isArray(rows)) fail(t + '.json is not a list of rows')
      if (rows.length !== info.rows) fail(t + '.json has ' + rows.length + ' rows, the manifest says ' + info.rows)
      total += rows.length
    }
    for (const [name, hash] of Object.entries(m.files)) {
      const p = path.join(dir, name)
      if (!fs.existsSync(p)) fail(name + ' is missing')
      if (sha256(fs.readFileSync(p)) !== hash) fail(name + ' does not match its checksum')
    }
    if (readJson(path.join(dir, '_canary.json')).canary !== CANARY) fail('the saved encoding check does not match')
    if (total !== m.total_rows) fail('row total ' + total + ' does not match the manifest ' + m.total_rows)
    console.log('OK verified ' + total + ' rows ' + Object.keys(m.tables).length + ' tables')
  },

  // For the restore drill: a login row for every account the backup holds,
  // taken from suppliers.json, so the drill covers every account there is -
  // not the ones somebody remembered. (A real recovery uses
  // restore-logins.mjs and the Auth Admin API instead; see DISASTER-RECOVERY.md.)
  'logins-sql'([dir, outFile]) {
    const q = (s) => (s === null || s === undefined ? 'null' : "'" + String(s).replace(/'/g, "''") + "'")
    const sup = readJson(path.join(dir, 'suppliers.json'))
    if (!sup.length) fail('the backup has no accounts')
    const values = sup
      .map((s) => `(${q(s.id)}::uuid, ${q(s.email)}, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated')`)
      .join(',\n  ')
    fs.writeFileSync(
      outFile,
      'insert into auth.users (id, email, instance_id, aud, role) values\n  ' +
        values +
        '\non conflict (id) do nothing;\n',
    )
    console.log('OK ' + sup.length + ' accounts')
  },

  // For the restore drill: SQL that compares the restored database with what
  // the backup says it holds. Row counts for every table, the exact set of
  // row ids, names character for character (the thing that broke before),
  // and the money totals. Each check prints check|ok|expected|actual.
  'expect-sql'([dir, outFile]) {
    const m = readJson(path.join(dir, 'manifest.json'))
    const schema = readJson(path.join(dir, '_schema.json'))
    const q = (s) => "'" + String(s).replace(/'/g, "''") + "'"
    const checks = []
    const add = (name, expected, actualSql) =>
      checks.push(
        `select ${q(name)}, coalesce((${actualSql})::text, '') = ${q(expected)}, ${q(expected)}, coalesce((${actualSql})::text, '')`,
      )

    // First: does the drill database even have every column the backup
    // carries? If not, the drill's copy of the migrations is behind
    // production - a problem with the drill, not with the backup.
    const cols = schema.columns || []
    const missingCols = cols.length
      ? `select string_agg(v.t || '.' || v.c, ', ') from (values ${cols
          .map((c) => `(${q(c.table)}, ${q(c.column)})`)
          .join(',')}) v(t, c) where not exists (select 1 from information_schema.columns ic ` +
        `where ic.table_schema = 'public' and ic.table_name = v.t and ic.column_name = v.c)`
      : 'select null::text'
    const schemaSql = `select 'schema: drill has every column the backup carries', (${missingCols}) is null, '', coalesce((${missingCols}), '');\n`

    for (const [t, info] of Object.entries(m.tables)) {
      add(`rows ${t}`, info.rows, `select count(*) from public."${t}"`)
      const rows = readJson(path.join(dir, t + '.json'))
      if (!rows.length || !rows.every((r) => r.id !== undefined && r.id !== null)) continue
      add(
        `ids ${t}`,
        md5(rows.map((r) => String(r.id)).sort().join(',')),
        `select md5(coalesce(string_agg(id::text, ',' order by id::text collate "C"), '')) from public."${t}"`,
      )
      const sorted = [...rows].sort(byId)
      for (const col of ['name', 'business_name', 'invoice_no', 'site', 'phone', 'address']) {
        if (!rows.some((r) => col in r)) continue
        const joined = sorted.map((r) => (r[col] === null || r[col] === undefined ? '' : String(r[col]))).join('|')
        add(
          `text ${t}.${col}`,
          md5(joined),
          `select md5(coalesce(string_agg(coalesce(${col}::text, ''), '|' order by id::text collate "C"), '')) from public."${t}"`,
        )
      }
    }
    const cents = (rows, col) => rows.reduce((s, r) => s + Math.round(Number(r[col] || 0) * 100), 0)
    const inv = readJson(path.join(dir, 'invoices.json'))
    const pay = readJson(path.join(dir, 'payments.json'))
    add('money invoices.total (paise)', cents(inv, 'total'), 'select coalesce(sum(round(total * 100)), 0)::bigint from public.invoices')
    add('money invoices.paid (paise)', cents(inv, 'paid'), 'select coalesce(sum(round(paid * 100)), 0)::bigint from public.invoices')
    add('money payments.amount (paise)', cents(pay, 'amount'), 'select coalesce(sum(round(amount * 100)), 0)::bigint from public.payments')

    // The same integrity rules the app itself relies on.
    add('integrity: no bill paid past its total', 0, 'select count(*) from public.invoices where paid > total + 0.01')
    add(
      'integrity: every bill paid equals its allocations',
      0,
      'select count(*) from (select i.id from public.invoices i left join public.payment_allocations pa ' +
        'on pa.invoice_id = i.id and pa.released_at is null group by i.id, i.paid having coalesce(sum(pa.amount), 0) <> i.paid) x',
    )
    add(
      'integrity: converted estimates point at a real bill',
      0,
      'select count(*) from public.quotations q where q.converted_invoice_id is not null ' +
        'and not exists (select 1 from public.invoices i where i.id = q.converted_invoice_id)',
    )
    add(
      'integrity: no cross-supplier payments',
      0,
      'select count(*) from public.payments p join public.invoices i on i.id = p.invoice_id where p.supplier_id <> i.supplier_id',
    )
    add(
      'integrity: no cross-supplier bills',
      0,
      'select count(*) from public.invoices i join public.customers c on c.id = i.customer_id where c.supplier_id <> i.supplier_id',
    )
    add(
      'integrity: no app trigger left switched off',
      0,
      "select count(*) from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace " +
        "where n.nspname = 'public' and not tg.tgisinternal and tg.tgenabled = 'D'",
    )
    add('logins: every account has its login row', m.accounts.length, 'select count(*) from public.suppliers s join auth.users u on u.id = s.id')

    // The two deliberately excluded secret tables come back in the state a
    // real recovery needs: no PIN hashes at all (each supplier sets a new
    // PIN; until then the app asks for none), and exactly one fresh spam
    // guard key, made by the migrations while the database was rebuilt.
    const ex = m.excluded || {}
    if (ex.supplier_pins) {
      add('excluded secret: no PIN hashes restored (suppliers set new PINs)', 0, 'select count(*) from public.supplier_pins')
    }
    if (ex.order_guard_secret) {
      add('excluded secret: a fresh spam-guard key exists', 1,
        "select count(*) from public.order_guard_secret where id and length(secret) = 64 and secret ~ '^[0-9a-f]+$'")
    }

    const sql =
      "\\pset format unaligned\n\\pset tuples_only on\n\\pset fieldsep '|'\n" + schemaSql + checks.join(';\n') + ';\n'
    fs.writeFileSync(outFile, sql)
    console.log('OK ' + (checks.length + 1) + ' checks')
  },
}

const [cmd, ...args] = process.argv.slice(2)
if (!commands[cmd]) fail('usage: node backup-tool.js <catalog|snapshot-sql|split|verify|logins-sql|expect-sql> ...')
try {
  commands[cmd](args)
} catch (e) {
  fail(e.message)
}
