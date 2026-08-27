// Supabase Edge Function — the only place the service_role key is used.
// Handles the three supplier-account operations that require privileged
// Auth Admin API access: creating a login, resetting a password, and
// banning/unbanning login. Everything else (status labels, subscription
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

  // Client scoped to the caller's own JWT — used only to identify who's calling.
  const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser()
  if (!caller) return json({ error: 'Invalid session' }, 401)

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

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
