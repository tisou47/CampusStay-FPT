import { useRef, useState } from 'react'
import { CircleAlert, Download, Plus, Upload, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatVnd, toDateInput, toDateTimeInput } from '@/lib/format'
import { t, tr } from '@/i18n'

/*
 * Registration periods (Change Specification v2 §5, §6.3, §6.4): what a Manager's request proposes and what the
 * Admin's wizard builds use the same milestones (§5.1). Renewal milestones M1–M7 are for the continuing residents of
 * the Term before; they are optional until the renewal flow uses them.
 */

/** Milestones in order: key, English label, input type ('datetime' instants, 'date' calendar days, 'hours'). */
export const RENEWAL = [
  { key: 'publishAt', label: 'Publish (M1)', type: 'datetime' },
  { key: 'requestsOpenAt', label: 'Requests window opens (M2)', type: 'datetime' },
  { key: 'requestsCloseAt', label: 'Request deadline (M3)', type: 'datetime' },
  { key: 'decisionsDueAt', label: 'Decision deadline (M4)', type: 'datetime' },
  { key: 'reconciliationDueAt', label: 'Reconciliation (M5)', type: 'datetime' },
  { key: 'feesIssueAt', label: 'Next-Term fees issued (M6)', type: 'datetime' },
  { key: 'feesDueAt', label: 'Next-Term fee deadline (M7)', type: 'datetime' },
]

export const REGISTRATION = [
  { key: 'registrationOpensAt', label: 'Registration opens', type: 'datetime' },
  { key: 'registrationClosesAt', label: 'Registration closes', type: 'datetime' },
  { key: 'resultsPublishedAt', label: 'Assignment results', type: 'datetime' },
  { key: 'roommateHours', label: 'Roommate confirmation (hours)', type: 'hours' },
  { key: 'depositHours', label: 'Deposit payment (hours)', type: 'hours' },
  { key: 'balanceDueAt', label: 'Balance due', type: 'datetime' },
  { key: 'checkInStart', label: 'Check-in from', type: 'date' },
  { key: 'checkInEnd', label: 'Check-in until', type: 'date' },
  { key: 'checkOutBy', label: 'Check-out by', type: 'date' },
]

export const MILESTONES = [...RENEWAL, ...REGISTRATION]

/** API value → input value. */
export function toInput(type, value) {
  if (value == null) return ''
  if (type === 'datetime') return toDateTimeInput(value)
  if (type === 'date') return toDateInput(value)
  return String(value)
}

/** Input value → API value; empty is null, never 0 (the server then names what is missing). */
export function fromInput(type, value) {
  if (value === '' || value == null) return null
  if (type === 'hours') return Number(value)
  return type === 'datetime' ? new Date(value).toISOString() : value
}

/** A timeline from the API as form values, and back. */
export const timelineForm = (timeline) => Object.fromEntries(MILESTONES.map((m) => [m.key, toInput(m.type, timeline?.[m.key])]))
export const timelineBody = (form) => Object.fromEntries(MILESTONES.map((m) => [m.key, fromInput(m.type, form[m.key])]))

/** Two values of one milestone are the same (instants compared to the minute). */
export function sameValue(type, a, b) {
  if (a == null || a === '') return b == null || b === ''
  if (b == null || b === '') return false
  if (type === 'datetime') return Math.floor(new Date(a).getTime() / 60000) === Math.floor(new Date(b).getTime() / 60000)
  return String(a) === String(b)
}

/** A milestone value as people read it. */
export function showValue(type, value) {
  if (value == null || value === '') return '—'
  if (type === 'datetime') return formatDateTime(value)
  if (type === 'date') return formatDate(value)
  if (type === 'MONEY') return formatVnd(Number(value))
  if (type === 'PERCENT') return `${value}%`
  if (type === 'DATETIME') return formatDateTime(value)
  if (type === 'DATE') return formatDate(value)
  if (type === 'BOOL') return value === 'true' ? t('On') : t('Off')
  return tr(String(value))
}

export const requestTone = {
  Submitted: 'info',
  'In progress': 'brand',
  'Needs changes': 'warning',
  Done: 'success',
  Rejected: 'error',
}

export function RequestStatus({ status }) {
  return <Tag tone={requestTone[status] ?? 'neutral'}>{status}</Tag>
}

/**
 * The timeline inputs. `errors`: field → message; `fixed`/`extendOnly`: fields a published Term may not move
 * back; `proposed` (a request's values) marks each changed value and asks for its reason through `reasonFor`.
 */
export function TimelineFields({ form, onChange, errors = {}, fixed = [], extendOnly = [], showRenewal, renewalNote, proposed, reasonFor, readOnly }) {
  const field = (m) => {
    const changed = proposed && proposed[m.key] != null && !sameValue(m.type, proposed[m.key], fromInput(m.type, form[m.key]))
    const locked = readOnly || fixed.includes(m.key)
    return (
      <div key={m.key} className="flex min-w-0 flex-col gap-1">
        <Field
          label={m.label}
          error={errors[m.key]}
          helper={
            fixed.includes(m.key)
              ? 'This date has passed, so it cannot change.'
              : extendOnly.includes(m.key)
                ? 'Open: it can be extended, never shortened.'
                : changed
                  ? t('The request asked for {value}.', { value: showValue(m.type, proposed[m.key]) })
                  : undefined
          }
        >
          {(id) => (
            <Input
              id={id}
              type={m.type === 'datetime' ? 'datetime-local' : m.type === 'date' ? 'date' : 'number'}
              value={form[m.key] ?? ''}
              disabled={locked}
              invalid={Boolean(errors[m.key])}
              onChange={(e) => onChange({ ...form, [m.key]: e.target.value })}
            />
          )}
        </Field>
        {changed && reasonFor?.(m.key)}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium text-fg-secondary">{t('Registration for new students')}</h3>
        <div className="grid grid-cols-3 gap-4">{REGISTRATION.map(field)}</div>
      </section>
      {showRenewal && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-base font-medium text-fg-secondary">{t('Renewal for continuing residents')}</h3>
            {renewalNote && <p className="text-sm text-fg-tertiary">{tr(renewalNote)}</p>}
          </div>
          <div className="grid grid-cols-3 gap-4">{RENEWAL.map(field)}</div>
        </section>
      )}
    </div>
  )
}

/** The milestones on one line each, in time order, with the ones that passed ticked (a visual check of §5.2). */
export function TimelineStrip({ form, className }) {
  const now = Date.now()
  const points = MILESTONES.filter((m) => m.type !== 'hours' && form[m.key])
    .map((m) => ({ ...m, at: new Date(form[m.key]).getTime() }))
    .sort((a, b) => a.at - b.at)
  if (!points.length) return null
  return (
    <ol className={cx('flex flex-col gap-2', className)}>
      {points.map((p) => (
        <li key={p.key} className="flex items-center gap-3 text-base">
          <span aria-hidden="true" className={cx('size-2.5 shrink-0 rounded-full', p.at <= now ? 'bg-success' : 'border-[1.5px] border-line-strong bg-white')} />
          <span className="flex-1 text-fg">{t(p.label)}</span>
          <span className="text-fg-secondary tabular">{showValue(p.type, fromInput(p.type, form[p.key]))}</span>
        </li>
      ))}
    </ol>
  )
}

/** A reason input under a value that differs from the Manager's request. */
export function ReasonInput({ value, onChange, error }) {
  return (
    <Field label="Reason for the change" error={error}>
      {(id) => <Input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="Shown to the Manager next to the difference" />}
    </Field>
  )
}

/** Values the Admin built differently from the request: label, proposed → built, and the reason. */
export function DifferencesTable({ differences }) {
  if (!differences?.length) return <p className="text-sm text-fg-tertiary">{t('The Term has every value the request proposed.')}</p>
  return (
    <ul className="flex flex-col divide-y divide-line">
      {differences.map((d) => (
        <li key={d.field} className="flex flex-col gap-0.5 py-2">
          <span className="text-base font-medium text-fg">{tr(d.label)}</span>
          <span className="text-sm text-fg-secondary">
            {showValue(d.type, d.proposed)} → {showValue(d.type, d.built)}
          </span>
          {d.reason ? (
            <span className="text-sm text-fg-tertiary">{t('Reason: {reason}', { reason: d.reason })}</span>
          ) : (
            <span className="flex items-center gap-1 text-sm text-warning-fg">
              <CircleAlert size={14} aria-hidden="true" />
              {t('No reason given yet')}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Codes compared without case, in the order first given. */
function mergeCodes(list, more) {
  const seen = new Set(list.map((c) => c.toUpperCase()))
  const out = [...list]
  for (const c of more) {
    if (!seen.has(c.toUpperCase())) {
      seen.add(c.toUpperCase())
      out.push(c)
    }
  }
  return out
}

/**
 * Rooms a Term leaves out (spec §6.3): imported from an Excel or CSV list (one column headed "Room code"), shown as
 * chips removed one by one; a code can still be typed in. Codes no Room has are listed after an import and never added.
 */
export function ExcludedRoomsField({ label, helper, codes, onChange, disabled, error }) {
  const file = useRef(null)
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState(null)
  const read = useMutation(
    (f) => {
      const body = new FormData()
      body.append('file', f)
      return api.inventory.roomCodes(body)
    },
    {
      onSuccess: (res) => {
        onChange(mergeCodes(codes, res.rooms.map((r) => r.code)))
        setResult({ added: res.rooms.length, unknown: res.unknown })
      },
      onError: () => setResult(null),
    },
  )
  const add = () => {
    onChange(mergeCodes(codes, typed.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean)))
    setTyped('')
  }
  const template = () => {
    const url = URL.createObjectURL(new Blob([`﻿${t('Room code')}\nA-101\nB-512\n`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'rooms-left-out.csv'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-base font-medium text-fg">{t(label)}</span>
        <span className="text-sm text-fg-tertiary">{t('{n} Rooms', { n: codes.length })}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <input
            ref={file}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) read.run(f)
              e.target.value = ''
            }}
          />
          <Button size="sm" icon={Upload} disabled={disabled || read.pending} onClick={() => file.current?.click()}>
            {read.pending ? t('Reading…') : t('Import Excel or CSV')}
          </Button>
          <Button size="sm" variant="text" icon={Download} onClick={template}>
            Template
          </Button>
          {codes.length > 0 && !disabled && (
            <Button size="sm" variant="text" onClick={() => onChange([])}>
              Clear all
            </Button>
          )}
        </div>
      </div>
      <div className={cx('flex max-h-40 min-h-11 flex-wrap content-start gap-1.5 overflow-y-auto rounded-md border p-2', error ? 'border-error' : 'border-line')}>
        {codes.length === 0 && <span className="self-center px-1 text-sm text-fg-tertiary">{t('No Room left out.')}</span>}
        {codes.map((code) => (
          <span key={code} className="inline-flex items-center gap-1 rounded-full bg-subtle py-0.5 pr-1 pl-2.5 text-sm font-medium text-fg">
            {code}
            {!disabled && (
              <button
                type="button"
                aria-label={t('Remove {code}', { code })}
                className="rounded-full p-0.5 text-fg-tertiary hover:bg-line hover:text-fg"
                onClick={() => onChange(codes.filter((c) => c !== code))}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Input
            aria-label={t('Add Room codes')}
            placeholder="Add a Room code, e.g. A-101"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
          <Button icon={Plus} disabled={!typed.trim()} onClick={add}>
            Add
          </Button>
        </div>
      )}
      {read.error && <Alert type="error" title="Could not read the file">{read.error.details?.fields?.file ?? read.error.message}</Alert>}
      {result?.unknown.length > 0 && (
        <Alert type="warning" title={t('{n} codes are not Rooms and were left out', { n: result.unknown.length })}>
          {result.unknown.join(', ')}
        </Alert>
      )}
      {result && !result.unknown.length && <p className="text-sm text-success-fg">{t('{n} Rooms read from the file.', { n: result.added })}</p>}
      {error ? <p className="text-sm text-error-fg">{tr(error)}</p> : helper ? <p className="text-sm text-fg-tertiary">{t(helper)}</p> : null}
    </div>
  )
}
