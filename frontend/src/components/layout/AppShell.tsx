import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, MoreHorizontal, X, ShieldCheck, Boxes, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { NAV_ITEMS, MOBILE_PRIMARY_IDS } from './nav-items'

export function AppShell({ children }: { children: ReactNode }) {
  const { supplier, signOut } = useAuth()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const primaryItems = NAV_ITEMS.filter((n) => MOBILE_PRIMARY_IDS.includes(n.id))
  const overflowItems = NAV_ITEMS.filter((n) => !MOBILE_PRIMARY_IDS.includes(n.id))

  return (
    <div className="flex min-h-screen bg-surface text-ink">
      {/* Desktop sidebar */}
      <nav className="sticky top-0 hidden h-screen w-[230px] shrink-0 flex-col bg-ink text-white sm:flex">
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-5">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#35A85D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18" />
            <path d="M5 21V8l5-4v17" />
            <path d="M10 21V11l6 3v7" />
            <path d="M16 21v-4l3 1.5V21" />
          </svg>
          <span className="text-[17px] font-bold">BuildSupply</span>
        </div>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-2.5 py-3.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text transition-colors hover:bg-white/5',
                  isActive && 'bg-accent/15 text-white',
                )
              }
            >
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
          {supplier?.role === 'admin' && (
            <>
              <NavLink
                to="/admin/suppliers"
                className={({ isActive }) =>
                  cn(
                    'mt-2 flex items-center gap-2.5 rounded-lg border-t border-white/10 px-3 pt-4 pb-2.5 text-sm font-medium text-sidebar-text transition-colors hover:bg-white/5',
                    isActive && 'bg-accent/15 text-white',
                  )
                }
              >
                <ShieldCheck size={17} />
                Suppliers (Admin)
              </NavLink>
              <NavLink
                to="/admin/materials"
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text transition-colors hover:bg-white/5',
                    isActive && 'bg-accent/15 text-white',
                  )
                }
              >
                <Boxes size={17} />
                Material Catalog
              </NavLink>
              <NavLink
                to="/admin/settings"
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text transition-colors hover:bg-white/5',
                    isActive && 'bg-accent/15 text-white',
                  )
                }
              >
                <SlidersHorizontal size={17} />
                Platform Settings
              </NavLink>
            </>
          )}
        </div>
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 truncate px-2 text-xs text-sidebar-text">{supplier?.business_name}</div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-text hover:bg-white/5"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 sm:pb-0">
        <main className="flex-1 p-4 sm:p-8">{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-white sm:hidden">
        {primaryItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted',
                isActive && 'text-accent',
              )
            }
          >
            <item.icon size={19} />
            {item.label}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted"
        >
          <MoreHorizontal size={19} />
          More
        </button>
      </nav>

      {/* Mobile "more" sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 sm:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="w-full rounded-t-2xl bg-white p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">More</span>
              <button onClick={() => setMoreOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {overflowItems.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-xs font-medium text-ink"
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
              {supplier?.role === 'admin' && (
                <>
                  <NavLink
                    to="/admin/suppliers"
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-xs font-medium text-ink"
                  >
                    <ShieldCheck size={18} />
                    Suppliers
                  </NavLink>
                  <NavLink
                    to="/admin/materials"
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-xs font-medium text-ink"
                  >
                    <Boxes size={18} />
                    Catalog
                  </NavLink>
                  <NavLink
                    to="/admin/settings"
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-xs font-medium text-ink"
                  >
                    <SlidersHorizontal size={18} />
                    Platform
                  </NavLink>
                </>
              )}
              <button
                onClick={handleSignOut}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-xs font-medium text-red-600"
              >
                <LogOut size={18} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
