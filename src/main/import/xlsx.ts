import { inflateRawSync } from 'node:zlib'

/**
 * Small .xlsx reader (first worksheet → rows of text), written for MeowLife so the app does not need
 * a large spreadsheet library. An .xlsx file is a ZIP of XML files. Limits guard against zip bombs.
 */

export class SpreadsheetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpreadsheetError'
  }
}

const MAX_ENTRY_BYTES = 40 * 1024 * 1024
const MAX_ROWS = 20_000
const MAX_COLS = 200

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  localOffset: number
}

function readZipEntries(buf: Buffer): Map<string, ZipEntry> {
  // End of central directory record: last 22+ bytes, signature 0x06054b50.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new SpreadsheetError('ไฟล์ Excel นี้เสียหายหรือไม่ใช่ไฟล์ .xlsx')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const entries = new Map<string, ZipEntry>()
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new SpreadsheetError('ไฟล์ Excel นี้เสียหาย')
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    entries.set(name, {
      name,
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      uncompressedSize: buf.readUInt32LE(p + 24),
      localOffset: buf.readUInt32LE(p + 42)
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function readEntry(buf: Buffer, entry: ZipEntry): string {
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new SpreadsheetError('ไฟล์ Excel ใหญ่เกินไป')
  const p = entry.localOffset
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== 0x04034b50) throw new SpreadsheetError('ไฟล์ Excel นี้เสียหาย')
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28)
  const data = buf.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return data.toString('utf8')
  if (entry.method === 8) {
    try {
      return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }).toString('utf8')
    } catch {
      throw new SpreadsheetError('แตกไฟล์ Excel ไม่ได้ (เสียหายหรือใหญ่เกินไป)')
    }
  }
  throw new SpreadsheetError('ไฟล์ Excel นี้ใช้การบีบอัดที่ไม่รองรับ')
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e === 'amp') return '&'
    if (e === 'lt') return '<'
    if (e === 'gt') return '>'
    if (e === 'quot') return '"'
    if (e === 'apos') return "'"
    const code = e.startsWith('#x') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
  })
}

/** Concatenate every <t> inside a block (handles rich text runs). */
function textOf(block: string): string {
  let out = ''
  for (const m of block.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodeXml(m[1] as string)
  return out
}

function columnIndex(ref: string): number {
  let n = 0
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function firstSheetPath(files: Map<string, ZipEntry>, buf: Buffer): string {
  const workbook = files.get('xl/workbook.xml')
  const rels = files.get('xl/_rels/workbook.xml.rels')
  if (workbook && rels) {
    const sheet = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(readEntry(buf, workbook))
    if (sheet) {
      for (const rel of readEntry(buf, rels).matchAll(/<Relationship\b[^>]*>/g)) {
        const tag = rel[0]
        if (new RegExp(`\\bId="${sheet[1]}"`).test(tag)) {
          const target = /\bTarget="([^"]+)"/.exec(tag)?.[1]
          if (target) return target.startsWith('/') ? target.slice(1) : `xl/${target}`
        }
      }
    }
  }
  return 'xl/worksheets/sheet1.xml'
}

/** First worksheet of an .xlsx as rows of text (numbers stay as their stored text; dates stay serial numbers). */
export function readXlsx(buf: Buffer): string[][] {
  const files = readZipEntries(buf)
  const sheetEntry = files.get(firstSheetPath(files, buf)) ?? files.get('xl/worksheets/sheet1.xml')
  if (!sheetEntry) throw new SpreadsheetError('ไม่พบแผ่นงาน (worksheet) ในไฟล์ Excel นี้')

  const shared: string[] = []
  const sharedEntry = files.get('xl/sharedStrings.xml')
  if (sharedEntry) {
    for (const m of readEntry(buf, sharedEntry).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1] as string))
  }

  const xml = readEntry(buf, sheetEntry)
  const rows: string[][] = []
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowIndex = Number(/\br="(\d+)"/.exec(rowMatch[1] as string)?.[1] ?? rows.length + 1) - 1
    if (rowIndex >= MAX_ROWS) throw new SpreadsheetError(`ไฟล์มีมากกว่า ${MAX_ROWS} แถว แบ่งไฟล์เป็นหลายไฟล์ก่อนนะ`)
    const cells: string[] = []
    for (const c of (rowMatch[2] as string).matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] as string
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const col = ref ? columnIndex(ref) : cells.length
      if (col < 0 || col >= MAX_COLS) continue
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n'
      const inner = c[2] ?? ''
      let value: string
      if (type === 's') value = shared[Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1])] ?? ''
      else if (type === 'inlineStr') value = textOf(inner)
      else if (type === 'b') value = /<v>1<\/v>/.test(inner) ? 'TRUE' : 'FALSE'
      else if (type === 'e') value = ''
      else value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '')
      while (cells.length < col) cells.push('')
      cells[col] = value
    }
    while (rows.length < rowIndex) rows.push([])
    rows[rowIndex] = cells
  }
  return rows
}
