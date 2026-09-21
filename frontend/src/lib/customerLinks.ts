// The links a customer has opened from one supplier, kept on the customer's
// own phone (localStorage) under the supplier's order link — never on the
// server. The order page then offers "My khata" and their recent orders, and
// the khata and status pages lead back to ordering. A phone that won't store
// anything simply doesn't remember; every page still works.

export type RecentOrder = { token: string; at: string }

const CODE = /^[0-9a-f]{32}$/
const recentKey = (link: string) => `buildsupply-orders:${link}`
const khataKey = (link: string) => `buildsupply-khata:${link}`

/** Their orders from this supplier, newest first, at most 5. */
export function readRecentOrders(link: string): RecentOrder[] {
  try {
    const list = JSON.parse(localStorage.getItem(recentKey(link)) ?? '[]')
    return Array.isArray(list) ? list.filter((r) => r && CODE.test(r.token)).slice(0, 5) : []
  } catch {
    return []
  }
}

/** Placed here, or opened from a status link: `at` is when the order was placed. */
export function rememberOrder(link: string, token: string, at: string = new Date().toISOString()): RecentOrder[] {
  const existing = readRecentOrders(link)
  if (existing.some((r) => r.token === token)) return existing
  const list = [{ token, at }, ...existing].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5)
  try {
    localStorage.setItem(recentKey(link), JSON.stringify(list))
  } catch {
    // Storage blocked: the link is still on screen to copy.
  }
  return list
}

/**
 * Their khata with this supplier, if this phone has opened it: the code and
 * the name it belongs to, kept together.
 *
 * The name is stored *with* the code on purpose. It used to be read from the
 * last order this phone had sent instead, and those are two different things:
 * one phone that has opened one customer's khata and placed another
 * customer's order showed the first name over the second account. One store,
 * one customer.
 */
export type KhataLink = { code: string; name: string | null; phone: string | null; site: string | null }

/** A string field as the shop has it, or null. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

export function readKhata(link: string): KhataLink | null {
  try {
    const raw = localStorage.getItem(khataKey(link))
    if (!raw) return null
    // Stored before anything but the code was kept: the code on its own.
    if (CODE.test(raw)) return { code: raw, name: null, phone: null, site: null }
    const value = JSON.parse(raw)
    if (!value || !CODE.test(value.code)) return null
    return { code: value.code, name: text(value.name), phone: text(value.phone), site: text(value.site) }
  } catch {
    return null
  }
}

export function rememberKhataCode(link: string, code: string, customer?: { name?: string | null; phone?: string | null; site?: string | null }) {
  try {
    localStorage.setItem(
      khataKey(link),
      JSON.stringify({ code, name: customer?.name ?? null, phone: customer?.phone ?? null, site: customer?.site ?? null }),
    )
  } catch {
    // Not remembered; the customer still has the link the supplier sent.
  }
}

/** The supplier stopped this link: stop offering it. */
export function forgetKhataCode(code: string) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (!key?.startsWith('buildsupply-khata:')) continue
      const raw = localStorage.getItem(key)
      // Either shape: the bare code as it used to be kept, or { code, name }.
      const stored = raw && CODE.test(raw) ? raw : raw ? (JSON.parse(raw) || {}).code : null
      if (stored === code) localStorage.removeItem(key)
    }
  } catch {
    // Nothing to forget on a phone that stores nothing.
  }
}
