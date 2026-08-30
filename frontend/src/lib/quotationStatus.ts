import type { QuotationStatus } from './database.types'

export const QUOTATION_STATUS_TONE: Record<QuotationStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  Draft: 'neutral',
  Sent: 'info',
  Converted: 'success',
  Expired: 'danger',
}
