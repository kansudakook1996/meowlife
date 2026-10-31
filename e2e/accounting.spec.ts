import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

/**
 * End-to-end check of the built app (`npm run build` first).
 * Uses a throwaway data folder, so real or dev data is never touched.
 */
let userData: string

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, MEOWLIFE_USER_DATA: userData, ELECTRON_RENDERER_URL: '' }
  })
  const page = await app.firstWindow()
  // The app reopens on the page you used last, so wait for the menu and go to the dashboard.
  await page.getByRole('navigation').getByRole('button', { name: 'ภาพรวม', exact: true }).click()
  await page.getByRole('heading', { name: 'ภาพรวม' }).waitFor()
  return { app, page }
}

test.beforeAll(() => {
  userData = mkdtempSync(join(tmpdir(), 'meowlife-e2e-'))
})

test.afterAll(() => {
  rmSync(userData, { recursive: true, force: true })
})

test('add income and a bill, see totals, data survives restart', async () => {
  let { app, page } = await launch()

  // Security: the page must not have Node access.
  expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined')
  expect(await page.evaluate(() => typeof window.meow.transactions.list)).toBe('function')

  await expect(page.getByText('ยังไม่มีรายการในเดือนนี้')).toBeVisible()
  await page.screenshot({ path: 'test-results/01-empty-dashboard.png' })

  // Add income with keyboard shortcut Ctrl+N
  await page.keyboard.press('Control+n')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /รายรับ/ }).click()
  await dialog.getByLabel('ชื่อรายการ').fill('เงินเดือน')
  await dialog.getByLabel('จำนวนเงิน (บาท)').fill('25,000')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(page.getByText('เพิ่ม "เงินเดือน" แล้ว')).toBeVisible()

  // Add an unpaid bill
  await page.keyboard.press('Control+n')
  await dialog.getByLabel('ชื่อรายการ').fill('ค่าไฟ')
  await dialog.getByLabel('จำนวนเงิน (บาท)').fill('1234.56')
  await dialog.getByLabel('จ่ายเงินแล้ว').uncheck()
  await dialog.getByRole('button', { name: 'บันทึก' }).click()

  const summary = page.getByRole('region', { name: 'สรุปยอด' })
  await expect(summary).toContainText('฿25,000.00')
  await expect(summary).toContainText('฿1,234.56')
  await expect(summary).toContainText('฿23,765.44')
  await page.screenshot({ path: 'test-results/02-dashboard-with-data.png' })

  // Validation message for a bad amount
  await page.keyboard.press('Control+n')
  await dialog.getByLabel('ชื่อรายการ').fill('ผิด')
  await dialog.getByLabel('จำนวนเงิน (บาท)').fill('1.234')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(dialog.getByText(/ทศนิยมไม่เกิน 2 ตำแหน่ง/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // Mark bill as paid → outstanding becomes 0
  await page.getByRole('button', { name: 'ทำเครื่องหมายว่าจ่ายแล้ว' }).click()
  await expect(page.getByText('จ่ายครบทุกบิลแล้ว')).toBeVisible()

  // Delete with confirm, then undo
  await page.getByRole('button', { name: 'รายการรับ-จ่าย' }).click()
  await page.getByRole('button', { name: 'ลบ ค่าไฟ' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'ลบรายการ' }).click()
  await expect(page.getByText('ลบ "ค่าไฟ" แล้ว')).toBeVisible()
  await page.getByRole('button', { name: 'เลิกทำ' }).click()
  await expect(page.getByText('กู้คืนรายการแล้ว')).toBeVisible()
  await expect(page.getByRole('button', { name: 'ลบ ค่าไฟ' })).toBeVisible()
  await page.screenshot({ path: 'test-results/03-transactions.png' })

  // The ledger page opens with the month's summary and a verdict: 25,000 in, 1,234.56 out = healthy
  const health = page.getByRole('region', { name: 'สถานะการเงินของเดือนนี้' })
  await expect(health).toContainText('สถานะการเงินดี')
  await expect(page.getByRole('region', { name: /^สรุปยอดของ/ })).toContainText('฿23,765.44')
  // spending above income turns it into a warning
  await page.keyboard.press('Control+n')
  await dialog.getByLabel('ชื่อรายการ').fill('ซื้อของใหญ่')
  await dialog.getByLabel('จำนวนเงิน (บาท)').fill('30000')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(health).toContainText('เดือนนี้ติดลบ')
  await expect(health).toContainText('฿6,234.56') // 31,234.56 spent − 25,000 earned
  await page.screenshot({ path: 'test-results/03b-deficit-warning.png' })
  await page.getByRole('button', { name: 'ลบ ซื้อของใหญ่' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'ลบรายการ' }).click()
  await expect(health).toContainText('สถานะการเงินดี')

  // Restart the app: data must still be there
  await app.close()
  ;({ app, page } = await launch())
  await expect(page.getByRole('region', { name: 'สรุปยอด' })).toContainText('฿23,765.44')
  await app.close()
})

test('recurring bill is generated for the month', async () => {
  const { app, page } = await launch()
  await page.getByRole('button', { name: 'รายการประจำ' }).click()
  await page.getByRole('button', { name: '＋ เพิ่มรายการประจำ' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('ชื่อรายการ').fill('ค่าเช่าห้อง')
  await dialog.getByLabel('จำนวนเงิน (บาท)').fill('4500')
  await dialog.getByLabel('ครบกำหนดทุกวันที่').fill('31')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(page.getByText('ทุกวันที่ 31')).toBeVisible()
  await page.screenshot({ path: 'test-results/04-recurring.png' })

  await page.getByRole('button', { name: 'รายการรับ-จ่าย' }).click()
  await expect(page.getByText('ค่าเช่าห้อง')).toBeVisible()
  await app.close()
})

test('ledger items can be dragged into order of importance; the order survives a restart', async () => {
  let { app, page } = await launch()
  await page.getByRole('button', { name: 'รายการรับ-จ่าย' }).click()
  await page.getByRole('button', { name: 'เรียงตามความสำคัญ' }).click()
  const rows = page.locator('li.tx-row')
  await expect(rows).toHaveCount(3)
  // no rank numbers or arrow buttons: the order is changed by dragging (or Alt + arrows from the keyboard)
  await expect(page.getByRole('button', { name: /^เลื่อน / })).toHaveCount(0)

  /** Press on a row's title and drag it onto the first row. */
  const dragToTop = async (index: number): Promise<void> => {
    await rows.last().scrollIntoViewIfNeeded()
    await rows.first().scrollIntoViewIfNeeded()
    const grab = await rows.nth(index).locator('.tx-title').boundingBox()
    const target = await rows.first().boundingBox()
    expect(grab && target).toBeTruthy()
    await page.mouse.move(grab!.x + 10, grab!.y + grab!.height / 2)
    await page.mouse.down()
    await page.mouse.move(grab!.x + 10, (grab!.y + target!.y) / 2, { steps: 8 })
    await page.mouse.move(grab!.x + 10, target!.y + 6, { steps: 8 })
    await page.mouse.up()
  }

  await dragToTop(2)
  const first = (await rows.first().locator('.tx-title').innerText()).trim()
  await page.screenshot({ path: 'test-results/21-ledger-priority.png' })
  await dragToTop(1)
  await expect(rows.nth(1)).toContainText(first) // the previous first row is now second

  // keyboard: focus a row and press Alt + ArrowUp / ArrowDown
  const lastTitle = (await rows.last().locator('.tx-title').innerText()).trim()
  await rows.last().focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(rows.nth(1)).toContainText(lastTitle)
  await page.keyboard.press('Alt+ArrowDown')
  await expect(rows.last()).toContainText(lastTitle)

  const order = await rows.locator('.tx-title').allInnerTexts()
  await app.close()
  ;({ app, page } = await launch())
  await page.getByRole('button', { name: 'รายการรับ-จ่าย' }).click()
  await expect(page.locator('li.tx-row').locator('.tx-title')).toHaveText(order) // chosen view and order were remembered
  await page.getByRole('button', { name: 'เรียงตามวันที่' }).click()
  await expect(page.locator('.date-group').first()).toBeVisible()
  await app.close()
})