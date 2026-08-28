import { useEffect, useState } from 'react'
import { FileText, FileSpreadsheet } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { listInvoices, type InvoiceWithCustomer } from '@/services/invoices'
import { listCustomers, listCustomerBalances } from '@/services/customers'
import type { Customer, CustomerBalance } from '@/lib/database.types'
import { exportExcel, exportPdf } from '@/lib/export'
import { logActivity } from '@/services/activityLog'

export default function Reports() {
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [balances, setBalances] = useState<CustomerBalance[]>([])

  useEffect(() => {
    listInvoices().then(setInvoices)
    listCustomers().then(setCustomers)
    listCustomerBalances().then(setBalances)
  }, [])

  function invoiceRows(): (string | number)[][] {
    return invoices.map((i) => [i.invoice_no, i.customers?.name ?? '—', i.total, i.paid, i.status])
  }

  function customerRows(): (string | number)[][] {
    const balanceMap = new Map(balances.map((b) => [b.customer_id, b]))
    return customers.map((c) => [c.name, c.phone ?? '—', c.site ?? '—', balanceMap.get(c.id)?.pending ?? 0])
  }

  return (
    <div>
      <PageHeader title="Reports" subtitle="Export your data as PDF or Excel — generated in your browser" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>All Invoices</CardTitle>
          </CardHeader>
          <p className="mb-4 text-sm text-muted">{invoices.length} invoices</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                exportPdf('Invoices', ['Invoice', 'Customer', 'Total', 'Paid', 'Status'], invoiceRows(), 'invoices.pdf')
                void logActivity('supplier', 'invoice_generated', { details: { format: 'pdf', count: invoices.length } })
              }}
            >
              <FileText size={15} /> PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                exportExcel('Invoices', ['Invoice', 'Customer', 'Total', 'Paid', 'Status'], invoiceRows(), 'invoices.xlsx')
                void logActivity('supplier', 'invoice_generated', { details: { format: 'excel', count: invoices.length } })
              }}
            >
              <FileSpreadsheet size={15} /> Excel
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer Balances</CardTitle>
          </CardHeader>
          <p className="mb-4 text-sm text-muted">{customers.length} customers</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => exportPdf('Customer Balances', ['Name', 'Phone', 'Site', 'Pending'], customerRows(), 'customers.pdf')}
            >
              <FileText size={15} /> PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => exportExcel('Customers', ['Name', 'Phone', 'Site', 'Pending'], customerRows(), 'customers.xlsx')}
            >
              <FileSpreadsheet size={15} /> Excel
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
