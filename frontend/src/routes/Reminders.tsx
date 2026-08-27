import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { listCustomers, listCustomerBalances } from '@/services/customers'
import { openWhatsAppShare } from '@/lib/whatsapp'
import type { Customer, CustomerBalance } from '@/lib/database.types'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

interface PendingCustomer extends Customer {
  pending: number
}

export default function Reminders() {
  const [pending, setPending] = useState<PendingCustomer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listCustomers(), listCustomerBalances()]).then(([customers, balances]) => {
      const balanceMap = new Map<string, CustomerBalance>(balances.map((b) => [b.customer_id, b]))
      const withPending = customers
        .map((c) => ({ ...c, pending: balanceMap.get(c.id)?.pending ?? 0 }))
        .filter((c) => c.pending > 0)
        .sort((a, b) => b.pending - a.pending)
      setPending(withPending)
      setLoading(false)
    })
  }, [])

  return (
    <div>
      <PageHeader title="Pending Reminders" subtitle="Customers with outstanding balances — reminders go via WhatsApp, nothing is sent automatically" />

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-border">
            {pending.length === 0 && <p className="py-3 text-sm text-muted">No pending balances — everyone's paid up.</p>}
            {pending.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium text-ink">{c.name}</div>
                  <div className="text-xs text-muted">{c.phone ?? 'No phone on file'}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-red-600">{formatINR(c.pending)}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!c.phone}
                    onClick={() =>
                      openWhatsAppShare(
                        c.phone,
                        `Hi ${c.name}, a gentle reminder that your pending balance with us is ${formatINR(c.pending)}. Please clear it at your earliest convenience.`,
                      )
                    }
                  >
                    <MessageCircle size={14} /> Remind
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
