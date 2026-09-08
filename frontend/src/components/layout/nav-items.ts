import {
  LayoutGrid,
  Users,
  LayersPlus,
  FileText,
  ClipboardList,
  CreditCard,
  Truck,
  Bell,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react'

import type { TranslationKey } from '@/lib/i18n'

export interface NavItem {
  id: string
  // Translated at render time — the sidebar and bottom bar follow the
  // supplier's chosen language along with the rest of the app.
  labelKey: TranslationKey
  path: string
  icon: LucideIcon
}

// The supplier's own workspace. The admin account never sees these — it runs
// the platform and has no building-material business of its own, and as of
// migration 019 RLS returns nothing for it on these tables anyway.
export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutGrid },
  { id: 'customers', labelKey: 'nav.customers', path: '/customers', icon: Users },
  // Named "Stock" rather than "Materials": updating stock is the single
  // most-used action in the app, and adding a material is rare by comparison.
  // LayersPlus, not a warehouse: a warehouse is a place, and this page is
  // about how much is in it. The plus matches what the supplier is nearly
  // always here to do — top the stock up after a delivery arrives.
  { id: 'materials', labelKey: 'nav.materials', path: '/materials', icon: LayersPlus },
  { id: 'invoices', labelKey: 'nav.invoices', path: '/invoices', icon: FileText },
  // Moved off Layers when Stock took LayersPlus — at 19px in the phone tab bar
  // the two differed only by a small plus. A clipboard also says "estimate"
  // more plainly than a stack of layers ever did.
  { id: 'quotations', labelKey: 'nav.quotations', path: '/quotations', icon: ClipboardList },
  { id: 'payments', labelKey: 'nav.payments', path: '/payments', icon: CreditCard },
  { id: 'deliveries', labelKey: 'nav.deliveries', path: '/deliveries', icon: Truck },
  { id: 'reminders', labelKey: 'nav.reminders', path: '/reminders', icon: Bell },
  { id: 'reports', labelKey: 'nav.reports', path: '/reports', icon: BarChart3 },
  { id: 'settings', labelKey: 'nav.settings', path: '/settings', icon: Settings },
]

// What the admin gets instead of the supplier workspace: their own dashboard
// plus the platform tools. Settings is the account's own profile, not a
// supplier's, so it stays.
export const ADMIN_NAV_IDS = ['dashboard', 'settings']

// Primary tabs shown in the mobile bottom bar; the rest collapse into "More".
// Materials and Stock used to be separate items for one idea ("my items and
// how much I have"); they're now a single page that leads with stock levels.
export const MOBILE_PRIMARY_IDS = ['dashboard', 'customers', 'materials', 'invoices']
