import { addMonths, isValidIsoDate } from './dates'
import { MAX_SATANG } from './money'
import type { EntryKind } from './types'

export const IMPORT_FIELDS = ['date', 'title', 'amount', 'kind', 'category', 'method', 'dueDate', 'status', 'note'] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  date: 'วันที่',
  title: 'ชื่อรายการ',
  amount: 'จำนวนเงิน',
  kind: 'ประเภท (รับ/จ่าย)',
  category: 'หมวดหมู่',
  method: 'ช่องทางชำระ',
  dueDate: 'วันครบกำหนด',
  status: 'สถานะ (จ่ายแล้ว/ยังไม่จ่าย)',
  note: 'หมายเหตุ'
}

export interface ImportMapping {
  /** Column index per field, or null when the file has no such column. */
  columns: Record<ImportField, number | null>
  firstRowIsHeader: boolean
  /** Used when there is no type column and the sign of the amount is not used. */
  defaultKind: EntryKind
  /** No type column: negative amounts are expenses, positive are income. */
  useSign: boolean
  /** No status column: treat rows as already paid/received. */
  defaultPaid: boolean
}

export interface ImportRow {
  /** Row number in the spreadsheet (1-based, including the header). */
  rowNumber: number
  kind: EntryKind
  title: string
  amountSatang: number
  txnDate: string
  dueDate: string | null
  isPaid: boolean
  note: string
  categoryName: string
  methodName: string
}

export interface ImportRowError {
  rowNumber: number
  message: string
  /** The original cells, for the error report. */
  cells: string[]
}

const HEADER_HINTS: Record<ImportField, RegExp> = {
  date: /^(วันที่|วัน|date|วันที่ทำรายการ|transaction date)$/i,
  title: /^(ชื่อรายการ|รายการ|ชื่อ|รายละเอียด|description|title|name|memo)$/i,
  amount: /^(จำนวนเงิน|จำนวน|ยอด|ยอดเงิน|เงิน|amount|total|price|ราคา)$/i,
  kind: /^(ประเภท|type|kind|รายรับ\/รายจ่าย|รับ\/จ่าย)$/i,
  category: /^(หมวดหมู่|หมวด|category)$/i,
  method: /^(ช่องทาง|ช่องทางชำระ|วิธีชำระ|การชำระเงิน|payment|method|account|บัญชี)$/i,
  dueDate: /^(วันครบกำหนด|ครบกำหนด|กำหนดชำระ|due|due date|วันที่ครบกำหนด)$/i,
  status: /^(สถานะ|status|จ่ายแล้ว|ชำระแล้ว|paid)$/i,
  note: /^(หมายเหตุ|note|notes|remark|comment)$/i
}

/** Guess which column is which from the header row (user can change it in the preview screen). */
export function guessMapping(headers: string[]): ImportMapping {
  const columns = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as Record<ImportField, number | null>
  const used = new Set<number>()
  for (const field of IMPORT_FIELDS) {
    const index = headers.findIndex((h, i) => !used.has(i) && HEADER_HINTS[field].test(h.trim()))
    if (index >= 0) {
      columns[field] = index
      used.add(index)
    }
  }
  return { columns, firstRowIsHeader: true, defaultKind: 'expense', useSign: false, defaultPaid: true }
}

/* ---------- cell parsers ---------- */

const THAI_MONTHS: Record<string, number> = {
  'ม.ค.': 1, มกราคม: 1, 'ก.พ.': 2, กุมภาพันธ์: 2, 'มี.ค.': 3, มีนาคม: 3, 'เม.ย.': 4, เมษายน: 4,
  'พ.ค.': 5, พฤษภาคม: 5, 'มิ.ย.': 6, มิถุนายน: 6, 'ก.ค.': 7, กรกฎาคม: 7, 'ส.ค.': 8, สิงหาคม: 8,
  'ก.ย.': 9, กันยายน: 9, 'ต.ค.': 10, ตุลาคม: 10, 'พ.ย.': 11, พฤศจิกายน: 11, 'ธ.ค.': 12, ธันวาคม: 12
}
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const pad2 = (n: number): string => String(n).padStart(2, '0')

function toIso(y: number, m: number, d: number): string | null {
  const year = y > 2400 ? y - 543 : y < 100 ? 2000 + y : y // Buddhist year, or 2-digit year
  const iso = `${year}-${pad2(m)}-${pad2(d)}`
  return isValidIsoDate(iso) ? iso : null
}

/** Excel serial day number (1900 system) → ISO date. */
function fromExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 80000) return null
  const ms = Math.round((Math.floor(serial) - 25569) * 86_400_000) // 25569 = days from 1899-12-30 to 1970-01-01
  const d = new Date(ms)
  const iso = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
  return isValidIsoDate(iso) ? iso : null
}

/** Accepts 2026-10-28, 28/10/2026, 28-10-69, พ.ศ. 2569, "28 ต.ค. 2569", "28 Oct 2026" and Excel serial numbers. */
export function parseDateCell(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(v)
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s].*)?$/.exec(v)
  if (m) return toIso(Number(m[3]), Number(m[2]), Number(m[1]))
  m = /^(\d{1,2})\s+(\S+?)\s+(\d{2,4})$/.exec(v)
  if (m) {
    const name = m[2] as string
    const month = THAI_MONTHS[name] ?? (EN_MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1 || undefined)
    if (month) return toIso(Number(m[3]), month, Number(m[1]))
  }
  if (/^\d+(\.\d+)?$/.test(v)) return fromExcelSerial(Number(v))
  return null
}

/** "1,234.50", "฿1,234", "(500)", "-500", "500 บาท" → signed satang. Returns an error text for invalid input. */
export function parseAmountCell(raw: string): { satang: number } | { error: string } {
  let v = raw.trim()
  if (!v) return { error: 'ไม่มีจำนวนเงิน' }
  let negative = false
  if (/^\(.*\)$/.test(v)) {
    negative = true
    v = v.slice(1, -1)
  }
  v = v.replace(/[฿\s,]|บาท|THB/gi, '')
  if (v.startsWith('-')) {
    negative = !negative
    v = v.slice(1)
  } else if (v.startsWith('+')) {
    v = v.slice(1)
  }
  if (!/^\d+(\.\d+)?$/.test(v)) return { error: `จำนวนเงิน "${raw.trim()}" อ่านไม่ได้` }
  const n = Number(v)
  const satang = Math.round(n * 100)
  if (Math.abs(n * 100 - satang) > 0.01) return { error: `จำนวนเงิน "${raw.trim()}" มีทศนิยมเกิน 2 ตำแหน่ง` }
  if (satang === 0) return { error: 'จำนวนเงินเป็น 0' }
  if (satang > MAX_SATANG) return { error: 'จำนวนเงินมากเกินไป' }
  return { satang: negative ? -satang : satang }
}

export function parseKindCell(raw: string): EntryKind | null {
  const v = raw.trim().toLowerCase()
  if (/^(รายรับ|รับ|รายได้|income|in|credit|\+|เข้า)$/.test(v)) return 'income'
  if (/^(รายจ่าย|จ่าย|expense|out|debit|-|ออก)$/.test(v)) return 'expense'
  return null
}

export function parseStatusCell(raw: string): boolean | null {
  const v = raw.trim().toLowerCase()
  if (/^(จ่ายแล้ว|ชำระแล้ว|ได้รับแล้ว|รับแล้ว|paid|received|yes|y|true|1|✓|เสร็จ)$/.test(v)) return true
  if (/^(ยังไม่จ่าย|ยังไม่ชำระ|ค้างชำระ|ค้าง|ยังไม่ได้รับ|unpaid|pending|no|n|false|0)$/.test(v)) return false
  // Labels written by MeowLife's own export for unpaid bills, so an exported file can be imported again.
  if (/^(เกินกำหนด|อีก\s*\d+\s*วันครบกำหนด|ครบกำหนดวันนี้)/.test(v)) return false
  return null
}

/* ---------- whole-file mapping ---------- */

export interface BuildContext {
  /** Keys (see dupKey) of transactions already in the database. */
  existingKeys: Set<string>
  /** Latest month we accept, e.g. today + 2 years. Guards against typos like year 2099. */
  maxDate: string
}

export function dupKey(row: Pick<ImportRow, 'txnDate' | 'kind' | 'amountSatang' | 'title'>): string {
  return `${row.txnDate}|${row.kind}|${row.amountSatang}|${row.title.trim().toLowerCase()}`
}

export interface BuildResult {
  valid: ImportRow[]
  /** Valid rows that look like something already imported or repeated in the file. */
  duplicates: ImportRow[]
  errors: ImportRowError[]
  totalRows: number
}

/** Turn spreadsheet cells into validated import rows. Pure function: nothing is written. */
export function buildImportRows(cells: string[][], mapping: ImportMapping, ctx: BuildContext): BuildResult {
  const start = mapping.firstRowIsHeader ? 1 : 0
  const valid: ImportRow[] = []
  const duplicates: ImportRow[] = []
  const errors: ImportRowError[] = []
  const seen = new Set<string>()
  const { columns } = mapping
  const cell = (row: string[], field: ImportField): string => {
    const i = columns[field]
    return i === null || i === undefined ? '' : (row[i] ?? '').trim()
  }

  let totalRows = 0
  for (let r = start; r < cells.length; r++) {
    const row = cells[r] as string[]
    if (row.every((c) => c.trim() === '')) continue
    totalRows++
    const rowNumber = r + 1
    const fail = (message: string): void => {
      errors.push({ rowNumber, message, cells: row })
    }

    const date = parseDateCell(cell(row, 'date'))
    if (!date) {
      fail(cell(row, 'date') ? `วันที่ "${cell(row, 'date')}" อ่านไม่ได้` : 'ไม่มีวันที่')
      continue
    }
    if (date > ctx.maxDate) {
      fail(`วันที่ ${date} ไกลเกินไป ตรวจปีอีกครั้ง`)
      continue
    }
    const title = cell(row, 'title')
    if (!title) {
      fail('ไม่มีชื่อรายการ')
      continue
    }
    if (title.length > 80) {
      fail('ชื่อรายการยาวเกิน 80 ตัวอักษร')
      continue
    }
    const amount = parseAmountCell(cell(row, 'amount'))
    if ('error' in amount) {
      fail(amount.error)
      continue
    }

    let kind: EntryKind
    if (columns.kind !== null) {
      const parsed = parseKindCell(cell(row, 'kind'))
      if (!parsed) {
        fail(`ประเภท "${cell(row, 'kind')}" ไม่ใช่ รายรับ/รายจ่าย`)
        continue
      }
      kind = parsed
    } else if (mapping.useSign) {
      kind = amount.satang < 0 ? 'expense' : 'income'
    } else {
      kind = mapping.defaultKind
    }

    let isPaid = mapping.defaultPaid
    if (columns.status !== null && cell(row, 'status') !== '') {
      const parsed = parseStatusCell(cell(row, 'status'))
      if (parsed === null) {
        fail(`สถานะ "${cell(row, 'status')}" ไม่เข้าใจ (ใช้ จ่ายแล้ว / ยังไม่จ่าย)`)
        continue
      }
      isPaid = parsed
    }

    let dueDate: string | null = null
    if (columns.dueDate !== null && cell(row, 'dueDate') !== '') {
      dueDate = parseDateCell(cell(row, 'dueDate'))
      if (!dueDate) {
        fail(`วันครบกำหนด "${cell(row, 'dueDate')}" อ่านไม่ได้`)
        continue
      }
    }
    const note = cell(row, 'note')
    if (note.length > 500) {
      fail('หมายเหตุยาวเกิน 500 ตัวอักษร')
      continue
    }

    const item: ImportRow = {
      rowNumber,
      kind,
      title,
      amountSatang: Math.abs(amount.satang),
      txnDate: date,
      dueDate,
      isPaid,
      note,
      categoryName: cell(row, 'category').slice(0, 40),
      methodName: cell(row, 'method').slice(0, 40)
    }
    const key = dupKey(item)
    if (ctx.existingKeys.has(key) || seen.has(key)) duplicates.push(item)
    else valid.push(item)
    seen.add(key)
  }
  return { valid, duplicates, errors, totalRows }
}

/** Default latest accepted date: end of the month two years after `today`. */
export function defaultMaxDate(today: string): string {
  return `${addMonths(today.slice(0, 7), 24)}-31`
}
