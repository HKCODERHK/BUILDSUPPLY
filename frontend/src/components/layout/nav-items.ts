import {
  LayoutGrid,
  Users,
  Box,
  FileText,
  Layers,
  CreditCard,
  Truck,
  Bell,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  path: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutGrid },
  { id: 'customers', label: 'Customers', path: '/customers', icon: Users },
  { id: 'materials', label: 'Materials', path: '/materials', icon: Box },
  { id: 'invoices', label: 'Invoices', path: '/invoices', icon: FileText },
  { id: 'quotations', label: 'Quotations', path: '/quotations', icon: Layers },
  { id: 'stock', label: 'Stock', path: '/stock', icon: Layers },
  { id: 'payments', label: 'Payments', path: '/payments', icon: CreditCard },
  { id: 'deliveries', label: 'Deliveries', path: '/deliveries', icon: Truck },
  { id: 'reminders', label: 'Reminders', path: '/reminders', icon: Bell },
  { id: 'reports', label: 'Reports', path: '/reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', path: '/settings', icon: Settings },
]

// Primary tabs shown in the mobile bottom bar; the rest collapse into "More".
export const MOBILE_PRIMARY_IDS = ['dashboard', 'customers', 'invoices', 'materials']
