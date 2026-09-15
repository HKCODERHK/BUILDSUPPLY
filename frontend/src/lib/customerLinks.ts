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

/** Their khata link code with this supplier, if this phone has opened it. */
export function readKhataCode(link: string): string | null {
  try {
    const code = localStorage.getItem(khataKey(link))
    return code && CODE.test(code) ? code : null
  } catch {
    return null
  }
}

export function rememberKhataCode(link: string, code: string) {
  try {
    localStorage.setItem(khataKey(link), code)
  } catch {
    // Not remembered; the customer still has the link the supplier sent.
  }
}

/** The supplier stopped this link: stop offering it. */
export function forgetKhataCode(code: string) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('buildsupply-khata:') && localStorage.getItem(key) === code) localStorage.removeItem(key)
    }
  } catch {
    // Nothing to forget on a phone that stores nothing.
  }
}
