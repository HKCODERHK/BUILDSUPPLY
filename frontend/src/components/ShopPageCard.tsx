import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Check, ExternalLink, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { SupplierOffer } from '@/lib/database.types'
import { BRAND_COLORS, DAYS, SOCIAL_KEYS, readHours, safeLink, type DayHours, type DayKey, type ShopHours, type SocialKey } from '@/lib/shopPage'
import { cn } from '@/lib/utils'
import { orderPageUrl } from '@/services/orders'
import {
  addOffer,
  deleteOffer,
  listMaterialPhotos,
  listOffers,
  removeShopImage,
  saveShopPage,
  setMaterialPhoto,
  replaceShopImage,
  setOfferActive,
} from '@/services/shopPage'

const OPEN_DEFAULT: DayHours = { open: '09:00', close: '19:00' }

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Today in India, as YYYY-MM-DD — an offer's last day is the shop's own calendar day. */
function todayIst() {
  return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
}

/**
 * Settings → Shop page (migration 042): what the shop's customers see on its
 * order page and their khata links — a cover picture, one of ten colours, a
 * few lines about the business, WhatsApp, hours, delivery information, social
 * links, product photos and offers. All optional. Pictures are shrunk on the
 * phone before they are uploaded.
 */
export function ShopPageCard() {
  const { supplier, refreshSupplier } = useAuth()
  const { t } = useLanguage()
  const [color, setColor] = useState(supplier?.brand_color ?? 'green')
  const [about, setAbout] = useState(supplier?.about ?? '')
  const [whatsapp, setWhatsapp] = useState(supplier?.whatsapp ?? '')
  const [delivery, setDelivery] = useState(supplier?.delivery_info ?? '')
  const [hours, setHours] = useState<ShopHours>(() => readHours(supplier?.hours) ?? {})
  const [social, setSocial] = useState<Record<SocialKey, string>>(() => {
    const s = (supplier?.social ?? {}) as Record<string, string>
    return { instagram: s.instagram ?? '', facebook: s.facebook ?? '', youtube: s.youtube ?? '', website: s.website ?? '' }
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coverBusy, setCoverBusy] = useState(false)
  const coverInput = useRef<HTMLInputElement>(null)

  if (!supplier || supplier.role !== 'supplier') return null
  const me = supplier

  const badLinks = SOCIAL_KEYS.filter((k) => social[k].trim() && !safeLink(social[k]))

  function setDay(day: DayKey, value: DayHours | undefined) {
    setHours((h) => {
      const next = { ...h }
      if (value) next[day] = value
      else delete next[day]
      return next
    })
    setSaved(false)
  }

  async function save() {
    if (saving) return
    if (badLinks.length) {
      setError(t('shop.linkInvalid'))
      return
    }
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const links = Object.fromEntries(SOCIAL_KEYS.filter((k) => social[k].trim()).map((k) => [k, social[k].trim()]))
      await saveShopPage(me.id, {
        brand_color: color === 'green' ? null : color,
        about: about.trim() || null,
        whatsapp: whatsapp || null,
        delivery_info: delivery.trim() || null,
        hours: Object.keys(hours).length ? hours : null,
        social: Object.keys(links).length ? links : null,
      })
      await refreshSupplier()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error && err.message === 'shop-invalid' ? t('shop.invalid') : t('error.generic'))
    } finally {
      setSaving(false)
    }
  }

  async function pickCover(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || coverBusy) return
    setCoverBusy(true)
    setError(null)
    try {
      await replaceShopImage(me.id, file, 'cover', me.cover_url, async (url) => {
        await saveShopPage(me.id, { cover_url: url })
      })
      await refreshSupplier()
    } catch (err) {
      setError(err instanceof Error && err.message === 'not-image' ? t('shop.notImage') : t('error.generic'))
    } finally {
      setCoverBusy(false)
    }
  }

  async function clearCover() {
    if (coverBusy) return
    setCoverBusy(true)
    try {
      await saveShopPage(me.id, { cover_url: null })
      await removeShopImage(me.id, me.cover_url)
      await refreshSupplier()
    } catch {
      setError(t('error.generic'))
    } finally {
      setCoverBusy(false)
    }
  }

  const previewUrl = me.order_link && me.ordering_enabled ? orderPageUrl(me.order_link) : null

  return (
    <div className="mt-4 flex max-w-lg flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('shop.settingsTitle')}</CardTitle>
        </CardHeader>
        <p className="-mt-2 text-xs text-muted">{t('shop.settingsHint')}</p>
        {previewUrl ? (
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            <ExternalLink size={15} /> {t('shop.preview')}
          </a>
        ) : (
          <p className="mt-3 text-xs text-muted">{t('shop.previewNeedsOrders')}</p>
        )}
      </Card>

      {/* The cover, saved the moment it is chosen. */}
      <Card>
        <Label>{t('shop.cover')}</Label>
        <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-surface">
          {me.cover_url ? (
            <img src={me.cover_url} alt="" className="aspect-[16/7] w-full object-cover" />
          ) : (
            <div className="flex aspect-[16/7] w-full items-center justify-center text-muted">
              <ImagePlus size={28} strokeWidth={1.6} />
            </div>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted">{t('shop.coverHint')}</p>
        <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pickCover} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => coverInput.current?.click()} disabled={coverBusy}>
            {coverBusy ? <LoaderCircle size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            {coverBusy ? t('shop.uploading') : me.cover_url ? t('shop.changePhoto') : t('shop.choosePhoto')}
          </Button>
          {me.cover_url && (
            <Button size="sm" variant="ghost" onClick={clearCover} disabled={coverBusy}>
              <Trash2 size={14} /> {t('shop.removePhoto')}
            </Button>
          )}
        </div>
      </Card>

      {/* Everything typed, saved together with one button at the end. */}
      <Card className="flex flex-col gap-5">
        <div>
          <Label>{t('shop.color')}</Label>
          <p className="mb-2 text-xs text-muted">{t('shop.colorHint')}</p>
          <div className="grid grid-cols-5 gap-2">
            {BRAND_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setColor(c.key)
                  setSaved(false)
                }}
                aria-pressed={color === c.key}
                aria-label={t(`brand.${c.key}`)}
                className="flex flex-col items-center gap-1"
              >
                <span
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-card',
                    color === c.key && 'ring-2 ring-ink',
                  )}
                  style={{ backgroundColor: c.swatch }}
                >
                  {color === c.key && <Check size={18} strokeWidth={3} />}
                </span>
                <span className="w-full truncate text-center text-[10px] text-muted">{t(`brand.${c.key}`)}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="shop-about">{t('shop.about')}</Label>
          <textarea
            id="shop-about"
            rows={3}
            maxLength={600}
            placeholder={t('shop.aboutPlaceholder')}
            value={about}
            onChange={(e) => {
              setAbout(e.target.value)
              setSaved(false)
            }}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <p className="text-right text-[11px] text-muted">{about.length}/600</p>
        </div>

        <div>
          <Label htmlFor="shop-whatsapp">{t('shop.whatsapp')}</Label>
          <PhoneInput
            id="shop-whatsapp"
            value={whatsapp}
            onValueChange={(v) => {
              setWhatsapp(v)
              setSaved(false)
            }}
          />
          <p className="mt-1.5 text-xs text-muted">{t('shop.whatsappHint')}</p>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <Label>{t('shop.hours')}</Label>
            <button
              type="button"
              className="text-xs font-semibold text-accent"
              onClick={() => {
                const first = DAYS.map((d) => hours[d]).find(Boolean) ?? OPEN_DEFAULT
                setHours(Object.fromEntries(DAYS.map((d) => [d, first])) as ShopHours)
                setSaved(false)
              }}
            >
              {t('shop.sameEveryDay')}
            </button>
          </div>
          <div className="mt-2 flex flex-col divide-y divide-border rounded-xl border border-border">
            {DAYS.map((d) => {
              const h = hours[d]
              const closed = !!h && 'closed' in h
              return (
                <div key={d} className="flex flex-col gap-2 px-3 py-2.5">
                  {/* Day and Closed on one line, the two times on their own
                      line under it — side by side they were clipped at 320px. */}
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-sm font-medium text-ink">{t(`day.${d}`)}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">
                      {closed ? t('shop.closed') : !h ? t('shop.notSet') : ''}
                    </span>
                    {!h && (
                      <button type="button" className="shrink-0 px-1 text-sm font-semibold text-accent" onClick={() => setDay(d, OPEN_DEFAULT)}>
                        +
                      </button>
                    )}
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                      <input type="checkbox" checked={closed} onChange={(e) => setDay(d, e.target.checked ? { closed: true } : OPEN_DEFAULT)} />
                      {t('shop.closed')}
                    </label>
                  </div>
                  {h && !closed && (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        aria-label={`${t(`day.${d}`)} open`}
                        value={(h as { open: string }).open}
                        onChange={(e) => setDay(d, { open: e.target.value || '09:00', close: (h as { close: string }).close })}
                        className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-sm text-ink"
                      />
                      <span className="shrink-0 text-xs text-muted">–</span>
                      <input
                        type="time"
                        aria-label={`${t(`day.${d}`)} close`}
                        value={(h as { close: string }).close}
                        onChange={(e) => setDay(d, { open: (h as { open: string }).open, close: e.target.value || '19:00' })}
                        className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-sm text-ink"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <Label htmlFor="shop-delivery">{t('shop.delivery')}</Label>
          <textarea
            id="shop-delivery"
            rows={2}
            maxLength={400}
            placeholder={t('shop.deliveryPlaceholder')}
            value={delivery}
            onChange={(e) => {
              setDelivery(e.target.value)
              setSaved(false)
            }}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div>
          <Label>{t('shop.social')}</Label>
          <p className="mb-2 text-xs text-muted">{t('shop.socialHint')}</p>
          <div className="flex flex-col gap-2">
            {SOCIAL_KEYS.map((k) => (
              <div key={k}>
                <Input
                  aria-label={t(`social.${k}`)}
                  placeholder={`${t(`social.${k}`)} — https://…`}
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={social[k]}
                  onChange={(e) => {
                    setSocial((s) => ({ ...s, [k]: e.target.value }))
                    setSaved(false)
                    setError(null)
                  }}
                />
                {badLinks.includes(k) && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t('shop.linkInvalid')}</p>}
              </div>
            ))}
          </div>
        </div>

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? t('common.saving') : t('shop.save')}
          </Button>
          {saved && <span className="text-xs text-accent">{t('set.saved')}</span>}
        </div>
      </Card>

      <ProductPhotos supplierId={me.id} />
      <Offers />
    </div>
  )
}

/** Each material with its photo: the shop's own, the catalog's, or none. Saved on choosing. */
function ProductPhotos({ supplierId }: { supplierId: string }) {
  const { t } = useLanguage()
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listMaterialPhotos>> | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const target = useRef<string | null>(null)

  useEffect(() => {
    listMaterialPhotos()
      .then(setRows)
      .catch(() => setFailed(true))
  }, [])

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const id = target.current
    const row = rows?.find((r) => r.id === id)
    if (!file || !id || !row || busy) return
    setBusy(id)
    setFailed(false)
    try {
      const url = await replaceShopImage(supplierId, file, `material-${id}`, row.photo_url, (u) => setMaterialPhoto(id, u))
      setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, photo_url: url } : r)) ?? null)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  async function clear(id: string) {
    const row = rows?.find((r) => r.id === id)
    if (!row || busy) return
    setBusy(id)
    try {
      await setMaterialPhoto(id, null)
      await removeShopImage(supplierId, row.photo_url)
      setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, photo_url: null } : r)) ?? null)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('shop.photos')}</CardTitle>
      </CardHeader>
      <p className="-mt-2 mb-3 text-xs text-muted">{t('shop.photosHint')}</p>
      {failed && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} />
      {rows && rows.length === 0 && <p className="text-sm text-muted">{t('shop.noMaterials')}</p>}
      <div className="flex flex-col divide-y divide-border">
        {rows?.map((r) => {
          const shown = r.photo_url ?? r.catalog_photo
          return (
            <div key={r.id} className="flex items-center gap-3 py-2.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface text-muted">
                {shown ? <img src={shown} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{r.name}</span>
                <span className="block text-xs text-muted">
                  {r.photo_url ? t('shop.ownPhoto') : r.catalog_photo ? t('shop.catalogPhoto') : t('shop.noPhoto')}
                </span>
              </span>
              {busy === r.id ? (
                <LoaderCircle size={18} className="shrink-0 animate-spin text-muted" />
              ) : (
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      target.current = r.id
                      input.current?.click()
                    }}
                    disabled={busy !== null}
                  >
                    {r.photo_url ? t('shop.changePhoto') : t('shop.choosePhoto')}
                  </Button>
                  {r.photo_url && (
                    <button type="button" aria-label={t('shop.removePhoto')} onClick={() => clear(r.id)} className="p-2 text-muted">
                      <Trash2 size={16} />
                    </button>
                  )}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/** Offers: add, pause / show again, delete. Each saves at once. */
function Offers() {
  const { t } = useLanguage()
  const [offers, setOffers] = useState<SupplierOffer[] | null>(null)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [until, setUntil] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const reload = () =>
    listOffers()
      .then(setOffers)
      .catch(() => setFailed(true))
  useEffect(() => {
    void reload()
  }, [])

  async function run(job: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      await job()
      await reload()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const today = todayIst()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('shop.offers')}</CardTitle>
      </CardHeader>
      <p className="-mt-2 mb-3 text-xs text-muted">{t('shop.offersHint')}</p>
      {failed && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>}
      <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
        <div>
          <Label htmlFor="offer-title">{t('shop.offerTitle')}</Label>
          <Input id="offer-title" maxLength={80} placeholder={t('shop.offerTitlePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="offer-details">{t('shop.offerDetails')}</Label>
          <Input id="offer-details" maxLength={300} value={details} onChange={(e) => setDetails(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="offer-until">{t('shop.offerUntil')}</Label>
          <Input id="offer-until" type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
        <Button
          size="sm"
          className="self-start"
          disabled={busy || !title.trim()}
          onClick={() =>
            run(async () => {
              await addOffer({ title: title.trim(), details: details.trim() || null, valid_until: until || null })
              setTitle('')
              setDetails('')
              setUntil('')
            })
          }
        >
          {t('shop.addOffer')}
        </Button>
      </div>
      {offers && offers.length === 0 && <p className="mt-3 text-sm text-muted">{t('shop.noOffers')}</p>}
      <div className="mt-2 flex flex-col divide-y divide-border">
        {offers?.map((o) => {
          const ended = !!o.valid_until && o.valid_until < today
          return (
            <div key={o.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className={cn('break-words text-sm font-semibold', ended || !o.active ? 'text-muted' : 'text-ink')}>{o.title}</div>
                {o.details && <div className="break-words text-xs text-muted">{o.details}</div>}
                <div className="text-[11px] text-muted">
                  {ended ? t('shop.offerEnded') : !o.active ? t('shop.offerPaused') : o.valid_until ? t('shop.untilDate', { date: formatDate(o.valid_until) }) : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!ended && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => setOfferActive(o.id, !o.active))}>
                    {o.active ? t('shop.pause') : t('shop.resume')}
                  </Button>
                )}
                <button type="button" aria-label={t('shop.delete')} disabled={busy} onClick={() => run(() => deleteOffer(o.id))} className="p-2 text-muted">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
