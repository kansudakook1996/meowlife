import { useEffect, useState } from 'react'
import { syncPill } from '../lib/syncText'
import { useSyncState } from '../lib/useSync'

/** Always-visible sync status at the bottom of the sidebar. */
export function SyncPill(): React.JSX.Element {
  const { status } = useSyncState()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (status.phase !== 'error') return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [status.phase])

  const pill = syncPill(status, now)
  return (
    <div className={`sync-pill sync-${pill.tone}`} role="status" aria-live="polite">
      <span aria-hidden="true">{pill.icon}</span>
      <span>{pill.text}</span>
    </div>
  )
}
