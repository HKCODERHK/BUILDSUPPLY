import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookmarkPlus, LogOut, Store, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LanguageToggle } from '@/components/LanguageToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { TruckLoader } from '@/components/TruckLoader'
import { SoftCard } from '@/components/CustomerHome'
import { useLanguage } from '@/context/LanguageContext'
import { cn } from '@/lib/utils'
import { signOutCustomer } from '@/lib/customerAuth'
import { disconnectShop, myShops, readCurrentShop, rememberCurrentShop, type MyShop } from '@/services/customerAccount'
import KhataPage from './KhataPage'

/**
 * /me — the customer's own BuildSupply (migration 038). Once a khata link has
 * been saved on this phone, this is where the customer comes back to: every
 * shop on their account, one at a time, read by who is signed in rather than
 * by a link. With several shops a switcher sits on top; each shop's khata,
 * bills, payments, estimates and orders are exactly the khata link's own
 * screens (KhataPage in account mode).
 *
 * Opening this page never makes an account — only "Save" on a khata link does.
 */
export default function MyAccount() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [shops, setShops] = useState<MyShop[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)
  // A shop that dropped off since last time: the shop stopped the link.
  const [gone, setGone] = useState(false)
  const [asking, setAsking] = useState<'remove' | 'signout' | null>(null)
  const [busy, setBusy] = useState(false)

  function apply(list: MyShop[]) {
    setShops(list)
    const remembered = readCurrentShop()
    if (remembered && list.length > 0 && !list.some((s) => s.connection === remembered)) setGone(true)
    const pick = list.find((s) => s.connection === remembered) ?? list[0]
    setCurrent(pick?.connection ?? null)
    if (pick) rememberCurrentShop(pick.connection)
  }

  async function load() {
    try {
      apply(await myShops())
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    let live = true
    myShops()
      .then((list) => live && apply(list))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  function switchTo(connection: string) {
    setCurrent(connection)
    rememberCurrentShop(connection)
    setAsking(null)
    navigate('/me', { replace: true })
    window.scrollTo({ top: 0 })
  }

  async function removeShop() {
    if (!current || busy) return
    setBusy(true)
    try {
      await disconnectShop(current)
      setAsking(null)
      navigate('/me', { replace: true })
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    if (busy) return
    setBusy(true)
    try {
      await signOutCustomer()
      setAsking(null)
      setGone(false)
      setShops([])
      setCurrent(null)
    } finally {
      setBusy(false)
    }
  }

  const shop = shops?.find((s) => s.connection === current) ?? null

  if (shop) {
    const switcher =
      shops && shops.length > 1 ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-1">
          <div className="flex w-max gap-2">
            {shops.map((s) => (
              <button
                key={s.connection}
                type="button"
                onClick={() => switchTo(s.connection)}
                aria-pressed={s.connection === current}
                className={cn(
                  'flex max-w-[12rem] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
                  s.connection === current ? 'border-accent bg-accent-bg text-accent-text' : 'border-border bg-card text-muted',
                )}
              >
                {s.logo_url ? (
                  <img src={s.logo_url} alt="" className="h-5 w-5 shrink-0 rounded-md bg-white object-cover" />
                ) : (
                  <Store size={14} className="shrink-0" />
                )}
                <span className="truncate">{s.business_name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null
    const top = (
      <>
        {gone && (
          <p className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{t('acct.gone')}</p>
        )}
        {switcher}
      </>
    )
    const footer = (
      <SoftCard className="flex flex-col divide-y divide-border p-2">
        {(['remove', 'signout'] as const).map((what) =>
          asking === what ? (
            <div key={what} className="flex flex-col gap-2 px-2 py-3">
              <p className="text-sm text-ink">
                {what === 'remove' ? t('acct.removeConfirm', { shop: shop.business_name }) : t('acct.signOutConfirm')}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={what === 'remove' ? removeShop : signOut} disabled={busy}>
                  {t('acct.yes')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAsking(null)} disabled={busy}>
                  {t('ord.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <button
              key={what}
              type="button"
              onClick={() => setAsking(what)}
              className="flex items-center gap-3 rounded-xl px-2 py-3 text-left text-sm text-muted hover:bg-surface"
            >
              {what === 'remove' ? <Trash2 size={18} className="shrink-0" /> : <LogOut size={18} className="shrink-0" />}
              {what === 'remove' ? t('acct.remove') : t('acct.signOut')}
            </button>
          ),
        )}
      </SoftCard>
    )
    return (
      <KhataPage
        key={shop.connection}
        connection={shop.connection}
        accountTop={top}
        accountFooter={footer}
        onGone={() => {
          setGone(true)
          void load()
        }}
      />
    )
  }

  // No account on this phone, or no shops on it yet.
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 bg-shell px-4 pb-3 pt-[calc(0.75rem_+_var(--safe-top))] text-white">
        <div className="mx-auto flex h-11 max-w-lg items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-lg font-bold">{t('acct.title')}</span>
          <LanguageToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
          <ThemeToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
        </div>
      </header>
      <main className="mx-auto flex max-w-lg flex-col gap-4 p-4">
        {!shops && !failed ? (
          <TruckLoader />
        ) : (
          <>
            {gone && (
              <p className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{t('acct.gone')}</p>
            )}
            <SoftCard className="flex flex-col items-center gap-3 p-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-bg text-accent-text">
                <BookmarkPlus size={26} />
              </span>
              <div className="text-base font-bold text-ink">{failed ? t('error.generic') : t('acct.emptyTitle')}</div>
              <p className="text-sm text-muted">{t('acct.emptyBody')}</p>
              <p className="text-xs text-muted">{t('acct.qrNote')}</p>
            </SoftCard>
          </>
        )}
      </main>
    </div>
  )
}
