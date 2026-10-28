import { useState } from 'react'
import type { ImportCommitResult, ImportPreview, ImportSession } from '@shared/dataTools'
import { formatThaiDate } from '@shared/dates'
import { IMPORT_FIELDS, IMPORT_FIELD_LABEL, type ImportField, type ImportMapping } from '@shared/importMap'
import { formatSatang } from '@shared/money'
import { errorMessage, meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useLoad } from '../lib/useLoad'

const REQUIRED: ImportField[] = ['date', 'title', 'amount']

function columnLabel(index: number, headerCell: string | undefined): string {
  const letter = String.fromCharCode(65 + (index % 26))
  const name = (headerCell ?? '').trim()
  return `คอลัมน์ ${index >= 26 ? letter + Math.floor(index / 26) : letter}${name ? `: ${name.slice(0, 24)}` : ''}`
}

/** 1) choose a file  2) match columns + live preview  3) import. Nothing is written until the last button. */
export function ImportWizard(): React.JSX.Element {
  const { refresh, toast } = usePortal()
  const [session, setSession] = useState<ImportSession | null>(null)
  const [mapping, setMapping] = useState<ImportMapping | null>(null)
  const [includeDuplicates, setIncludeDuplicates] = useState(false)
  const [createMissing, setCreateMissing] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<ImportCommitResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ready = mapping !== null && REQUIRED.every((f) => mapping.columns[f] !== null)
  const key = session && mapping && ready ? `${session.token}:${JSON.stringify(mapping)}` : 'none'
  const { data: preview, error: previewError } = useLoad<ImportPreview | null>(key, async () =>
    session && mapping && ready ? unwrap(meow().data.previewImport(session.token, mapping)) : null
  )

  const pick = async (): Promise<void> => {
    setError(null)
    setDone(null)
    try {
      const s = await unwrap(meow().data.pickImportFile())
      if (s) {
        setSession(s)
        setMapping(s.mapping)
      }
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const reset = (): void => {
    setSession(null)
    setMapping(null)
    setDone(null)
    setError(null)
  }

  const setColumn = (field: ImportField, value: string): void =>
    setMapping((m) => (m ? { ...m, columns: { ...m.columns, [field]: value === '' ? null : Number(value) } } : m))

  const commit = async (): Promise<void> => {
    if (!session || !mapping) return
    setBusy(true)
    setError(null)
    try {
      const result = await unwrap(meow().data.commitImport(session.token, mapping, includeDuplicates, createMissing))
      setDone(result)
      refresh()
      toast(`นำเข้า ${result.imported} รายการแล้ว`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const saveErrors = async (): Promise<void> => {
    if (!session || !mapping) return
    try {
      const r = await unwrap(meow().data.saveImportErrors(session.token, mapping))
      if (r) toast('บันทึกรายงานข้อผิดพลาดแล้ว')
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    }
  }

  if (done) {
    return (
      <div className="form">
        <p className="info" role="status">
          ✓ นำเข้าเสร็จแล้ว: เพิ่ม <strong>{done.imported}</strong> รายการ
          {done.createdCategories > 0 && ` · สร้างหมวดใหม่ ${done.createdCategories}`}
          {done.createdMethods > 0 && ` · สร้างช่องทางใหม่ ${done.createdMethods}`}
          {done.skippedDuplicates > 0 && ` · ข้ามรายการซ้ำ ${done.skippedDuplicates}`}
          {done.errorCount > 0 && ` · แถวที่มีปัญหา ${done.errorCount} (ไม่ได้นำเข้า)`}
        </p>
        <div className="toolbar">
          <button type="button" className="btn btn-secondary" onClick={reset}>
            นำเข้าไฟล์อื่น
          </button>
        </div>
      </div>
    )
  }

  if (!session || !mapping) {
    return (
      <div className="form">
        <p className="muted">
          เลือกไฟล์ Excel (.xlsx) หรือ CSV ที่มีรายการรับ-จ่าย ระบบจะให้ดูตัวอย่างและตรวจความถูกต้องก่อน ยังไม่เพิ่มอะไรจนกว่าคุณจะกดยืนยัน
        </p>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="toolbar">
          <button type="button" className="btn btn-primary" onClick={() => void pick()}>
            📥 เลือกไฟล์ที่จะนำเข้า
          </button>
        </div>
      </div>
    )
  }

  const header = session.sample[0] ?? []
  const noKindColumn = mapping.columns.kind === null
  const noStatusColumn = mapping.columns.status === null

  return (
    <div className="form">
      <p>
        ไฟล์ <strong>{session.fileName}</strong> · {session.totalRows} แถว
        <button type="button" className="btn btn-ghost" onClick={reset}>
          เลือกไฟล์อื่น
        </button>
      </p>

      <div className="card" style={{ background: 'var(--bg)' }}>
        <h3>ขั้นที่ 1: จับคู่คอลัมน์</h3>
        <label className="check" style={{ margin: '8px 0' }}>
          <input type="checkbox" checked={mapping.firstRowIsHeader} onChange={(e) => setMapping({ ...mapping, firstRowIsHeader: e.target.checked })} />
          แถวแรกเป็นหัวตาราง
        </label>
        <div className="field-row">
          {IMPORT_FIELDS.map((field) => (
            <div className="field" key={field}>
              <label htmlFor={`map-${field}`}>
                {IMPORT_FIELD_LABEL[field]}
                {REQUIRED.includes(field) && ' *'}
              </label>
              <select id={`map-${field}`} className="input" value={mapping.columns[field] ?? ''} onChange={(e) => setColumn(field, e.target.value)}>
                <option value="">— ไม่มีคอลัมน์นี้ —</option>
                {Array.from({ length: session.columnCount }, (_, i) => (
                  <option key={i} value={i}>
                    {columnLabel(i, header[i])}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {noKindColumn && (
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="map-kind-mode">ไม่มีคอลัมน์ประเภท จะให้ถือว่า</label>
            <select
              id="map-kind-mode"
              className="input"
              value={mapping.useSign ? 'sign' : mapping.defaultKind}
              onChange={(e) =>
                setMapping(
                  e.target.value === 'sign'
                    ? { ...mapping, useSign: true }
                    : { ...mapping, useSign: false, defaultKind: e.target.value as 'income' | 'expense' }
                )
              }
            >
              <option value="expense">ทุกรายการเป็นรายจ่าย</option>
              <option value="income">ทุกรายการเป็นรายรับ</option>
              <option value="sign">ดูจากเครื่องหมาย (ติดลบ = รายจ่าย, บวก = รายรับ)</option>
            </select>
          </div>
        )}
        {noStatusColumn && (
          <label className="check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={mapping.defaultPaid} onChange={(e) => setMapping({ ...mapping, defaultPaid: e.target.checked })} />
            ถือว่าทุกรายการจ่ายแล้ว/ได้รับแล้ว
          </label>
        )}
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table className="data-table" aria-label="ตัวอย่างข้อมูลในไฟล์">
            <tbody>
              {session.sample.map((row, r) => (
                <tr key={r}>
                  {Array.from({ length: session.columnCount }, (_, c) => (
                    <td key={c}>{r === 0 && mapping.firstRowIsHeader ? <strong>{row[c] ?? ''}</strong> : (row[c] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--bg)' }} aria-live="polite">
        <h3>ขั้นที่ 2: ตรวจสอบ</h3>
        {!ready && <p className="info">เลือกคอลัมน์ที่มีดาว (*) ให้ครบก่อน แล้วจะเห็นผลตรวจสอบตรงนี้</p>}
        {previewError && <p className="alert">{previewError}</p>}
        {ready && !preview && !previewError && <p className="muted">กำลังตรวจสอบ…</p>}
        {preview && (
          <>
            <p>
              <span className="badge badge-paid">✓ พร้อมนำเข้า {preview.validCount}</span>{' '}
              <span className="badge badge-due_soon">⏰ อาจซ้ำ {preview.duplicateCount}</span>{' '}
              <span className={preview.errorCount > 0 ? 'badge badge-overdue' : 'badge badge-unpaid'}>! มีปัญหา {preview.errorCount}</span>
            </p>
            {preview.sampleValid.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" aria-label="ตัวอย่างรายการที่จะนำเข้า">
                  <thead>
                    <tr>
                      <th>แถว</th>
                      <th>วันที่</th>
                      <th>ประเภท</th>
                      <th>ชื่อรายการ</th>
                      <th>จำนวนเงิน</th>
                      <th>หมวด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sampleValid.map((r) => (
                      <tr key={r.rowNumber}>
                        <td>{r.rowNumber}</td>
                        <td>{formatThaiDate(r.txnDate)}</td>
                        <td>{r.kind === 'income' ? 'รายรับ' : 'รายจ่าย'}</td>
                        <td>{r.title}</td>
                        <td style={{ textAlign: 'right' }}>{formatSatang(r.amountSatang)}</td>
                        <td>{r.categoryName || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(preview.newCategories.length > 0 || preview.newMethods.length > 0) && (
              <p className="info small" style={{ marginTop: 8 }}>
                ในไฟล์มีชื่อที่ยังไม่มีในแอป: {[...preview.newCategories.map((c) => `หมวด "${c}"`), ...preview.newMethods.map((m) => `ช่องทาง "${m}"`)].join(', ')}
              </p>
            )}
            {preview.duplicateCount > 0 && (
              <p className="small" style={{ marginTop: 8 }}>
                รายการที่อาจซ้ำ (วันที่ ประเภท จำนวน และชื่อเหมือนกับที่มีอยู่แล้วหรือซ้ำในไฟล์): แถว{' '}
                {preview.sampleDuplicates.map((d) => d.rowNumber).join(', ')}
                {preview.duplicateCount > preview.sampleDuplicates.length ? ' …' : ''}
              </p>
            )}
            {preview.errors.length > 0 && (
              <details open style={{ marginTop: 8 }}>
                <summary>แถวที่มีปัญหา (จะไม่ถูกนำเข้า){preview.errorCount > preview.errors.length ? ` — แสดง ${preview.errors.length} แรก` : ''}</summary>
                <ul className="small">
                  {preview.errors.map((e) => (
                    <li key={e.rowNumber}>
                      แถว {e.rowNumber}: {e.message}
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-secondary" onClick={() => void saveErrors()}>
                  บันทึกรายงานข้อผิดพลาด (CSV)
                </button>
              </details>
            )}
          </>
        )}
      </div>

      {preview && (
        <div className="card" style={{ background: 'var(--bg)' }}>
          <h3>ขั้นที่ 3: นำเข้า</h3>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <label className="check">
            <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
            สร้างหมวดหมู่/ช่องทางที่ยังไม่มีตามชื่อในไฟล์
          </label>
          {preview.duplicateCount > 0 && (
            <label className="check" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={includeDuplicates} onChange={(e) => setIncludeDuplicates(e.target.checked)} />
              นำเข้ารายการที่อาจซ้ำด้วย ({preview.duplicateCount} รายการ)
            </label>
          )}
          <p className="muted small" style={{ margin: '8px 0' }}>
            แอปจะสำรองข้อมูลปัจจุบันไว้ให้อัตโนมัติก่อนนำเข้า (โฟลเดอร์ backups)
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || preview.validCount + (includeDuplicates ? preview.duplicateCount : 0) === 0}
            onClick={() => void commit()}
          >
            {busy ? 'กำลังนำเข้า…' : `นำเข้า ${preview.validCount + (includeDuplicates ? preview.duplicateCount : 0)} รายการ`}
          </button>
        </div>
      )}
    </div>
  )
}
