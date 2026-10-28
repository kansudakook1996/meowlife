import { useEffect, useState } from 'react'
import { errorMessage } from './api'

interface LoadState<T> {
  data: T | undefined
  error: string | null
  /** Key of the request whose result is in `data`; used to tell stale data from fresh. */
  key: string
}

/**
 * Load async data whenever `key` changes. Results from older keys are ignored,
 * so quickly switching months never shows the wrong month.
 */
export function useLoad<T>(key: string, load: () => Promise<T>): { data: T | undefined; error: string | null; loading: boolean } {
  const [state, setState] = useState<LoadState<T>>({ data: undefined, error: null, key: '' })

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => {
        if (!cancelled) setState({ data, error: null, key })
      },
      (error: unknown) => {
        if (!cancelled) setState((s) => ({ data: s.data, error: errorMessage(error), key }))
      }
    )
    return () => {
      cancelled = true
    }
    // `load` is recreated every render; `key` captures everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { data: state.data, error: state.error, loading: state.key !== key }
}
