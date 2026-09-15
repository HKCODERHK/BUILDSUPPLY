import { sanitizePhone } from '@/lib/numberInput'

// The phone's own contact picker (the Contact Picker API) — Android Chrome
// has it; iPhones and computers don't, so the button that uses it is shown
// only where it exists. It is read-only: the supplier picks, the page gets
// just the names and numbers picked, nothing is written back to the phone.

export interface PickedContact {
  name: string
  /** Cleaned like every phone field in the app: 10 digits, or '' if none fit. */
  phone: string
}

type ContactsManager = {
  select: (props: string[], opts: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]>
}

export function canPickContacts() {
  return typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window
}

/**
 * Opens the picker. Resolves with what was picked — empty if the supplier
 * closed it — and throws only if the phone refuses outright. A contact's
 * first number that cleans to 10 digits is the one used.
 */
export async function pickContacts(multiple: boolean): Promise<PickedContact[]> {
  const manager = (navigator as Navigator & { contacts: ContactsManager }).contacts
  const results = await manager.select(['name', 'tel'], { multiple })
  return results
    .map((r) => ({
      name: (r.name?.[0] ?? '').trim(),
      phone: (r.tel ?? []).map((tel) => sanitizePhone(tel)).find((p) => p.length === 10) ?? '',
    }))
    .filter((c) => c.name || c.phone)
}
