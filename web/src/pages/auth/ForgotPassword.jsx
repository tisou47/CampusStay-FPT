import { useState } from 'react'
import { useLocation } from 'react-router'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { Alert } from '@/components/ui/Display'
import { AuthShell, BackToSignIn, CardTitle, LoginField, cardClasses, primaryButtonClasses } from './shared'

// SCR-AUTH-02 Forgot password (contract change A-02).
// POST /auth/password/forgot { email } → 204 whether or not the account exists, so the page always shows
// the same answer. The email links to /reset-password?token=… (valid 30 minutes, one use).

export default function ForgotPassword() {
  const location = useLocation()
  const [email, setEmail] = useState(location.state?.email ?? '')
  const [fieldError, setFieldError] = useState(null)
  const [sentTo, setSentTo] = useState(null)
  const send = useMutation((address) => api.auth.forgotPassword({ email: address }), {
    onSuccess: (_, address) => setSentTo(address),
    onError: (err) => setFieldError(err.fields?.email ?? null),
  })

  const submit = (e) => {
    e.preventDefault()
    const address = email.trim()
    if (!address) {
      setFieldError('Enter your email.')
      return
    }
    setFieldError(null)
    send.run(address)
  }

  if (sentTo) {
    return (
      <AuthShell>
        <div className={cardClasses}>
          <CardTitle title="Check your email" />
          <Alert type="success" title="Link sent">
            If a CampusStay account exists for {sentTo}, we sent a link to choose a new password. The link works once and expires in 30 minutes.
          </Alert>
          <p className="text-base text-fg-secondary">No email after a few minutes? Check the spam folder, or contact the dormitory office.</p>
          <BackToSignIn />
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <form onSubmit={submit} noValidate className={cardClasses}>
        <CardTitle title="Forgot your password?">Enter the email of your CampusStay account. We will send you a link to choose a new password.</CardTitle>
        {send.error && !send.error.fields?.email && (
          <Alert type="error" title="Could not send the link">
            {send.error.message}
          </Alert>
        )}
        <LoginField
          label="Email"
          type="email"
          inputMode="email"
          placeholder="name@fpt.edu.vn"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          error={fieldError}
          onChange={(e) => {
            setEmail(e.target.value)
            setFieldError(null)
          }}
        />
        <button type="submit" disabled={send.pending} className={primaryButtonClasses}>
          {send.pending ? 'Sending…' : 'Send link'}
        </button>
        <BackToSignIn />
      </form>
    </AuthShell>
  )
}
