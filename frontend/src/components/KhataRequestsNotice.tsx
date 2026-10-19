import { useEffect, useState } from 'react'
import { Link2 } from 'lucide-react'
import { KhataLinkModal } from '@/components/KhataLinkModal'
import { useLanguage } from '@/context/LanguageContext'
import type { Customer } from '@/lib/database.types'
import { getCustomer } from '@/services/customers'
import { handleKhataLinkRequest, openKhataLinkRequests } from '@/services/khataRequests'

type Row = { id: string; customer: Customer }

/** The open requests with their customers, newest five. */
async function fetchRows(): Promise<Row[]> {
  const requests = await openKhataLinkRequests()
  const found = await Promise.all(
    requests.slice(0, 5).map((r) =>
      getCustomer(r.customer_id)
        .then((customer) => ({ id: r.id, customer }))
        .catch(() => null),
    ),
  )
  return found.filter((r): r is Row => r !== null)
}

/**
 * Dashboard: customers who asked for their khata link again (048). One row
 * each, and "Send link" opens the customer page's own Share khata link dialog,
 * whose WhatsApp goes only to the number the shop has on file. Closing that
 * dialog puts the request away; nothing is sent without the shop pressing Send.
 */
export function KhataRequestsNotice() {
  const { t } = useLanguage()
  const [rows, setRows] = useState<Row[]>([])
  const [sharing, setSharing] = useState<Row | null>(null)

  const reload = () => fetchRows().then(setRows)
  useEffect(() => {
    let live = true
    fetchRows().then((r) => live && setRows(r))
    return () => {
      live = false
    }
  }, [])

  if (rows.length === 0) return null
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 dark:border-amber-900 dark:bg-amber-950">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link2 size={18} className="shrink-0 text-amber-700 dark:text-amber-400" />
            <span className="min-w-0 text-sm font-medium text-amber-900 dark:text-amber-200">
              {t('dash.khataAsked', { name: r.customer.name })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSharing(r)}
            className="flex min-h-11 shrink-0 items-center text-xs font-semibold text-amber-800 dark:text-amber-300"
          >
            {t('dash.khataSend')}
          </button>
        </div>
      ))}
      {sharing && (
        <KhataLinkModal
          customer={sharing.customer}
          onClose={() => {
            const id = sharing.id
            setSharing(null)
            void handleKhataLinkRequest(id)
              .catch(() => undefined)
              .then(reload)
          }}
        />
      )}
    </div>
  )
}
