import type { Invoice, Supplier } from '@/lib/database.types'

// What a bill prints about the business (migration 043). One rule, read by
// the bill PDF, the bill page and a customer's copy from their khata link —
// so the three can never disagree.
//
//   * The business details are the bill's own copy, taken when it was issued
//     (`invoice.issuer`). Bills made before 043 have none and use the shop's
//     details as they are now, exactly as they always printed.
//   * Which of them print: the bill's own choice (`invoice.print_options`),
//     else the shop's defaults recorded on the bill when it was issued
//     (`issuer.print`), else everything — again, as before.
//   * The business name always prints. On a bill that charges GST, from a
//     shop with a GSTIN, the address and the GSTIN always print too, whatever
//     the choices say. What else GST law requires is for the user's CA to
//     confirm (CLAUDE.md, Phase 32).

export const PRINT_CHOICES = ['logo', 'address', 'gstin', 'phone'] as const
export type PrintChoice = (typeof PRINT_CHOICES)[number]
export type PrintOptions = Partial<Record<PrintChoice, boolean>>

export interface Issuer {
  business_name: string
  address: string | null
  phone: string | null
  gst_number: string | null
  logo_url: string | null
  print?: PrintOptions | null
}

type BillLike = Pick<Invoice, 'gst_amount'> & { issuer?: Issuer | null; print_options?: PrintOptions | null }

/** The details this bill was issued with, or the shop's current ones for a bill from before 043. */
export function billIssuer(supplier: Pick<Supplier, 'business_name' | 'address' | 'phone' | 'gst_number' | 'logo_url'>, bill: BillLike): Issuer {
  if (bill.issuer) return bill.issuer
  return { business_name: supplier.business_name, address: supplier.address, phone: supplier.phone, gst_number: supplier.gst_number, logo_url: supplier.logo_url }
}

/** The choices GST law takes out of the supplier's hands on this bill. */
export function lockedChoices(bill: Pick<Invoice, 'gst_amount'>, issuer: Pick<Issuer, 'gst_number'>): Set<PrintChoice> {
  return Number(bill.gst_amount) > 0 && !!issuer.gst_number ? new Set<PrintChoice>(['address', 'gstin']) : new Set()
}

/** Whether each detail prints on this bill, after the bill's choice, the recorded defaults and the lock. */
export function effectiveChoices(bill: BillLike, issuer: Issuer, override?: PrintOptions | null): Record<PrintChoice, boolean> {
  const chosen = override !== undefined ? override : (bill.print_options ?? issuer.print ?? null)
  const locked = lockedChoices(bill, issuer)
  return Object.fromEntries(PRINT_CHOICES.map((c) => [c, locked.has(c) || chosen?.[c] !== false])) as Record<PrintChoice, boolean>
}

/**
 * The supplier as this bill should print it: its issued details, with what is
 * switched off left blank. Everything else on the supplier is passed through.
 */
export function printedSupplier<S extends Pick<Supplier, 'business_name' | 'address' | 'phone' | 'gst_number' | 'logo_url'>>(
  supplier: S,
  bill: BillLike,
  override?: PrintOptions | null,
): S {
  const issuer = billIssuer(supplier, bill)
  const on = effectiveChoices(bill, issuer, override)
  return {
    ...supplier,
    business_name: issuer.business_name,
    address: on.address ? issuer.address : null,
    gst_number: on.gstin ? issuer.gst_number : null,
    phone: on.phone ? issuer.phone : null,
    logo_url: on.logo ? issuer.logo_url : null,
  }
}
