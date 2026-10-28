/**
 * Money is stored and calculated as integer satang (1 baht = 100 satang).
 * Never use floating point for money: 0.1 + 0.2 !== 0.3.
 */

/** Largest amount accepted for a single item: 999,999,999.99 baht. */
export const MAX_SATANG = 99_999_999_999

const AMOUNT_PATTERN = /^(\d{1,9})(?:\.(\d{1,2}))?$/

/**
 * Parse user text like "1,250.5" or "฿ 300" into satang.
 * Returns null when the text is not a valid non-negative amount with at most 2 decimals.
 */
export function parseBahtToSatang(input: string): number | null {
  const cleaned = input.trim().replace(/[\s,฿]/g, '')
  const match = AMOUNT_PATTERN.exec(cleaned)
  if (!match) return null
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(2, '0'))
  const satang = whole * 100 + fraction
  return satang <= MAX_SATANG ? satang : null
}

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

let wordStyle = false

/** Settings → how money looks: "฿1,234.50" (symbol) or "1,234.50 บาท" (word). */
export function setMoneyStyle(style: 'symbol' | 'word'): void {
  wordStyle = style === 'word'
}

/** 123450 → "฿1,234.50", -5000 → "-฿50.00" */
export function formatSatang(satang: number): string {
  assertSafeSatang(satang)
  const sign = satang < 0 ? '-' : ''
  const abs = Math.abs(satang)
  const baht = Math.floor(abs / 100)
  const rest = abs % 100
  const number = `${groupThousands(baht)}.${String(rest).padStart(2, '0')}`
  return wordStyle ? `${sign}${number} บาท` : `${sign}฿${number}`
}

/** 123450 → "1234.50" (for putting back into an input field) */
export function satangToInput(satang: number): string {
  assertSafeSatang(satang)
  const baht = Math.floor(Math.abs(satang) / 100)
  const rest = Math.abs(satang) % 100
  return `${satang < 0 ? '-' : ''}${baht}.${String(rest).padStart(2, '0')}`
}

export function sumSatang(values: Iterable<number>): number {
  let total = 0
  for (const v of values) {
    assertSafeSatang(v)
    total += v
  }
  assertSafeSatang(total)
  return total
}

function assertSafeSatang(n: number): void {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Invalid satang value: ${n}`)
}
