import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { landingFor, useSession } from '@/app/session'
import { Alert } from '@/components/ui/Display'
import { PASSWORD_RULE, newPasswordErrors } from '@/lib/password'
import { AuthShell, CardTitle, LoginField, cardClasses, primaryButtonClasses, textLinkClasses } from './shared'
import { t } from '@/i18n'

// SCR-AUTH-05 Set a password (first sign-in with Google, ADR-26)
// An account created by Google sign-up has no CampusStay password: until it sets one, every page leads here and the
// API answers 403 PASSWORD_REQUIRED. POST /auth/password/set { newPassword } → 204 (the session stays);
// GET /auth/me then says passwordSet: true. Errors: 400 WEAK_PASSWORD (under the field), 409 PASSWORD_ALREADY_SET.

export default function FirstPassword() {
  const navigate = useNavigate()
  const { user, refreshUser, signOut } = useSession()
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})

  const save = useMutation(() => api.auth.setFirstPassword({ newPassword }), {
    onSuccess: async () => {
      const fresh = await refreshUser()
      navigate(landingFor(fresh), { replace: true })
    },
    onError: async (err) => {
      if (err.code === 'WEAK_PASSWORD') setErrors({ newPassword: err.message })
      if (err.code === 'PASSWORD_ALREADY_SET') navigate(landingFor(await refreshUser()), { replace: true })
    },
  })

  if (!user) return <Navigate to="/signin" replace />
  if (user.passwordSet !== false) return <Navigate to={landingFor(user)} replace />

  const submit = (e) => {
    e.preventDefault()
    const found = newPasswordErrors(newPassword, confirm)
    setErrors(found)
    if (!Object.keys(found).length) save.run()
  }

  return (
    <AuthShell>
      <form onSubmit={submit} noValidate className={cardClasses}>
        <CardTitle title="Set a CampusStay password">
          {t('Welcome, {name}. Choose a password so you can also sign in with {email} when Google is not at hand.', {
            name: user.name,
            email: user.email,
          })}
        </CardTitle>
        {save.error && save.error.code !== 'WEAK_PASSWORD' && (
          <Alert type="error" title="Could not save the password">
            {save.error.message}
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
          {save.pending ? t('Saving…') : t('Set password and continue')}
        </button>
        <button
          type="button"
          className={textLinkClasses}
          onClick={async () => {
            await signOut()
            navigate('/signin', { replace: true })
          }}
        >
          {t('Sign out')}
        </button>
      </form>
    </AuthShell>
  )
}
