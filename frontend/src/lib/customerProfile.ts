/**
 * Who this phone's customer is, as they told us the first time they opened a
 * shop's QR or order link (2026-10-12): name, mobile, site and city. Kept on
 * their own phone only — localStorage, or sessionStorage when they untick
 * "keep my details" — never on the server. A shop sees these details only in
 * an order the customer chooses to send, exactly as before.
 *
 * It proves nothing: anyone can type any number. So it only fills in forms
 * and greets them. A customer's bills and balance still open only through
 * their own khata link (Phase 30's rule).
 */

export type CustomerProfile = { name: string; phone: string; site: string; city: string }

const KEY = 'buildsupply-customer-profile'

function parse(raw: string | null): CustomerProfile | null {
  try {
    const v = JSON.parse(raw ?? 'null')
    return v && typeof v.name === 'string' && typeof v.phone === 'string'
      ? { name: v.name, phone: v.phone, site: v.site ?? '', city: v.city ?? '' }
      : null
  } catch {
    return null
  }
}

export function readProfile(): CustomerProfile | null {
  try {
    return parse(localStorage.getItem(KEY)) ?? parse(sessionStorage.getItem(KEY))
  } catch {
    return null
  }
}

export function saveProfile(profile: CustomerProfile, keep: boolean) {
  try {
    const value = JSON.stringify(profile)
    if (keep) {
      localStorage.setItem(KEY, value)
      sessionStorage.removeItem(KEY)
    } else {
      sessionStorage.setItem(KEY, value)
      localStorage.removeItem(KEY)
    }
  } catch {
    // Storage blocked: they are asked again next time, and the order still goes.
  }
}

export function clearProfile() {
  try {
    localStorage.removeItem(KEY)
    sessionStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}

/** The site as an order should carry it: "Shivaji Nagar, Betul". */
export function siteWithCity(p: Pick<CustomerProfile, 'site' | 'city'>) {
  const site = p.site.trim()
  const city = p.city.trim()
  if (!city) return site
  if (!site) return city
  return site.toLowerCase().includes(city.toLowerCase()) ? site : `${site}, ${city}`
}
