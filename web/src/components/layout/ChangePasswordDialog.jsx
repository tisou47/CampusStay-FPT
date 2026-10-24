import { useState } from 'react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { PASSWORD_RULE, newPasswordErrors } from '@/lib/password'
import { t } from '@/i18n'

// Change password, for every role (contract change A-04), opened from the user menu.
// POST /auth/password/change { currentPassword, newPassword } → 204; the user's other sessions are signed out.
// Errors: 400 WRONG_PASSWORD (details.fields.currentPassword), 400 WEAK_PASSWORD.

function Form({ onClose }) {
  const { notify } = useToast()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((f) => ({ ...f, [key]: undefined }))
  }

  const save = useMutation(() => api.auth.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword }), {
    onSuccess: () => {
      notify({ title: 'Password changed', message: 'Use the new password next time. Your other devices were signed out.' })
      onClose()
    },
    onError: (err) => {
      if (err.code === 'WEAK_PASSWORD') setErrors({ newPassword: err.message })
      else setErrors(err.fields ?? {})
    },
  })

  const submit = (e) => {
    e.preventDefault()
    const found = newPasswordErrors(form.newPassword, form.confirm)
    if (!form.currentPassword) found.currentPassword = t('Enter your current password.')
    setErrors(found)
    if (!Object.keys(found).length) save.run()
  }

  const shownInline = save.error && (save.error.code === 'WEAK_PASSWORD' || Object.keys(save.error.fields ?? {}).length > 0)
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {save.error && !shownInline && (
        <Alert type="error" title="Could not change the password">
          {save.error.message}
        </Alert>
      )}
      <Field label="Current password" error={errors.currentPassword} required>
        {(id) => <Input id={id} type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} invalid={Boolean(errors.currentPassword)} />}
      </Field>
      <Field label="New password" error={errors.newPassword} helper={PASSWORD_RULE} required>
        {(id) => <Input id={id} type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} invalid={Boolean(errors.newPassword)} />}
      </Field>
      <Field label="Confirm new password" error={errors.confirm} required>
        {(id) => <Input id={id} type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} invalid={Boolean(errors.confirm)} />}
      </Field>
      <div className="flex items-center justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.pending}>
          {save.pending ? 'Saving…' : 'Change password'}
        </Button>
      </div>
    </form>
  )
}

export function ChangePasswordDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Change password" description="You stay signed in on this device.">
      {/* Mounted only while open, so the fields start empty every time. */}
      {open && <Form onClose={onClose} />}
    </Modal>
  )
}
