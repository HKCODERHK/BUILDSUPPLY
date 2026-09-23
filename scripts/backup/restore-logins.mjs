// Recreates every BuildSupply login after a disaster, with its ORIGINAL id,
// so the restored business data (which points at those ids) belongs to the
// right account again. Run it BEFORE restore-from-backup.mjs.
//
//   set SUPABASE_SERVICE_ROLE_KEY=<the NEW project's service_role key>
//   node restore-logins.mjs --backup <unzipped backup folder> --url https://<new-ref>.supabase.co
//   node restore-logins.mjs --backup <folder> --url https://<new-ref>.supabase.co --apply
//
// Without --apply it only reports what it would do. Nothing is changed.
//
// Why this works without password hashes: the Auth Admin API accepts the id
// to use for a new user (tested 2026-09-23 on the local Supabase: the id was
// honoured, the account signed in under it, and a second create with the same
// id was refused). So the backups never carry password hashes - a stolen
// backup is not an offline password-cracking target - and after a disaster
// each supplier simply gets a new temporary password from the admin, the same
// way the admin panel's Reset Password already works.
//
// Safety:
//   - It only CREATES accounts that do not exist. An existing account is
//     never changed, reset, banned or deleted - it is reported and skipped.
//   - It refuses the live project unless --allow-live-project is given, since
//     after a real disaster the logins are recreated in a NEW project.
//   - The service key is read from the environment, never from the command
//     line, so it does not end up in shell history.
//   - Temporary passwords are printed once, to this window only. Nothing is
//     written to disk.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const LIVE_REF = 'pefarymejlfdsmwusbbq'
const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}
const flag = (name) => args.includes(name)

const backup = opt('--backup')
const url = (opt('--url') || '').replace(/\/+$/, '')
const apply = flag('--apply')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

function stop(msg) {
  console.error('\nSTOPPED: ' + msg + '\n')
  process.exit(1)
}
if (!backup || !url) stop('usage: node restore-logins.mjs --backup <folder> --url https://<ref>.supabase.co [--apply]')
if (!key) stop('set SUPABASE_SERVICE_ROLE_KEY to the service_role key of the project you are restoring into')
if (url.includes(LIVE_REF) && !flag('--allow-live-project')) {
  stop('that is the LIVE project. After a disaster, logins are recreated in a NEW project. ' +
    'If you really mean the live one (for example it survived but lost its logins), add --allow-live-project. ' +
    'Even then, existing accounts are never touched.')
}
const supFile = path.join(backup, 'suppliers.json')
if (!fs.existsSync(supFile)) stop('no suppliers.json in ' + backup + ' - point --backup at an unzipped backup folder')
const suppliers = JSON.parse(fs.readFileSync(supFile, 'utf8'))
if (!suppliers.length) stop('the backup has no accounts')

// The same alphabet as the admin panel's generated passwords: no O/0/I/l/1,
// because the admin reads them out and the supplier types them on a phone.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const tempPassword = () => Array.from({ length: 14 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('')

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
async function api(method, p, body) {
  const r = await fetch(`${url}/auth/v1${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let json = null
  try {
    json = await r.json()
  } catch {}
  return { status: r.status, json }
}

console.log(`\n${apply ? 'RECREATING' : 'DRY RUN - nothing will be changed. Add --apply to do it.'}`)
console.log(`project : ${url}`)
console.log(`backup  : ${path.resolve(backup)} (${suppliers.length} accounts)\n`)

const results = []
for (const s of suppliers) {
  const who = `${s.business_name} <${s.email}>`
  if (!s.email) {
    results.push({ who, outcome: 'SKIPPED - no email in the backup; recreate this one by hand' })
    continue
  }
  const existing = await api('GET', `/admin/users/${s.id}`)
  if (existing.status === 200) {
    results.push({ who, outcome: 'already exists - left untouched' })
    continue
  }
  if (existing.status === 401 || existing.status === 403) stop('the service key was refused (' + existing.status + ')')
  // Only a clear "not found" means the account is missing. Anything else -
  // an error, a timeout, a half-readable row - means we do not know, and a
  // create on top of an account that is really there is never attempted.
  if (existing.status !== 404) {
    results.push({ who, outcome: `FAILED - could not tell whether it exists (${existing.status}); nothing was done to it` })
    continue
  }
  // A suspended or deactivated supplier comes back banned, as the admin panel
  // leaves them (the same ban the Edge Function applies).
  const banned = s.status === 'suspended' || s.status === 'inactive'
  if (!apply) {
    results.push({ who, outcome: `would be created with id ${s.id}${banned ? ', then banned (' + s.status + ')' : ''}` })
    continue
  }
  const password = tempPassword()
  const created = await api('POST', '/admin/users', { id: s.id, email: s.email, password, email_confirm: true })
  if (created.status !== 200 || !created.json || created.json.id !== s.id) {
    results.push({ who, outcome: `FAILED (${created.status}): ${JSON.stringify(created.json).slice(0, 160)}` })
    continue
  }
  let outcome = `created with its original id - temporary password: ${password}`
  if (banned) {
    const b = await api('PUT', `/admin/users/${s.id}`, { ban_duration: '876000h' })
    outcome += b.status === 200 ? ` - banned again (${s.status})` : ` - BAN FAILED (${b.status}), ban it from the admin panel`
  }
  results.push({ who, outcome })
}

for (const r of results) console.log(`  ${r.who}\n      ${r.outcome}`)
const failed = results.filter((r) => r.outcome.startsWith('FAILED')).length
console.log(`\n${failed ? failed + ' FAILED - fix and run again (created accounts are skipped next time).' : 'Done.'}`)
const createdCount = results.filter((r) => r.outcome.startsWith('created')).length
if (apply && !failed && createdCount) {
  console.log('Next: restore the data (restore-from-backup.mjs), then send each supplier their temporary password')
  console.log('on WhatsApp and ask them to change it in Settings. These passwords are not saved anywhere.\n')
}
// exitCode rather than process.exit(): on Windows, exiting while fetch still
// holds a connection open crashes Node (0xC0000409) after the work is done.
process.exitCode = failed ? 1 : 0
