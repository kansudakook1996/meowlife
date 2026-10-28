import { describe, expect, it } from 'vitest'
import { csvText, parseCsv, toCsv } from './csv'

describe('toCsv', () => {
  it('starts with a BOM, uses CRLF, and quotes only when needed', () => {
    const out = toCsv([
      ['ชื่อ', 'หมายเหตุ'],
      ['ข้าว', 'มี "คำพูด", และจุลภาค'],
      ['บรรทัด', 'สอง\nบรรทัด']
    ])
    expect(out.startsWith('﻿')).toBe(true)
    expect(out).toContain('ข้าว,"มี ""คำพูด"", และจุลภาค"\r\n')
    expect(out).toContain('"สอง\nบรรทัด"')
  })

  it('neutralises spreadsheet formulas in text cells', () => {
    expect(csvText('=HYPERLINK("http://evil")')).toBe(`'=HYPERLINK("http://evil")`)
    expect(csvText('+1')).toBe("'+1")
    expect(csvText('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvText('ข้าว')).toBe('ข้าว')
  })
})

describe('parseCsv', () => {
  it('round-trips what toCsv wrote', () => {
    const rows = [
      ['a', 'b "q"', 'c,d'],
      ['ไทย', '', 'x\ny']
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })

  it('handles LF/CRLF/CR, blank lines, missing final newline and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n1,2\n\n3,4\r5,6')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
      ['5', '6']
    ])
  })

  it('detects semicolon and tab delimiters', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3']
    ])
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('keeps an unterminated quoted field instead of losing data', () => {
    expect(parseCsv('a,"b\nc')).toEqual([['a', 'b\nc']])
  })
})
