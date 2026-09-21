import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import { supabase } from '@/lib/supabase'
import { localDateKey } from '@/lib/localDate'
import { cn } from '@/lib/utils'
import type { Material, StockLog } from '@/lib/database.types'
import type { TranslationKey } from '@/lib/i18n'
import { listStockLogs, type StockLogFilters } from '@/services/stockLogs'

type Direction = 'all' | 'in' | 'out'

const REASON_KEY: Record<StockLog['reason'], TranslationKey> = {
  added: 'slog.added',
  delivered: 'slog.delivered',
  bill_edited: 'slog.billEdited',
  bill_cancelled: 'slog.billCancelled',
  other: 'slog.other',
}

/**
 * Materials & Stock → Stock logs (migration 036): when a material's stock
 * changed, by how much, what it read before and after, and where the change
 * came from.
 *
 * The rows are written by the database's own trigger and cannot be edited or
 * removed by anyone, which is the point — this is the answer to "the app says
 * 120 bags and I counted 170". It starts the day 036 was applied: earlier
 * movements were never recorded anywhere, and a guessed history would be
 * worse than none.
 */
export function StockLogs({ materials }: { materials: Material[] }) {
  const { t, mt } = useLanguage()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [direction, setDirection] = useState<Direction>('all')
  // What was asked for, and what came back for it. Keeping the filters the
  // rows belong to means the loader is derived during render rather than set
  // from inside the effect, which would cost a second render every time a
  // filter moves.
  const [result, setResult] = useState<{ key: string; rows: StockLog[] | null } | null>(null)
  const [billNos, setBillNos] = useState<Record<string, string>>({})

  const filters: StockLogFilters = {
    from: from || undefined,
    to: to || undefined,
    materialId: materialId || undefined,
    direction: direction === 'all' ? undefined : direction,
  }
  const key = JSON.stringify(filters)

  useEffect(() => {
    let live = true
    listStockLogs(JSON.parse(key) as StockLogFilters)
      .then(async (rows) => {
        if (!live) return
        setResult({ key, rows })
        // The bill a movement came from, so the line says "INV-1045" rather
        // than only "delivered". One request for the whole page.
        const ids = [...new Set(rows.map((r) => r.invoice_id).filter((id): id is string => !!id))]
        if (ids.length === 0) return
        const { data } = await supabase.from('invoices').select('id, invoice_no').in('id', ids)
        if (live && data) setBillNos(Object.fromEntries(data.map((i) => [i.id, i.invoice_no])))
      })
      .catch(() => live && setResult({ key, rows: null }))
    return () => {
      live = false
    }
  }, [key])

  const current = result?.key === key ? result : null
  const logs = current?.rows ?? null
  const failed = !!current && current.rows === null

  const names = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials])

  // Grouped by the supplier's own calendar day, which is what "date-wise"
  // means to them — not the UTC day the timestamp falls in.
  const days = useMemo(() => {
    const by = new Map<string, StockLog[]>()
    for (const log of logs ?? []) {
      const key = localDateKey(log.created_at)
      const list = by.get(key)
      if (list) list.push(log)
      else by.set(key, [log])
    }
    return [...by.entries()]
  }, [logs])

  const filtered = !!(from || to || materialId || direction !== 'all')

  return (
    <div>
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="slog-from">{t('slog.from')}</Label>
            <Input id="slog-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="slog-to">{t('slog.to')}</Label>
            <Input id="slog-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <Label htmlFor="slog-material">{t('inv.material')}</Label>
          <select
            id="slog-material"
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
          >
            <option value="">{t('slog.allMaterials')}</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {mt(m.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['all', 'in', 'out'] as Direction[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={cn(
                'rounded-full border px-3.5 py-2 text-xs font-medium',
                direction === d ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted',
              )}
            >
              {t(d === 'all' ? 'slog.dirAll' : d === 'in' ? 'slog.dirIn' : 'slog.dirOut')}
            </button>
          ))}
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setFrom('')
                setTo('')
                setMaterialId('')
                setDirection('all')
              }}
              className="rounded-full border border-border px-3.5 py-2 text-xs font-medium text-muted"
            >
              {t('slog.clear')}
            </button>
          )}
        </div>
      </Card>

      {failed ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>
      ) : logs === null ? (
        <TruckLoader />
      ) : logs.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{filtered ? t('slog.noneMatch') : t('slog.none')}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map(([day, rows]) => (
            <div key={day}>
              <div className="mb-2 text-xs font-medium text-muted">{longDate(day)}</div>
              <Card className="p-0">
                <div className="divide-y divide-border">
                  {rows.map((log) => {
                    const material = names.get(log.material_id)
                    const unit = material?.stock_unit ?? ''
                    const up = Number(log.delta) > 0
                    const bill = log.invoice_id ? billNos[log.invoice_id] : null
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-3">
                        <span
                          className={cn(
                            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                            up ? 'bg-accent-bg text-accent-text' : 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
                          )}
                        >
                          {up ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium text-ink">
                              {material ? mt(material.name) : t('slog.removedMaterial')}
                            </span>
                            <span className={cn('shrink-0 text-sm font-bold', up ? 'text-accent' : 'text-red-600')}>
                              {up ? '+' : '−'}
                              {Math.abs(Number(log.delta))} {mt(unit)}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-muted">
                            {t('slog.wasNow', {
                              before: `${Number(log.qty_before)}`,
                              after: `${Number(log.qty_after)}`,
                            })}
                          </div>
                          <div className="mt-0.5 text-xs text-muted">
                            {shortTime(log.created_at)} · {t(REASON_KEY[log.reason])}
                            {bill && ` · ${bill}`}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </div>
          ))}
          <p className="text-xs text-muted">{t('slog.startsNote')}</p>
        </div>
      )}
    </div>
  )
}

function longDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}
