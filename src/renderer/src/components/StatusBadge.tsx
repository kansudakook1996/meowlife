import { statusLabel } from '@shared/status'
import type { EntryKind, PaymentStatus } from '@shared/types'

const ICONS: Record<PaymentStatus, string> = {
  paid: '✓',
  unpaid: '○',
  due_soon: '⏰',
  overdue: '!'
}

/** Status is always shown as color + icon + text, never color alone. */
export function StatusBadge(props: {
  kind: EntryKind
  status: PaymentStatus
  daysUntilDue: number | null
}): React.JSX.Element {
  return (
    <span className={`badge badge-${props.status}`}>
      <span aria-hidden="true">{ICONS[props.status]}</span>
      {statusLabel(props.kind, { status: props.status, daysUntilDue: props.daysUntilDue })}
    </span>
  )
}
