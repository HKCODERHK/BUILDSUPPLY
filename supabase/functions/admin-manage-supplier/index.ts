// Supabase Edge Function — the only place the service_role key is used.
// Handles the supplier-account operations that require privileged Auth Admin
// API access: creating a login, resetting a password, banning/unbanning
// login, and deleting an account outright. Everything else (status labels, subscription
// dates, business info) is a normal RLS-protected table update done
// directly from the frontend as the signed-in admin.
//
// Deploy: supabase functions deploy admin-manage-supplier

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
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
        return json({ error: createError?.message ?? 'Failed to create auth user' }, 400)
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
        await adminClient.auth.admin.deleteUser(created.user.id)
        return json({ error: insertError.message }, 400)
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
      if (error) return json({ error: error.message }, 400)

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
      if (error) return json({ error: error.message }, 400)

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

      // Logged before the rows go, because activity_log cascades away with
      // the supplier — this entry is written against the admin instead, so
      // it survives as the record that the deletion happened.
      await adminClient.from('activity_log').insert({
        actor_id: caller.id,
        actor_role: 'admin',
        supplier_id: caller.id,
        action: 'supplier_deleted',
        details: { business_name: target.business_name, deleted_rows: deleted },
      })

      // Their uploaded logo, which no cascade would reach.
      const { data: logoFiles } = await adminClient.storage.from('logos').list(supplier_id)
      if (logoFiles?.length) {
        await adminClient.storage
          .from('logos')
          .remove(logoFiles.map((f: { name: string }) => `${supplier_id}/${f.name}`))
      }

      // Deleting the login is what actually does it. suppliers.id references
      // auth.users(id) ON DELETE CASCADE, and every business table cascades
      // from suppliers in turn — customers, invoices, invoice_items,
      // payments, materials, quotations, quotation_items, activity_log and
      // the confirmation PIN all go with it, in one transaction.
      const { error: authError } = await adminClient.auth.admin.deleteUser(supplier_id)
      if (authError && !/not found/i.test(authError.message)) {
        return json({ error: `Could not delete the login: ${authError.message}` }, 400)
      }

      // Normally a no-op, because the cascade above already took the row.
      // Kept as a backstop for the one case it wouldn't: a profile row whose
      // auth user had already been removed by some other route.
      const { error: rowError } = await adminClient.from('suppliers').delete().eq('id', supplier_id)
      if (rowError) return json({ error: rowError.message }, 400)

      return json({ ok: true, business_name: target.business_name, deleted })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
