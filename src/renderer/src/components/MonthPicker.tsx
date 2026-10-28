import { addMonths, formatThaiMonth, monthOf, todayIso } from '@shared/dates'

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }): React.JSX.Element {
  const current = monthOf(todayIso())
  return (
    <div className="toolbar">
      <div className="month-picker" role="group" aria-label="เลือกเดือน">
        <button type="button" className="icon-btn" aria-label="เดือนก่อน" title="เดือนก่อน" onClick={() => onChange(addMonths(month, -1))}>
          ‹
        </button>
        <span className="month-label" aria-live="polite">
          {formatThaiMonth(month)}
        </span>
        <button type="button" className="icon-btn" aria-label="เดือนถัดไป" title="เดือนถัดไป" onClick={() => onChange(addMonths(month, 1))}>
          ›
        </button>
      </div>
      {month !== current && (
        <button type="button" className="btn btn-ghost" onClick={() => onChange(current)}>
          กลับมาเดือนนี้
        </button>
      )}
    </div>
  )
}
