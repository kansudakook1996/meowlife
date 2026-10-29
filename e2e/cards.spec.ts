import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

/** Credit cards on the real built app, plus the Ctrl+K command palette. */
let userData: string
let app: ElectronApplication
let page: Page

const now = new Date()
const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const nav = (name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true })

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'meowlife-e2e-cards-'))
  app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, MEOWLIFE_USER_DATA: userData, ELECTRON_RENDERER_URL: '' }
  })
  page = await app.firstWindow()
  await page.getByRole('navigation').waitFor()
})
test.afterAll(async () => {
  await app.close()
  rmSync(userData, { recursive: true, force: true })
})
test.describe.configure({ mode: 'serial' })

test('command palette: Ctrl+K opens, filters and jumps with the keyboard', async () => {
  await page.keyboard.press('Control+k')
  const input = page.getByRole('combobox')
  await expect(input).toBeFocused()
  await input.fill('ปฏิทิน')
  await expect(page.getByRole('option').first()).toHaveText(/ปฏิทิน/)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'ปฏิทิน', exact: true })).toBeVisible()

  await page.keyboard.press('Control+k')
  await page.getByRole('combobox').fill('บัตร')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'บัตรเครดิต', exact: true })).toBeVisible()
  await expect(page.getByText('ยังไม่ได้เพิ่มบัตรเครดิต')).toBeVisible()
  await page.screenshot({ path: 'test-results/15-cards-empty.png' })
})

test('set up a card, add a charge and an instalment plan, see the totals', async () => {
  await page.getByRole('button', { name: /เพิ่มบัตร/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('ชื่อบัตร').fill('KTC')
  await dialog.getByLabel('วันตัดรอบบิล (ทุกวันที่)').fill('25')
  await dialog.getByLabel('วันครบกำหนดชำระ (ทุกวันที่)').fill('10')
  await dialog.getByLabel('วงเงิน (บาท, ไม่บังคับ)').fill('50,000')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(page.getByRole('heading', { name: /💳 KTC/ })).toBeVisible()

  await page.getByRole('button', { name: '＋ เพิ่มยอด', exact: true }).click()
  await dialog.getByLabel('วันที่ใช้จ่าย').fill(`${month}-05`)
  await dialog.getByLabel('รายการ', { exact: true }).fill('ข้าวเที่ยง')
  await dialog.getByLabel('หมวดหมู่').selectOption('อาหาร')
  await dialog.getByLabel('จำนวนเงิน (บาท)').fill('250')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(page.getByText('ข้าวเที่ยง', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '＋ เพิ่มรายการผ่อน' }).click()
  await dialog.getByLabel('รายการผ่อน').fill('ผ่อนโทรศัพท์')
  await dialog.getByLabel('ยอดผ่อนต่อเดือน (บาท)').fill('1,500')
  await dialog.getByLabel('ผ่อนทั้งหมดกี่งวด').fill('10')
  await dialog.getByLabel(/เป็นงวดที่/).fill('3')
  await expect(dialog.getByText(/เหลืออีก 7 งวดหลังเดือนนี้/)).toBeVisible()
  await dialog.getByRole('button', { name: 'บันทึก' }).click()

  await expect(page.getByText(/งวดที่ 3\/10 · เหลืออีก 7 งวด · ผ่อนหมด/)).toBeVisible()
  await expect(page.getByRole('progressbar', { name: /ผ่อนโทรศัพท์/ })).toHaveAttribute('aria-valuenow', '30')
  await expect(page.getByText('฿1,750.00').first()).toBeVisible() // 250 + 1,500
  await page.screenshot({ path: 'test-results/16-cards-statement.png', fullPage: true })
})

test('create the ledger bill, keep it up to date, and never duplicate it', async () => {
  await page.getByRole('button', { name: 'สร้างรายการจ่ายบิล', exact: true }).click()
  await expect(page.getByText(/สร้างรายการจ่ายบิลแล้ว/)).toBeVisible()
  await expect(page.getByText(/รายการจ่ายบิล ฿1,750.00/)).toBeVisible()

  // A new purchase makes the bill out of date; one click updates the same bill.
  await page.getByRole('button', { name: '＋ เพิ่มยอด', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('วันที่ใช้จ่าย').fill(`${month}-06`)
  await dialog.getByLabel('รายการ', { exact: true }).fill('ซื้อของใช้')
  await dialog.getByLabel('จำนวนเงิน (บาท)').fill('500')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await page.getByRole('button', { name: /อัปเดตยอดบิลเป็น ฿2,250.00/ }).click()
  await expect(page.getByText(/อัปเดตยอดบิลเป็น ฿2,250.00 แล้ว/)).toBeVisible()
  await expect(page.getByText(/รายการจ่ายบิล ฿2,250.00/)).toBeVisible()

  // The bill is a normal ledger item due next month (card due day 10 < statement day 25).
  await nav('รายการรับ-จ่าย').click()
  await page.getByRole('button', { name: 'เดือนถัดไป' }).click()
  await expect(page.getByText(/ชำระบัตร KTC/)).toHaveCount(1)
  await expect(page.getByText('฿2,250.00').first()).toBeVisible()
})

test('delete a charge with undo; dashboard shows the card summary', async () => {
  await nav('บัตรเครดิต').click()
  await page.getByRole('button', { name: 'เดือนก่อน' }).click() // the month selection is shared by all pages (the ledger was left on next month)
  await page.getByRole('button', { name: 'ลบ ซื้อของใช้' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'ลบ', exact: true }).click()
  await expect(page.getByText('ซื้อของใช้', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'เลิกทำ' }).click()
  await expect(page.getByText('ซื้อของใช้', { exact: true })).toBeVisible()

  await nav('ภาพรวม').click()
  await expect(page.getByRole('heading', { name: /💳 บัตรเครดิต · รอบบิล/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/17-dashboard-cards.png', fullPage: true })
  await expect(page.getByText(/ต้องจ่ายรวม/)).toBeVisible()
  await page.getByRole('button', { name: 'ดูรายละเอียด' }).click()
  await expect(page.getByRole('heading', { name: 'บัตรเครดิต', exact: true })).toBeVisible()
})

test('a monthly repeating charge on the card is added to the statement by itself, with a chosen category', async () => {
  await expect(page.getByText(/ตั้งไว้ครั้งเดียว แอปจะใส่ยอดให้ทุกรอบบิลเอง/)).toBeVisible()
  await page.getByRole('button', { name: '＋ เพิ่มรายการประจำ' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('รายการ', { exact: true }).fill('ค่าไฟรายเดือน')
  await dialog.getByLabel('หมวดหมู่').selectOption('ค่าน้ำค่าไฟ')
  await dialog.getByLabel('จำนวนเงินต่อเดือน (บาท)').fill('1,200')
  await dialog.getByLabel('ตัดบัตรทุกวันที่').fill('1')
  await dialog.getByLabel('เริ่มเดือน').fill(month)
  await dialog.getByRole('button', { name: 'บันทึก' }).click()

  await expect(page.getByText(/รายการประจำทุกเดือน \(1\)/)).toBeVisible()
  // the month's charge appears in the statement without typing it again, and is filed under the chosen category
  await expect(page.getByText('ค่าไฟรายเดือน')).toHaveCount(2) // the rule + this month's charge
  await expect(page.getByText('ค่าน้ำค่าไฟ').first()).toBeVisible()
  await expect(page.getByText('฿3,450.00').first()).toBeVisible() // 250 + 500 + 1,500 + 1,200
  await page.screenshot({ path: 'test-results/18-cards-recurring.png', fullPage: true })

  // deleting the generated charge sticks (it does not come back on reload)
  await page.getByRole('button', { name: 'ลบ ค่าไฟรายเดือน' }).last().click()
  await page.getByRole('dialog').getByRole('button', { name: 'ลบ', exact: true }).click()
  await nav('ภาพรวม').click()
  await nav('บัตรเครดิต').click()
  await expect(page.getByText('ค่าไฟรายเดือน')).toHaveCount(1)
})
