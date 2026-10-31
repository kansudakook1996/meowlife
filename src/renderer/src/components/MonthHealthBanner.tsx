import { formatSatang } from '@shared/money'
import { monthHealth, type HealthLevel } from '@shared/summary'
import type { MonthSummary } from '@shared/types'

const LOOK: Record<Exclude<HealthLevel, 'empty'>, { icon: string; title: string }> = {
  deficit: { icon: '🚨', title: 'เดือนนี้ติดลบ' },
  tight: { icon: '⚠️', title: 'เงินเหลือน้อย' },
  ok: { icon: '🙂', title: 'พอไปได้' },
  great: { icon: '✅', title: 'สถานะการเงินดี' }
}

/** One-glance verdict for the month: icon + word + colour, never colour alone. */
export function MonthHealthBanner({ summary }: { summary: MonthSummary }): React.JSX.Element | null {
  const h = monthHealth(summary)
  if (h.level === 'empty') return null
  const look = LOOK[h.level]
  const detail =
    h.level === 'deficit'
      ? `ใช้เกินรายรับอยู่ ${formatSatang(h.overBy)} ลองชะลอรายจ่ายที่ยังไม่จำเป็น หรือเลื่อนบางรายการไปเดือนหน้า แล้วจดไว้เตือนตัวเองตอนวางแผนเดือนถัดไปนะ`
      : h.savedPercent === null
        ? 'เดือนนี้ยังไม่มีรายรับที่จดไว้'
        : h.level === 'tight'
          ? `เหลือเพียง ${h.savedPercent}% ของรายรับ (${formatSatang(summary.balance)}) ระวังรายจ่ายเพิ่มนะ`
          : `เหลือ ${h.savedPercent}% ของรายรับ (${formatSatang(summary.balance)})`
  return (
    <section className={`health health-${h.level}`} aria-label="สถานะการเงินของเดือนนี้">
      <span className="health-icon" aria-hidden="true">
        {look.icon}
      </span>
      <div>
        <strong>{look.title}</strong>
        <p className="small">{detail}</p>
        {h.cashSoFar < 0 && h.level !== 'deficit' && (
          <p className="small">ตอนนี้จ่ายไปแล้วมากกว่าที่ได้รับ {formatSatang(-h.cashSoFar)} (รอรายรับที่ยังไม่เข้า)</p>
        )}
      </div>
    </section>
  )
}
