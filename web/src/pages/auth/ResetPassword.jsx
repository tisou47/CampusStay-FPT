import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { writeSession } from '@/api/client'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { Alert } from '@/components/ui/Display'
import { PASSWORD_RULE, newPasswordErrors } from '@/lib/password'
import { AuthShell, BackToSignIn, CardTitle, LoginField, cardClasses, primaryButtonClasses, textLinkClasses } from './shared'

// SCR-AUTH-03 Reset password (/reset-password?token=…, 30 minutes) and
// SCR-AUTH-04 Set password for an invited account (/set-password?token=…, 72 hours). Contract change A-03, C-13.
// POST /auth/password/reset { token, newPassword } → 204; every session of the user is signed out, so the
// browser forgets its own session too and the user signs in again with the new password.
// Errors: 400 LINK_INVALID (used or expired link), 400 WEAK_PASSWORD (shown under the new password).

const copy = {
  reset: {
    title: 'Choose a new password',
    intro: 'Your other devices are signed out when you save the new password.',
    button: 'Save new password',
    done: 'Your new password is saved. Sign in with your email and the new password.',
  },
  invite: {
    title: 'Set your password',
    intro: 'Welcome to CampusStay. Choose the password you will use to sign in with your email.',
    button: 'Set password',
    done: 'Your account is ready. Sign in with your email and the password you just set.',
  },
}

export default function ResetPassword({ mode = 'reset' }) {
  const text = copy[mode]
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})

  const save = useMutation(() => api.auth.resetPassword({ token, newPassword }), {
    onSuccess: () => {
      writeSession(null)
      navigate('/signin', { replace: true, state: { notice: text.done } })
    },
    onError: (err) => {
      if (err.code === 'WEAK_PASSWORD') setErrors({ newPassword: err.message })
    },
  })

  if (!token) {
    return (
      <AuthShell>
        <div className={cardClasses}>
          <CardTitle title={text.title} />
          <Alert type="error" title="This link is incomplete">
            Open the link from your email again. If it still does not work, ask for a new one.
          </Alert>
          {mode === 'reset' ? (
            <Link to="/forgot-password" className={textLinkClasses}>
              Send me a new link
            </Link>
          ) : (
            <p className="text-base text-fg-secondary">Ask the dormitory office to send you a new invitation.</p>
          )}
          <BackToSignIn />
        </div>
      </AuthShell>
    )
  }

  const submit = (e) => {
    e.preventDefault()
    const found = newPasswordErrors(newPassword, confirm)
    setErrors(found)
    if (!Object.keys(found).length) save.run()
  }

  const linkInvalid = save.error?.code === 'LINK_INVALID'
  return (
    <AuthShell>
      <form onSubmit={submit} noValidate className={cardClasses}>
        <CardTitle title={text.title}>{text.intro}</CardTitle>
        {save.error && save.error.code !== 'WEAK_PASSWORD' && (
          <Alert type="error" title={linkInvalid ? 'This link no longer works' : 'Could not save the password'}>
            {save.error.message}
            {linkInvalid && mode === 'reset' && (
              <>
                {' '}
                <Link to="/forgot-password" className="font-semibold underline">
                  Send me a new link
                </Link>
              </>
            )}
            {linkInvalid && mode === 'invite' && ' Ask the dormitory office to send you a new invitation.'}
          </Alert>
        )}
        <LoginField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          error={errors.newPassword}
          helper={PASSWORD_RULE}
          onChange={(e) => {
            setNewPassword(e.target.value)
            setErrors((f) => ({ ...f, newPassword: undefined }))
          }}
        />
        <LoginField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setErrors((f) => ({ ...f, confirm: undefined }))
          }}
        />
        <button type="submit" disabled={save.pending} className={primaryButtonClasses}>
          {save.pending ? 'Saving…' : text.button}
        </button>
        <BackToSignIn />
      </form>
    </AuthShell>
  )
}
