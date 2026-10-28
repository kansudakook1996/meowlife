import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/** The online-account card loads the Firebase SDK lazily and shows the sign-in form (no network needed). */
test('settings shows the online account card', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'meowlife-e2e-settings-'))
  const app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, MEOWLIFE_USER_DATA: userData, ELECTRON_RENDERER_URL: '' }
  })
  try {
    const page = await app.firstWindow()
    const cspErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) cspErrors.push(m.text())
    })
    await page.getByRole('navigation').getByRole('button', { name: 'ตั้งค่า' }).click()
    await expect(page.getByRole('heading', { name: /บัญชีออนไลน์/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('อีเมล')).toBeVisible()

    // Client-side validation runs before any network call.
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
    await expect(page.getByText('กรุณาใส่อีเมล')).toBeVisible()

    await page.screenshot({ path: 'test-results/05-settings-account.png' })
    expect(cspErrors).toEqual([])
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
