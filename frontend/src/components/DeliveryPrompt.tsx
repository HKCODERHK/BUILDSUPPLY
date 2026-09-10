import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { SuccessHeader } from '@/components/SuccessTick'
import { useLanguage } from '@/context/LanguageContext'
import { isFirstInvoice, markInvoiceDelivered } from '@/services/invoices'

export interface SavedBill {
  id: string
  invoice_no: string
  total: number
  customerName: string
}

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

/**
 * Shown the moment a bill is saved, from New Invoice or from an estimate
 * turned into a bill. The tick confirms the save — a supplier's very first
 * bill says so — and then it asks the one thing saving could not know: whether
 * the material has left the godown. Stock moves on delivery, not on billing.
 * Either answer opens the bill.
 */
export function DeliveryPrompt({ bill }: { bill: SavedBill }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  // Blocks a second tap in the same tick, before `busy` has re-rendered the
  // buttons disabled — marking delivered twice would take the stock twice.
  const answering = useRef(false)
  const first = isFirstInvoice(bill)
  const detail = [first ? bill.invoice_no : '', bill.customerName, formatINR(bill.total)].filter(Boolean).join(' · ')

  async function answer(delivered: boolean) {
    if (answering.current) return
    answering.current = true
    setBusy(true)
    try {
      if (delivered) await markInvoiceDelivered(bill.id)
      // Replace, not push. While this dialog is open, the top history entry is
      // the one it added so the back gesture could close it; putting the bill
      // there leaves history as if the supplier had gone straight from the
      // form to the bill, and back returns to the form once. See Modal.
      navigate(`/invoices/${bill.id}`, { replace: true })
    } finally {
      answering.current = false
      setBusy(false)
    }
  }

  return (
    <Modal title={t('inv.delivery')} onClose={() => answer(false)}>
      <SuccessHeader title={first ? t('inv.firstBillTitle') : t('inv.savedTitle', { no: bill.invoice_no })} detail={detail} />
      <p className="mt-4 border-t border-border pt-4 text-sm font-medium text-ink">{t('inv.deliveryQuestion')}</p>
      <p className="mt-1 mb-4 text-xs text-muted">{t('inv.deliveryHint')}</p>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy} onClick={() => answer(true)}>
          {t('inv.deliveredYes')}
        </Button>
        <Button variant="outline" className="flex-1" disabled={busy} onClick={() => answer(false)}>
          {t('inv.deliveredNot')}
        </Button>
      </div>
    </Modal>
  )
}
