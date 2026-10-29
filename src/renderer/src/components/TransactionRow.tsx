import { formatThaiDate } from '@shared/dates'
import { formatSatang } from '@shared/money'
import type { TransactionView } from '@shared/types'
import { usePortal } from '../lib/portal'
import { StatusBadge } from './StatusBadge'

/** Shown in the importance-order view: where the item sits and how to move it (buttons or drag and drop). */
export interface RowOrder {
  rank: number
  canUp: boolean
  canDown: boolean
  onUp: () => void
  onDown: () => void
  dragging: boolean
  /** Press on the row and drag it up or down (pointer based, so it works the same everywhere). */
  onPointerDown: (e: React.PointerEvent<HTMLLIElement>) => void
}

export function TransactionRow({ item, showDate = false, order }: { item: TransactionView; showDate?: boolean; order?: RowOrder }): React.JSX.Element {
  const { openEditor, togglePaid, deleteTransaction } = usePortal()
  const sign = item.kind === 'income' ? '+' : '−'
  const paidAction = item.isPaid
    ? item.kind === 'income'
      ? 'เปลี่ยนเป็นยังไม่ได้รับ'
      : 'เปลี่ยนเป็นยังไม่จ่าย'
    : item.kind === 'income'
      ? 'ทำเครื่องหมายว่าได้รับแล้ว'
      : 'ทำเครื่องหมายว่าจ่ายแล้ว'

  return (
    <li
      className="tx-row"
      data-txid={order ? item.id : undefined}
      style={order ? { gridTemplateColumns: 'auto auto minmax(0, 1fr) auto auto', cursor: order.dragging ? 'grabbing' : 'grab', userSelect: 'none', background: order.dragging ? 'var(--sky)' : undefined, transform: order.dragging ? 'scale(1.01)' : undefined } : undefined}
      onPointerDown={order ? order.onPointerDown : undefined}
    >
      {order && (
        <div className="tx-order" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <button type="button" className="icon-btn" aria-label={`เลื่อน ${item.title} ขึ้น`} title="เลื่อนขึ้น (สำคัญขึ้น)" disabled={!order.canUp} onClick={order.onUp}>▲</button>
          <span className="muted small" aria-label={`ลำดับที่ ${order.rank}`} title="ลากเพื่อจัดลำดับได้">{order.rank}</span>
          <button type="button" className="icon-btn" aria-label={`เลื่อน ${item.title} ลง`} title="เลื่อนลง (สำคัญน้อยลง)" disabled={!order.canDown} onClick={order.onDown}>▼</button>
        </div>
      )}
      <span className={`tx-icon ${item.kind}`} aria-hidden="true">
        {item.categoryIcon ?? (item.kind === 'income' ? '💰' : '💸')}
      </span>
      <div className="tx-main">
        <div className="tx-title">
          {item.title}
          {item.recurringRuleId && (
            <span className="muted small" title="สร้างจากรายการประจำ">
              {' '}
              🔁
            </span>
          )}
        </div>
        <div className="tx-meta">
          {showDate && <span>{formatThaiDate(item.txnDate)}</span>}
          {item.categoryName && <span>{item.categoryName}</span>}
          {item.paymentMethodName && <span>· {item.paymentMethodName}</span>}
          {item.dueDate && !item.isPaid && <span>ครบกำหนด {formatThaiDate(item.dueDate)}</span>}
          <StatusBadge kind={item.kind} status={item.status} daysUntilDue={item.daysUntilDue} />
        </div>
        {item.note && <div className="muted small">{item.note}</div>}
      </div>
      <div className={`tx-amount ${item.kind}`}>
        <span className="visually-hidden">{item.kind === 'income' ? 'รายรับ' : 'รายจ่าย'}</span>
        {sign}
        {formatSatang(item.amountSatang)}
      </div>
      <div className="tx-actions">
        <button type="button" className="icon-btn" aria-label={paidAction} title={paidAction} onClick={() => void togglePaid(item)}>
          {item.isPaid ? '↺' : '✓'}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`แก้ไข ${item.title}`}
          title="แก้ไข"
          onClick={() => openEditor({ mode: 'edit', item })}
        >
          ✏️
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`ลบ ${item.title}`}
          title="ลบ"
          onClick={() => void deleteTransaction(item)}
        >
          🗑️
        </button>
      </div>
    </li>
  )
}
