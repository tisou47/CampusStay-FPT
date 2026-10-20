import { useEffect, useId, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import campusAerial from '@/assets/signin/campus-aerial.png'
import dividerLine from '@/assets/signin/divider-line.svg'
import fieldIcon from '@/assets/signin/field-icon.svg'
import fptLogo from '@/assets/signin/fpt-logo.png'
import googleLogo from '@/assets/signin/google-logo.png'
import { homeFor, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Alert } from '@/components/ui/Display'
import { cx } from '@/lib/cx'
import { googleConfigured, loadGoogle, requestGoogleCode } from '@/lib/googleSignIn'

// SCR-AUTH-01 Sign In (Figma 128:58 "dormitory-login").
// Username + password: POST /auth/sign-in { username, password, remember }.
// Google: popup restricted to @fpt.edu.vn → POST /auth/google { code, remember }.

const passwordResetUrl = import.meta.env.VITE_PASSWORD_RESET_URL

function LoginField({ label, error, ...props }) {
  const id = useId()
  return (
    <div className="flex w-full flex-col gap-0.75">
      <label htmlFor={id} className="text-sm leading-4 font-semibold text-fg">
        {label}
      </label>
      <div
        className={cx(
          'flex h-10 w-full items-center gap-2 rounded-lg border bg-surface px-3 transition-[border-color,box-shadow] focus-within:shadow-focus',
          error ? 'border-error focus-within:border-error' : 'border-line focus-within:border-focus',
        )}
      >
        <img src={fieldIcon} alt="" width={16} height={16} className="block size-4 shrink-0" />
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-base leading-5 text-fg outline-none placeholder:text-fg-disabled"
          {...props}
        />
      </div>
      {error && <p className="text-sm text-error-fg">{error}</p>}
    </div>
  )
}

function DividerLine() {
  return (
    <span className="relative h-0 min-w-px flex-1" aria-hidden="true">
      <span className="absolute inset-x-0 -top-px bottom-0">
        <img src={dividerLine} alt="" className="block size-full max-w-none" />
      </span>
    </span>
  )
}

export default function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notify } = useToast()
  const { user, signIn, signInWithGoogle } = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(null) // 'password' | 'google'

  // Already signed in: go straight to the user's portal.
  useEffect(() => {
    if (user) navigate(homeFor[user.role] ?? '/student', { replace: true })
  }, [user, navigate])

  // Load Google's script early so its popup opens on the first click.
  useEffect(() => {
    if (googleConfigured) loadGoogle().catch(() => {})
  }, [])

  const goHome = (signedIn) => {
    const from = location.state?.from
    navigate(from?.startsWith(homeFor[signedIn.role]) ? from : homeFor[signedIn.role] ?? '/student', { replace: true })
  }

  const submit = async (e) => {
    e.preventDefault()
    const name = username.trim()
    const errors = {}
    if (!name) errors.username = 'Enter your username.'
    if (!password) errors.password = 'Enter your password.'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setPending('password')
    setError(null)
    try {
      goHome(await signIn(name, password, remember))
    } catch (err) {
      setError(err)
    } finally {
      setPending(null)
    }
  }

  const google = async () => {
    setError(null)
    setPending('google')
    try {
      const code = await requestGoogleCode()
      goHome(await signInWithGoogle(code, remember))
    } catch (err) {
      setError(err)
    } finally {
      setPending(null)
    }
  }

  const forgot = () => notify({ type: 'info', title: 'Forgot your password?', message: 'CampusStay uses your FPT University account. Reset it with the FPT IT help desk, or sign in with Google.' })

  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <img src={campusAerial} alt="" className="pointer-events-none absolute inset-0 -z-10 size-full max-w-none object-cover" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[rgba(10,15,26,0.72)]" />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.25 bg-accent" />

      <main className="flex w-full max-w-105 flex-col items-center gap-6">
        <div className="flex w-full flex-col items-center gap-2.5">
          <div className="flex items-center gap-2.5 rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5">
            <img src={fptLogo} alt="FPT University" className="h-6 w-15.5 shrink-0 object-contain" />
            <p className="text-sm leading-4 font-semibold whitespace-nowrap text-white opacity-90">FPT University • Tân Uyên Campus</p>
          </div>
          <h1 className="w-full text-center text-h1 font-bold text-white">CampusStay FPT</h1>
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="flex w-full flex-col gap-4 rounded-[20px] border border-white/18 bg-white/96 p-5 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.12),0px_20px_60px_0px_rgba(0,0,0,0.3)]"
        >
          {error && (
            <Alert type="error" title="Could not sign in">
              {error.message}
            </Alert>
          )}

          <div className="flex w-full flex-col gap-2.5">
            <LoginField
              label="Username"
              placeholder="Wifi Username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              error={fieldErrors.username}
              onChange={(e) => {
                setUsername(e.target.value)
                setFieldErrors((f) => ({ ...f, username: undefined }))
              }}
            />
            <LoginField
              label="Password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              error={fieldErrors.password}
              onChange={(e) => {
                setPassword(e.target.value)
                setFieldErrors((f) => ({ ...f, password: undefined }))
              }}
            />
            <div className="flex w-full items-center justify-between pt-0.5">
              <label className="flex cursor-pointer items-center gap-2">
                <span className="relative flex size-4 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="peer absolute inset-0 cursor-pointer appearance-none rounded-sm border border-line bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  />
                  <span aria-hidden="true" className="pointer-events-none relative size-2 rounded-xs bg-accent opacity-0 peer-checked:opacity-100" />
                </span>
                <span className="text-base leading-5 text-fg-secondary">Remember me</span>
              </label>
              {passwordResetUrl ? (
                <a href={passwordResetUrl} target="_blank" rel="noreferrer" className="text-base leading-5 font-semibold text-accent hover:underline">
                  Forgot password?
                </a>
              ) : (
                <button type="button" onClick={forgot} className="text-base leading-5 font-semibold text-accent hover:underline">
                  Forgot password?
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={Boolean(pending)}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-accent px-2 text-base leading-5 font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
          >
            {pending === 'password' ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="flex w-full items-center gap-2 pt-1">
            <DividerLine />
            <span className="text-sm leading-4 font-semibold whitespace-nowrap text-fg-disabled">Or sign in with</span>
            <DividerLine />
          </div>

          <div className="w-full pt-1">
            <button
              type="button"
              onClick={google}
              disabled={Boolean(pending)}
              className="flex h-10 w-full items-center justify-center gap-3 rounded-lg border border-line bg-white px-4 text-base leading-5 font-semibold text-fg transition-colors hover:bg-subtle disabled:opacity-60"
            >
              <img src={googleLogo} alt="" className="size-5 shrink-0 object-cover" />
              {pending === 'google' ? 'Waiting for Google…' : 'Sign in with Google'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
