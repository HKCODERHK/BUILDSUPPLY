// Web Push with nothing but WebCrypto: the VAPID signature (RFC 8292) and
// the message encryption (RFC 8291, aes128gcm). Runs the same in Deno (the
// Edge Function) and in Node 22 (the test), so no library is needed and
// nothing is paid for. Checked against RFC 8291's own worked example.

const enc = new TextEncoder()

export function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(s.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToB64url(b: Uint8Array): string {
  let bin = ''
  for (const x of b) bin += String.fromCharCode(x)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

// A P-256 key as a JWK, from its raw uncompressed public point (and private
// scalar, if given).
function ecJwk(publicRaw: Uint8Array, d?: string): JsonWebKey {
  return {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(publicRaw.slice(1, 33)),
    y: bytesToB64url(publicRaw.slice(33, 65)),
    ...(d ? { d } : {}),
    ext: true,
  }
}

export interface Sender {
  privateKey: CryptoKey
  publicRaw: Uint8Array
}

/** Encrypts one message for one subscription (RFC 8291). */
export async function encryptPayload(
  payload: Uint8Array,
  p256dh: string,
  authSecret: string,
  fixed?: { sender: Sender; salt: Uint8Array },
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(p256dh)
  const auth = b64urlToBytes(authSecret)
  let sender = fixed?.sender
  if (!sender) {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair
    sender = {
      privateKey: pair.privateKey,
      publicRaw: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)),
    }
  }
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))

  const uaKey = await crypto.subtle.importKey('jwk', ecJwk(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, sender.privateKey, 256),
  )

  const prkKey = await hmac(auth, ecdh)
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, sender.publicRaw, new Uint8Array([1]))
  const ikm = await hmac(prkKey, keyInfo)
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16)
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12)

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const record = concat(payload, new Uint8Array([2]))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record))

  const rs = 4096
  const header = concat(
    salt,
    new Uint8Array([(rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255]),
    new Uint8Array([sender.publicRaw.length]),
    sender.publicRaw,
  )
  return concat(header, cipher)
}

/** Imports an ECDH private key from its scalar and public point, for tests. */
export async function importSender(d: string, publicB64: string): Promise<Sender> {
  const publicRaw = b64urlToBytes(publicB64)
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    ecJwk(publicRaw, d),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  )
  return { privateKey, publicRaw }
}

/** The VAPID Authorization header for one push service (RFC 8292). */
export async function vapidHeader(
  endpoint: string,
  vapidPublic: string,
  vapidPrivateD: string,
  subject: string,
): Promise<string> {
  const publicRaw = b64urlToBytes(vapidPublic)
  const key = await crypto.subtle.importKey(
    'jwk',
    ecJwk(publicRaw, vapidPrivateD),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const head = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToB64url(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: subject,
      }),
    ),
  )
  const signed = `${head}.${claims}`
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signed)))
  return `vapid t=${signed}.${bytesToB64url(sig)}, k=${vapidPublic}`
}

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

/** Sends one message. Returns the push service's status code. */
export async function sendPush(
  target: PushTarget,
  message: unknown,
  vapid: { publicKey: string; privateKey: string; subject: string },
): Promise<number> {
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), target.p256dh, target.auth)
  const res = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(target.endpoint, vapid.publicKey, vapid.privateKey, vapid.subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body,
  })
  await res.body?.cancel()
  return res.status
}
