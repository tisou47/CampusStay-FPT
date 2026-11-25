import { useEffect, useSyncExternalStore } from 'react'

// Focus mode of the back office: a page that wants the whole width (a report read side by side) hides the sidebar
// and the section trail while it is shown. The layout reads it; pages turn it on with useFocusMode().

let count = 0
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** True while a page in focus mode is shown (for the layout). */
export function useFocusModeOn() {
  return useSyncExternalStore(subscribe, () => count > 0)
}

/** Turns focus mode on while the calling page is mounted. */
export function useFocusMode(on = true) {
  useEffect(() => {
    if (!on) return undefined
    count += 1
    emit()
    return () => {
      count -= 1
      emit()
    }
  }, [on])
}
