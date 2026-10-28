import { readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { parseCsv } from '@shared/csv'
import { readXlsx, SpreadsheetError } from './xlsx'

export { SpreadsheetError }

const MAX_FILE_BYTES = 15 * 1024 * 1024

/** Decode CSV bytes: UTF-8 first, then Windows-874 (Thai Excel "CSV" files saved without UTF-8). */
export function decodeCsvBytes(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-874').decode(bytes)
  }
}

export function parseSpreadsheetBytes(bytes: Buffer, extension: string): string[][] {
  const ext = extension.toLowerCase()
  if (ext === '.xlsx') return readXlsx(bytes)
  if (ext === '.csv' || ext === '.txt' || ext === '.tsv') return parseCsv(decodeCsvBytes(bytes))
  if (ext === '.xls') {
    throw new SpreadsheetError('ไฟล์ .xls (Excel เก่า) ยังไม่รองรับ เปิดใน Excel แล้ว "บันทึกเป็น" .xlsx หรือ .csv ก่อนนะ')
  }
  throw new SpreadsheetError('รองรับเฉพาะไฟล์ .xlsx และ .csv')
}

/** Read a spreadsheet from disk (first sheet only). */
export function readSpreadsheetFile(path: string): string[][] {
  let size: number
  try {
    size = statSync(path).size
  } catch {
    throw new SpreadsheetError('เปิดไฟล์นี้ไม่ได้ ตรวจว่าไฟล์ยังอยู่และไม่ได้เปิดค้างไว้')
  }
  if (size > MAX_FILE_BYTES) throw new SpreadsheetError('ไฟล์ใหญ่เกิน 15 MB แบ่งเป็นหลายไฟล์ก่อนนะ')
  const rows = parseSpreadsheetBytes(readFileSync(path), extname(path))
  if (rows.length === 0) throw new SpreadsheetError('ไฟล์นี้ไม่มีข้อมูล')
  return rows
}
