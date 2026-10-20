import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { cx } from '@/lib/cx'

/* Ant Design style message toasts, top-centre, Elevation/2. notify({ type, title, message }). */

const ToastContext = createContext(null)
let seq = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
  }, [])

  const notify = useCallback(
    ({ type = 'success', title, message, duration = 4000 }) => {
      const id = ++seq
      setToasts((list) => [...list.slice(-2), { id, type, title, message }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      )
      return id
    },
    [dismiss],
  )

  /** Shows an API failure as an error toast. */
  const notifyError = useCallback((error, title = 'Something went wrong') => notify({ type: 'error', title, message: error?.message, duration: 6000 }), [notify])

  const value = useMemo(() => ({ notify, notifyError, toasts, dismiss }), [notify, notifyError, toasts, dismiss])
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

const looks = {
  success: { icon: CircleCheck, color: 'text-success' },
  info: { icon: Info, color: 'text-info' },
  warning: { icon: TriangleAlert, color: 'text-warning' },
  error: { icon: TriangleAlert, color: 'text-error' },
}

export function Toaster() {
  const { toasts, dismiss } = useToast()
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-4 z-60 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const look = looks[t.type] ?? looks.info
        const Glyph = look.icon
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-md animate-toast-in items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-dropdown"
          >
            <Glyph size={20} aria-hidden="true" className={cx('mt-px shrink-0', look.color)} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-base font-medium text-fg">{t.title}</p>
              {t.message && <p className="text-base text-fg-secondary">{t.message}</p>}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="shrink-0 rounded text-fg-tertiary hover:text-fg">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
