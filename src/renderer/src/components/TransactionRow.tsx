import { formatThaiDate } from '@shared/dates'
import { formatSatang } from '@shared/money'
import type { TransactionView } from '@shared/types'
import { usePortal } from '../lib/portal'
import { StatusBadge } from './StatusBadge'

/** Importance-order view: press the row and drag it, or focus it and press Alt + arrow keys. */
export interface RowOrder {
  /** Alt + ArrowUp / ArrowDown on the focused row (the keyboard way to reorder). */
  onMove: (delta: -1 | 1) => void
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
      tabIndex={order ? 0 : undefined}
      onKeyDown={order ? (e) => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); order.onMove(e.key === 'ArrowUp' ? -1 : 1) } } : undefined}
      style={order ? { cursor: order.dragging ? 'grabbing' : 'grab', userSelect: 'none', background: order.dragging ? 'var(--sky)' : undefined, transform: order.dragging ? 'scale(1.01)' : undefined } : undefined}
      onPointerDown={order ? order.onPointerDown : undefined}
    >
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
