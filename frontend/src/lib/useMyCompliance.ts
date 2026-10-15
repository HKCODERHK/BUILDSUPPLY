import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getMyCompliance, type ComplianceRecord } from '@/services/compliance'

/**
 * The signed-in supplier's verification record (migration 045): undefined
 * while loading, null when there is none — the admin, a database without
 * 045, or a shop the admin created afterwards that has not started yet.
 */
export function useMyCompliance() {
  const { supplier } = useAuth()
  const id = supplier?.role === 'supplier' ? supplier.id : null
  const [record, setRecord] = useState<ComplianceRecord | null | undefined>(undefined)

  useEffect(() => {
    if (!id) return
    let live = true
    getMyCompliance(id).then(
      (r) => live && setRecord(r),
      () => live && setRecord(null),
    )
    return () => {
      live = false
    }
  }, [id])

  const reload = useCallback(async () => {
    if (!id) return
    setRecord(await getMyCompliance(id).catch(() => null))
  }, [id])

  return { record: id ? record : null, reload }
}
