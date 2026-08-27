export type SupplierRole = 'admin' | 'supplier'
export type Plan = 'starter' | 'pro'
export type BillingCycle = 'monthly' | 'yearly'
export type CustomerStatus = 'Active' | 'Inactive'
export type QuotationStatus = 'Open' | 'Converted' | 'Expired'
export type InvoiceStatus = 'Unpaid' | 'Partial' | 'Paid'
export type PaymentMode = 'Cash' | 'UPI' | 'Wallet' | 'Split'
export type DeliveryStatus = 'Pending' | 'Delivered'
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
  created_at: string
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

export interface MaterialCategory {
  id: string
  name: string
  active: boolean
  created_at: string
}

export interface Brand {
  id: string
  name: string
  active: boolean
  created_at: string
}

export interface MasterMaterial {
  id: string
  category_id: string | null
  brand_id: string | null
  name: string
  default_unit_label: string | null
  default_per_label: string | null
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
  site: string | null
  status: CustomerStatus
  created_at: string
}

export interface CustomerSite {
  id: string
  supplier_id: string
  customer_id: string
  site_name: string
  pending_amount: number
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
  created_at: string
}

export interface Quotation {
  id: string
  supplier_id: string
  quote_no: string
  customer_id: string | null
  total: number
  status: QuotationStatus
  converted_invoice_id: string | null
  created_at: string
}

export interface Invoice {
  id: string
  supplier_id: string
  invoice_no: string
  customer_id: string | null
  quotation_id: string | null
  subtotal: number
  gst_amount: number
  total: number
  paid: number
  status: InvoiceStatus
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
}

export interface Payment {
  id: string
  supplier_id: string
  invoice_id: string
  amount: number
  mode: PaymentMode
  created_at: string
}

export interface Delivery {
  id: string
  supplier_id: string
  invoice_id: string | null
  challan_no: string
  driver_name: string | null
  vehicle_no: string | null
  status: DeliveryStatus
  created_at: string
}

export interface CustomerBalance {
  customer_id: string
  supplier_id: string
  sales: number
  pending: number
}

export interface DashboardTotals {
  supplier_id: string
  total_sales: number
  total_collected: number
  total_pending: number
}
