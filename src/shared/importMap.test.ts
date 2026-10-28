import { describe, expect, it } from 'vitest'
import {
  buildImportRows,
  guessMapping,
  parseAmountCell,
  parseDateCell,
  parseKindCell,
  parseStatusCell,
  type ImportMapping
} from './importMap'

describe('parseDateCell', () => {
  it.each([
    ['2026-10-28', '2026-10-28'],
    ['2026/10/28', '2026-10-28'],
    ['28/10/2026', '2026-10-28'],
    ['28-10-2569', '2026-10-28'], // Buddhist year
    ['1/2/69', '2069-02-01'],
    ['28 ต.ค. 2569', '2026-10-28'],
    ['5 มกราคม 2570', '2027-01-05'],
    ['28 Oct 2026', '2026-10-28'],
    ['2026-10-28T10:30:00', '2026-10-28'],
    ['46323', '2026-10-28'] // Excel serial
  ])('%s → %s', (input, expected) => {
    expect(parseDateCell(input)).toBe(expected)
  })

  it.each(['', 'abc', '31/02/2026', '2026-13-01', '0', '99999999'])('rejects %j', (input) => {
    expect(parseDateCell(input)).toBeNull()
  })

  it('knows 29 Feb only in leap years', () => {
    expect(parseDateCell('29/02/2028')).toBe('2028-02-29')
    expect(parseDateCell('29/02/2027')).toBeNull()
  })
})

describe('parseAmountCell', () => {
  it.each([
    ['1,234.50', 123450],
    ['฿1,234', 123400],
    ['500 บาท', 50000],
    ['-500', -50000],
    ['(500)', -50000],
    ['+75.5', 7550],
    ['123.45000000000002', 12345] // spreadsheet float noise
  ])('%s → %i satang', (input, expected) => {
    expect(parseAmountCell(input)).toEqual({ satang: expected })
  })

  it.each(['', 'abc', '0', '1.234', '1000000000', '12..3'])('rejects %j', (input) => {
    expect(parseAmountCell(input)).toHaveProperty('error')
  })
})

describe('kind and status cells', () => {
  it('understands Thai and English words', () => {
    expect(parseKindCell('รายรับ')).toBe('income')
    expect(parseKindCell(' Income ')).toBe('income')
    expect(parseKindCell('จ่าย')).toBe('expense')
    expect(parseKindCell('?')).toBeNull()
    expect(parseStatusCell('จ่ายแล้ว')).toBe(true)
    expect(parseStatusCell('ยังไม่จ่าย')).toBe(false)
    expect(parseStatusCell('อะไรไม่รู้')).toBeNull()
    expect(parseStatusCell('เกินกำหนด 3 วัน')).toBe(false) // labels from MeowLife's own export
    expect(parseStatusCell('อีก 2 วันครบกำหนด')).toBe(false)
    expect(parseStatusCell('ได้รับแล้ว')).toBe(true)
  })
})

describe('guessMapping', () => {
  it('finds Thai headers', () => {
    const m = guessMapping(['วันที่', 'รายการ', 'จำนวนเงิน', 'ประเภท', 'หมวดหมู่', 'ช่องทาง', 'ครบกำหนด', 'สถานะ', 'หมายเหตุ'])
    expect(m.columns).toEqual({ date: 0, title: 1, amount: 2, kind: 3, category: 4, method: 5, dueDate: 6, status: 7, note: 8 })
  })
  it('leaves unknown columns unmapped', () => {
    const m = guessMapping(['Date', 'Description', 'Amount', 'ฉลาก'])
    expect(m.columns).toMatchObject({ date: 0, title: 1, amount: 2, kind: null, note: null })
  })
})

describe('buildImportRows', () => {
  const mapping = (over: Partial<ImportMapping> = {}): ImportMapping => ({
    ...guessMapping(['วันที่', 'รายการ', 'จำนวนเงิน', 'ประเภท']),
    ...over
  })
  const ctx = { existingKeys: new Set<string>(), maxDate: '2028-12-31' }

  it('imports valid rows and reports bad ones with their row numbers', () => {
    const result = buildImportRows(
      [
        ['วันที่', 'รายการ', 'จำนวนเงิน', 'ประเภท'],
        ['2026-10-01', 'เงินเดือน', '25,000', 'รายรับ'],
        ['2026-10-02', 'ค่าไฟ', '1,234.50', 'รายจ่าย'],
        ['32/10/2026', 'วันผิด', '10', 'รายจ่าย'],
        ['2026-10-03', '', '10', 'รายจ่าย'],
        ['2026-10-04', 'จำนวนผิด', 'สิบบาท', 'รายจ่าย'],
        ['2026-10-05', 'ประเภทผิด', '10', 'อะไร'],
        ['2099-01-01', 'อนาคตไกล', '10', 'รายจ่าย'],
        ['', '', '', '']
      ],
      mapping(),
      ctx
    )
    expect(result.totalRows).toBe(7)
    expect(result.valid.map((r) => [r.rowNumber, r.kind, r.amountSatang])).toEqual([
      [2, 'income', 2500000],
      [3, 'expense', 123450]
    ])
    expect(result.errors.map((e) => e.rowNumber)).toEqual([4, 5, 6, 7, 8])
    expect(result.errors[0]?.message).toContain('วันที่')
    expect(result.errors[4]?.message).toContain('ไกลเกินไป')
  })

  it('flags duplicates already in the database or repeated in the file', () => {
    const existing = new Set(['2026-10-02|expense|123450|ค่าไฟ'])
    const result = buildImportRows(
      [
        ['วันที่', 'รายการ', 'จำนวนเงิน', 'ประเภท'],
        ['2026-10-02', 'ค่าไฟ', '1234.50', 'รายจ่าย'],
        ['2026-10-03', 'กาแฟ', '60', 'รายจ่าย'],
        ['2026-10-03', 'กาแฟ', '60', 'รายจ่าย']
      ],
      mapping(),
      { ...ctx, existingKeys: existing }
    )
    expect(result.valid.map((r) => r.title)).toEqual(['กาแฟ'])
    expect(result.duplicates.map((r) => r.rowNumber)).toEqual([2, 4])
  })

  it('works without a type column: by sign, or a fixed default', () => {
    const rows = [
      ['วันที่', 'รายการ', 'จำนวนเงิน'],
      ['2026-10-01', 'เงินโอนเข้า', '1000'],
      ['2026-10-02', 'ซื้อของ', '-250']
    ]
    const base = { ...guessMapping(rows[0] as string[]) }
    const bySign = buildImportRows(rows, { ...base, useSign: true }, ctx)
    expect(bySign.valid.map((r) => [r.kind, r.amountSatang])).toEqual([
      ['income', 100000],
      ['expense', 25000]
    ])
    const fixed = buildImportRows(rows, { ...base, defaultKind: 'expense' }, ctx)
    expect(fixed.valid.map((r) => r.kind)).toEqual(['expense', 'expense'])
  })

  it('reads status, due date, category and note; defaults paid when there is no status column', () => {
    const rows = [
      ['วันที่', 'รายการ', 'จำนวนเงิน', 'ประเภท', 'หมวดหมู่', 'ครบกำหนด', 'สถานะ', 'หมายเหตุ'],
      ['2026-10-01', 'ค่าเน็ต', '599', 'จ่าย', 'บริการ', '2026-10-25', 'ยังไม่จ่าย', 'รายเดือน'],
      ['2026-10-01', 'ค่าน้ำ', '120', 'จ่าย', '', '', '', '']
    ]
    const result = buildImportRows(rows, guessMapping(rows[0] as string[]), ctx)
    expect(result.valid[0]).toMatchObject({ isPaid: false, dueDate: '2026-10-25', categoryName: 'บริการ', note: 'รายเดือน' })
    expect(result.valid[1]).toMatchObject({ isPaid: true, dueDate: null })
  })
})
