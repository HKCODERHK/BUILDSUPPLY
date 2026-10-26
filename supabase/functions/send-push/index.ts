// Supabase Edge Function — sends the phone alerts that are due (migration 051).
//
// The database pings it (pg_net) after any new notification. It asks the
// database for what is due — claim_push_batch takes each notification once,
// so a second call, or anyone else calling it, sends nothing more — and sends
// one encrypted Web Push message per phone. A phone the push service says is
// gone (404 / 410) is removed. Nothing here can create a notification or
// read anything but the messages already written for sending, which is why
// it needs no secret from its caller.
//
// Secrets (npx supabase secrets set ... --project-ref <ref>):
//   VAPID_PUBLIC_KEY   the raw public key, base64url — the same one the app
//                      ships in lib/push.ts
//   VAPID_PRIVATE_KEY  its private scalar (the JWK "d"), base64url. Never in
//                      the repo or a backup; if it is lost, make a new pair,
//                      put the public half in lib/push.ts, and phones sign
//                      up again the next time they open the app.
//
// Deploy: npx supabase functions deploy send-push --project-ref <ref> --use-api --no-verify-jwt

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendPush } from './webpush.ts'

interface Message {
  sub: string
  endpoint: string
  p256dh: string
  auth: string
  title: string
  body: string
  tag: string
  url: string
}

const SUBJECT = 'mailto:himanshukhalatkar6@gmail.com'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) {
    console.error('send-push: VAPID keys are not set')
    return Response.json({ ok: false }, { status: 500 })
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const vapid = { publicKey, privateKey, subject: SUBJECT }

  let sent = 0
  let gone = 0
  // A few rounds at most: anything arriving later brings its own ping.
  for (let round = 0; round < 5; round++) {
    const { data, error } = await db.rpc('claim_push_batch', { p_limit: 200 })
    if (error) {
      console.error('send-push: claim failed', error.message)
      break
    }
    const batch = (data ?? []) as Message[]
    if (batch.length === 0) break

    const ok: string[] = []
    const dead: string[] = []
    await Promise.all(
      batch.map(async (m) => {
        try {
          const status = await sendPush(
            m,
            { title: m.title, body: m.body, tag: m.tag, url: m.url },
            vapid,
          )
          if (status >= 200 && status < 300) ok.push(m.sub)
          else if (status === 404 || status === 410) dead.push(m.sub)
          else console.error('send-push: push service answered', status, new URL(m.endpoint).host)
        } catch (e) {
          console.error('send-push: send failed', (e as Error).message)
        }
      }),
    )
    sent += ok.length
    gone += dead.length
    const { error: resultError } = await db.rpc('push_results', { p_sent: ok, p_gone: dead })
    if (resultError) console.error('send-push: results not saved', resultError.message)
  }
  return Response.json({ ok: true, sent, gone })
})
