export type SupplierRole = 'admin' | 'supplier'
export type Plan = 'starter' | 'pro'
export type BillingCycle = 'monthly' | 'yearly'
export type CustomerStatus = 'Active' | 'Inactive'
export type QuotationStatus = 'Draft' | 'Sent' | 'Converted' | 'Expired'
export type InvoiceStatus = 'Unpaid' | 'Partial' | 'Paid' | 'Cancelled'
// 'opening' is a customer's old udhaar, kept alongside their bills so it
// counts in the khata but never in sales (migration 024).
export type InvoiceKind = 'bill' | 'opening'
export type PaymentMode = 'Cash' | 'UPI' | 'Bank/Cheque'
export type SupplierAccountStatus = 'active' | 'suspended' | 'inactive'
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled'

export interface Supplier {
  id: string
  business_name: string
  owner_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  gst_number: string | null
  logo_url: string | null
  role: SupplierRole
  status: SupplierAccountStatus
  suspension_reason: string | null
  plan: Plan
  billing_cycle: BillingCycle
  subscription_start: string | null
  subscription_expiry: string | null
  subscription_status: SubscriptionStatus
  // When the admin last called or messaged this supplier from the admin
  // panel (migration 020). Null until the first contact.
  last_contacted_at: string | null
  // Payments at or above this amount ask for the confirmation PIN, and only
  // when a PIN is actually set (migration 022). Not secret — the PIN hash
  // itself lives in supplier_pins, which no client can read.
  pin_payment_threshold: number
  // Customer online orders (migration 026). order_link is the name in
  // /order/<order_link>; null until the supplier sets ordering up.
  order_link: string | null
  ordering_enabled: boolean
  order_show_prices: boolean
  // UPI, only where the supplier chooses (migration 029). khata_upi_enabled
  // puts "Pay by UPI" on khata links; off by default.
  upi_id: string | null
  khata_upi_enabled: boolean
  created_at: string
}

export type OrderStatus = 'pending' | 'approved' | 'rejected'

/** Why an order was rejected, picked from a list (migration 027). The customer sees it. */
export type RejectCode = 'no_stock' | 'too_many_orders' | 'area_not_served' | 'date_not_possible' | 'other'

/** One line of a customer's order request — never a price. */
export interface OrderItem {
  material_id: string
  name: string
  unit: string
  qty: number
}

/** A customer's order request (migration 026). Becomes an estimate only when the supplier approves it. */
export interface OrderRequest {
  id: string
  supplier_id: string
  status: OrderStatus
  public_token: string
  request_id: string
  customer_name: string
  phone: string
  site: string | null
  delivery_date: string | null
  note: string | null
  items: OrderItem[]
  customer_id: string | null
  quotation_id: string | null
  reject_code: RejectCode | null
  /** Only for "Other" (or orders rejected before 027): the words the supplier wrote. */
  reject_reason: string | null
  /** The customer's answer to the estimate, from their status link (migration 030). */
  customer_response: 'accepted' | 'call_me' | null
  responded_at: string | null
  created_at: string
  decided_at: string | null
}

export interface SupplierOverview extends Supplier {
  last_sign_in_at: string | null
}

export interface AdminDashboardStats {
  total_suppliers: number
  active_suppliers: number
  suspended_suppliers: number
  inactive_suppliers: number
  expired_subscriptions: number
  expiring_soon: number
  never_logged_in: number
}

export type ActivityActorRole = 'admin' | 'supplier'

export interface ActivityLogEntry {
  id: string
  actor_id: string | null
  actor_role: ActivityActorRole
  supplier_id: string | null
  action: string
  details: Record<string, unknown> | null
  created_at: string
}

// What the admin is allowed to see of a supplier's activity: the action and
// when it happened, never the `details` payload (customer names, invoice
// numbers, amounts). Returned by the admin_supplier_activity RPC — see
// migration 019.
export interface AdminActivityEntry {
  id: string
  action: string
  actor_role: ActivityActorRole
  // Populated only for admin-authored rows (subscription and catalog
  // changes). Always null for supplier-authored rows, which hold that
  // supplier's customer names and invoice amounts — see migration 020.
  details: Record<string, unknown> | null
  created_at: string
}

export interface MaterialCategory {
  id: string
  name: string
  slug: string
  active: boolean
  created_at: string
}

export interface Brand {
  id: string
  name: string
  slug: string
  active: boolean
  created_at: string
}

export interface MaterialType {
  id: string
  category_id: string
  name: string
  slug: string
  active: boolean
  created_at: string
}

// Attribute shapes vary by category — sand/gitti use vehicle+capacity_cft,
// steel uses diameter_mm+grade+length_m, cement uses cement_type+pack_size_kg.
// See src/lib/catalogAttributes.ts for the field definitions per category.
export type VariantAttributes = Record<string, string | number>

export interface MasterMaterialVariant {
  id: string
  material_type_id: string
  brand_id: string | null
  name: string
  attributes: VariantAttributes
  unit: string | null
  search_keywords: string | null
  search_text: string | null
  image_url: string | null
  active: boolean
  created_at: string
}

export interface PlatformSettings {
  id: true
  platform_name: string
  default_currency: string
  default_gst_rate: number
  default_subscription_days: number
  updated_at: string
}

export interface Customer {
  id: string
  supplier_id: string
  name: string
  phone: string | null
  // The customer's usual site — pre-filled as the default when billing them,
  // but each invoice/quotation carries its own site (see Invoice.site).
  site: string | null
  address: string | null
  // Optional udhaar limit. Null for almost everyone — it only exists so a
  // supplier can be warned before extending more credit to the one or two
  // contractors they're wary of. Never blocks a bill (migration 018).
  credit_limit: number | null
  status: CustomerStatus
  created_at: string
}

export interface Material {
  id: string
  supplier_id: string
  master_material_id: string | null
  name: string
  category: string | null
  rate: number
  unit_label: string | null
  per_label: string | null
  stock_qty: number
  stock_unit: string | null
  low_stock_threshold: number | null
  /** GST percentage charged on this material (migration 035). 18 by default. */
  gst_rate: number
  created_at: string
}

export interface Quotation {
  id: string
  supplier_id: string
  quote_no: string
  customer_id: string | null
  // The site this estimate is for. Lives on the estimate, not the customer,
  // so a contractor can have several sites running at once.
  site: string | null
  subtotal: number
  gst_amount: number
  transport_labour_charge: number
  total: number
  status: QuotationStatus
  converted_invoice_id: string | null
  created_at: string
}

export interface QuotationItem {
  id: string
  supplier_id: string
  quotation_id: string
  material_id: string | null
  description: string
  qty: number
  rate: number
  amount: number
  /** The GST charged on this line, fixed when it was saved (035). Null before it. */
  gst_rate?: number | null
  gst_amount?: number | null
}

export interface Invoice {
  id: string
  supplier_id: string
  invoice_no: string
  customer_id: string | null
  quotation_id: string | null
  // The site this bill was raised for — see Quotation.site.
  site: string | null
  subtotal: number
  gst_amount: number
  transport_labour_charge: number
  total: number
  paid: number
  status: InvoiceStatus
  delivered: boolean
  kind: InvoiceKind
  /** When the customer tapped "Material received" on their khata link (migration 030). Only they can set it. */
  received_at: string | null
  created_at: string
}

export interface InvoiceItem {
  id: string
  supplier_id: string
  invoice_id: string
  material_id: string | null
  description: string
  qty: number
  rate: number
  amount: number
  /** The GST charged on this line, fixed when the bill was saved (035). Null before it. */
  gst_rate?: number | null
  gst_amount?: number | null
}

export interface Payment {
  id: string
  supplier_id: string
  // Null while the money is an advance — received, but with no bill to go
  // on yet. The customer's next bill uses it up (migration 024).
  invoice_id: string | null
  customer_id: string | null
  // Handed over for their NEXT bill ("Receive advance") — never used on
  // dues they already had.
  is_advance: boolean
  amount: number
  mode: PaymentMode
  created_at: string
}

/** One of a supplier's own drivers, for "Send to driver" on WhatsApp (migration 031). Only they can read it. */
export interface Driver {
  id: string
  supplier_id: string
  name: string
  phone: string
  created_at: string
}

export interface CustomerBalance {
  customer_id: string
  supplier_id: string
  sales: number
  pending: number
  // Money received beyond everything they owe, waiting for their next bill.
  advance: number
}

export interface DashboardTotals {
  supplier_id: string
  total_sales: number
  total_collected: number
  total_pending: number
}
