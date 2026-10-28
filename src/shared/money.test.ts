import { describe, expect, it } from 'vitest'
import { formatSatang, MAX_SATANG, parseBahtToSatang, satangToInput, sumSatang } from './money'

describe('parseBahtToSatang', () => {
  it.each([
    ['0', 0],
    ['1', 100],
    ['1.5', 150],
    ['1.05', 105],
    ['1,250.50', 125050],
    ['  ฿ 300 ', 30000],
    ['999999999.99', MAX_SATANG]
  ])('parses %j → %i', (text, expected) => {
    expect(parseBahtToSatang(text)).toBe(expected)
  })

  it.each(['', 'abc', '-5', '1.234', '1.', '.5', '1e3', '1000000000', '12..3', '0x10'])('rejects %j', (text) => {
    expect(parseBahtToSatang(text)).toBeNull()
  })
})

describe('formatSatang', () => {
  it('formats with thousands separators and 2 decimals', () => {
    expect(formatSatang(0)).toBe('฿0.00')
    expect(formatSatang(5)).toBe('฿0.05')
    expect(formatSatang(125050)).toBe('฿1,250.50')
    expect(formatSatang(MAX_SATANG)).toBe('฿999,999,999.99')
  })

  it('formats negatives', () => {
    expect(formatSatang(-150)).toBe('-฿1.50')
  })

  it('rejects non-integers', () => {
    expect(() => formatSatang(1.5)).toThrow(RangeError)
  })
})

describe('satangToInput', () => {
  it('round-trips through the parser', () => {
    for (const v of [0, 1, 99, 100, 125050, MAX_SATANG]) {
      expect(parseBahtToSatang(satangToInput(v))).toBe(v)
    }
  })
})

describe('sumSatang', () => {
  it('has no floating point drift (0.10 + 0.20 = 0.30)', () => {
    expect(sumSatang([10, 20])).toBe(30)
    const tenCents = Array.from({ length: 1000 }, () => 10)
    expect(sumSatang(tenCents)).toBe(10000)
  })

  it('throws on unsafe input', () => {
    expect(() => sumSatang([0.1])).toThrow(RangeError)
  })
})
