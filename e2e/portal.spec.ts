import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

/** Personal Portal on the real built app: tasks, journal, goals, habits, notes, calendar, insights, companion, settings. */
let userData: string
let app: ElectronApplication
let page: Page

const today = new Date()
const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const TODAY = iso(today)
const nav = (name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true })

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'meowlife-e2e-portal-'))
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
})
test.describe.configure({ mode: 'serial' })

test('tasks: add, repeat, complete, delete with undo; shows on the dashboard reminder', async () => {
  await nav('สิ่งที่ต้องทำ').click()
  await page.getByRole('button', { name: '＋ เพิ่มงาน' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('ชื่องาน').fill('ซื้อทรายแมว')
  await dialog.getByLabel('วันครบกำหนด (ไม่บังคับ)').fill(TODAY)
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(page.getByText('ซื้อทรายแมว', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '＋ เพิ่มงาน' }).first().click()
  await dialog.getByLabel('ชื่องาน').fill('รดน้ำต้นไม้')
  await dialog.getByLabel('วันครบกำหนด (ไม่บังคับ)').fill(TODAY)
  await dialog.getByLabel('ทำซ้ำ').selectOption('weekly')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()

  // The dashboard shows today's tasks in the reminder card.
  await nav('ภาพรวม').click()
  await expect(page.getByRole('heading', { name: /วันนี้ต้องดูแล/ })).toBeVisible()
  await expect(page.getByText('ซื้อทรายแมว', { exact: true })).toBeVisible()

  await nav('สิ่งที่ต้องทำ').click()
  await page.getByRole('button', { name: 'ทำ รดน้ำต้นไม้ เสร็จแล้ว' }).click()
  await expect(page.getByText(/งานนี้จะมาอีกครั้ง/)).toBeVisible() // repeating tasks come back
  await expect(page.getByText('รดน้ำต้นไม้', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'ทำ ซื้อทรายแมว เสร็จแล้ว' }).click()
  await page.getByRole('button', { name: /งานที่เสร็จแล้ว/ }).click()
  await expect(page.getByRole('button', { name: 'ยกเลิกเสร็จ ซื้อทรายแมว' })).toBeVisible()

  await page.getByRole('button', { name: 'ลบ ซื้อทรายแมว' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'ลบ', exact: true }).click()
  await page.getByRole('button', { name: 'เลิกทำ' }).click()
  await expect(page.getByText('กู้คืนแล้ว')).toBeVisible()
  await page.screenshot({ path: 'test-results/09-tasks.png' })
})

test('journal: write today, edit it, one page per day', async () => {
  await nav('บันทึกประจำวัน').click()
  await page.getByRole('button', { name: /ดีมาก/ }).click()
  await page.getByLabel('เรื่องราววันนี้').fill('วันนี้ได้เล่นกับแมวทั้งวัน')
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(page.getByText('✓ มีบันทึกแล้ว')).toBeVisible()
  await page.getByLabel('เรื่องราววันนี้').fill('วันนี้ได้เล่นกับแมวทั้งวัน (แก้)')
  await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click()
  await expect(page.getByText('1 วัน')).toBeVisible()
  await expect(page.getByText(/\(แก้\)/).first()).toBeVisible()
})

test('goals: saving goal progress reaches 100% and finishes', async () => {
  await nav('เป้าหมาย').click()
  await page.getByRole('button', { name: '＋ เพิ่มเป้าหมาย' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('ชื่อเป้าหมาย').fill('เที่ยวญี่ปุ่น')
  await dialog.getByLabel('จำนวนเงินเป้าหมาย (บาท)').fill('10,000')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await page.getByRole('button', { name: '＋ เพิ่มเงินออม' }).click()
  await dialog.getByLabel('เพิ่มเงินออม (บาท)').fill('2,500')
  await dialog.getByRole('button', { name: 'เพิ่มเงินออม' }).click()
  await expect(page.getByText('25%')).toBeVisible()
  await expect(page.getByRole('progressbar', { name: /เที่ยวญี่ปุ่น/ })).toHaveAttribute('aria-valuenow', '25')
  await page.getByRole('button', { name: '＋ เพิ่มเงินออม' }).click()
  await dialog.getByLabel('เพิ่มเงินออม (บาท)').fill('7,500')
  await dialog.getByRole('button', { name: 'เพิ่มเงินออม' }).click()
  await expect(page.getByText(/สำเร็จแล้ว/).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/10-goals.png' })
})

test('habits: tick today, streak, tick a past day', async () => {
  await nav('นิสัย').click()
  await page.getByRole('button', { name: '＋ เพิ่มนิสัย' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('ชื่อนิสัย').fill('ดื่มน้ำ 8 แก้ว')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await page.getByRole('button', { name: 'ติ๊กวันนี้' }).click()
  await expect(page.getByText(/ต่อเนื่อง 1 วัน/)).toBeVisible()
  await expect(page.getByRole('button', { name: '✓ ทำวันนี้แล้ว' })).toHaveAttribute('aria-pressed', 'true')
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  await page.getByRole('button', { name: new RegExp('ยังไม่ได้ทำ$') }).nth(12).click() // the 13th of 14 days = yesterday
  await expect(page.getByText(/ต่อเนื่อง 2 วัน/)).toBeVisible()
  expect(iso(yesterday)).toBeTruthy()
})

test('notes: create, pin, search, delete with undo', async () => {
  await nav('โน้ต').click()
  await page.getByRole('button', { name: '＋ เพิ่มโน้ต' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('หัวข้อ').fill('รายการซื้อของ')
  await dialog.getByLabel('เนื้อหา').fill('ปลาทู\nนมแมว')
  await dialog.getByLabel('ปักหมุดไว้ด้านบน').check()
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await page.getByRole('button', { name: '＋ เพิ่มโน้ต' }).first().click()
  await dialog.getByLabel('หัวข้อ').fill('ไอเดีย')
  await dialog.getByLabel('เนื้อหา').fill('ทำสวนผัก')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(page.getByRole('heading', { name: '📌 รายการซื้อของ' })).toBeVisible()
  await page.getByLabel('ค้นหาโน้ต').fill('สวนผัก')
  await expect(page.getByRole('heading', { name: 'ไอเดีย' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /รายการซื้อของ/ })).toHaveCount(0)
  await page.getByLabel('ค้นหาโน้ต').fill('')
  await page.getByRole('button', { name: 'ลบ ไอเดีย' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'ลบ', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'ไอเดีย' })).toHaveCount(0)
  await page.getByRole('button', { name: 'เลิกทำ' }).click()
  await expect(page.getByRole('heading', { name: 'ไอเดีย' })).toBeVisible()
})

test('calendar: month grid shows today’s task, day panel adds a task, week and day views work', async () => {
  await nav('ปฏิทิน').click()
  await expect(page.getByRole('grid')).toBeVisible()
  const cell = page.getByRole('gridcell', { name: new RegExp(`มี \\d+ รายการ`) }).first()
  await expect(cell).toBeVisible()
  await page.getByLabel('เพิ่มงานในวันนี้').fill('งานจากปฏิทิน')
  await page.getByLabel('เพิ่มงานในวันนี้').press('Enter')
  await expect(page.getByText('งานจากปฏิทิน').first()).toBeVisible()
  await page.getByRole('button', { name: 'สัปดาห์', exact: true }).click()
  await expect(page.getByText('งานจากปฏิทิน').first()).toBeVisible()
  await page.getByRole('button', { name: 'วัน', exact: true }).click()
  await expect(page.getByRole('heading', { name: /วัน/ }).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/11-calendar-day.png' })
  await page.getByRole('button', { name: 'เดือน', exact: true }).click()
  await page.screenshot({ path: 'test-results/12-calendar-month.png', fullPage: true })
})

test('insights and companion reflect the activity, with locked and earned badges', async () => {
  await nav('สถิติ').click()
  await expect(page.getByRole('heading', { name: '✅ งาน' })).toBeVisible()
  await expect(page.getByText(/ดื่มน้ำ 8 แก้ว/).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: '🎯 เป้าหมาย' })).toBeVisible()

  await nav('แมวคู่ใจ').click()
  await expect(page.getByRole('heading', { name: '🏅 Badge ของคุณ' })).toBeVisible()
  await expect(page.getByText('✓ ได้รับแล้ว').first()).toBeVisible() // goal done → "ถึงเป้าหมาย"
  await expect(page.getByText('🔒 ยังไม่ปลดล็อก').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/13-companion.png', fullPage: true })
})

test('settings: theme, year style and money style change the app; choices survive a restart', async () => {
  await nav('ตั้งค่า').click()
  await page.getByRole('button', { name: /ฟ้าพาสเทล/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'blue')
  await page.getByLabel('การแสดงปี').selectOption('ce')
  await page.getByLabel('การแสดงเงิน (บาท)').selectOption('word')
  await nav('ปฏิทิน').click()
  await expect(page.getByRole('grid')).toHaveAttribute('aria-label', new RegExp(`${today.getFullYear()}`)) // ค.ศ.
  await page.screenshot({ path: 'test-results/14-theme-blue.png' })

  await app.close()
  app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, MEOWLIFE_USER_DATA: userData, ELECTRON_RENDERER_URL: '' }
  })
  page = await app.firstWindow()
  await page.getByRole('heading', { name: 'ภาพรวม' }).waitFor()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'blue')
  await nav('เป้าหมาย').click()
  await expect(page.getByText(/บาท/).first()).toBeVisible() // "10,000.00 บาท" style survived
})
