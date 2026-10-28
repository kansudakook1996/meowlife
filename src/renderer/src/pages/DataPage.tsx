import { useState } from 'react'
import type { BackupPick } from '@shared/dataTools'
import { formatThaiMonth } from '@shared/dates'
import { ImportWizard } from '../components/ImportWizard'
import { errorMessage, meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'

export function DataPage(): React.JSX.Element {
  const { month, refresh, toast, confirm } = usePortal()
  const [picked, setPicked] = useState<BackupPick | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'info' | 'alert'; text: string } | null>(null)

  const exportCsv = async (scope: 'all' | 'month'): Promise<void> => {
    setMessage(null)
    try {
      const r = await unwrap(meow().data.exportCsv(scope, scope === 'month' ? month : undefined))
      if (r) setMessage({ tone: 'info', text: `ส่งออก ${r.rows} รายการแล้ว: ${r.path}` })
    } catch (e) {
      setMessage({ tone: 'alert', text: errorMessage(e) })
    }
  }

  const createBackup = async (): Promise<void> => {
    setMessage(null)
    try {
      const r = await unwrap(meow().data.createBackup())
      if (r) setMessage({ tone: 'info', text: `สำรองข้อมูลแล้ว: ${r.path}` })
    } catch (e) {
      setMessage({ tone: 'alert', text: errorMessage(e) })
    }
  }

  const pickBackup = async (): Promise<void> => {
    setMessage(null)
    setPicked(null)
    try {
      setPicked(await unwrap(meow().data.pickBackup()))
    } catch (e) {
      setMessage({ tone: 'alert', text: errorMessage(e) })
    }
  }

  const restore = async (): Promise<void> => {
    if (!picked) return
    const ok = await confirm({
      title: 'กู้คืนข้อมูลจากไฟล์สำรองไหม?',
      message: `ข้อมูลปัจจุบันจะถูกแทนที่ด้วยข้อมูลในไฟล์ (${picked.summary.transactions} รายการ) รายการที่ไม่มีในไฟล์จะถูกลบออก แอปจะสำรองข้อมูลปัจจุบันไว้ให้อัตโนมัติก่อน และถ้าเข้าสู่ระบบออนไลน์อยู่ ผลนี้จะซิงก์ไปเครื่องอื่นด้วย`,
      confirmLabel: 'กู้คืนข้อมูล',
      danger: true
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await unwrap(meow().data.restoreBackup())
      setPicked(null)
      refresh()
      toast('กู้คืนข้อมูลแล้ว')
      setMessage({ tone: 'info', text: `กู้คืนเสร็จแล้ว (${r.summary.transactions} รายการ) · ข้อมูลก่อนกู้คืนเก็บไว้ที่ ${r.safetyCopy}${r.skipped > 0 ? ` · ข้ามข้อมูลที่ใช้ไม่ได้ ${r.skipped} แถว` : ''}` })
    } catch (e) {
      setMessage({ tone: 'alert', text: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>ข้อมูลและสำรอง</h1>
          <p className="muted">นำเข้าจาก Excel · ส่งออก · สำรองและกู้คืน</p>
        </div>
      </header>

      {message && (
        <p className={message.tone} role={message.tone === 'alert' ? 'alert' : 'status'} style={{ overflowWrap: 'anywhere' }}>
          {message.text}
        </p>
      )}

      <section className="card" aria-labelledby="import-title">
        <div className="card-title">
          <h2 id="import-title">📥 นำเข้าจาก Excel / CSV</h2>
        </div>
        <ImportWizard />
      </section>

      <section className="card" aria-labelledby="export-title">
        <div className="card-title">
          <h2 id="export-title">📤 ส่งออกเป็น CSV</h2>
        </div>
        <p className="muted" style={{ marginBottom: 10 }}>
          ไฟล์ CSV เปิดด้วย Excel ได้ ภาษาไทยไม่เพี้ยน และนำกลับเข้า MeowLife ได้อีก
        </p>
        <div className="toolbar">
          <button type="button" className="btn btn-primary" onClick={() => void exportCsv('month')}>
            ส่งออก{formatThaiMonth(month)}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void exportCsv('all')}>
            ส่งออกทั้งหมด
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="backup-title">
        <div className="card-title">
          <h2 id="backup-title">🛟 สำรองและกู้คืนข้อมูล</h2>
        </div>
        <div className="form">
          <p className="muted">
            ไฟล์สำรอง (.meowbackup) คือสำเนาข้อมูลทั้งหมดในเครื่องนี้ เก็บไว้ที่ไหนก็ได้ เช่น แฟลชไดรฟ์ แอปยังสำรองอัตโนมัติวันละครั้ง (เก็บ 7 วันล่าสุด)
            ไว้ในโฟลเดอร์ของแอปด้วย ไฟล์สำรองไม่ได้เข้ารหัส ควรเก็บให้ปลอดภัย
          </p>
          <div className="toolbar">
            <button type="button" className="btn btn-primary" onClick={() => void createBackup()}>
              สำรองข้อมูลตอนนี้
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void meow().data.openBackupFolder()}>
              เปิดโฟลเดอร์สำรองอัตโนมัติ
            </button>
          </div>

          <h3 style={{ marginTop: 8 }}>กู้คืนจากไฟล์สำรอง</h3>
          <div className="toolbar">
            <button type="button" className="btn btn-secondary" onClick={() => void pickBackup()}>
              เลือกไฟล์สำรอง…
            </button>
          </div>
          {picked && (
            <div className="info" role="status">
              <p>
                ไฟล์ <strong>{picked.fileName}</strong> ใช้ได้ — มี {picked.summary.transactions} รายการ, {picked.summary.recurringRules} รายการประจำ,{' '}
                {picked.summary.categories} หมวดหมู่
              </p>
              <button type="button" className="btn btn-danger" style={{ marginTop: 8 }} disabled={busy} onClick={() => void restore()}>
                {busy ? 'กำลังกู้คืน…' : 'กู้คืนข้อมูลจากไฟล์นี้'}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
