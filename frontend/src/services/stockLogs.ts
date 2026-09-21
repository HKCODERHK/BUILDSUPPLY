import { supabase } from '@/lib/supabase'
import type { StockLog } from '@/lib/database.types'

export interface StockLogFilters {
  /** A calendar day in the phone's own timezone, `YYYY-MM-DD`. */
  from?: string
  to?: string
  materialId?: string
  direction?: 'in' | 'out'
}

/**
 * A material's stock history (migration 036). Nobody can write to this table —
 * the rows come from the `_log_stock` trigger — so this is read-only by
 * construction, and RLS keeps it to the supplier's own.
 *
 * The date filters are the supplier's own calendar day, not UTC: `created_at`
 * is UTC and India is +5:30, so slicing an ISO string would file anything
 * recorded between midnight and 5:30am under the day before (see
 * `lib/localDate.ts`). The day's own boundaries are sent instead.
 */
export async function listStockLogs(filters: StockLogFilters = {}, limit = 200): Promise<StockLog[]> {
  let query = supabase
    .from('stock_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  if (filters.from) query = query.gte('created_at', startOfDay(filters.from))
  if (filters.to) query = query.lt('created_at', startOfDay(nextDay(filters.to)))
  if (filters.materialId) query = query.eq('material_id', filters.materialId)
  if (filters.direction === 'in') query = query.gt('delta', 0)
  if (filters.direction === 'out') query = query.lt('delta', 0)

  const { data, error } = await query
  if (error) {
    // Before 036 is pasted the table does not exist; the screen says so
    // rather than showing a red error.
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw error
  }
  return data ?? []
}

/** Midnight at the start of that calendar day, where the phone is. */
function startOfDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).toISOString()
}

function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const next = new Date(y, (m ?? 1) - 1, (d ?? 1) + 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

/** True while the table is not there yet — 036 has not been pasted. */
export async function stockLogsReady(): Promise<boolean> {
  const { error } = await supabase.from('stock_logs').select('id').limit(1)
  return !(error && (error.code === '42P01' || error.code === 'PGRST205'))
}
