import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { listShopComplaints, respondComplaint, type ShopComplaint } from '@/services/complaints'

/**
 * Customer complaints about the shop's bills (migration 046): open ones
 * first, each with the customer, the bill, what they wrote, and a reply the
 * customer reads on their khata link. Reached from the Dashboard notice.
 */
export default function Complaints() {
  const { t } = useLanguage()
  const [rows, setRows] = useState<ShopComplaint[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<'open' | 'done'>('open')

  useEffect(() => {
    listShopComplaints().then(setRows, () => setFailed(true))
  }, [])

  const reload = () => listShopComplaints().then(setRows, () => setFailed(true))
  const isOpen = (c: ShopComplaint) => c.status === 'open' || c.status === 'in_progress'
  const shown = (rows ?? []).filter((c) => (tab === 'open' ? isOpen(c) : !isOpen(c)))

  return (
    <div>
      <PageHeader title={t('cmpS.title')} subtitle={t('cmpS.sub')} />
      <div className="mb-4 flex gap-1 rounded-xl bg-surface p-1">
        {(['open', 'done'] as const).map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setTab(x)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              tab === x ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {t(x === 'open' ? 'cmpS.open' : 'cmpS.done')} · {(rows ?? []).filter((c) => (x === 'open' ? isOpen(c) : !isOpen(c))).length}
          </button>
        ))}
      </div>

      {failed ? (
        <Card className="text-sm text-red-600 dark:text-red-400">{t('cmpS.loadFailed')}</Card>
      ) : !rows ? (
        <TruckLoader />
      ) : shown.length === 0 ? (
        <Card className="text-sm text-muted">{t('cmpS.none')}</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((c) => (
            <ComplaintCard key={c.id} c={c} onSaved={reload} />
          ))}
        </div>
      )}
    </div>
  )
}

function ComplaintCard({ c, onSaved }: { c: ShopComplaint; onSaved: () => Promise<void> }) {
  const { t } = useLanguage()
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const open = c.status === 'open' || c.status === 'in_progress'

  async function save(status: 'in_progress' | 'resolved') {
    if (status === 'resolved' && !reply.trim() && !c.supplier_response) return setMsg({ ok: false, text: t('cmpS.needReply') })
    setBusy(true)
    setMsg(null)
    try {
      await respondComplaint(c.id, status, reply.trim())
      setReply('')
      setMsg({ ok: true, text: t('cmpS.saved') })
      await onSaved()
    } catch {
      setMsg({ ok: false, text: t('cmpS.failed') })
    } finally {
      setBusy(false)
    }
  }

  const date = new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {c.customers ? (
            <Link
              to={`/customers/${c.customers.id}`}
              state={{ customerName: c.customers.name }}
              className="font-semibold text-ink hover:underline"
            >
              {c.customers.name}
            </Link>
          ) : null}
          <p className="text-xs text-muted">
            <Link to={`/invoices/${c.invoice_id}`} className="font-medium text-accent-text hover:underline">
              {t('cmpS.bill', { no: c.invoice_no })}
            </Link>{' '}
            · {date}
          </p>
        </div>
        <Badge tone={c.status === 'resolved' || c.status === 'closed' ? 'success' : c.status === 'in_progress' ? 'info' : 'warning'}>
          {t(`cmp.st.${c.status}` as TranslationKey)}
        </Badge>
      </div>
      <p className="mt-2 text-sm font-semibold text-ink">{t(`cmp.cat.${c.category}` as TranslationKey)}</p>
      <p className="mt-1 whitespace-pre-line text-sm text-ink">{c.description}</p>
      {c.supplier_response && (
        <p className="mt-2 rounded-lg bg-surface p-2.5 text-sm text-muted">
          <span className="font-semibold text-ink">{t('cmpS.reply')}: </span>
          {c.supplier_response}
        </p>
      )}

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            aria-label={t('cmpS.reply')}
            placeholder={t('cmpS.reply')}
            value={reply}
            maxLength={1000}
            onChange={(e) => setReply(e.target.value)}
            className="min-h-20 w-full rounded-lg border border-border bg-card p-3 text-sm text-ink"
          />
          <p className="text-xs text-muted">{t('cmpS.replyHint')}</p>
          <div className="flex flex-wrap gap-2">
            {c.customers?.phone && (
              <Button size="sm" variant="ghost" onClick={() => window.location.assign(`tel:${c.customers!.phone}`)}>
                <Phone size={15} /> {t('cmpS.call')}
              </Button>
            )}
            {c.status === 'open' && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void save('in_progress')}>
                {t('cmpS.working')}
              </Button>
            )}
            <Button size="sm" disabled={busy} onClick={() => void save('resolved')}>
              {t('cmpS.resolve')}
            </Button>
          </div>
        </div>
      )}
      {msg && <p className={cn('mt-2 text-sm', msg.ok ? 'text-accent-text' : 'text-red-600 dark:text-red-400')}>{msg.text}</p>}
    </Card>
  )
}
