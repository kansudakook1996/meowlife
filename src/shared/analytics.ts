/** One slice of the spending pie: money that really left OUR pocket (the partner's share is already removed). */
export interface SpendingSlice {
  name: string
  icon: string
  totalSatang: number
}

/** Where a piece of spending comes from. The order here is the order shown in the report. */
export type SpendSource = 'card' | 'installment' | 'recurring' | 'other'

export const SPEND_SOURCES: Array<{ key: SpendSource; label: string; icon: string; hint: string }> = [
  { key: 'card', label: 'บัตรเครดิต', icon: '💳', hint: 'ยอดที่รูดใช้จ่ายในบัตร (ส่วนของเรา)' },
  { key: 'installment', label: 'ผ่อนบัตรเครดิต', icon: '📅', hint: 'ค่างวดที่ผ่อนในรอบนั้น (ส่วนของเรา)' },
  { key: 'recurring', label: 'รายการประจำ', icon: '🔁', hint: 'รายการประจำในหน้ารายการประจำ และรายการประจำที่ตั้งไว้ในบัตร' },
  { key: 'other', label: 'รายจ่ายอื่น ๆ', icon: '🧾', hint: 'รายจ่ายที่จดเองในรายการรับ-จ่าย' }
]

export interface SourceSpend {
  source: SpendSource
  totalSatang: number
  /** Biggest first. Instalments are listed per plan; everything else per category. */
  items: SpendingSlice[]
}

/** Everything of OURS that left in one month, split by where it came from. Card statements count in the month their bill is due. */
export interface MonthSpend {
  month: string
  totalSatang: number
  /** Always one entry per source, in `SPEND_SOURCES` order (zero when empty). */
  sources: SourceSpend[]
  /** The same money grouped by category (all sources together), biggest first. */
  categories: SpendingSlice[]
}

export interface CardAnalytics {
  month: string
  /** Same as `months.at(-1).categories`: the spending pie of the month. */
  spending: SpendingSlice[]
  spendingTotal: number
  /** Oldest first, ending at `month`. */
  months: MonthSpend[]
}

/** One piece of our spending before it is grouped. */
export interface SpendLine {
  source: SpendSource
  /** Category name used for the pie and the category totals. */
  category: string
  icon: string
  /** Name shown inside the source list (the plan's title for instalments, otherwise the category). */
  label: string
  labelIcon: string
  satang: number
}

function addTo(map: Map<string, SpendingSlice>, name: string, icon: string, satang: number): void {
  const cur = map.get(name)
  if (cur) cur.totalSatang += satang
  else map.set(name, { name, icon, totalSatang: satang })
}

const biggestFirst = (map: Map<string, SpendingSlice>): SpendingSlice[] => [...map.values()].sort((a, b) => b.totalSatang - a.totalSatang)

/** Group lines into the per-source and per-category totals of a month. Zero or negative lines are ignored. */
export function groupSpending(month: string, lines: SpendLine[]): MonthSpend {
  const bySource = new Map<SpendSource, Map<string, SpendingSlice>>(SPEND_SOURCES.map((s) => [s.key, new Map()]))
  const categories = new Map<string, SpendingSlice>()
  for (const l of lines) {
    if (l.satang <= 0) continue
    addTo(bySource.get(l.source)!, l.label, l.labelIcon, l.satang)
    addTo(categories, l.category, l.icon, l.satang)
  }
  const sources = SPEND_SOURCES.map(({ key }) => {
    const items = biggestFirst(bySource.get(key)!)
    return { source: key, totalSatang: items.reduce((s, x) => s + x.totalSatang, 0), items }
  })
  return { month, totalSatang: sources.reduce((s, x) => s + x.totalSatang, 0), sources, categories: biggestFirst(categories) }
}

/** Keep the biggest `max - 1` slices and fold the rest into one "อื่น ๆ" slice. */
export function foldSlices(slices: SpendingSlice[], max: number): SpendingSlice[] {
  const sorted = [...slices].filter((s) => s.totalSatang > 0).sort((a, b) => b.totalSatang - a.totalSatang)
  if (sorted.length <= max) return sorted
  const head = sorted.slice(0, max - 1)
  const rest = sorted.slice(max - 1).reduce((sum, s) => sum + s.totalSatang, 0)
  return [...head, { name: 'อื่น ๆ', icon: '➕', totalSatang: rest }]
}
