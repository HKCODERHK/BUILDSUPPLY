import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getCustomer, listCustomerSites } from '@/services/customers'
import { supabase } from '@/lib/supabase'
import { openWhatsAppShare } from '@/lib/whatsapp'
import type { Customer, CustomerSite, Invoice } from '@/lib/database.types'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function CustomerProfile() {
  const { id } = useParams<{ id: string }>()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [sites, setSites] = useState<CustomerSite[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([
      getCustomer(id),
      listCustomerSites(id),
      supabase.from('invoices').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
    ]).then(([customerData, sitesData, invoicesRes]) => {
      if (!active) return
      setCustomer(customerData)
      setSites(sitesData)
      setInvoices((invoicesRes.data as Invoice[]) ?? [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  if (loading) return <p className="text-sm text-muted">Loading…</p>
  if (!customer) return <p className="text-sm text-muted">Customer not found.</p>

  const totalPending = invoices.reduce((sum, i) => sum + (Number(i.total) - Number(i.paid)), 0)

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle="Customer profile, khata and activity"
        action={
          <Button
            variant="outline"
            onClick={() =>
              openWhatsAppShare(
                customer.phone,
                `Hi ${customer.name}, your pending balance with us is ${formatINR(totalPending)}. Please clear it at your earliest convenience.`,
              )
            }
          >
            <MessageCircle size={16} /> Remind via WhatsApp
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs font-medium text-muted">Phone</div>
          <div className="mt-1 text-sm font-semibold">{customer.phone ?? '—'}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-muted">Status</div>
          <Badge tone={customer.status === 'Active' ? 'success' : 'neutral'} className="mt-1">
            {customer.status}
          </Badge>
        </Card>
        <Card>
          <div className="text-xs font-medium text-muted">Pending</div>
          <div className="mt-1 text-sm font-semibold text-red-600">{formatINR(totalPending)}</div>
        </Card>
      </div>

      {sites.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Sites</CardTitle>
          </CardHeader>
          <div className="flex flex-col divide-y divide-border">
            {sites.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span>{s.site_name}</span>
                <span className="font-medium text-red-600">{formatINR(s.pending_amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Khata — Invoices</CardTitle>
        </CardHeader>
        <div className="flex flex-col divide-y divide-border">
          {invoices.length === 0 && <p className="py-3 text-sm text-muted">No invoices for this customer yet.</p>}
          {invoices.map((inv) => (
            <Link key={inv.id} to={`/invoices`} className="flex items-center justify-between py-2.5 text-sm hover:text-accent">
              <span>{inv.invoice_no}</span>
              <span className="font-semibold">{formatINR(inv.total)}</span>
              <Badge tone={inv.status === 'Paid' ? 'success' : inv.status === 'Partial' ? 'warning' : 'danger'}>
                {inv.status}
              </Badge>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}
