import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

/** Import / export / backup / restore / categories / reports on the real built app, with file dialogs stubbed. */
let userData: string
let work: string
let app: ElectronApplication
let page: Page

const month = new Date().toISOString().slice(0, 7)

async function pickFileNext(path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as never
  }, path)
}
async function saveFileNext(path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as never
  }, path)
}
const nav = (name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true })

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'meowlife-e2e-data-'))
  work = mkdtempSync(join(tmpdir(), 'meowlife-e2e-files-'))
  app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, MEOWLIFE_USER_DATA: userData, ELECTRON_RENDERER_URL: '' }
  })
  page = await app.firstWindow()
  await page.getByRole('heading', { name: 'ภาพรวม' }).waitFor()
})

test.afterAll(async () => {
  await app.close()
  rmSync(userData, { recursive: true, force: true })
  rmSync(work, { recursive: true, force: true })
})

test.describe.configure({ mode: 'serial' })

test('categories: add, rename and delete', async () => {
  await nav('หมวดหมู่').click()
  await page.getByRole('button', { name: '＋ เพิ่มหมวด' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('ชื่อ').fill('สัตว์เลี้ยง')
  await dialog.getByRole('button', { name: 'ไอคอน 🐱' }).click()
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(page.getByText('สัตว์เลี้ยง', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'แก้ไขหมวด สัตว์เลี้ยง' }).click()
  await dialog.getByLabel('ชื่อ').fill('แมวสองตัว')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(page.getByText('แมวสองตัว', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'ลบหมวด แมวสองตัว' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'ลบหมวด' }).click()
  await expect(page.getByText('แมวสองตัว', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/06-categories.png' })
})

test('a category marked "not counted as spending" stays out of the expense total but is shown separately', async () => {
  await nav('หมวดหมู่').click()
  await page.locator('section[aria-labelledby="cat-expense"]').getByRole('button', { name: '＋ เพิ่มหมวด' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('ชื่อ').fill('เงินออมทดสอบ')
  await dialog.getByLabel(/ไม่นับเป็นรายจ่าย/).check()
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(page.getByText('ไม่นับเป็นรายจ่าย', { exact: true })).toBeVisible()

  await nav('รายการรับ-จ่าย').click()
  await page.getByRole('button', { name: '＋ เพิ่มรายการ' }).first().click()
  await dialog.getByLabel('ชื่อรายการ').fill('ออมประจำเดือน')
  await dialog.getByLabel('จำนวนเงิน (บาท)').fill('500')
  await dialog.getByText('รายละเอียดเพิ่มเติม (ไม่บังคับ)').click()
  const select = dialog.getByLabel('หมวดหมู่')
  const wanted = await select.locator('option', { hasText: 'เงินออมทดสอบ' }).first().getAttribute('value')
  await select.selectOption(wanted!)
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(page.getByText('ออมประจำเดือน', { exact: true })).toBeVisible()

  await nav('ภาพรวม').click()
  await expect(page.locator('.summary-expense .value')).toHaveText('฿0.00')
  await expect(page.locator('.summary-expense')).toContainText('ไม่นับเป็นรายจ่าย (เช่น เงินออม) ฿500.00')

  // clean up so the later export / report tests see the same data as before
  await nav('รายการรับ-จ่าย').click()
  await page.getByRole('button', { name: 'ลบ ออมประจำเดือน' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'ลบรายการ' }).click()
  await expect(page.getByRole('button', { name: 'ลบ ออมประจำเดือน' })).toHaveCount(0)
  await nav('หมวดหมู่').click()
  await page.getByRole('button', { name: 'ลบหมวด เงินออมทดสอบ' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'ลบหมวด' }).click()
  await expect(page.getByRole('button', { name: 'ลบหมวด เงินออมทดสอบ' })).toHaveCount(0) // (the toast repeats the name, so count the button)
})

test('import a CSV: map, preview, catch bad rows and duplicates, then import', async () => {
  const csv = [
    'วันที่,รายการ,จำนวนเงิน,ประเภท,หมวดหมู่',
    `${month}-03,เงินเดือนนำเข้า,"25,000.00",รายรับ,เงินเดือน`,
    `${month}-04,ค่ากาแฟนำเข้า,65,รายจ่าย,อาหาร`,
    `${month}-04,ค่ากาแฟนำเข้า,65,รายจ่าย,อาหาร`,
    `31/02/${month.slice(0, 4)},วันที่ผิด,10,รายจ่าย,`,
    `${month}-05,จำนวนผิด,สิบบาท,รายจ่าย,`
  ].join('\r\n')
  const file = join(work, 'ตัวอย่าง.csv')
  writeFileSync(file, '﻿' + csv, 'utf8')

  await nav('ข้อมูลและสำรอง').click()
  await pickFileNext(file)
  await page.getByRole('button', { name: /เลือกไฟล์ที่จะนำเข้า/ }).click()

  await expect(page.getByText('ขั้นที่ 1: จับคู่คอลัมน์')).toBeVisible()
  await expect(page.getByLabel('วันที่ *')).toHaveValue('0') // guessed from the header
  await expect(page.getByText('พร้อมนำเข้า 2')).toBeVisible()
  await expect(page.getByText('อาจซ้ำ 1')).toBeVisible()
  await expect(page.getByText('มีปัญหา 2')).toBeVisible()
  await expect(page.getByText(/แถว 5: วันที่/)).toBeVisible()
  await expect(page.getByText(/แถว 6: จำนวนเงิน/)).toBeVisible()
  await page.screenshot({ path: 'test-results/07-import-preview.png', fullPage: true })

  await page.getByRole('button', { name: 'นำเข้า 2 รายการ' }).click()
  await expect(page.getByText(/นำเข้าเสร็จแล้ว: เพิ่ม/)).toBeVisible()

  await nav('รายการรับ-จ่าย').click()
  await expect(page.getByText('เงินเดือนนำเข้า')).toBeVisible()
  await expect(page.getByText('ค่ากาแฟนำเข้า')).toHaveCount(1)

  // Importing the same file again: everything is now a duplicate, nothing is imported.
  await nav('ข้อมูลและสำรอง').click() // leaving the page resets the wizard
  await pickFileNext(file)
  await page.getByRole('button', { name: /เลือกไฟล์ที่จะนำเข้า/ }).click()
  await expect(page.getByText('พร้อมนำเข้า 0')).toBeVisible()
  await expect(page.getByRole('button', { name: /^นำเข้า 0 รายการ$/ })).toBeDisabled()
})

test('export CSV writes a UTF-8 file Excel can open', async () => {
  const out = join(work, 'export.csv')
  await saveFileNext(out)
  await nav('ข้อมูลและสำรอง').click()
  await page.getByRole('button', { name: 'ส่งออกทั้งหมด' }).click()
  await expect(page.getByText(/ส่งออก 2 รายการแล้ว/)).toBeVisible()
  const text = readFileSync(out, 'utf8')
  expect(text.charCodeAt(0)).toBe(0xfeff)
  expect(text).toContain('วันที่,ประเภท,ชื่อรายการ')
  expect(text).toContain('25000.00')
  expect(text).toContain('ค่ากาแฟนำเข้า')
})

test('backup, change data, restore: data returns to the backed-up state', async () => {
  const backup = join(work, 'my.meowbackup')
  await saveFileNext(backup)
  await nav('ข้อมูลและสำรอง').click()
  await page.getByRole('button', { name: 'สำรองข้อมูลตอนนี้' }).click()
  await expect(page.getByText(/สำรองข้อมูลแล้ว/)).toBeVisible()

  // Add one more item after the backup.
  await page.keyboard.press('Control+n')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('ชื่อรายการ').fill('เพิ่มหลังสำรอง')
  await dialog.getByLabel('จำนวนเงิน (บาท)').fill('10')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await nav('รายการรับ-จ่าย').click()
  await expect(page.getByText('เพิ่มหลังสำรอง', { exact: true })).toBeVisible()

  await nav('ข้อมูลและสำรอง').click()
  await pickFileNext(backup)
  await page.getByRole('button', { name: 'เลือกไฟล์สำรอง…' }).click()
  await expect(page.getByText(/ใช้ได้ — มี 2 รายการ/)).toBeVisible()
  await page.getByRole('button', { name: 'กู้คืนข้อมูลจากไฟล์นี้' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'กู้คืนข้อมูล' }).click()
  await expect(page.getByText(/กู้คืนเสร็จแล้ว \(2 รายการ\)/)).toBeVisible()

  await nav('รายการรับ-จ่าย').click()
  await expect(page.getByText('เพิ่มหลังสำรอง', { exact: true })).toHaveCount(0)
  await expect(page.getByText('เงินเดือนนำเข้า')).toBeVisible()

  // A file that is not a backup is refused with a clear message and nothing changes.
  const junk = join(work, 'junk.meowbackup')
  writeFileSync(junk, 'this is not a database')
  await nav('ข้อมูลและสำรอง').click()
  await pickFileNext(junk)
  await page.getByRole('button', { name: 'เลือกไฟล์สำรอง…' }).click()
  await expect(page.getByText('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ MeowLife')).toBeVisible()
})

test('reports show totals, the 6-month chart and its data table', async () => {
  await nav('รายงาน').click()
  await expect(page.getByRole('heading', { name: 'รายงาน' })).toBeVisible()
  await expect(page.getByRole('img', { name: /กราฟรายรับและรายจ่าย 6 เดือน/ })).toBeVisible()
  await expect(page.getByRole('table', { name: 'ตัวเลขรายรับรายจ่ายรายเดือน' })).toContainText('฿25,000.00')
  await expect(page.getByRole('table', { name: 'รายจ่ายตามหมวดเทียบเดือนก่อน' })).toContainText('อาหาร')
  await page.screenshot({ path: 'test-results/08-reports.png', fullPage: true })
})
