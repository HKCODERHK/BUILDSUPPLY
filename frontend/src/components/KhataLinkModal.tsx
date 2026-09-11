import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { TruckLoader } from '@/components/TruckLoader'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { openWhatsAppShare } from '@/lib/whatsapp'
import type { Customer } from '@/lib/database.types'
import { getKhataLink, khataUrl, stopKhataLink } from '@/services/khata'

/**
 * Customer page → ⋯ → Share khata link. Makes the customer's private,
 * read-only link the first time (migration 028), then Send on WhatsApp /
 * Copy / Open page. WhatsApp only opens the customer's chat with the message
 * ready — the supplier presses Send. "Stop this link" switches the old one
 * off; a new one can be made any time.
 */
export function KhataLinkModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [stopped, setStopped] = useState(false)

  useEffect(() => {
    let active = true
    getKhataLink(customer.id)
      .then((token) => active && setUrl(khataUrl(token)))
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [customer.id])

  function sendOnWhatsApp(link: string) {
    openWhatsAppShare(customer.phone, t('khata.message', { name: customer.name, business: supplier?.business_name ?? '', url: link }))
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  async function stop() {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      await stopKhataLink(customer.id)
      setUrl(null)
      setCopied(false)
      setStopped(true)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function makeNew() {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      setUrl(khataUrl(await getKhataLink(customer.id)))
      setStopped(false)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t('khata.title')} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t('khata.hint', { name: customer.name })}</p>
        {failed && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>}
        {stopped ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink">{t('khata.stopped')}</p>
            <Button onClick={makeNew} disabled={busy}>
              {t('khata.makeNew')}
            </Button>
          </div>
        ) : url ? (
          <>
            <Input readOnly value={url} onFocus={(e) => e.target.select()} className="text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => sendOnWhatsApp(url)}>
                <WhatsAppIcon size={14} /> {t('khata.whatsapp')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => copy(url)}>
                {copied ? t('order.copied') : t('order.copyLink')}
              </Button>
              <a href={url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">
                  {t('ord.openPage')}
                </Button>
              </a>
            </div>
            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={stop}
                disabled={busy}
                className="text-xs font-semibold text-red-600 disabled:opacity-50 dark:text-red-400"
              >
                {t('khata.stop')}
              </button>
              <p className="mt-1 text-xs text-muted">{t('khata.stopHint')}</p>
            </div>
          </>
        ) : (
          !failed && <TruckLoader inline />
        )}
      </div>
    </Modal>
  )
}
