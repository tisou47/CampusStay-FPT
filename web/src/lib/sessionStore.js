/**
 * Where the signed-in session is kept (WEB-STU-03, WEB-ADM-04): "Remember me" keeps it in localStorage (it survives
 * closing the browser); without it, sessionStorage (gone when the tab closes, so a shared computer does not stay
 * signed in). A write without `remember` (a profile refresh) stays in the store the session already lives in.
 */
export function sessionStore(local, perTab, key) {
  const parse = (store) => {
    try {
      return JSON.parse(store?.getItem(key)) ?? null
    } catch {
      return null
    }
  }
  const read = () => parse(perTab) ?? parse(local)
  const write = (session, remember) => {
    try {
      if (!session) {
        local?.removeItem(key)
        perTab?.removeItem(key)
        return
      }
      const keep = remember ?? parse(perTab) === null
      ;(keep ? local : perTab)?.setItem(key, JSON.stringify(session))
      ;(keep ? perTab : local)?.removeItem(key)
    } catch {
      // Storage unavailable (private mode): the session lives only in memory.
    }
  }
  return { read, write }
}
