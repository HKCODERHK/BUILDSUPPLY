// Puts every uploaded file from a backup back into Supabase Storage after a
// disaster: supplier logos, catalog images, and anything a future feature
// uploads. Run it after restore-logins.mjs and the data restore.
//
//   set SUPABASE_SERVICE_ROLE_KEY=<the NEW project's service_role key>
//   node restore-files.mjs --backup <unzipped backup folder> --url https://<new-ref>.supabase.co
//   node restore-files.mjs --backup <folder> --url https://<new-ref>.supabase.co --apply
//
// Without --apply it only reports what it would do. Nothing is changed.
//
// Safety:
//   - It only CREATES buckets and files that are missing. An existing file is
//     never overwritten, replaced or deleted - it is compared and reported.
//   - Every file is checked against the SHA-256 the backup recorded before it
//     is uploaded, and downloaded again afterwards to prove it arrived intact.
//   - It refuses the live project unless --allow-live-project is given.
//   - The service key is read from the environment, never from the command
//     line, so it does not end up in shell history.
//
// Afterwards, generate the data restore with
//   restore-from-backup.mjs <folder> --storage-url https://<new-ref>.supabase.co
// so that every stored link to a file points at the new project.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const LIVE_REF = 'pefarymejlfdsmwusbbq'
const args = process.argv.slice(2)
const opt = (name) => (args.indexOf(name) === -1 ? null : args[args.indexOf(name) + 1])
const flag = (name) => args.includes(name)
const backup = opt('--backup')
const url = (opt('--url') || '').replace(/\/+$/, '')
const apply = flag('--apply')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

function stop(msg) {
  console.error('\nSTOPPED: ' + msg + '\n')
  process.exit(1)
}
if (!backup || !url) stop('usage: node restore-files.mjs --backup <folder> --url https://<ref>.supabase.co [--apply]')
if (!key) stop('set SUPABASE_SERVICE_ROLE_KEY to the service_role key of the project you are restoring into')
if (url.includes(LIVE_REF) && !flag('--allow-live-project')) {
  stop('that is the LIVE project. After a disaster, files go into a NEW project. ' +
    'If you really mean the live one (it survived but lost its files), add --allow-live-project. Existing files are never touched.')
}
const stPath = path.join(backup, '_storage.json')
if (!fs.existsSync(stPath)) stop('no _storage.json in ' + backup + ' - this backup predates the file backup, or the folder is wrong')
const st = JSON.parse(fs.readFileSync(stPath, 'utf8'))
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex')
const headers = { apikey: key, Authorization: `Bearer ${key}` }
const enc = (name) => name.split('/').map(encodeURIComponent).join('/')

async function download(bucket, name) {
  const r = await fetch(`${url}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${enc(name)}`, { headers })
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null
}

console.log(`\n${apply ? 'RESTORING FILES' : 'DRY RUN - nothing will be changed. Add --apply to do it.'}`)
console.log(`project : ${url}`)
console.log(`backup  : ${path.resolve(backup)} (${st.buckets.length} bucket(s), ${st.objects.length} file(s))\n`)

const lines = []
let failed = 0
for (const b of st.buckets) {
  const r = await fetch(`${url}/storage/v1/bucket/${encodeURIComponent(b.id)}`, { headers })
  if (r.status === 401 || r.status === 403) stop('the service key was refused (' + r.status + ')')
  if (r.ok) {
    lines.push(`bucket ${b.id}: already exists - left as it is`)
    continue
  }
  if (!apply) {
    lines.push(`bucket ${b.id}: would be created (${b.public ? 'public' : 'private'})`)
    continue
  }
  const c = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: b.id, name: b.name, public: b.public, file_size_limit: b.file_size_limit, allowed_mime_types: b.allowed_mime_types }),
  })
  if (c.ok) lines.push(`bucket ${b.id}: created (${b.public ? 'public' : 'private'})`)
  else {
    failed++
    lines.push(`bucket ${b.id}: FAILED to create (${c.status}) ${(await c.text()).slice(0, 120)}`)
  }
}
for (const o of st.objects) {
  const label = `${o.bucket}/${o.name}`
  const body = fs.readFileSync(path.join(backup, o.file))
  if (sha256(body) !== o.sha256) {
    failed++
    lines.push(`${label}: FAILED - the backup copy does not match its checksum; not uploaded`)
    continue
  }
  const existing = await download(o.bucket, o.name)
  if (existing) {
    lines.push(`${label}: already exists - ${sha256(existing) === o.sha256 ? 'identical' : 'DIFFERENT content, left untouched (never overwritten)'}`)
    continue
  }
  if (!apply) {
    lines.push(`${label}: would be uploaded (${o.size} bytes)`)
    continue
  }
  const up = await fetch(`${url}/storage/v1/object/${encodeURIComponent(o.bucket)}/${enc(o.name)}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': o.mimetype || 'application/octet-stream', 'x-upsert': 'false' },
    body,
  })
  if (!up.ok) {
    failed++
    lines.push(`${label}: FAILED to upload (${up.status}) ${(await up.text()).slice(0, 120)}`)
    continue
  }
  const back = await download(o.bucket, o.name)
  if (back && sha256(back) === o.sha256) lines.push(`${label}: uploaded and verified`)
  else {
    failed++
    lines.push(`${label}: FAILED - uploaded, but what came back does not match`)
  }
}
for (const l of lines) console.log('  ' + l)
console.log(`\n${failed ? failed + ' FAILED - fix and run again (restored files are skipped next time).' : 'Done.'}\n`)
// exitCode rather than process.exit(): on Windows, exiting while fetch still
// holds a connection open crashes Node (0xC0000409) after the work is done.
process.exitCode = failed ? 1 : 0
