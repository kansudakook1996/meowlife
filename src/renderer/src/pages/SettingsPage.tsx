import { useState } from 'react'
import type { ThemeName } from '@shared/portalModel'
import { AccountCard } from '../components/AccountCard'
import { meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useSettings } from '../lib/settings'
import { useLoad } from '../lib/useLoad'
import { describeUpdate, useUpdateStatus } from '../lib/useUpdateStatus'

const THEMES: Array<{ id: ThemeName; label: string; color: string }> = [
  { id: 'orange', label: 'ส้มเหลือง (ตามแมว)', color: '#b4530f' },
  { id: 'pink', label: 'ชมพูพาสเทล', color: '#b5365f' },
  { id: 'blue', label: 'ฟ้าพาสเทล', color: '#24609e' }
]

export function SettingsPage(): React.JSX.Element {
  const { data: info, error } = useLoad('info', () => unwrap(meow().app.info()))
  const update = useUpdateStatus()
  const { settings, update: save } = useSettings()
  const { toast, refresh } = usePortal()
  const [saveError, setSaveError] = useState<string | null>(null)

  const change = async (patch: Parameters<typeof save>[0]): Promise<void> => {
    const message = await save(patch)
    setSaveError(message)
    if (!message) {
      refresh() // statuses such as "due soon" depend on these settings
      toast('บันทึกการตั้งค่าแล้ว')
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>ตั้งค่า</h1>
          <p className="muted">หน้าตา การแจ้งเตือน การซิงก์ และข้อมูลของคุณ</p>
        </div>
      </header>

      {(error || saveError) && <div className="alert" role="alert">{error ?? saveError}</div>}

      <section className="card" aria-labelledby="look-title">
        <div className="card-title"><h2 id="look-title">🎨 หน้าตาและการแสดงผล</h2></div>
        <div className="form">
          <div className="field">
            <span className="field-label" id="theme-label">ธีมสี</span>
            <div className="segmented" role="group" aria-labelledby="theme-label" style={{ flexWrap: 'wrap', borderRadius: 16 }}>
              {THEMES.map((t) => (
                <button key={t.id} type="button" aria-pressed={settings.theme === t.id} onClick={() => void change({ theme: t.id })}>
                  <span className="theme-swatch" style={{ background: t.color }} aria-hidden="true" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="set-year">การแสดงปี</label>
              <select id="set-year" className="input" value={settings.yearStyle} onChange={(e) => void change({ yearStyle: e.target.value as 'be' | 'ce' })}>
                <option value="be">พุทธศักราช (พ.ศ. 2569)</option>
                <option value="ce">คริสต์ศักราช (ค.ศ. 2026)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="set-money">การแสดงเงิน (บาท)</label>
              <select id="set-money" className="input" value={settings.moneyStyle} onChange={(e) => void change({ moneyStyle: e.target.value as 'symbol' | 'word' })}>
                <option value="symbol">฿1,234.50</option>
                <option value="word">1,234.50 บาท</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="remind-title">
        <div className="card-title"><h2 id="remind-title">🔔 การแจ้งเตือน</h2></div>
        <div className="form">
          <label className="check">
            <input type="checkbox" checked={settings.remindersEnabled} onChange={(e) => void change({ remindersEnabled: e.target.checked })} />
            แจ้งเตือนบนหน้าจอเมื่อมีงานหรือบิลที่ต้องทำ (วันละไม่เกิน 1 ครั้ง ขณะเปิดแอปอยู่)
          </label>
          <div className="field-row">
            <div className="field">
              <label htmlFor="set-hour">แจ้งเตือนหลังเวลา</label>
              <select id="set-hour" className="input" value={settings.reminderHour} disabled={!settings.remindersEnabled} onChange={(e) => void change({ reminderHour: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00 น.</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="set-soon">บิล "ใกล้ครบกำหนด" ภายใน</label>
              <select id="set-soon" className="input" value={settings.dueSoonDays} onChange={(e) => void change({ dueSoonDays: Number(e.target.value) })}>
                {[1, 2, 3, 5, 7, 10, 14].map((d) => (
                  <option key={d} value={d}>{d} วัน</option>
                ))}
              </select>
            </div>
          </div>
          <p className="muted small">การแจ้งเตือนทำงานเมื่อแอปเปิดอยู่เท่านั้น (ยังไม่ทำงานเบื้องหลังตอนปิดแอป) และอาจถูกปิดโดย "โหมดห้ามรบกวน" ของ Windows</p>
        </div>
      </section>

      <section className="card" aria-labelledby="data-title">
        <div className="card-title"><h2 id="data-title">💾 ข้อมูลของคุณ</h2></div>
        <div className="form">
          <p>
            ข้อมูลหลักเก็บ<strong>ในเครื่องนี้</strong>เสมอ ใช้ออฟไลน์ได้ ถ้าเข้าสู่ระบบบัญชีออนไลน์ (ด้านล่าง)
            แอปจะสำเนาขึ้น Firebase ให้เพื่อใช้ข้ามเครื่อง
          </p>
          <div className="field">
            <span className="field-label">ตำแหน่งไฟล์ข้อมูล</span>
            <code style={{ overflowWrap: 'anywhere' }}>{info ? info.dataPath : '…'}</code>
          </div>
          <p className="muted small">
            ไฟล์ข้อมูลไม่ได้เข้ารหัส ใครที่ใช้บัญชี Windows ของคุณได้ก็เปิดอ่านได้ — แนะนำให้ตั้งรหัสผ่าน Windows
            และเปิด BitLocker/Device Encryption · สำรอง/กู้คืนได้ที่เมนู "ข้อมูลและสำรอง"
          </p>
          <p className="muted small">เวอร์ชัน {info ? info.version : '…'}{info && !info.isPackaged ? ' (โหมดพัฒนา)' : ''}</p>
        </div>
      </section>

      <section className="card" aria-labelledby="autosync-title">
        <div className="card-title"><h2 id="autosync-title">☁️ การซิงก์</h2></div>
        <label className="check">
          <input type="checkbox" checked={settings.autoSync} onChange={(e) => void change({ autoSync: e.target.checked })} />
          ซิงก์อัตโนมัติเมื่อเข้าสู่ระบบอยู่ (ถ้าปิด จะซิงก์เฉพาะตอนกด "ซิงก์ตอนนี้")
        </label>
      </section>

      <AccountCard />

      <section className="card" aria-labelledby="update-title">
        <div className="card-title"><h2 id="update-title">🔄 อัปเดตแอป</h2></div>
        <div className="form">
          <p aria-live="polite">{update ? describeUpdate(update) : '…'}</p>
          <p className="muted small">แอปจะตรวจเวอร์ชันใหม่จาก GitHub ให้เองทุกครั้งที่เปิด และข้อมูลของคุณจะไม่หายเมื่ออัปเดต</p>
          <div className="toolbar">
            {update?.state === 'downloaded' ? (
              <button type="button" className="btn btn-primary" onClick={() => void meow().updates.install()}>รีสตาร์ทเพื่ออัปเดต</button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!update || update.state === 'disabled' || update.state === 'checking' || update.state === 'downloading'}
                onClick={() => void meow().updates.check()}
              >
                ตรวจหาเวอร์ชันใหม่
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
