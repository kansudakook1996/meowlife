import { AccountCard } from '../components/AccountCard'
import { CatMascot } from '../components/CatMascot'
import { meow, unwrap } from '../lib/api'
import { useLoad } from '../lib/useLoad'
import { describeUpdate, useUpdateStatus } from '../lib/useUpdateStatus'

const ROADMAP = [
  'นำเข้า Excel/CSV และส่งออกข้อมูล',
  'สำรองและกู้คืนข้อมูล (Backup/Restore)',
  'รายงานและกราฟแนวโน้ม',
  'ซิงก์ข้อมูลรายรับรายจ่ายข้ามเครื่อง (Firebase)',
  'ปฏิทิน บันทึกประจำวัน สิ่งที่ต้องทำ เป้าหมาย นิสัย โน้ต'
]

export function SettingsPage(): React.JSX.Element {
  const { data: info, error } = useLoad('info', () => unwrap(meow().app.info()))
  const update = useUpdateStatus()

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>ตั้งค่าและข้อมูลแอป</h1>
          <p className="muted">ข้อมูลของคุณอยู่ที่ไหน และกำลังจะมีอะไรเพิ่ม</p>
        </div>
      </header>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      <section className="card" aria-labelledby="data-title">
        <div className="card-title">
          <h2 id="data-title">💾 ข้อมูลของคุณ</h2>
        </div>
        <div className="form">
          <p>
            ตอนนี้ข้อมูลทั้งหมดเก็บ<strong>ในเครื่องนี้เท่านั้น</strong> ยังไม่ได้ซิงก์ขึ้นอินเทอร์เน็ต
          </p>
          <div className="field">
            <span className="field-label">ตำแหน่งไฟล์ข้อมูล</span>
            <code style={{ overflowWrap: 'anywhere' }}>{info ? info.dataPath : '…'}</code>
          </div>
          <p className="muted small">
            ไฟล์ข้อมูลไม่ได้เข้ารหัส ใครที่ใช้บัญชี Windows ของคุณได้ก็เปิดอ่านได้ — แนะนำให้ตั้งรหัสผ่าน Windows
            และเปิด BitLocker/Device Encryption
          </p>
          <p className="muted small">เวอร์ชัน {info ? info.version : '…'}{info && !info.isPackaged ? ' (โหมดพัฒนา)' : ''}</p>
        </div>
      </section>

      <AccountCard />

      <section className="card" aria-labelledby="update-title">
        <div className="card-title">
          <h2 id="update-title">🔄 อัปเดตแอป</h2>
        </div>
        <div className="form">
          <p aria-live="polite">{update ? describeUpdate(update) : '…'}</p>
          <p className="muted small">แอปจะตรวจเวอร์ชันใหม่จาก GitHub ให้เองทุกครั้งที่เปิด และข้อมูลของคุณจะไม่หายเมื่ออัปเดต</p>
          <div className="toolbar">
            {update?.state === 'downloaded' ? (
              <button type="button" className="btn btn-primary" onClick={() => void meow().updates.install()}>
                รีสตาร์ทเพื่ออัปเดต
              </button>
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

      <section className="card" aria-labelledby="soon-title">
        <div className="card-title">
          <h2 id="soon-title">🛠️ กำลังพัฒนา (ยังใช้ไม่ได้)</h2>
          <CatMascot mood="sleepy" size={56} />
        </div>
        <ul>
          {ROADMAP.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
