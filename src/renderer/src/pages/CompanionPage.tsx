import { useEffect } from 'react'
import { CatMascot } from '../components/CatMascot'
import { meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useLoad } from '../lib/useLoad'

export function CompanionPage(): React.JSX.Element {
  const { dataVersion } = usePortal()
  const { data, error } = useLoad(`companion:${dataVersion}`, () => unwrap(meow().portal.companion.state()))

  // Opening this page counts as "seen" for every badge earned so far.
  useEffect(() => {
    if (data && data.newBadgeIds.length > 0) void meow().portal.companion.markSeen(data.newBadgeIds)
  }, [data])

  const earned = data?.badges.filter((b) => b.earned).length ?? 0

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>แมวคู่ใจ</h1>
          <p className="muted">โมจิ (ขาว) กับ ส้มโอ (ส้ม) อยู่เป็นเพื่อนคุณ ไม่มีใครกดดันใคร</p>
        </div>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}
      {data && (
        <>
          <section className="greeting" aria-label="คำให้กำลังใจวันนี้">
            <CatMascot mood={data.message.mood} size={150} label="โมจิกับส้มโอ" />
            <div>
              <p style={{ fontSize: '1.15rem' }}>{data.message.text}</p>
              <p className="muted small">กำลังใจประจำวันนี้</p>
            </div>
          </section>

          <section className="card" aria-labelledby="badge-title">
            <div className="card-title">
              <h2 id="badge-title">🏅 Badge ของคุณ</h2>
              <span className="muted small">ได้รับแล้ว {earned} จาก {data.badges.length} (ค่อย ๆ สะสมไปนะ ไม่มีกำหนดเวลา)</span>
            </div>
            <ul className="badge-grid">
              {data.badges.map((b) => (
                <li key={b.id} className={`badge-card${b.earned ? '' : ' locked'}`}>
                  <span className="badge-emoji" aria-hidden="true">{b.icon}</span>
                  <strong>{b.title}</strong>
                  <span className={b.earned ? 'badge badge-paid' : 'badge badge-unpaid'}>
                    <span aria-hidden="true">{b.earned ? '✓' : '🔒'}</span> {b.earned ? 'ได้รับแล้ว' : 'ยังไม่ปลดล็อก'}
                  </span>
                  <span className="muted small">{b.hint}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
