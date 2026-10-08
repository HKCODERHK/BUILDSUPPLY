// The data half of the BuildSupply backup: everything that touches the
// exported rows or files is done here, in Node, because Node reads and writes
// UTF-8 itself. Windows PowerShell 5.1 does not: routing row data through it
// is what silently turned every em-dash into '?' in the September 2026
// backups. The PowerShell scripts only move files around.
//
//   node backup-tool.js catalog-sql  <out.sql>
//   node backup-tool.js catalog      <cli-output> <out.json>
//   node backup-tool.js snapshot-sql <catalog.json> <out.sql>
//   node backup-tool.js files        <catalog.json> <dir> <project-url>
//   node backup-tool.js split        <cli-output> <catalog.json> <dir> <project-ref>
//   node backup-tool.js verify       <dir>
//   node backup-tool.js logins-sql   <dir> <out.sql>
//   node backup-tool.js expect-sql   <dir> <out.sql>
//   node backup-tool.js categories   <dir> <out.json>
//
// Every command prints one short ASCII line and exits 0, or prints the reason
// and exits 1. Output is ASCII on purpose, so the caller's console encoding
// cannot matter.
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const coverage = require('./coverage.js')

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'"

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

// Every reference to a public uploaded file inside a row - a supplier's
// logo_url, a catalog image_url, a mention in the activity log, or whatever a
// future column holds - so each one can be checked against the backup.
function storageRefs(text) {
  const out = []
  const re = /\/storage\/v1\/object\/public\/([^/"?\s\\]+)\/([^"?\s\\]+)/g
  let m
  while ((m = re.exec(text))) {
    let name = m[2]
    try {
      name = decodeURIComponent(name)
    } catch {}
    out.push({ bucket: m[1], name })
  }
  return out
}

const commands = {
  // What the database holds, read fresh every run and in ONE read-only
  // statement: the app's tables and columns, EVERY table in EVERY schema
  // (with exact row counts outside public, so the coverage policy can tell
  // an empty platform table from one holding data), auto-counters, the
  // logins' shape, the uploaded files and the scheduled jobs.
  'catalog-sql'([outFile]) {
    const cnt = (schemaExpr, nameExpr) =>
      `(xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', ${schemaExpr}, ${nameExpr}), false, true, '')))[1]::text::bigint`
    const sql = `set transaction read only;
select json_build_object(
 'pg', current_setting('server_version'),
 'tables', (select coalesce(json_agg(table_name::text order by table_name), '[]'::json)
    from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'),
 'columns', (select coalesce(json_agg(json_build_object('table', c.table_name, 'column', c.column_name, 'type', c.data_type)
    order by c.table_name, c.ordinal_position), '[]'::json)
    from information_schema.columns c join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'),
 'relations', (select coalesce(json_agg(json_build_object('schema', n.nspname, 'name', c.relname, 'kind', c.relkind::text,
      'rows', case when n.nspname <> 'public' and c.relkind in ('r', 'p') and has_table_privilege(c.oid, 'select')
                   then ${cnt('n.nspname', 'c.relname')} end)
    order by n.nspname, c.relname), '[]'::json)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'm', 'f') and not c.relispartition
      and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname !~ '^pg_(toast|temp)'),
 'large_objects', (select count(*) from pg_largeobject_metadata),
 'sequences', (select coalesce(json_agg(json_build_object('table', c.relname, 'column', a.attname, 'sequence', s.relname)
    order by c.relname, a.attname), '[]'::json)
    from pg_class s join pg_depend d on d.objid = s.oid and d.classid = 'pg_class'::regclass
      and d.refclassid = 'pg_class'::regclass and d.deptype in ('a', 'i')
    join pg_class c on c.oid = d.refobjid join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attnum = d.refobjsubid
    where s.relkind = 'S'),
 'auth', json_build_object(
    'users', (select count(*) from auth.users),
    'providers', (select coalesce(json_object_agg(provider, n), '{}'::json) from (select provider, count(*) n from auth.identities group by 1) x),
    -- A customer's anonymous login (041) is covered by relinking from the
    -- khata link, not by recreating it, so it is not "without an account".
    'without_account', (select coalesce(json_agg(u.id order by u.id), '[]'::json) from auth.users u
       where not exists (select 1 from public.suppliers s where s.id = u.id) and not coalesce(u.is_anonymous, false)),
    'customer_logins', (select count(*) from auth.users u where coalesce(u.is_anonymous, false)
       and not exists (select 1 from public.suppliers s where s.id = u.id)),
    'account_without_login', (select coalesce(json_agg(s.id order by s.id), '[]'::json) from public.suppliers s
       where not exists (select 1 from auth.users u where u.id = s.id)),
    'email_mismatch', (select coalesce(json_agg(s.id order by s.id), '[]'::json) from public.suppliers s join auth.users u on u.id = s.id
       where lower(coalesce(u.email, '')) <> lower(coalesce(s.email, ''))),
    'no_email', (select coalesce(json_agg(s.id order by s.id), '[]'::json) from public.suppliers s where coalesce(s.email, '') = '')),
 'buckets', (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'public', public,
    'file_size_limit', file_size_limit, 'allowed_mime_types', allowed_mime_types) order by id), '[]'::json) from storage.buckets),
 'objects', (select coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name,
    'size', (metadata->>'size')::bigint, 'etag', metadata->>'eTag', 'mimetype', metadata->>'mimetype')
    order by bucket_id, name), '[]'::json) from storage.objects),
 'cron', (select coalesce(json_agg(json_build_object('name', jobname, 'schedule', schedule, 'command', command, 'active', active)
    order by jobname), '[]'::json) from cron.job)
) as data;
`
    fs.writeFileSync(outFile, sql)
    console.log('OK catalog query written')
  },

  catalog([cliOut, outFile]) {
    const cat = cliData(cliOut)
    if (!cat || !Array.isArray(cat.tables)) fail('the table list is missing')
    if (!Array.isArray(cat.relations) || !cat.relations.length) fail('the list of all tables is missing')
    if (!cat.auth || !Array.isArray(cat.buckets) || !Array.isArray(cat.objects) || !Array.isArray(cat.cron)) {
      fail('the catalog is missing the logins, files or scheduled jobs')
    }
    const bad = cat.tables.filter((t) => !SAFE_NAME.test(t))
    if (bad.length) fail('unexpected table names: ' + bad.join(', '))
    const missing = MUST_HAVE.filter((t) => !cat.tables.includes(t))
    if (missing.length) fail('the table list came back without ' + missing.join(', '))
    fs.writeFileSync(outFile, JSON.stringify(cat, null, 1))
    console.log('OK ' + cat.tables.length + ' tables ' + cat.relations.length + ' relations ' + cat.objects.length + ' files')
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

  // Every uploaded file (supplier logos, catalog images, anything a future
  // feature stores), downloaded by its public address - a read, nothing
  // else - checked against the size and checksum storage recorded for it,
  // and written as _file_NNNNNN.bin. A file that cannot be fetched or does
  // not match is a PROBLEM, never skipped quietly.
  async files([catalogFile, dir, baseUrl]) {
    const cat = readJson(catalogFile)
    fs.mkdirSync(dir, { recursive: true })
    const base = String(baseUrl || '').replace(/\/+$/, '')
    if (!/^https?:\/\//.test(base)) fail('the project address is missing')
    const buckets = cat.buckets || []
    const saved = []
    const problems = []
    let n = 0
    for (const o of cat.objects || []) {
      const b = buckets.find((x) => x.id === o.bucket)
      const label = o.bucket + '/' + o.name
      if (!b || !b.public) {
        problems.push(`uploaded file ${label} is in a private bucket, which the backup cannot download yet`)
        continue
      }
      const url = base + '/storage/v1/object/public/' + encodeURIComponent(o.bucket) + '/' + o.name.split('/').map(encodeURIComponent).join('/')
      let buf = null
      let why = ''
      for (const wait of [0, 5000, 20000]) {
        if (wait) await sleep(wait)
        try {
          const r = await fetch(url)
          if (r.ok) {
            buf = Buffer.from(await r.arrayBuffer())
            break
          }
          why = 'HTTP ' + r.status
        } catch (e) {
          why = e.message
        }
      }
      if (!buf) {
        problems.push(`uploaded file ${label} could not be downloaded (${why})`)
        continue
      }
      if (o.size !== null && o.size !== undefined && buf.length !== Number(o.size)) {
        problems.push(`uploaded file ${label} came back as ${buf.length} bytes, storage says ${o.size}`)
        continue
      }
      const etag = String(o.etag || '').replace(/"/g, '').toLowerCase()
      const fileMd5 = crypto.createHash('md5').update(buf).digest('hex')
      if (/^[0-9a-f]{32}$/.test(etag) && etag !== fileMd5) {
        problems.push(`uploaded file ${label} does not match the checksum storage recorded for it`)
        continue
      }
      n++
      const file = '_file_' + String(n).padStart(6, '0') + '.bin'
      fs.writeFileSync(path.join(dir, file), buf)
      saved.push({ bucket: o.bucket, name: o.name, size: buf.length, mimetype: o.mimetype || null, etag, sha256: sha256(buf), file })
    }
    fs.writeFileSync(path.join(dir, '_storage.json'), JSON.stringify({ base_url: base, buckets, objects: saved, problems }, null, 1))
    console.log('OK ' + saved.length + ' files saved ' + problems.length + ' problems')
  },

  // Writes one file per table plus the manifest: what was taken, when, how
  // many rows, the SHA-256 of every file, and the COVERAGE - how every table
  // and data source in the database is protected, and anything that is not.
  split([cliOut, catalogFile, dir, projectRef]) {
    const snap = cliData(cliOut)
    const cat = readJson(catalogFile)
    if (!snap || typeof snap !== 'object') fail('the snapshot is empty')
    if (snap._canary !== CANARY) {
      fail('the encoding check failed - special characters did not survive the export, so nothing was saved')
    }
    fs.mkdirSync(dir, { recursive: true })
    const problems = []
    const notes = []
    const tables = {}
    let total = 0
    const excluded = {}
    for (const t of cat.tables.filter((x) => EXCLUDED[x])) {
      if (t in snap) fail('the snapshot contains the contents of ' + t + ', which must never be backed up')
      excluded[t] = { reason: EXCLUDED[t], rows_in_production: Number(snap['_count_' + t]) }
    }
    const allRows = {}
    for (const t of cat.tables) {
      if (EXCLUDED[t]) continue
      const rows = snap[t]
      if (!Array.isArray(rows)) fail('table ' + t + ' is missing from the snapshot')
      const body = Buffer.from(JSON.stringify(rows, null, 1), 'utf8')
      fs.writeFileSync(path.join(dir, t + '.json'), body)
      tables[t] = { rows: rows.length, bytes: body.length, sha256: sha256(body), category: coverage.categoryOf(t) }
      allRows[t] = rows
      total += rows.length
    }

    // A. Coverage of every table in every schema.
    const cov = coverage.classify(cat, EXCLUDED)
    problems.push(...cov.problems)
    for (const t of Object.keys(tables)) {
      if (!cov.coverage.some((c) => c.schema === 'public' && c.table === t && c.class === 'backed_up')) {
        fail('coverage and the snapshot disagree about table ' + t)
      }
    }

    // D. Logins: every one must be recreatable from this backup alone.
    problems.push(...coverage.loginProblems(cat.auth))

    // B. Uploaded files, fetched by the `files` step into this folder.
    const storagePath = path.join(dir, '_storage.json')
    let storage = null
    if (!fs.existsSync(storagePath)) {
      problems.push('the uploaded files were not backed up (the file step did not run)')
    } else {
      storage = readJson(storagePath)
      problems.push(...storage.problems)
      const kept = new Set(storage.objects.map((o) => o.bucket + '/' + o.name))
      const inProduction = new Set((cat.objects || []).map((o) => o.bucket + '/' + o.name))
      // Every file a record points at must be in the backup.
      for (const [t, rows] of Object.entries(allRows)) {
        for (const row of rows) {
          for (const ref of storageRefs(JSON.stringify(row))) {
            const k = ref.bucket + '/' + ref.name
            if (kept.has(k)) continue
            if (inProduction.has(k)) problems.push(`${t} refers to uploaded file ${k}, which is not in this backup`)
            else notes.push(`${t} refers to uploaded file ${k}, which no longer exists in storage`)
          }
        }
      }
    }

    const extras = {
      '_canary.json': Buffer.from(JSON.stringify({ canary: CANARY }), 'utf8'),
      '_schema.json': Buffer.from(JSON.stringify({ pg: cat.pg, columns: cat.columns }, null, 1), 'utf8'),
      '_cron.json': Buffer.from(JSON.stringify(cat.cron, null, 1), 'utf8'),
    }
    const files = {}
    for (const [name, body] of Object.entries(extras)) {
      fs.writeFileSync(path.join(dir, name), body)
      files[name] = sha256(body)
    }
    if (storage) {
      files['_storage.json'] = sha256(fs.readFileSync(storagePath))
      for (const o of storage.objects) files[o.file] = o.sha256
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
      complete: problems.length === 0,
      problems,
      notes,
      tables,
      files,
      excluded,
      pin_accounts: pinAccounts,
      accounts,
      logins: {
        users: cat.auth.users,
        providers: cat.auth.providers,
        recoverable: accounts.length,
        // Not recreated after a disaster: each customer taps Save on their khata link.
        customer_logins_relinked_by_khata_link: Number(cat.auth.customer_logins || 0),
      },
      storage: storage
        ? { buckets: storage.buckets.map((b) => b.id), files: storage.objects.length, bytes: storage.objects.reduce((s, o) => s + o.size, 0) }
        : null,
      sequences: cat.sequences || [],
      cron_jobs: (cat.cron || []).map((j) => j.name),
      coverage: cov.coverage,
    }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1))
    console.log('OK ' + total + ' rows ' + Object.keys(tables).length + ' tables ' + accounts.length + ' accounts ' +
      (storage ? storage.objects.length : 0) + ' files ' + Object.keys(excluded).length + ' secret tables excluded ' +
      problems.length + ' coverage problems')
  },

  // Re-reads a folder of backup files from disk and checks each against the
  // manifest: the right files, byte-identical, valid JSON, the right number
  // of rows, every uploaded file intact, and no sign of the two ways text has
  // been damaged before.
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
    let fileCount = 0
    if (m.storage) {
      const st = readJson(path.join(dir, '_storage.json'))
      for (const o of st.objects) {
        if (m.files[o.file] !== o.sha256) fail('uploaded file ' + o.bucket + '/' + o.name + ' is not listed with its checksum')
        if (fs.statSync(path.join(dir, o.file)).size !== o.size) fail('uploaded file ' + o.bucket + '/' + o.name + ' has the wrong size')
        fileCount++
      }
      if (fileCount !== m.storage.files) fail('the backup should hold ' + m.storage.files + ' uploaded files, found ' + fileCount)
    }
    if (readJson(path.join(dir, '_canary.json')).canary !== CANARY) fail('the saved encoding check does not match')
    if (total !== m.total_rows) fail('row total ' + total + ' does not match the manifest ' + m.total_rows)
    console.log('OK verified ' + total + ' rows ' + Object.keys(m.tables).length + ' tables ' + fileCount + ' files')
  },

  // For the restore drill: a login row for every account the backup holds,
  // taken from suppliers.json, so the drill covers every account there is -
  // not the ones somebody remembered. (A real recovery uses
  // restore-logins.mjs and the Auth Admin API instead; see DISASTER-RECOVERY.md.)
  'logins-sql'([dir, outFile]) {
    const sq = (s) => (s === null || s === undefined ? 'null' : q(s))
    const sup = readJson(path.join(dir, 'suppliers.json'))
    if (!sup.length) fail('the backup has no accounts')
    const values = sup
      .map((s) => `(${sq(s.id)}::uuid, ${sq(s.email)}, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated')`)
      .join(',\n  ')
    fs.writeFileSync(
      outFile,
      // Only the columns every version of auth.users has: the drill image's
      // login table is older than the hosted one.
      'insert into auth.users (id, email, instance_id, aud, role) values\n  ' + values + '\non conflict (id) do nothing;\n',
    )
    console.log('OK ' + sup.length + ' accounts')
  },

  // For the restore drill's report: which business category each table in
  // the backup belongs to. A table in no category is listed as new or other.
  categories([dir, outFile]) {
    const m = readJson(path.join(dir, 'manifest.json'))
    const out = {}
    for (const t of Object.keys(m.tables)) (out[coverage.categoryOf(t)] = out[coverage.categoryOf(t)] || []).push(t)
    fs.writeFileSync(outFile, JSON.stringify(out))
    console.log('OK ' + Object.keys(out).length + ' categories')
  },

  // For the restore drill: SQL that compares the restored database with what
  // the backup says it holds. For EVERY table: the row count and every
  // column of every row, compared as typed values. Plus the exact set of row
  // ids, names character for character, the money totals, the app's
  // integrity rules, the scheduled jobs, the auto-counters and the two
  // excluded secrets. Each check prints check|ok|expected|actual.
  'expect-sql'([dir, outFile]) {
    const m = readJson(path.join(dir, 'manifest.json'))
    const schema = readJson(path.join(dir, '_schema.json'))
    const checks = []
    const add = (name, expected, actualSql) =>
      checks.push(`select ${q(name)}, coalesce((${actualSql})::text, '') = ${q(expected)}, ${q(expected)}, coalesce((${actualSql})::text, '')`)

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

    // Which phone holds which customer's account (041). The logins behind
    // these rows are anonymous and are not recreated, so the rows come back
    // only where their login exists - in a drill, none. What must come back
    // is every linked customer with the same khata link, so Save relinks.
    const RELINKED = new Set(['customer_accounts', 'customer_connections'])
    if (m.tables.customer_connections) {
      const conns = readJson(path.join(dir, 'customer_connections.json'))
      const customers = readJson(path.join(dir, 'customers.json'))
      const linked = customers.filter((c) => conns.some((x) => x.customer_id === c.id && !x.revoked_at) && c.khata_token)
      add('customer_connections - no device link restored without its login', 0,
        'select count(*) from public.customer_connections cc where not exists (select 1 from auth.users u where u.id = cc.user_id)')
      if (linked.length) {
        const v = linked.map((c) => `(${q(c.id)}::uuid, ${q(c.khata_token)})`).join(',')
        add('customer_connections - every linked customer restored with the same khata link', linked.length,
          `select count(*) from (values ${v}) v(id, tok) join public.customers c on c.id = v.id and c.khata_token = v.tok`)
      }
    }

    for (const [t, info] of Object.entries(m.tables)) {
      if (RELINKED.has(t)) continue
      add(`rows ${t}`, info.rows, `select count(*) from public."${t}"`)
      const rows = readJson(path.join(dir, t + '.json'))
      if (rows.length) {
        // C. Every column of every row. Both sides are typed by Postgres and
        // compared as jsonb, so formatting cannot matter; columns a later
        // migration added (not in this backup) are left out of both sides.
        const backupCols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
        const extraCols = `array(select column_name::text from information_schema.columns where table_schema = 'public' ` +
          `and table_name = ${q(t)} and column_name <> all (${q('{' + backupCols.join(',') + '}')}::text[]))`
        const b = `select to_jsonb(r) - ${extraCols} as j from jsonb_populate_recordset(null::public."${t}", ${q(JSON.stringify(rows))}::jsonb) r`
        const d = `select to_jsonb(x) - ${extraCols} as j from public."${t}" x`
        add(`every value ${t} (rows differing)`, 0,
          `select (select count(*) from (${b} except all ${d}) p) + (select count(*) from (${d} except all ${b}) q)`)
      }
      if (!rows.length || !rows.every((r) => r.id !== undefined && r.id !== null)) continue
      add(`ids ${t}`, md5(rows.map((r) => String(r.id)).sort().join(',')),
        `select md5(coalesce(string_agg(id::text, ',' order by id::text collate "C"), '')) from public."${t}"`)
      const sorted = [...rows].sort(byId)
      for (const col of ['name', 'business_name', 'invoice_no', 'site', 'phone', 'address']) {
        if (!rows.some((r) => col in r)) continue
        const joined = sorted.map((r) => (r[col] === null || r[col] === undefined ? '' : String(r[col]))).join('|')
        add(`text ${t}.${col}`, md5(joined),
          `select md5(coalesce(string_agg(coalesce(${col}::text, ''), '|' order by id::text collate "C"), '')) from public."${t}"`)
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
    add('integrity: every bill paid equals its allocations', 0,
      'select count(*) from (select i.id from public.invoices i left join public.payment_allocations pa ' +
        'on pa.invoice_id = i.id and pa.released_at is null group by i.id, i.paid having coalesce(sum(pa.amount), 0) <> i.paid) x')
    add('integrity: converted estimates point at a real bill', 0,
      'select count(*) from public.quotations q where q.converted_invoice_id is not null ' +
        'and not exists (select 1 from public.invoices i where i.id = q.converted_invoice_id)')
    add('integrity: no cross-supplier payments', 0,
      'select count(*) from public.payments p join public.invoices i on i.id = p.invoice_id where p.supplier_id <> i.supplier_id')
    add('integrity: no cross-supplier bills', 0,
      'select count(*) from public.invoices i join public.customers c on c.id = i.customer_id where c.supplier_id <> i.supplier_id')
    add('integrity: no app trigger left switched off', 0,
      "select count(*) from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace " +
        "where n.nspname = 'public' and not tg.tgisinternal and tg.tgenabled = 'D'")
    add('logins: every account has its login row', m.accounts.length, 'select count(*) from public.suppliers s join auth.users u on u.id = s.id')

    // E. Auto-counters: after a restore, the next number each one hands out
    // must be above every number already in its column, or the first new
    // record would collide with a restored one.
    add('auto-counters: every counter is ahead of the restored data', 0,
      // MATERIALIZED: the app's tables are chosen first, and only then is
      // each one queried - otherwise Postgres may run the lookup on other
      // schemas' tables before the filter applies.
      `with x as materialized (
        select c.relname as tbl, a.attname as col, s.oid::regclass::text as seq
        from pg_class s join pg_depend d on d.objid = s.oid and d.classid = 'pg_class'::regclass
          and d.refclassid = 'pg_class'::regclass and d.deptype in ('a', 'i')
        join pg_class c on c.oid = d.refobjid join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
        join pg_attribute a on a.attrelid = c.oid and a.attnum = d.refobjsubid
        where s.relkind = 'S')
       select count(*) from x where coalesce((xpath('/row/m/text()', query_to_xml(format('select max(%I)::bigint as m from public.%I', x.col, x.tbl), false, true, '')))[1]::text::bigint, 0)
          >= (xpath('/row/n/text()', query_to_xml(format('select case when is_called then last_value + 1 else last_value end as n from %s', x.seq), false, true, '')))[1]::text::bigint`)

    // Scheduled jobs: every job production had is recreated by the migrations.
    const cron = fs.existsSync(path.join(dir, '_cron.json')) ? readJson(path.join(dir, '_cron.json')) : []
    if (cron.length) {
      const v = cron.map((j) => `(${q(j.name)}, ${q(j.schedule)}, ${q(j.command)})`).join(',')
      add('scheduled jobs: every production job is recreated', 0,
        `select count(*) from (values ${v}) v(name, schedule, command) where not exists ` +
          '(select 1 from cron.job j where j.jobname = v.name and j.schedule = v.schedule and j.command = v.command)')
    }

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

    // The relink itself, on the restored copy: a brand-new customer login
    // (not the backed-up one) taps Save on a restored khata link and gets
    // exactly that customer's account; a second customer's login cannot read
    // it; a wrong code connects nothing. Run last, inside a transaction that
    // is rolled back, so nothing above is affected. Only once production has
    // customer accounts (the backup carries customer_connections).
    let probe = ''
    if (m.tables.customer_connections) {
      const customers = readJson(path.join(dir, 'customers.json'))
      const suppliers = readJson(path.join(dir, 'suppliers.json'))
      const active = new Set(suppliers.filter((s) => s.status === 'active').map((s) => s.id))
      const withLink = customers.filter((c) => c.khata_token && active.has(c.supplier_id)).sort(byId)
      if (withLink.length) {
        const x = withLink[0]
        const y = withLink.find((c) => c.id !== x.id)
        const oldIds = readJson(path.join(dir, 'customer_connections.json')).map((c) => c.id)
        const A = '00000000-0000-4000-8000-0000000000a1', Bu = '00000000-0000-4000-8000-0000000000b2'
        const as = (u) => `set local role authenticated;\nset local request.jwt.claim.sub = ${q(u)};\n` +
          `set local request.jwt.claims = ${q(JSON.stringify({ sub: u, role: 'authenticated' }))};\n`
        const line = (name, cond, expected, actual) => `select ${q(name)}, (${cond}), ${q(expected)}, (${actual})::text;\n`
        probe += 'begin;\n'
        probe += `insert into auth.users (id, instance_id, aud, role) values (${q(A)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), ` +
          `(${q(Bu)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');\n`
        probe += as(A)
        probe += `select coalesce(public.connect_khata(${q(x.khata_token)}) ->> 'connection', '') as relink_a \\gset\n`
        probe += line('relink customer_connections - Save on a restored khata link makes a new connection', `:'relink_a' <> ''`, 'true', `:'relink_a' <> ''`)
        probe += line('relink customer_connections - the old login and its connection were not needed',
          `:'relink_a' <> all (${q('{' + oldIds.join(',') + '}')}::text[])`, 'true', `:'relink_a' <> all (${q('{' + oldIds.join(',') + '}')}::text[])`)
        probe += line("relink customer_accounts - the new account reads exactly that customer's khata",
          `public.my_khata(nullif(:'relink_a', '')::uuid) = public.customer_khata(${q(x.khata_token)})`, 'true',
          `public.my_khata(nullif(:'relink_a', '')::uuid) = public.customer_khata(${q(x.khata_token)})`)
        probe += line('relink customer_accounts - the new account holds that one shop and no other', `jsonb_array_length(public.my_shops()) = 1`, '1', `jsonb_array_length(public.my_shops())`)
        probe += line('relink customer_connections - a wrong code connects nothing', `(public.connect_khata(md5('not a khata link')) ->> 'ok') = 'false'`, 'false',
          `public.connect_khata(md5('not a khata link')) ->> 'ok'`)
        probe += 'reset role;\n' + as(Bu)
        if (y) probe += `select public.connect_khata(${q(y.khata_token)}) is not null as _b \\gset\n`
        probe += line("relink customer_accounts - another customer's login cannot read that khata",
          `(public.my_khata(nullif(:'relink_a', '')::uuid) ->> 'found') = 'false'`, 'false', `public.my_khata(nullif(:'relink_a', '')::uuid) ->> 'found'`)
        probe += line("relink customer_accounts - another customer's login cannot open its documents",
          `(public.my_khata_document(nullif(:'relink_a', '')::uuid, 'bill', 'INV-1001') ->> 'found') = 'false'`, 'false',
          `public.my_khata_document(nullif(:'relink_a', '')::uuid, 'bill', 'INV-1001') ->> 'found'`)
        probe += 'rollback;\n'
      }
    }

    const sql = "\\pset format unaligned\n\\pset tuples_only on\n\\pset fieldsep '|'\n" + schemaSql + checks.join(';\n') + ';\n' + probe
    fs.writeFileSync(outFile, sql)
    console.log('OK ' + (checks.length + 1) + ' checks')
  },
}

const [cmd, ...args] = process.argv.slice(2)
if (!commands[cmd]) fail('usage: node backup-tool.js <' + Object.keys(commands).join('|') + '> ...')
Promise.resolve()
  .then(() => commands[cmd](args))
  .catch((e) => fail(e.message))
