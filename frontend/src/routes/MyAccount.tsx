import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, BookmarkPlus, LogOut, RotateCcw, ShoppingBag, Store, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TruckLoader } from '@/components/TruckLoader'
import { CustomerHeader, SoftCard } from '@/components/CustomerHome'
import { useLanguage } from '@/context/LanguageContext'
import { cn } from '@/lib/utils'
import { signOutCustomer } from '@/lib/customerAuth'
import { forgetShopOnPhone, knownShops } from '@/lib/customerLinks'
import { disconnectShop, myShops, readCurrentShop, forgetCurrentShop, rememberCurrentShop, type MyShop } from '@/services/customerAccount'
import KhataPage from './KhataPage'
import { BuildSupplyFooter } from '@/components/BuildSupplyFooter'

/**
 * /me — the customer's own BuildSupply (migration 041). Once a khata link has
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
  // Remove or sign out did not go through: said, not swallowed (#25).
  const [actionFailed, setActionFailed] = useState<'remove' | 'signout' | null>(null)

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
    setActionFailed(null)
    try {
      await disconnectShop(current)
      // The customer removed it, the shop did not stop it: without this, the
      // reload took the missing shop for a stopped link and said so (#5).
      forgetCurrentShop()
      setAsking(null)
      navigate('/me', { replace: true })
      await load()
    } catch {
      setActionFailed('remove')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    if (busy) return
    setBusy(true)
    setActionFailed(null)
    // The shops this account holds, read before the account goes.
    const links = (shops ?? []).map((s) => s.order_link).filter((l): l is string => !!l)
    try {
      await signOutCustomer()
      // Every saved shop leaves this phone, and with them their links and the
      // customer's details for them (#26) — the warning says so.
      links.forEach(forgetShopOnPhone)
      forgetCurrentShop()
      setAsking(null)
      setGone(false)
      setShops([])
      setCurrent(null)
    } catch {
      setActionFailed('signout')
    } finally {
      setBusy(false)
    }
  }

  function retry() {
    setFailed(false)
    setShops(null)
    void load()
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
                {what === 'remove'
                  ? t('acct.removeConfirm', { shop: shop.business_name })
                  : shops && shops.length > 1
                    ? t('acct.signOutConfirmMany', { count: shops.length })
                    : t('acct.signOutConfirm')}
              </p>
              {actionFailed === what && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('error.generic')}</p>}
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
              onClick={() => {
                setActionFailed(null)
                setAsking(what)
              }}
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
  const phoneShops = shops && shops.length === 0 ? knownShops().slice(0, 5) : []
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <CustomerHeader title={t('acct.title')} />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
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
              {failed ? (
                // Not "no shops": it could not be read (#25).
                <Button variant="outline" className="h-11" onClick={retry}>
                  <RotateCcw size={16} /> {t('account.retry')}
                </Button>
              ) : (
                <>
                  <p className="text-sm text-muted">{t('acct.emptyBody')}</p>
                  <p className="text-xs text-muted">{t('acct.qrNote')}</p>
                </>
              )}
            </SoftCard>
            {/* Installed from a shop's QR, this page opened empty with no way
                back (#25): the shops this phone has used, from the phone. */}
            {!failed && phoneShops.length > 0 && (
              <SoftCard className="flex flex-col divide-y divide-border p-2">
                <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('acct.onThisPhone')}</div>
                {phoneShops.map((p) => (
                  <Link
                    key={p.link}
                    to={p.khata ? `/khata/${p.khata}` : `/order/${p.link}`}
                    className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-2.5 text-sm text-ink hover:bg-surface"
                  >
                    {p.khata ? <BookOpen size={18} className="shrink-0 text-accent" /> : <ShoppingBag size={18} className="shrink-0 text-accent" />}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{p.khata ? t('order.tileKhata') : t('khata.orderMaterials')}</span>
                      <span className="block truncate text-xs text-muted">/{p.link}</span>
                    </span>
                  </Link>
                ))}
              </SoftCard>
            )}
          </>
        )}
        <BuildSupplyFooter />
      </main>
    </div>
  )
}
