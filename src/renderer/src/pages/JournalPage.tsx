import { useState } from 'react'
import { formatThaiDate, isValidIsoDate, todayIso } from '@shared/dates'
import { MOODS, type JournalEntry } from '@shared/portalModel'
import { EmptyState } from '../components/EmptyState'
import { errorMessage, meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useDeleteWithUndo } from '../lib/portalApi'
import { useLoad } from '../lib/useLoad'

export function JournalPage(): React.JSX.Element {
  const { dataVersion, refresh, toast } = usePortal()
  const [date, setDate] = useState(todayIso())
  const { data, error } = useLoad(`journal:${dataVersion}`, () => unwrap(meow().portal.journal.list()))
  const del = useDeleteWithUndo(
    (id) => unwrap(meow().portal.journal.remove(id)),
    (id) => unwrap(meow().portal.journal.restore(id)),
    refresh
  )
  const entry = data?.find((e) => e.entryDate === date) ?? null

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>บันทึกประจำวัน</h1>
          <p className="muted">เล่าเรื่องวันนี้และความรู้สึกให้โมจิกับส้มโอฟัง (หนึ่งหน้าต่อวัน)</p>
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label htmlFor="journal-date">วันที่</label>
          <input id="journal-date" type="date" className="input" value={date} max={todayIso()} onChange={(e) => isValidIsoDate(e.target.value) && setDate(e.target.value)} />
        </div>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      <div className="two-col">
        <JournalEditor key={`${date}:${entry?.updatedAt ?? 'new'}`} date={date} entry={entry} onSaved={() => { refresh(); toast('บันทึกแล้ว') }} />

        <section className="card" aria-labelledby="journal-list">
          <div className="card-title">
            <h2 id="journal-list">หน้าที่เขียนไว้</h2>
            <span className="muted small">{data?.length ?? 0} วัน</span>
          </div>
          {data && data.length === 0 && <EmptyState title="ยังไม่มีบันทึก" hint="เขียนเรื่องแรกของคุณทางซ้ายได้เลย" />}
          <ul className="tx-list">
            {(data ?? []).slice(0, 60).map((e) => (
              <li key={e.id} className="tx-row" style={{ gridTemplateColumns: '44px minmax(0, 1fr) auto', outline: e.entryDate === date ? '2px solid var(--orange-300)' : undefined }}>
                <span className="tx-icon income" aria-hidden="true">{MOODS[e.mood - 1]?.icon}</span>
                <button type="button" className="btn btn-ghost" style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal' }} onClick={() => setDate(e.entryDate)}>
                  <span>
                    <strong>{formatThaiDate(e.entryDate)}</strong> · {MOODS[e.mood - 1]?.label}
                    <br />
                    <span className="muted small">{e.body.slice(0, 70) || '(ไม่มีข้อความ)'}</span>
                  </span>
                </button>
                <button type="button" className="icon-btn" aria-label={`ลบบันทึก ${formatThaiDate(e.entryDate)}`} title="ลบ" onClick={() => void del(e.id, `บันทึก ${formatThaiDate(e.entryDate)}`)}>
                  🗑️
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function JournalEditor(props: { date: string; entry: JournalEntry | null; onSaved: () => void }): React.JSX.Element {
  const [mood, setMood] = useState(props.entry?.mood ?? 4)
  const [body, setBody] = useState(props.entry?.body ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      await unwrap(meow().portal.journal.save({ entryDate: props.date, mood, body }))
      props.onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card" aria-labelledby="journal-edit">
      <div className="card-title">
        <h2 id="journal-edit">{formatThaiDate(props.date)}</h2>
        {props.entry && <span className="badge badge-paid">✓ มีบันทึกแล้ว</span>}
      </div>
      <div className="form">
        {error && <div className="alert" role="alert">{error}</div>}
        <div className="field">
          <span className="field-label" id="mood-label">วันนี้รู้สึกอย่างไร</span>
          <div className="segmented" role="group" aria-labelledby="mood-label" style={{ flexWrap: 'wrap', borderRadius: 16 }}>
            {MOODS.map((m) => (
              <button key={m.value} type="button" aria-pressed={mood === m.value} onClick={() => setMood(m.value)}>
                <span aria-hidden="true">{m.icon}</span> {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="journal-body">เรื่องราววันนี้</label>
          <textarea id="journal-body" className="input" rows={10} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="วันนี้เกิดอะไรขึ้นบ้าง? มีอะไรที่อยากขอบคุณไหม?" />
          <span className="muted small">{body.length}/5000</span>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'กำลังบันทึก…' : props.entry ? 'บันทึกการแก้ไข' : 'บันทึก'}
          </button>
        </div>
      </div>
    </section>
  )
}
