import { useState } from 'react'
import { formatThaiMonth } from '@shared/dates'
import { formatSatang } from '@shared/money'
import type { RecurringRule } from '@shared/types'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { RecurringForm } from '../components/RecurringForm'
import { errorMessage, meow, unwrap } from '../lib/api'
import { usePortal } from '../lib/portal'
import { useLoad } from '../lib/useLoad'

type Editing = { mode: 'new' } | { mode: 'edit'; rule: RecurringRule } | null

export function RecurringPage(): React.JSX.Element {
  const { dataVersion, refresh, categories, paymentMethods, confirm, toast } = usePortal()
  const [editing, setEditing] = useState<Editing>(null)
  const { data, error } = useLoad(`recurring:${dataVersion}`, () => unwrap(meow().recurring.list()))

  const categoryOf = (id: string | null): string => {
    const c = categories.find((x) => x.id === id)
    return c ? `${c.icon} ${c.name}` : ''
  }

  const remove = async (rule: RecurringRule): Promise<void> => {
    const ok = await confirm({
      title: 'ลบรายการประจำนี้ไหม?',
      message: `"${rule.title}" จะไม่ถูกสร้างอีก และรายการที่ยังไม่จ่ายตั้งแต่วันนี้จะถูกลบ (รายการที่จ่ายแล้วยังอยู่ครบ)`,
      confirmLabel: 'ลบรายการประจำ',
      danger: true
    })
    if (!ok) return
    try {
      await unwrap(meow().recurring.remove(rule.id))
      refresh()
      toast(`ลบรายการประจำ "${rule.title}" แล้ว`)
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' })
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1>รายการประจำ</h1>
          <p className="muted">ค่าเช่า ค่าน้ำ ค่าไฟ บัตรเครดิต ค่าสมาชิก — ตั้งครั้งเดียว แอปสร้างให้ทุกเดือน</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ mode: 'new' })}>
          ＋ เพิ่มรายการประจำ
        </button>
      </header>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {!data && !error && <div className="loading">กำลังโหลด…</div>}

      {data && data.length === 0 && (
        <div className="card">
          <EmptyState
            title="ยังไม่มีรายการประจำ"
            hint="เช่น ค่าเช่าห้องทุกวันที่ 1 หรือ ค่าไฟทุกวันที่ 25 — แอปจะใส่เป็นรายการ “ยังไม่จ่าย” ให้ในแต่ละเดือน"
            action={
              <button type="button" className="btn btn-primary" onClick={() => setEditing({ mode: 'new' })}>
                ＋ เพิ่มรายการประจำ
              </button>
            }
          />
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="tx-list">
          {data.map((r) => (
            <li key={r.id} className="tx-row">
              <span className={`tx-icon ${r.kind}`} aria-hidden="true">
                🔁
              </span>
              <div className="tx-main">
                <div className="tx-title">{r.title}</div>
                <div className="tx-meta">
                  <span>ทุกวันที่ {r.dayOfMonth}</span>
                  <span>
                    · ตั้งแต่ {formatThaiMonth(r.startMonth)}
                    {r.endMonth ? ` ถึง ${formatThaiMonth(r.endMonth)}` : ''}
                  </span>
                  {categoryOf(r.categoryId) && <span>· {categoryOf(r.categoryId)}</span>}
                  <span className={r.isActive ? 'badge badge-paid' : 'badge badge-unpaid'}>
                    <span aria-hidden="true">{r.isActive ? '●' : '○'}</span>
                    {r.isActive ? 'เปิดใช้งาน' : 'หยุดไว้'}
                  </span>
                </div>
              </div>
              <div className={`tx-amount ${r.kind}`}>
                {r.kind === 'income' ? '+' : '−'}
                {formatSatang(r.amountSatang)}
              </div>
              <div className="tx-actions">
                <button type="button" className="icon-btn" aria-label={`แก้ไข ${r.title}`} title="แก้ไข" onClick={() => setEditing({ mode: 'edit', rule: r })}>
                  ✏️
                </button>
                <button type="button" className="icon-btn" aria-label={`ลบ ${r.title}`} title="ลบ" onClick={() => void remove(r)}>
                  🗑️
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={editing !== null} title={editing?.mode === 'edit' ? 'แก้ไขรายการประจำ' : 'เพิ่มรายการประจำ'} onClose={() => setEditing(null)}>
        {editing && (
          <RecurringForm
            key={editing.mode === 'edit' ? editing.rule.id : 'new'}
            initial={editing.mode === 'edit' ? editing.rule : undefined}
            categories={categories}
            paymentMethods={paymentMethods}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              refresh()
              toast('บันทึกรายการประจำแล้ว')
            }}
          />
        )}
      </Modal>
    </div>
  )
}
