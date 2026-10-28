/** Minimal RFC 4180 CSV reader/writer (Excel-friendly: UTF-8 BOM, CRLF, quoted fields). */

/** Text starting with these characters can run as a formula when the file is opened in Excel. */
const FORMULA_START = /^[=+\-@\t\r]/

/** Make a free-text cell safe to open in a spreadsheet. */
export function csvText(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value
}

function quote(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
}

/** Rows → CSV text starting with a BOM so Excel reads Thai correctly. */
export function toCsv(rows: string[][]): string {
  return '﻿' + rows.map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n'
}

function detectDelimiter(firstLine: string): string {
  const counts: Array<[string, number]> = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1])
  counts.sort((a, b) => b[1] - a[1])
  return counts[0] && counts[0][1] > 0 ? counts[0][0] : ','
}

/** CSV text → rows of strings. Handles BOM, quotes, escaped quotes, newlines inside quotes, `,` `;` or tab. */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0
  const endCell = (): void => {
    row.push(cell)
    cell = ''
  }
  const endRow = (): void => {
    endCell()
    if (!(row.length === 1 && row[0] === '')) rows.push(row) // skip fully empty lines
    row = []
  }
  while (i < text.length) {
    const ch = text[i] as string
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
      } else {
        cell += ch
      }
    } else if (ch === '"' && cell === '') {
      inQuotes = true
    } else if (ch === delimiter) {
      endCell()
    } else if (ch === '\n') {
      endRow()
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++
      endRow()
    } else {
      cell += ch
    }
    i++
  }
  if (cell !== '' || row.length > 0) endRow()
  return rows
}
