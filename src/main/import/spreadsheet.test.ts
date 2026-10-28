import { crc32, deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodeCsvBytes, parseSpreadsheetBytes, SpreadsheetError } from './spreadsheet'

/** Build a tiny .xlsx (ZIP) by hand so the reader is tested against real file structure. */
function zip(files: Record<string, string>, method: 0 | 8 = 8): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, 'utf8')
    const data = method === 8 ? deflateRawSync(raw) : raw
    const nameBuf = Buffer.from(name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc32(raw), 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc32(raw), 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, end])
}

const WORKBOOK = `<workbook xmlns:r="x"><sheets><sheet name="รายการ" sheetId="1" r:id="rId7"/><sheet name="อื่น" sheetId="2" r:id="rId8"/></sheets></workbook>`
const RELS = `<Relationships><Relationship Id="rId8" Target="worksheets/sheet2.xml"/><Relationship Id="rId7" Target="worksheets/sheet1.xml"/></Relationships>`
const SHARED = `<sst><si><t>วันที่</t></si><si><t>รายการ</t></si><si><t>จำนวนเงิน</t></si><si><r><t>ค่า</t></r><r><t>ไฟ &amp; น้ำ</t></r></si></sst>`
const SHEET1 = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
<row r="2"><c r="A2"><v>46323</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>1234.5</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>2026-10-29</t></is></c><c r="C3"><v>99</v></c><c r="D3" t="b"><v>1</v></c></row>
<row r="5"><c r="B5" t="str"><v>หลังบรรทัดว่าง</v></c></row>
</sheetData></worksheet>`

describe('readXlsx', () => {
  const book = (method: 0 | 8 = 8): Buffer =>
    zip(
      {
        'xl/workbook.xml': WORKBOOK,
        'xl/_rels/workbook.xml.rels': RELS,
        'xl/sharedStrings.xml': SHARED,
        'xl/worksheets/sheet1.xml': SHEET1,
        'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1"><v>ไม่ใช่แผ่นแรก</v></c></row></sheetData></worksheet>'
      },
      method
    )

  it('reads the first sheet: shared strings, rich text, numbers, inline strings, gaps and booleans', () => {
    expect(parseSpreadsheetBytes(book(), '.xlsx')).toEqual([
      ['วันที่', 'รายการ', 'จำนวนเงิน'],
      ['46323', 'ค่าไฟ & น้ำ', '1234.5'],
      ['2026-10-29', '', '99', 'TRUE'],
      [],
      ['', 'หลังบรรทัดว่าง']
    ])
  })

  it('also reads stored (uncompressed) entries', () => {
    expect(parseSpreadsheetBytes(book(0), '.xlsx')[1]).toEqual(['46323', 'ค่าไฟ & น้ำ', '1234.5'])
  })

  it('rejects files that are not xlsx, and old .xls', () => {
    expect(() => parseSpreadsheetBytes(Buffer.from('plain text'), '.xlsx')).toThrow(SpreadsheetError)
    expect(() => parseSpreadsheetBytes(Buffer.from('x'), '.xls')).toThrow(/xlsx/)
    expect(() => parseSpreadsheetBytes(Buffer.from('x'), '.pdf')).toThrow(/รองรับเฉพาะ/)
  })
})

describe('csv bytes', () => {
  it('reads UTF-8 and falls back to Windows-874 Thai', () => {
    expect(decodeCsvBytes(Buffer.from('วันที่,ยอด', 'utf8'))).toBe('วันที่,ยอด')
    const tis = Buffer.from([0xc7, 0xd1, 0xb9, 0xb7, 0xd5, 0xe8]) // "วันที่" in Windows-874
    expect(decodeCsvBytes(tis)).toBe('วันที่')
    expect(parseSpreadsheetBytes(Buffer.from('a,b\n1,2'), '.csv')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })
})
