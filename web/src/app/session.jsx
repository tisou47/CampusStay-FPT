import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { api } from '@/api/endpoints'
import { readSession, writeSession } from '@/api/client'
import { useQuery } from '@/api/hooks'

/*
 * Signed-in user and the working context every screen shares:
 *  - session: { token, user: { id, name, email, role, studentCode?, title?, blocks? } }
 *  - term: the Term picked in the top bar (back office) or the current Term (student)
 *  - block: the Block scope picked in the top bar (Staff and Manager)
 */

const SessionContext = createContext(null)
const TERM_KEY = 'campusstay-term'

// Development only: VITE_SKIP_AUTH=true lets every portal open without signing in.
const skipAuth = import.meta.env.DEV && import.meta.env.VITE_SKIP_AUTH === 'true'

export const homeFor = { student: '/student', staff: '/staff', manager: '/manager', admin: '/admin' }

export function SessionProvider({ children }) {
  const [session, setSession] = useState(readSession)
  const [termId, setTermIdState] = useState(() => localStorage.getItem(TERM_KEY))
  const [block, setBlock] = useState(null)

  useEffect(() => {
    const sync = () => setSession(readSession())
    window.addEventListener('campusstay:session', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('campusstay:session', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const terms = useQuery(['terms'], ({ signal }) => api.terms.list({ signal }), { enabled: Boolean(session) || skipAuth })
  const termList = terms.data?.items ?? []
  const term = termList.find((t) => t.id === termId) ?? termList.find((t) => t.current) ?? termList[0] ?? null

  const setTermId = useCallback((id) => {
    setTermIdState(id)
    try {
      localStorage.setItem(TERM_KEY, id)
    } catch {
      // ignore
    }
  }, [])

  const signIn = useCallback(async (email, password, remember) => {
    const result = await api.auth.signIn({ email, password, remember })
    writeSession({ token: result.token, user: result.user })
    return result.user
  }, [])

  const signInWithGoogle = useCallback(async (code, remember) => {
    const result = await api.auth.google({ code, remember })
    writeSession({ token: result.token, user: result.user })
    return result.user
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api.auth.signOut()
    } catch {
      // Signing out locally is enough when the server cannot be reached.
    }
    writeSession(null)
  }, [])

  const user = session?.user ?? null
  const blocks = user?.blocks ?? []
  const value = useMemo(
    () => ({
      user,
      signedIn: Boolean(user),
      signIn,
      signInWithGoogle,
      signOut,
      terms: termList,
      termsState: terms,
      term,
      setTermId,
      blocks,
      block: block ?? (blocks.length === 1 ? blocks[0] : null),
      setBlock,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, signIn, signInWithGoogle, signOut, terms.data, terms.error, terms.loading, term, setTermId, block, blocks.join()],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}

/** Route guard: the signed-in user must have this role, otherwise go to Sign In (or the user's own portal). */
export function RequireRole({ role }) {
  const { user } = useSession()
  const location = useLocation()
  if (skipAuth) return <Outlet />
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />
  if (user.role !== role) return <Navigate to={homeFor[user.role] ?? '/signin'} replace />
  return <Outlet />
}

/** Query parameters every term- and block-scoped list sends. */
export function useScopeQuery() {
  const { term, block } = useSession()
  return { termId: term?.id, block: block ?? undefined }
}
