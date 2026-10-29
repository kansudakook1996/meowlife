/** One slice of the spending pie: money that really left OUR pocket (the partner's share is already removed). */
export interface SpendingSlice {
  name: string
  icon: string
  totalSatang: number
}

/** What the partner owed for the card statements due in a month, and what they have actually transferred. */
export interface PartnerMonth {
  month: string
  owedSatang: number
  paidSatang: number
}

export interface CardAnalytics {
  month: string
  /** Ledger expenses + card spending (our share), card bills themselves excluded so nothing is counted twice. */
  spending: SpendingSlice[]
  spendingTotal: number
  /** Oldest first, ending at `month`. */
  partnerMonths: PartnerMonth[]
}

/** Keep the biggest `max - 1` slices and fold the rest into one "อื่น ๆ" slice. */
export function foldSlices(slices: SpendingSlice[], max: number): SpendingSlice[] {
  const sorted = [...slices].filter((s) => s.totalSatang > 0).sort((a, b) => b.totalSatang - a.totalSatang)
  if (sorted.length <= max) return sorted
  const head = sorted.slice(0, max - 1)
  const rest = sorted.slice(max - 1).reduce((sum, s) => sum + s.totalSatang, 0)
  return [...head, { name: 'อื่น ๆ', icon: '➕', totalSatang: rest }]
}