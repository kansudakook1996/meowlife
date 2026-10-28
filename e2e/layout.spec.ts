import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/** At the minimum window size (900×600) nothing may overflow horizontally. */
test('pages fit at the minimum window size 900×600', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'meowlife-e2e-layout-'))
  const app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, MEOWLIFE_USER_DATA: userData, ELECTRON_RENDERER_URL: '' }
  })
  try {
    const page = await app.firstWindow()
    await page.getByRole('heading', { name: 'ภาพรวม' }).waitFor()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(900, 600))
    await page.waitForFunction(() => window.innerWidth === 900)

    // Add one long-titled bill so rows are exercised.
    await page.keyboard.press('Control+n')
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('ชื่อรายการ').fill('ค่าบัตรเครดิตธนาคารกรุงเทพรอบบิลเดือนตุลาคมพร้อมดอกเบี้ย')
    await dialog.getByLabel('จำนวนเงิน (บาท)').fill('123456789.99')
    await dialog.getByLabel('จ่ายเงินแล้ว').uncheck()
    await dialog.getByRole('button', { name: 'บันทึก' }).click()

    for (const nav of ['ภาพรวม', 'รายการรับ-จ่าย', 'รายการประจำ', 'รายงาน', 'หมวดหมู่', 'ข้อมูลและสำรอง', 'ตั้งค่า']) {
      await page.getByRole('navigation').getByRole('button', { name: nav }).click()
      await page.waitForTimeout(200)
      const overflow = await page.evaluate(() => {
        const main = document.querySelector('main')
        return main ? main.scrollWidth - main.clientWidth : -1
      })
      await page.screenshot({ path: `test-results/layout-900x600-${nav}.png` })
      expect(overflow, `horizontal overflow on ${nav}`).toBeLessThanOrEqual(0)
    }
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
