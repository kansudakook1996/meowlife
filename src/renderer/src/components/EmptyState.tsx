import type { ReactNode } from 'react'
import { CatMascot, type CatMood } from './CatMascot'

export function EmptyState(props: { title: string; hint?: string; mood?: CatMood; action?: ReactNode }): React.JSX.Element {
  return (
    <div className="empty">
      <CatMascot mood={props.mood ?? 'sleepy'} size={110} />
      <h3>{props.title}</h3>
      {props.hint && <p className="muted">{props.hint}</p>}
      {props.action}
    </div>
  )
}
