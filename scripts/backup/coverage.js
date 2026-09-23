// Backup coverage policy: for EVERY table in EVERY schema of the database,
// how is it protected? Anything this file cannot account for is a PROBLEM,
// and a backup with a problem is saved but marked INCOMPLETE, recorded as
// such, and raised by the health check - never reported as a clean success.
//
// The rules, in order:
//   public schema     every base table is backed up automatically - including
//                     any table a future migration adds - except the two
//                     security secrets in EXCLUDED (backup-tool.js)
//   auth              users + identities -> login recovery (restore-logins.mjs);
//                     short-lived session/token/log tables -> not needed;
//                     ANY other auth table must be empty (passkeys, SSO, MFA,
//                     OAuth clients... cannot be recreated by login recovery)
//   storage           buckets + objects -> the uploaded-file backup;
//                     upload bookkeeping -> not needed; anything else empty
//   cron              job -> saved in the backup and compared by the drill;
//                     job_run_details -> run logs, not needed
//   vault             secrets must be empty (a secret cannot be backed up)
//   other Supabase    platform plumbing: known transient tables are fine,
//   platform schemas  anything else must be empty
//   ANY OTHER schema  a problem, even if empty: a module being built outside
//                     `public` would otherwise never be backed up
//   foreign tables,   a problem: the data lives outside this database
//   large objects
//
// Written to be read by a person deciding a new case: add the table to the
// right list below WITH the reason, never to make a warning go away.
'use strict'

const PLATFORM_SCHEMAS = new Set([
  'auth', 'storage', 'realtime', '_realtime', 'vault', 'cron', 'extensions', 'graphql', 'graphql_public',
  'pgbouncer', 'pgsodium', 'pgsodium_masks', 'net', 'supabase_functions', 'supabase_migrations', '_analytics',
])

// Tables that hold nothing a restore needs: sessions, one-time tokens,
// rate-limit and audit logs, migration bookkeeping, upload scratch space.
const TRANSIENT = {
  auth: ['audit_log_entries', 'flow_state', 'instances', 'mfa_amr_claims', 'mfa_challenges', 'one_time_tokens',
    'refresh_tokens', 'saml_relay_states', 'schema_migrations', 'sessions', 'webauthn_challenges',
    'oauth_authorizations', 'oauth_client_states'],
  storage: ['migrations', 's3_multipart_uploads', 's3_multipart_uploads_parts', 'prefixes'],
  realtime: ['messages', 'schema_migrations', 'subscription'],
  cron: ['job_run_details'],
  net: ['_http_response', 'http_request_queue'],
  supabase_functions: ['hooks', 'migrations'],
  supabase_migrations: ['schema_migrations', 'seed_files'],
}

const HANDLED = {
  'auth.users': 'logins: recreated with their original ids by restore-logins.mjs (no passwords are stored)',
  'auth.identities': 'logins: which sign-in method each account uses; checked every backup',
  'storage.buckets': 'uploaded files: bucket settings saved in _storage.json',
  'storage.objects': 'uploaded files: every file downloaded into the backup and fingerprinted',
  'cron.job': 'scheduled jobs: saved in _cron.json; the drill checks the migrations recreate every one',
}

// Tables every backup categorises for the restore drill's summary. A table
// that is in no category is reported as "new or other", never hidden.
const CATEGORIES = [
  ['Admin, suppliers and settings', ['suppliers', 'platform_settings']],
  ['Customers', ['customers']],
  ['Bills and invoices', ['invoices', 'invoice_items']],
  ['Payments', ['payments', 'payment_allocations']],
  ['Estimates', ['quotations', 'quotation_items']],
  ['Customer orders and requests', ['order_requests', 'order_request_clients', 'order_blocked_phones']],
  ['Drivers and deliveries', ['drivers']],
  ['Materials and stock', ['materials', 'stock_logs']],
  ['Material catalog', ['material_categories', 'material_types', 'brands', 'master_material_variants']],
  ['Activity and safety logs', ['activity_log', 'client_requests']],
]

function categoryOf(table) {
  for (const [name, tables] of CATEGORIES) if (tables.includes(table)) return name
  return 'New or other tables'
}

// cat: the catalog read from the live database. excluded: EXCLUDED map.
// Returns { coverage: [...every relation with its class...], problems: [...] }.
function classify(cat, excluded) {
  const coverage = []
  const problems = []
  const add = (r, cls, reason) => coverage.push({ schema: r.schema, table: r.name, kind: r.kind, rows: r.rows, class: cls, reason })
  const needEmpty = (r, what) => {
    if (r.rows === null || r.rows === undefined) {
      add(r, 'problem', 'cannot be read to confirm it is empty')
      problems.push(`${r.schema}.${r.name} could not be checked (no read access) - ${what}`)
    } else if (Number(r.rows) > 0) {
      add(r, 'problem', what)
      problems.push(`${r.schema}.${r.name} holds ${r.rows} row(s) that no backup covers - ${what}`)
    } else {
      add(r, 'empty', 'must stay empty - checked: empty')
    }
  }

  for (const r of cat.relations) {
    const key = r.schema + '.' + r.name
    if (r.kind === 'f') {
      add(r, 'problem', 'foreign table - its data lives outside this database')
      problems.push(`${key} is a foreign table: its data lives outside the database and is not backed up`)
      continue
    }
    if (r.schema === 'public') {
      if (r.kind === 'm') { add(r, 'derived', 'materialised view - recreated by the migrations, refreshed after a restore'); continue }
      if (excluded[r.name]) { add(r, 'excluded', 'deliberate security exclusion'); continue }
      add(r, 'backed_up', 'app data - in every backup')
      continue
    }
    if (HANDLED[key]) { add(r, 'handled', HANDLED[key]); continue }
    if (!PLATFORM_SCHEMAS.has(r.schema)) {
      add(r, 'problem', 'outside the public schema - not backed up')
      problems.push(`${key} is in schema "${r.schema}", which no backup covers - app data belongs in public`)
      continue
    }
    if ((TRANSIENT[r.schema] || []).includes(r.name)) { add(r, 'transient', 'platform bookkeeping - nothing a restore needs'); continue }
    if (r.schema === 'vault') { needEmpty(r, 'the vault holds secrets, which a backup cannot carry'); continue }
    if (r.schema === 'auth') { needEmpty(r, 'a login feature (passkeys, SSO, MFA, OAuth) that login recovery cannot recreate'); continue }
    needEmpty(r, 'a platform table not known to hold nothing of value')
  }

  if (Number(cat.large_objects) > 0) problems.push(`the database holds ${cat.large_objects} large object(s), which no backup covers`)
  return { coverage, problems }
}

// Login coverage: every login must be recreatable from the backup alone.
function loginProblems(auth) {
  const p = []
  if (!auth) return ['the login summary is missing from the catalog']
  if (auth.without_account.length) p.push(`${auth.without_account.length} login(s) have no account row, so login recovery would not recreate them: ${auth.without_account.join(', ')}`)
  if (auth.account_without_login.length) p.push(`${auth.account_without_login.length} account(s) have no login: ${auth.account_without_login.join(', ')}`)
  if (auth.email_mismatch.length) p.push(`${auth.email_mismatch.length} login email(s) differ from the account's email, so recovery would recreate the wrong address: ${auth.email_mismatch.join(', ')}`)
  if (auth.no_email.length) p.push(`${auth.no_email.length} account(s) have no email to recreate a login with: ${auth.no_email.join(', ')}`)
  const other = Object.keys(auth.providers || {}).filter((k) => k !== 'email')
  if (other.length) p.push(`sign-in methods other than email are in use (${other.join(', ')}); login recovery recreates email logins only`)
  // Two-factor settings, passkeys and SSO are caught by classify(): every
  // auth table not known to be transient must be empty.
  return p
}

module.exports = { classify, loginProblems, categoryOf, CATEGORIES, PLATFORM_SCHEMAS }
