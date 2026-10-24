import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import dividerLine from '@/assets/signin/divider-line.svg'
import googleLogo from '@/assets/signin/google-logo.png'
import { homeFor, useSession } from '@/app/session'
import { Alert } from '@/components/ui/Display'
import { googleConfigured, loadGoogle, requestGoogleCode } from '@/lib/googleSignIn'
import { AuthShell, LoginField, cardClasses, primaryButtonClasses, textLinkClasses } from './shared'
import { t } from '@/i18n'

// SCR-AUTH-01 Sign In (Figma 128:58 "dormitory-login").
// Email + CampusStay password: POST /auth/sign-in { email, password, remember } (ADR-13).
// Google: popup restricted to @fpt.edu.vn → POST /auth/google { code, remember }.
// A 400 VALIDATION_FAILED puts details.fields under the inputs.

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
  const { user, signIn, signInWithGoogle } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(null) // 'password' | 'google'
  const notice = location.state?.notice

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
    const address = email.trim()
    const errors = {}
    if (!address) errors.email = t('Enter your email.')
    if (!password) errors.password = t('Enter your password.')
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setPending('password')
    setError(null)
    try {
      goHome(await signIn(address, password, remember))
    } catch (err) {
      setFieldErrors(err.fields ?? {})
      setError(err)
    } finally {
      setPending(null)
    }
  }

  const google = async () => {
    setError(null)
    setFieldErrors({})
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

  return (
    <AuthShell>
      <form onSubmit={submit} noValidate className={cardClasses}>
        {notice && !error && (
          <Alert type="success" title="Password set">
            {notice}
          </Alert>
        )}
        {error && (
          <Alert type="error" title="Could not sign in">
            {error.summary ?? error.message}
          </Alert>
        )}

        <div className="flex w-full flex-col gap-2.5">
          <LoginField
            label="Email"
            type="email"
            inputMode="email"
            placeholder="name@fpt.edu.vn"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            error={fieldErrors.email}
            onChange={(e) => {
              setEmail(e.target.value)
              setFieldErrors((f) => ({ ...f, email: undefined }))
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
              <span className="text-base leading-5 text-fg-secondary">{t('Remember me')}</span>
            </label>
            <Link to="/forgot-password" state={{ email: email.trim() }} className={textLinkClasses}>
              {t('Forgot password?')}
            </Link>
          </div>
        </div>

        <button type="submit" disabled={Boolean(pending)} className={primaryButtonClasses}>
          {pending === 'password' ? t('Signing in…') : t('Sign in')}
        </button>

        <div className="flex w-full items-center gap-2 pt-1">
          <DividerLine />
          <span className="text-sm leading-4 font-semibold whitespace-nowrap text-fg-disabled">{t('Or sign in with')}</span>
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
            {pending === 'google' ? t('Waiting for Google…') : t('Sign in with Google')}
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
