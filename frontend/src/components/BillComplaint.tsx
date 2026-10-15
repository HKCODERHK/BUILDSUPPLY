import { useEffect, useState } from 'react'
import { MessageSquareWarning } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import {
  COMPLAINT_CATEGORIES,
  fileComplaint,
  listCustomerComplaints,
  type ComplaintCategory,
  type CustomerComplaint,
} from '@/services/complaints'

/**
 * A complaint about one bill, from the customer (migration 046). It sits at
 * the foot of the bill's own view on the khata link and never anywhere more
 * visible — the user's decision: found when it is needed, not tapped for fun.
 * Shows this bill's earlier complaints with the shop's reply; offers a new
 * one only while none is open.
 */
export function BillComplaint({
  source,
  invoiceNo,
  shopName,
}: {
  source: { token?: string; connection?: string }
  invoiceNo: string
  shopName: string
}) {
  const { t } = useLanguage()
  const [list, setList] = useState<CustomerComplaint[] | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<ComplaintCategory | ''>('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const token = source.token
  const connection = source.connection

  useEffect(() => {
    let live = true
    listCustomerComplaints({ token, connection }).then(
      (l) => live && setList(l),
      () => live && setList(null),
    )
    return () => {
      live = false
    }
  }, [token, connection])

  // No 046 (or it could not be read): no complaint option at all.
  if (list === undefined || list === null) return null
  const mine = list.filter((c) => c.invoice_no === invoiceNo)
  // Just sent: open until the list confirms it, even if re-reading failed.
  const hasOpen = sent || mine.some((c) => c.status === 'open' || c.status === 'in_progress')

  async function send() {
    if (!category) return setError(t('cmp.choose'))
    if (text.trim().length < 10) return setError(t('cmp.short'))
    setBusy(true)
    setError(null)
    try {
      await fileComplaint({ token, connection }, invoiceNo, category, text.trim())
    } catch (e) {
      setError(/several/i.test(e instanceof Error ? e.message : '') ? t('cmp.limit') : t('cmp.failed'))
      setBusy(false)
      return
    }
    // Sent. Re-reading the list is separate (#29): a failure there must not
    // show "could not send" for a complaint that went, nor bring the link
    // back as if nothing had been sent.
    setSent(true)
    setOpen(false)
    setText('')
    setCategory('')
    try {
      const fresh = await listCustomerComplaints({ token, connection })
      if (fresh) setList(fresh)
    } catch {
      // The complaint stays shown as sent; the list catches up next time.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-border pt-3">
      {mine.map((c) => (
        <div key={c.created_at} className="mb-3 rounded-xl border border-border bg-surface p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-ink">{t(`cmp.cat.${c.category}` as TranslationKey)}</span>
            <Badge tone={c.status === 'resolved' || c.status === 'closed' ? 'success' : c.status === 'in_progress' ? 'info' : 'warning'}>
              {t(`cmp.st.${c.status}` as TranslationKey)}
            </Badge>
          </div>
          <p className="mt-1 whitespace-pre-line text-muted">{c.description}</p>
          {c.supplier_response && (
            <p className="mt-2 whitespace-pre-line text-ink">
              <span className="font-semibold">{t('cmp.reply', { shop: shopName })}: </span>
              {c.supplier_response}
            </p>
          )}
        </div>
      ))}
      {sent && <p className="mb-2 text-sm font-medium text-accent-text">{t('cmp.sent', { shop: shopName })}</p>}

      {!hasOpen && !open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setSent(false)
          }}
          className="flex items-center gap-1.5 text-xs font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          <MessageSquareWarning size={14} /> {t('cmp.link')}
        </button>
      )}

      {open && (
        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-semibold text-ink">{t('cmp.title', { shop: shopName })}</p>
          <select
            aria-label={t('cmp.what')}
            value={category}
            onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-ink"
          >
            <option value="">{t('cmp.what')}</option>
            {COMPLAINT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`cmp.cat.${c}` as TranslationKey)}
              </option>
            ))}
          </select>
          <textarea
            aria-label={t('cmp.describe')}
            placeholder={t('cmp.describe')}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            className="min-h-24 w-full rounded-lg border border-border bg-card p-3 text-sm text-ink"
          />
          <p className="text-xs text-muted">{t('cmp.note', { shop: shopName })}</p>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button className="flex-1" disabled={busy} onClick={() => void send()}>
              {busy ? t('common.saving') : t('cmp.send')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
