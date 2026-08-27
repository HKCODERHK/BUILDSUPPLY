import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { listMaterials } from '@/services/materials'
import type { Material } from '@/lib/database.types'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function Stock() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listMaterials()
      .then(setMaterials)
      .finally(() => setLoading(false))
  }, [])

  const totalValue = materials.reduce((sum, m) => sum + m.rate * m.stock_qty, 0)
  const lowStock = materials.filter((m) => m.stock_qty <= 5)

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle="Godown quantities, updated as bills go out"
        action={
          <Link to="/materials">
            <Button variant="outline">Manage materials</Button>
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <div className="text-xs font-medium text-muted">Stock value</div>
          <div className="mt-1 text-2xl font-bold text-ink">{formatINR(totalValue)}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-muted">Low stock items</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{lowStock.length}</div>
        </Card>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Material</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium">On hand</th>
                  <th className="py-2 pr-3 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {materials.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 pr-3 font-medium text-ink">{m.name}</td>
                    <td className="py-2.5 pr-3 text-muted">{m.category ?? '—'}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={m.stock_qty <= 5 ? 'danger' : 'success'}>
                        {m.stock_qty} {m.stock_unit ?? ''}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3">{formatINR(m.rate * m.stock_qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
