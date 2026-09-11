import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { isValidOrderLink, orderPageUrl, sanitizeOrderLink, saveOrderSettings, suggestOrderLink } from '@/services/orders'

/**
 * Settings → Online orders: switch ordering on, choose whether customers see
 * prices, set the link, and share it. Sharing only opens WhatsApp (or the
 * phone's share sheet) — the supplier picks the chat and presses Send.
 */
export function OrderSettingsCard() {
  const { supplier, refreshSupplier } = useAuth()
  const { t } = useLanguage()
  const [enabled, setEnabled] = useState(supplier?.ordering_enabled ?? false)
  const [showPrices, setShowPrices] = useState(supplier?.order_show_prices ?? false)
  const [link, setLink] = useState(supplier?.order_link ?? (supplier ? suggestOrderLink(supplier.business_name) : ''))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!supplier || supplier.role !== 'supplier') return null

  const liveUrl = supplier.order_link && supplier.ordering_enabled ? orderPageUrl(supplier.order_link) : null

  async function save() {
    if (!supplier || saving) return
    if (!isValidOrderLink(link)) {
      setError(t('ord.linkInvalid'))
      return
    }
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await saveOrderSettings(supplier.id, { ordering_enabled: enabled, order_show_prices: showPrices, order_link: link })
      await refreshSupplier()
      setSaved(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setError(message === 'link-taken' ? t('ord.linkTaken') : message === 'link-invalid' ? t('ord.linkInvalid') : t('error.generic'))
    } finally {
      setSaving(false)
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  async function share(url: string) {
    const message = t('ord.shareMessage', { business: supplier?.business_name ?? '', url })
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: message })
        return
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
      }
    }
    openWhatsAppShare(null, message)
  }

  return (
    <Card className="mt-4 max-w-lg">
      <CardHeader>
        <CardTitle>{t('ord.settingsTitle')}</CardTitle>
      </CardHeader>
      <p className="-mt-2 mb-4 text-xs text-muted">{t('ord.settingsHint')}</p>
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setSaved(false) }} />
          {t('ord.enable')}
        </label>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-1" checked={showPrices} onChange={(e) => { setShowPrices(e.target.checked); setSaved(false) }} />
          <span>
            <span className="font-medium">{t('ord.showPrices')}</span>
            <span className="block text-xs text-muted">{t('ord.showPricesHint')}</span>
          </span>
        </label>
        <div>
          <Label htmlFor="order-link">{t('ord.link')}</Label>
          <div className="flex items-center overflow-hidden rounded-lg border border-border bg-card focus-within:border-accent">
            <span className="shrink-0 pl-3 text-xs text-muted">/order/</span>
            <input
              id="order-link"
              value={link}
              onChange={(e) => {
                setLink(sanitizeOrderLink(e.target.value))
                setSaved(false)
                setError(null)
              }}
              className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm text-ink outline-none"
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">{t('ord.linkHint')}</p>
        </div>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? t('common.saving') : t('cust.saveChanges')}
          </Button>
          {saved && <span className="text-xs text-accent">{t('set.saved')}</span>}
        </div>

        {liveUrl && (
          <div className="rounded-lg bg-surface p-3">
            <Input readOnly value={liveUrl} onFocus={(e) => e.target.select()} className="mb-3 text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => copy(liveUrl)}>
                {copied ? t('order.copied') : t('order.copyLink')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => share(liveUrl)}>
                <WhatsAppIcon size={14} /> {t('ord.share')}
              </Button>
              <a href={liveUrl} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">{t('ord.openPage')}</Button>
              </a>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
