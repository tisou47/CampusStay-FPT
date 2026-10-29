import { useEffect, useState } from 'react'
import { Landmark } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { t } from '@/i18n'

/*
 * The bank account a student's refunds are paid to (A-62): asked when they withdraw from the waitlist or decline a
 * Round-2 offer, and shown on Payments, so refunds the system starts (an expired offer, the end of the waitlist) can
 * be paid too. GET/PUT /students/me/refund-account { holder, number, bank }.
 */

const blank = { holder: '', number: '', bank: '' }

/** The saved account, a draft to edit and save(): resolves true once the draft is saved (or unchanged). */
export function useRefundAccount() {
  const query = useQuery(['refund-account'], ({ signal }) => api.me.refundAccount(undefined, { signal }))
  const saved = query.data
  const [draft, setDraft] = useState(blank)
  useEffect(() => {
    if (saved) setDraft({ holder: saved.holder ?? '', number: saved.number ?? '', bank: saved.bank ?? '' })
  }, [saved])
  const mutation = useMutation((body) => api.me.saveRefundAccount(body), { invalidates: ['refund-account', 'refunds'], onError: () => {} })
  const unchanged = saved && saved.number && draft.holder === saved.holder && draft.number === saved.number && draft.bank === saved.bank
  const save = async () => {
    if (unchanged) return true
    const result = await mutation.run(draft)
    return Boolean(result)
  }
  return { query, saved, draft, setDraft, save, saving: mutation.pending, error: mutation.error, has: Boolean(saved?.number) }
}

/** The three fields; `error` is the save error (its field messages show under each field). */
export function RefundAccountFields({ draft, setDraft, error, disabled }) {
  const fields = error?.fields ?? {}
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }))
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-1 text-base font-medium text-fg">{t('Bank account for the refund')}</legend>
      <Field label="Account holder" error={fields.holder} helper="As the bank shows it">
        {(id) => <Input id={id} value={draft.holder} onChange={set('holder')} autoComplete="name" />}
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Account number" error={fields.number}>
          {(id) => <Input id={id} value={draft.number} onChange={set('number')} inputMode="numeric" />}
        </Field>
        <Field label="Bank" error={fields.bank}>
          {(id) => <Input id={id} value={draft.bank} onChange={set('bank')} placeholder="Vietcombank, VietinBank…" />}
        </Field>
      </div>
    </fieldset>
  )
}

/** Payments page card: the account refunds go to, editable at any time. */
export function RefundAccountCard() {
  const { notify } = useToast()
  const account = useRefundAccount()
  const [editing, setEditing] = useState(false)
  if (!account.saved) return null
  return (
    <Card padding="lg" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Landmark size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-brand" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-card-title text-fg">{t('Refund account')}</h2>
          <p className="text-sm text-fg-secondary">
            {account.has
              ? `${account.saved.holder} · ${account.saved.number} · ${account.saved.bank}`
              : t('Not entered yet. A Manager can only transfer a refund to you once you enter it.')}
          </p>
        </div>
        {!editing && (
          <Button variant="text" onClick={() => setEditing(true)}>
            {account.has ? 'Change' : 'Enter account'}
          </Button>
        )}
      </div>
      {editing && (
        <>
          <RefundAccountFields draft={account.draft} setDraft={account.setDraft} error={account.error} disabled={account.saving} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={account.saving}
              onClick={async () => {
                if (await account.save()) {
                  setEditing(false)
                  notify({ title: 'Refund account saved', message: 'Refunds are transferred to this account.' })
                }
              }}
            >
              Save
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
