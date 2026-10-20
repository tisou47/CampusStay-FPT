import { useCallback, useEffect, useRef, useState } from 'react'

/*
 * Small data hooks (no cache library):
 *   useQuery(key, fetcher)  → { data, error, loading, reload }
 *   useMutation(fn)         → { run, pending, error }
 *   invalidate(name)        → refetches every mounted query whose key starts with `name`
 *
 * A key is an array: ['maintenance', { status, page }]. The first item names the resource.
 */

const listeners = new Set()

export function invalidate(...names) {
  for (const listener of listeners) listener(names)
}

export function useQuery(key, fetcher, { enabled = true, keepPrevious = true } = {}) {
  const hash = JSON.stringify(key)
  const [state, setState] = useState({ data: undefined, error: null, loading: enabled })
  const [version, setVersion] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }))
      return undefined
    }
    const controller = new AbortController()
    setState((s) => ({ data: keepPrevious ? s.data : undefined, error: null, loading: true }))
    Promise.resolve()
      .then(() => fetcherRef.current({ signal: controller.signal }))
      .then(
        (data) => !controller.signal.aborted && setState({ data, error: null, loading: false }),
        (error) => !controller.signal.aborted && error?.name !== 'AbortError' && setState((s) => ({ data: s.data, error, loading: false })),
      )
    return () => controller.abort()
  }, [hash, enabled, version, keepPrevious])

  useEffect(() => {
    const name = key[0]
    const listener = (names) => names.includes(name) && setVersion((v) => v + 1)
    listeners.add(listener)
    return () => listeners.delete(listener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key[0]])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  // Right after a query is enabled (or its key changes) the effect has not run yet: report it as loading.
  const loading = state.loading || (enabled && state.data === undefined && !state.error)
  return { ...state, loading, reload }
}

export function useMutation(fn, options = {}) {
  const [state, setState] = useState({ pending: false, error: null })
  const ref = useRef({ fn, options })
  ref.current = { fn, options }

  // run() resolves with the result, or with undefined after onError handled the failure.
  const run = useCallback(async (...args) => {
    const { fn: call, options: { invalidates = [], onSuccess, onError } } = ref.current
    setState({ pending: true, error: null })
    try {
      const result = await call(...args)
      setState({ pending: false, error: null })
      if (invalidates.length) invalidate(...invalidates)
      onSuccess?.(result, ...args)
      return result
    } catch (error) {
      setState({ pending: false, error })
      if (onError) {
        onError(error, ...args)
        return undefined
      }
      throw error
    }
  }, [])
  return { ...state, run }
}
