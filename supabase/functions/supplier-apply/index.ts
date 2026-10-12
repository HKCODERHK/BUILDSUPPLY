// Supabase Edge Function — a new shop applying to join BuildSupply
// (compliance round 2, 2026-10-13). Public: no sign-in is needed to apply.
//
// It creates the applicant's login (the email and password they chose) and
// their application row in supplier_compliance (migration 045), and nothing
// else. There is NO suppliers row until the admin accepts the application
// (accept_supplier_application, after the shop has paid on WhatsApp), so an
// applicant who signs in reaches only their application screen.
//
// Kept apart from admin-manage-supplier on purpose: the admin side was not
// to change at all, and a public entry point should not share code paths
// with admin-only ones.
//
// Deploy: npx supabase functions deploy supplier-apply --project-ref <ref> --use-api --no-verify-jwt
// (--no-verify-jwt because the app calls it signed out, with the publishable
// key, which is not a JWT. It checks everything itself and can only ever
// create a login plus a PENDING application.)

import { createClient } from 'jsr:@supabase/supabase-js@2'

// The same origins as admin-manage-supplier: the live site, this project's
// Vercel previews, a local dev server, and ALLOWED_ORIGINS.
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

// Applications the whole platform takes in an hour. A real shop applies once;
// this only stops a script filling the admin's list.
const PLATFORM_PER_HOUR = 10

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MOBILE = /^[6-9][0-9]{9}$/
const PLANS = new Set(['trial', 'basic', 'pro', 'yearly'])

function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, max) : null
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
  // A plain sentence for the applicant; the raw cause only in the function log.
  const fail = (code: string, status: number, detail?: unknown) => {
    if (detail !== undefined) console.error(code, '|', detail instanceof Error ? detail.message : JSON.stringify(detail))
    return json({ error: code }, status)
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail('bad_request', 405)
  // Only the app's own pages may apply (a browser always sends Origin on a
  // cross-site POST).
  if (!originAllowed(origin)) return fail('bad_request', 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('bad_request', 400)
  }

  // The bot trap: a field people never see. Answered like a success, and
  // nothing is made.
  if (typeof body.website === 'string' && body.website.trim() !== '') return json({ ok: true })

  const email = clean(body.email, 254)?.toLowerCase() ?? null
  const password = typeof body.password === 'string' ? body.password : ''
  const legalName = clean(body.business_name, 200)
  const contactName = clean(body.owner_name, 120)
  const mobile = clean(body.mobile, 10)
  const district = clean(body.district, 80)
  const state = clean(body.state, 80)
  const plan = clean(body.plan, 10)

  if (!email || !EMAIL.test(email)) return fail('bad_email', 400)
  if (password.length < 8 || password.length > 72) return fail('bad_password', 400)
  if (!legalName || legalName.length < 2) return fail('bad_name', 400)
  if (!contactName || contactName.length < 2) return fail('bad_owner', 400)
  if (!mobile || !MOBILE.test(mobile)) return fail('bad_mobile', 400)
  if (!district || district.length < 2 || !state || state.length < 2) return fail('bad_place', 400)
  if (!plan || !PLANS.has(plan)) return fail('bad_plan', 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const since = new Date(Date.now() - 3600_000).toISOString()
    const { count, error: countError } = await admin
      .from('supplier_compliance')
      .select('user_id', { count: 'exact', head: true })
      .eq('is_applicant', true)
      .gte('created_at', since)
    if (countError) return fail('server', 500, countError)
    if ((count ?? 0) >= PLATFORM_PER_HOUR) return fail('busy', 429)

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError || !created.user) {
      const msg = createError?.message ?? ''
      if (/already (been )?registered|already exists/i.test(msg)) return fail('email_taken', 400)
      if (/password/i.test(msg)) return fail('bad_password', 400, createError)
      return fail('server', 500, createError)
    }

    const { error: insertError } = await admin.from('supplier_compliance').insert({
      user_id: created.user.id,
      status: 'PENDING',
      is_applicant: true,
      requested_plan: plan,
      legal_name: legalName,
      contact_name: contactName,
      mobile,
      email,
      district,
      state,
    })
    if (insertError) {
      // Never leave a login without its application.
      const { error: rollbackError } = await admin.auth.admin.deleteUser(created.user.id)
      return fail('server', 500, { insertError, rollbackError })
    }

    const { error: auditError } = await admin.from('compliance_audit_log').insert({
      user_id: created.user.id,
      actor_id: created.user.id,
      actor_role: 'supplier',
      action: 'application_created',
      new_status: 'PENDING',
      details: { plan },
    })
    if (auditError) console.error('audit', auditError.message)

    return json({ ok: true })
  } catch (err) {
    return fail('server', 500, err)
  }
})
