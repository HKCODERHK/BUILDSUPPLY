// Supabase Edge Function — the only place the service_role key is used.
// Handles the supplier-account operations that require privileged Auth Admin
// API access: creating a login, resetting a password, banning/unbanning
// login, and deleting an account outright. Everything else (status labels, subscription
// dates, business info) is a normal RLS-protected table update done
// directly from the frontend as the signed-in admin.
//
// Deploy: supabase functions deploy admin-manage-supplier

import { createClient } from 'jsr:@supabase/supabase-js@2'

// Which web pages may call this function from a browser (F6, Phase 2 audit).
// It used to answer `*` - any site. Not exploitable, since the caller's login
// travels as a bearer token rather than a cookie, but broader than the app
// needs. Allowed: the live site, this project's own Vercel previews, and a
// local dev server. ALLOWED_ORIGINS (comma-separated, set as a function
// secret) adds more - the custom domain, once one is bought.
const EXTRA_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
function originAllowed(origin: string | null): boolean {
  if (!origin) return false
  return (
    origin === 'https://buildsupplyin.vercel.app' ||
    EXTRA_ORIGINS.includes(origin) ||
    /^https:\/\/buildsupplyin-[a-z0-9-]+-hkcoderhk\.vercel\.app$/.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?$/.test(origin)
  )
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  }
  if (originAllowed(origin)) corsHeaders['Access-Control-Allow-Origin'] = origin!

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  // F5 (Phase 2 audit): the raw error text of an upstream service - a
  // database constraint name, an internal Auth message - goes to the function
  // log, never back to the browser. The admin gets a plain sentence.
  const fail = (publicMessage: string, status: number, detail?: unknown) => {
    if (detail !== undefined) console.error(publicMessage, '|', detail instanceof Error ? detail.message : JSON.stringify(detail))
    return json({ error: publicMessage }, status)
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRoleKey

  // Resolve the caller's identity with a direct call to the Auth REST API —
  // bypasses any ambiguity in how the SDK's client-side session state
  // interacts with a manually-supplied JWT.
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` },
  })
  if (!userRes.ok) {
    const body = await userRes.text()
    console.log('diag: /auth/v1/user failed', userRes.status, body)
    return json({ error: 'Invalid session' }, 401)
  }
  const caller = await userRes.json()
  if (!caller?.id) return json({ error: 'Invalid session' }, 401)

  // Privileged client — never exposed to the browser, only used server-side here.
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: callerProfile } = await adminClient
    .from('suppliers')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.role !== 'admin') {
    return json({ error: 'Admin role required' }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const action = body.action as string

  /**
   * Resolves the row an action names, and refuses anything that is not this
   * platform's own supplier.
   *
   * `delete_supplier` has always done this. `reset_password` and `set_ban`
   * did not: they passed the id straight to the Auth Admin API, which acts on
   * **any** auth user — another admin's login included, and any auth account
   * that has no supplier profile at all. With one admin that was unreachable;
   * with two it is one admin taking the other's account, and the moment
   * logins can exist without a supplier profile it is wider still. Found in
   * the Phase 2 audit, 2026-09-22.
   */
  async function requireSupplierTarget(id: unknown) {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return { error: json({ error: 'supplier_id must be a supplier id' }, 400) }
    }
    const { data: target } = await adminClient
      .from('suppliers')
      .select('id, business_name, role')
      .eq('id', id)
      .single()
    if (!target) return { error: json({ error: 'Supplier not found' }, 404) }
    if (target.role === 'admin') {
      return { error: json({ error: 'Admin accounts cannot be changed here.' }, 403) }
    }
    return { target }
  }

  try {
    if (action === 'create_supplier') {
      const {
        email, password, business_name, owner_name, phone, address,
        plan, subscription_start, subscription_expiry,
      } = body as Record<string, string>

      if (!email || !password || !business_name) {
        return json({ error: 'email, password and business_name are required' }, 400)
      }

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (createError || !created.user) {
        const msg = createError?.message ?? ''
        if (/already (been )?registered|already exists/i.test(msg)) {
          return fail('An account with this email already exists.', 400, createError)
        }
        // A password rule refusal is about what the admin typed, so it is
        // shown as Auth worded it ("Password should be at least ...").
        if (/password/i.test(msg)) return fail(msg, 400)
        return fail('Could not create the login. Nothing was saved.', 400, createError)
      }

      const { error: insertError } = await adminClient.from('suppliers').insert({
        id: created.user.id,
        business_name,
        owner_name: owner_name || null,
        email,
        phone: phone || null,
        address: address || null,
        role: 'supplier',
        status: 'active',
        plan: plan || 'starter',
        subscription_start: subscription_start || null,
        subscription_expiry: subscription_expiry || null,
      })

      if (insertError) {
        // Roll back the auth user so we don't leave an orphaned login.
        const { error: rollbackError } = await adminClient.auth.admin.deleteUser(created.user.id)
        if (rollbackError) {
          return fail(`Could not save the supplier, and the new login for ${email} could not be removed again - ` +
            'remove it under Authentication in the Supabase dashboard.', 500, { insertError, rollbackError })
        }
        return fail('Could not save the supplier. The new login was removed again, so nothing was saved.', 400, insertError)
      }

      await adminClient.from('activity_log').insert({
        actor_id: caller.id,
        actor_role: 'admin',
        supplier_id: created.user.id,
        action: 'supplier_created',
        details: { business_name },
      })

      return json({ id: created.user.id })
    }

    if (action === 'reset_password') {
      const { supplier_id, new_password } = body as Record<string, string>
      if (!supplier_id || !new_password) {
        return json({ error: 'supplier_id and new_password are required' }, 400)
      }

      const checked = await requireSupplierTarget(supplier_id)
      if (checked.error) return checked.error

      const { error } = await adminClient.auth.admin.updateUserById(supplier_id, {
        password: new_password,
      })
      if (error) {
        if (/password/i.test(error.message)) return fail(error.message, 400)
        return fail('Could not reset the password. It is unchanged.', 400, error)
      }

      await adminClient.from('activity_log').insert({
        actor_id: caller.id,
        actor_role: 'admin',
        supplier_id,
        action: 'supplier_password_reset',
      })

      return json({ ok: true })
    }

    if (action === 'set_ban') {
      const { supplier_id, banned } = body as Record<string, unknown>
      if (!supplier_id) return json({ error: 'supplier_id is required' }, 400)

      const checked = await requireSupplierTarget(supplier_id)
      if (checked.error) return checked.error

      const { error } = await adminClient.auth.admin.updateUserById(supplier_id as string, {
        ban_duration: banned ? '876000h' : 'none',
      })
      if (error) return fail(banned ? 'Could not block the login. It is unchanged.' : 'Could not unblock the login. It is unchanged.', 400, error)

      await adminClient.from('activity_log').insert({
        actor_id: caller.id,
        actor_role: 'admin',
        supplier_id,
        action: banned ? 'supplier_banned' : 'supplier_unbanned',
      })

      return json({ ok: true })
    }

    if (action === 'delete_supplier') {
      const { supplier_id, confirm_name } = body as Record<string, string>
      if (!supplier_id || !confirm_name) {
        return json({ error: 'supplier_id and confirm_name are required' }, 400)
      }

      const { data: target } = await adminClient
        .from('suppliers')
        .select('id, business_name, role')
        .eq('id', supplier_id)
        .single()

      if (!target) return json({ error: 'Supplier not found' }, 404)

      // An admin account is the platform itself. Deleting one — your own most
      // of all — would lock everybody out with no way back.
      if (target.role === 'admin') {
        return json({ error: 'Admin accounts cannot be deleted here.' }, 403)
      }

      // The typed name is re-checked here, not just in the browser. This is
      // the one call in the app that destroys a whole business, and the UI is
      // not the place to enforce that it was aimed at the right row.
      if (confirm_name.trim() !== target.business_name.trim()) {
        return json({ error: 'The typed business name does not match.' }, 400)
      }

      // Counted before the delete so the admin gets told what actually went,
      // and so the log records the size of what was destroyed.
      const tables = ['customers', 'invoices', 'invoice_items', 'payments', 'materials', 'quotations'] as const
      const deleted: Record<string, number> = {}
      for (const table of tables) {
        const { count } = await adminClient
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('supplier_id', supplier_id)
        deleted[table] = count ?? 0
      }

      // Every activity_log entry here is written against the ADMIN, because
      // the supplier's own entries cascade away with them.
      const record = (action: string, details: Record<string, unknown>) =>
        adminClient.from('activity_log').insert({
          actor_id: caller.id,
          actor_role: 'admin',
          supplier_id: caller.id,
          action,
          details: { business_name: target.business_name, ...details },
        })

      // Deleting the login is what actually does it. suppliers.id references
      // auth.users(id) ON DELETE CASCADE, and every business table cascades
      // from suppliers in turn — customers, invoices, invoice_items,
      // payments, materials, quotations, quotation_items, activity_log and
      // the confirmation PIN all go with it, in one transaction.
      const { error: authError } = await adminClient.auth.admin.deleteUser(supplier_id)
      if (authError && !/not found/i.test(authError.message)) {
        // F8 (Phase 2 audit): this used to be logged as done BEFORE the
        // delete ran, so a failed delete still read as a deletion. Now a
        // failure is recorded as a failure.
        await record('supplier_delete_failed', { reason: authError.message })
        return fail('Could not delete this supplier. Nothing was deleted.', 400, authError)
      }

      // Normally a no-op, because the cascade above already took the row.
      // Kept as a backstop for the one case it wouldn't: a profile row whose
      // auth user had already been removed by some other route.
      const { error: rowError } = await adminClient.from('suppliers').delete().eq('id', supplier_id)
      if (rowError) {
        await record('supplier_delete_failed', { reason: rowError.message, login_deleted: true })
        return fail('The login was deleted, but the supplier record could not be removed. Ask for help before retrying.', 500, rowError)
      }

      // Their uploaded logo, which no cascade would reach. F7 (Phase 2
      // audit): this used to run before the delete with every error ignored,
      // so a storage hiccup left the file in a public bucket for good, with
      // nobody told. It runs after the delete now - so a failure can never
      // cost a supplier who was NOT deleted their logo - and a failure is
      // reported to the admin and recorded, never swallowed.
      let logoProblem: string | null = null
      const { data: logoFiles, error: listError } = await adminClient.storage.from('logos').list(supplier_id)
      if (listError) {
        logoProblem = 'could not check for a logo'
      } else if (logoFiles?.length) {
        const paths = logoFiles.map((f: { name: string }) => `${supplier_id}/${f.name}`)
        const { error: removeError } = await adminClient.storage.from('logos').remove(paths)
        if (removeError) logoProblem = `could not remove ${paths.length} logo file(s) under logos/${supplier_id}/`
      }
      if (logoProblem) console.error('delete_supplier logo:', logoProblem, listError ?? '')

      // F8: written only now that the deletion has actually happened.
      await record('supplier_deleted', { deleted_rows: deleted, logo_removed: !logoProblem })

      const warning = logoProblem
        ? `The supplier was deleted, but the logo ${logoProblem}. Remove it under Storage > logos in the Supabase dashboard.`
        : undefined
      return json({ ok: true, business_name: target.business_name, deleted, ...(warning ? { warning } : {}) })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (err) {
    return fail('Something went wrong on the server. The details are in the function log.', 500, err)
  }
})
