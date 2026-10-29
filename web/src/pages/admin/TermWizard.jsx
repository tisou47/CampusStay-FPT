import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, Check, CircleCheck, ExternalLink, Plus, Rocket, Trash2, TriangleAlert } from 'lucide-react'
import { api } from '@/api/endpoints'
import { invalidate, useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatVnd } from '@/lib/format'
import { DifferencesTable, ExcludedRoomsField, ReasonInput, TimelineFields, TimelineStrip, timelineBody, timelineForm } from '../registration/shared'
import { termTone } from './Terms'
import { t, tr } from '@/i18n'

// SCR-CFG-23 Term wizard (spec §6.4, ADR-20): General → Timeline → Rooms and places → Prices → Rules → Information →
// Review and publish. Each step is saved on its own (the Draft keeps it); a Term built from a Manager's request needs
// a reason for every value that differs from it. After publishing, a change needs a reason and is announced.
// GET /admin/terms/:id/wizard → { id, code, name, status, published, step, request, general, timeline, rooms, prices,
//   rules, information, differences, checks, editable }
// PUT /admin/terms/:id/wizard/:step { …values of the step, reasons, changeReason } · POST /admin/terms/:id/publish

export const STEPS = [
  { key: 'general', label: 'General', why: 'The Term’s name and stay dates; everything else hangs on them.' },
  { key: 'timeline', label: 'Timeline', why: 'When registration opens and closes and when each later milestone falls; deadlines and reminders follow these dates.' },
  { key: 'rooms', label: 'Rooms and places', why: 'Which Blocks and Rooms this Term offers; the assignment can only use these Beds.' },
  { key: 'prices', label: 'Prices', why: 'The price of each Room Type and Room Class for this Term; fixed once published.' },
  { key: 'rules', label: 'Rules', why: 'Who may apply, who goes first and how roommates are matched for this Term.' },
  { key: 'information', label: 'Information', why: 'What students read about the Term on their board before they apply.' },
  { key: 'review', label: 'Review and publish', why: 'Check what is still missing, then publish: students see the Term and Managers are told.' },
]

const GENDER = { M: 'Male', F: 'Female' }

/** Saves one step; field errors stay with the form. */
function useStep(w, step, onSaved) {
  const { notify } = useToast()
  const [fields, setFields] = useState({})
  const save = useMutation((body) => api.admin.terms.saveStep(w.id, step, body), {
    invalidates: ['admin-terms', 'terms', 'term-wizard'],
    onSuccess: (_, body) => {
      setFields({})
      notify({ title: t('{step} saved', { step: t(STEPS.find((s) => s.key === step).label) }), message: w.published ? 'Students read the change in an announcement.' : 'The Draft keeps it.' })
      onSaved(body)
    },
    onError: (err) => setFields(err.fields ?? {}),
  })
  return { save, fields, setFields }
}

/** The change reason a published Term asks for (shown to students in the change announcement). */
function ChangeReason({ w, value, onChange, error }) {
  if (!w.published) return null
  return (
    <Field label="Why does this published Term change?" required error={error} helper="Students read it in the change announcement.">
      {(id) => <Textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  )
}

function StepActions({ save, onSave, next, disabled }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="primary" icon={next ? ArrowRight : Check} disabled={disabled || save.pending} onClick={onSave}>
        {next ? t('Save and continue') : t('Save')}
      </Button>
    </div>
  )
}

function SaveError({ save }) {
  if (!save.error || Object.keys(save.error.fields ?? {}).length) return null
  return <Alert type="error" title="Could not save this step">{save.error.message}</Alert>
}

/* ---------------------------------------------------------------- 1 General */

function GeneralStep({ w, onSaved }) {
  const { save, fields } = useStep(w, 'general', onSaved)
  const [form, setForm] = useState({ name: w.general.name, stayStart: w.general.stayStart, stayEnd: w.general.stayEnd })
  const [reasons, setReasons] = useState(reasonsOf(w))
  const [changeReason, setChangeReason] = useState('')
  const proposed = w.request ? { name: w.request.termName, stayStart: w.request.stayStart, stayEnd: w.request.stayEnd } : null
  const differs = (key) => proposed && proposed[key] != null && String(proposed[key]) !== String(form[key] ?? '')
  const input = (key, label, type = 'text') => (
    <div className="flex flex-col gap-1">
      <Field label={label} error={fields[key]} helper={differs(key) ? t('The request asked for {value}.', { value: type === 'date' ? formatDate(proposed[key]) : proposed[key] }) : undefined}>
        {(id) => <Input id={id} type={type} value={form[key] ?? ''} disabled={!w.editable.general} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />}
      </Field>
      {differs(key) && <ReasonInput value={reasons[key]} onChange={(v) => setReasons((r) => ({ ...r, [key]: v }))} />}
    </div>
  )
  return (
    <>
      <SaveError save={save} />
      <div className="grid grid-cols-3 gap-4">
        {input('name', 'Name')}
        {input('stayStart', 'Stay starts', 'date')}
        {input('stayEnd', 'Stay ends', 'date')}
      </div>
      <p className="text-sm text-fg-tertiary">{t('Internal code {code}; Application and Invoice codes use it.', { code: w.code })}</p>
      <ChangeReason w={w} value={changeReason} onChange={setChangeReason} error={fields.changeReason} />
      <StepActions save={save} next disabled={!w.editable.general} onSave={() => save.run({ ...form, reasons: pick(reasons, ['name', 'stayStart', 'stayEnd']), changeReason })} />
    </>
  )
}

/* ---------------------------------------------------------------- 2 Timeline */

function TimelineStep({ w, onSaved }) {
  const { save, fields } = useStep(w, 'timeline', onSaved)
  const [form, setForm] = useState(() => timelineForm(w.timeline.values))
  const [reasons, setReasons] = useState(reasonsOf(w))
  const [changeReason, setChangeReason] = useState('')
  const proposed = w.request?.proposal?.timeline ?? null
  const renewal = Boolean(w.timeline.previousTerm)
  return (
    <>
      <SaveError save={save} />
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <TimelineFields
            form={form}
            onChange={setForm}
            errors={fields}
            fixed={w.timeline.fixed}
            extendOnly={w.timeline.extendOnly}
            readOnly={!w.editable.timeline}
            showRenewal={renewal}
            renewalNote={
              renewal
                ? t('For the residents of {term} (stay ends {end}) who continue into this Term. Optional until the renewal flow is in use.', {
                    term: w.timeline.previousTerm,
                    end: formatDate(w.timeline.previousStayEnd),
                  })
                : undefined
            }
            proposed={proposed}
            reasonFor={(key) => <ReasonInput value={reasons[key]} onChange={(v) => setReasons((r) => ({ ...r, [key]: v }))} error={fields[key] && !reasons[key] ? fields[key] : undefined} />}
          />
          {!renewal && <p className="mt-4 text-sm text-fg-tertiary">{t('No Term runs before this one, so it has no renewal milestones.')}</p>}
        </div>
        <Card className="w-80 shrink-0">
          <h3 className="mb-3 text-h3 font-semibold text-fg">{t('In time order')}</h3>
          <TimelineStrip form={form} />
          {w.timeline.previousCheckOutBy && (
            <p className="mt-3 text-sm text-fg-tertiary">
              {t('Residents of {term} leave by {date}: Check-in starts on or after that day.', { term: w.timeline.previousTerm, date: formatDate(w.timeline.previousCheckOutBy) })}
            </p>
          )}
        </Card>
      </div>
      <ChangeReason w={w} value={changeReason} onChange={setChangeReason} error={fields.changeReason} />
      <StepActions
        save={save}
        next
        disabled={!w.editable.timeline}
        onSave={() => save.run({ timeline: timelineBody(form), reasons: Object.fromEntries(Object.entries(reasons).filter(([k]) => !k.startsWith('price:') && !['name', 'stayStart', 'stayEnd', 'blocks', 'excludedRooms'].includes(k))), changeReason })}
      />
    </>
  )
}

/* ---------------------------------------------------------------- 3 Rooms and places */

function RoomsStep({ w, onSaved }) {
  const { save, fields } = useStep(w, 'rooms', onSaved)
  const [used, setUsed] = useState(() => new Set(w.rooms.blocks.filter((b) => b.used).map((b) => b.id)))
  const [excluded, setExcluded] = useState(w.rooms.excludedRooms)
  const [reserved, setReserved] = useState(String(w.rooms.reservedNewPercent ?? 0))
  const [reasons, setReasons] = useState(reasonsOf(w))
  const [changeReason, setChangeReason] = useState('')
  const proposal = w.request?.proposal
  const codes = (list) => [...list].map((c) => c.trim().toUpperCase()).filter(Boolean).sort().join(', ')
  const chosenCodes = w.rooms.blocks.filter((b) => used.has(b.id)).map((b) => b.code)
  const blocksDiffer = proposal?.blocks?.length > 0 && codes(proposal.blocks) !== (used.size === w.rooms.blocks.length ? codes(w.rooms.blocks.map((b) => b.code)) : codes(chosenCodes))
  const roomsDiffer = proposal?.excludedRooms?.length > 0 && codes(proposal.excludedRooms) !== codes(excluded)
  const supply = w.rooms.supply
  return (
    <>
      <SaveError save={save} />
      <section className="flex flex-col gap-2">
        <h3 className="text-base font-medium text-fg-secondary">{t('Blocks used')}</h3>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {w.rooms.blocks.map((b) => (
            <Checkbox
              key={b.id}
              disabled={!w.editable.rooms}
              label={`${b.name} · ${t(GENDER[b.gender])}`}
              description={t('{rooms} Rooms · {beds} Beds', { rooms: b.rooms, beds: b.beds })}
              checked={used.has(b.id)}
              onChange={() =>
                setUsed((s) => {
                  const next = new Set(s)
                  if (next.has(b.id)) next.delete(b.id)
                  else next.add(b.id)
                  return next
                })
              }
            />
          ))}
        </div>
        {fields.blockIds && <p className="text-sm text-error-fg">{tr(fields.blockIds)}</p>}
        {blocksDiffer && (
          <>
            <p className="text-sm text-fg-tertiary">{t('The request asked for Blocks {codes}.', { codes: codes(proposal.blocks) })}</p>
            <ReasonInput value={reasons.blocks} onChange={(v) => setReasons((r) => ({ ...r, blocks: v }))} error={fields.blocks} />
          </>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <ExcludedRoomsField label="Rooms left out" helper="One column of Room codes in an Excel or CSV file; the assignment and Round 2 never use these Rooms." codes={excluded} disabled={!w.editable.rooms} onChange={setExcluded} error={fields.excludedRooms} />
        {roomsDiffer && (
          <>
            <p className="text-sm text-fg-tertiary">{t('The request asked to leave out {codes}.', { codes: codes(proposal.excludedRooms) })}</p>
            <ReasonInput value={reasons.excludedRooms} onChange={(v) => setReasons((r) => ({ ...r, excludedRooms: v }))} error={fields.excludedRooms} />
          </>
        )}
      </section>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Beds kept for new students (%)" helper={t('{n} of {beds} Beds now.', { n: w.rooms.reservedBeds, beds: w.rooms.beds })} error={fields.reservedNewPercent}>
          {(id) => <Input id={id} inputMode="decimal" value={reserved} disabled={!w.editable.rooms} onChange={(e) => setReserved(e.target.value)} />}
        </Field>
      </div>
      <section className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-base font-medium text-fg-secondary">{t('Supply and demand')}</h3>
            <p className="text-sm text-fg-tertiary">{t('Beds the Term offers with the Room Class of each Room in this Term (Managers set them in Room Classes by Term), next to the places asked for and the Applications so far. Saved Blocks and Rooms count.')}</p>
          </div>
        </div>
        <Table>
          <THead>
            <tr>
              <Th>Room Type</Th>
              <Th>Room Class</Th>
              <Th>Gender</Th>
              <Th align="right">Rooms</Th>
              <Th align="right">Beds</Th>
              <Th align="right">Not matching their class</Th>
              <Th align="right">Places asked</Th>
              <Th align="right">Applications</Th>
            </tr>
          </THead>
          <TBody>
            {supply.map((r) => (
              <Tr key={`${r.roomTypeId}:${r.roomClassId}:${r.gender}`}>
                <Td>{tr(r.roomType)}</Td>
                <Td>{tr(r.roomClass)}</Td>
                <Td>{t(GENDER[r.gender])}</Td>
                <Td align="right">{r.rooms}</Td>
                <Td align="right" className={cx(r.requested != null && r.beds < r.requested && 'font-medium text-error-fg')}>
                  {r.beds}
                </Td>
                <Td align="right">{r.roomsNotMatching ? <Tag tone="warning">{r.roomsNotMatching}</Tag> : 0}</Td>
                <Td align="right">{r.requested ?? '—'}</Td>
                <Td align="right">{r.applications}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </section>
      <ChangeReason w={w} value={changeReason} onChange={setChangeReason} error={fields.changeReason} />
      <StepActions
        save={save}
        next
        disabled={!w.editable.rooms}
        onSave={() =>
          save.run({
            blockIds: [...used],
            excludedRooms: excluded,
            reservedNewPercent: reserved === '' ? 0 : Number(reserved),
            reasons: pick(reasons, ['blocks', 'excludedRooms']),
            changeReason,
          })
        }
      />
    </>
  )
}

/* ---------------------------------------------------------------- 4 Prices */

function PricesStep({ w, onSaved }) {
  const { save, fields } = useStep(w, 'prices', onSaved)
  const p = w.prices
  const [rows, setRows] = useState(() => p.rows.map((r) => ({ ...r, value: String(r.price) })))
  const [deposit, setDeposit] = useState(String(p.depositPercent))
  const [utility, setUtility] = useState(String(p.utilityDeposit))
  const [reasons, setReasons] = useState(reasonsOf(w))
  const [changeReason, setChangeReason] = useState('')
  const editable = w.editable.prices
  const fill = (source) => setRows((list) => list.map((r) => (r[source] != null ? { ...r, value: String(r[source]) } : r)))
  return (
    <>
      <SaveError save={save} />
      {p.locked && (
        <Alert type="info" title="Prices are locked">
          Invoices of this Term exist, so its prices, Deposit and Utility Deposit stay as they are.
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!editable} onClick={() => fill('defaultPrice')}>
          Use the default prices
        </Button>
        {p.previousTerm && (
          <Button disabled={!editable} onClick={() => fill('previousPrice')}>
            {t("Use {term}'s prices", { term: p.previousTerm })}
          </Button>
        )}
        {w.request && (
          <Button disabled={!editable} onClick={() => fill('requested')}>
            Use the requested prices
          </Button>
        )}
      </div>
      <Table>
        <THead>
          <tr>
            <Th>Room Type</Th>
            <Th>Room Class</Th>
            <Th align="right">Default</Th>
            {p.previousTerm && <Th align="right">{p.previousTerm}</Th>}
            {w.request && <Th align="right">Requested</Th>}
            <Th className="w-64">This Term (VND per Bed)</Th>
          </tr>
        </THead>
        <TBody>
          {rows.map((r, i) => {
            const field = `price:${r.roomTypeId}:${r.roomClassId}`
            const differs = r.requested != null && String(r.requested) !== r.value
            return (
              <Tr key={field}>
                <Td>{tr(r.roomType)}</Td>
                <Td>{tr(r.roomClass)}</Td>
                <Td align="right">{formatVnd(r.defaultPrice)}</Td>
                {p.previousTerm && <Td align="right">{r.previousPrice != null ? formatVnd(r.previousPrice) : '—'}</Td>}
                {w.request && <Td align="right">{r.requested != null ? formatVnd(r.requested) : '—'}</Td>}
                <Td>
                  <div className="flex flex-col gap-1 py-1">
                    <Input
                      aria-label={t('Price of {type} · {class}', { type: tr(r.roomType), class: tr(r.roomClass) })}
                      inputMode="numeric"
                      value={r.value}
                      disabled={!editable}
                      onChange={(e) => setRows((list) => list.map((x, j) => (j === i ? { ...x, value: e.target.value.replace(/\D/g, '') } : x)))}
                    />
                    {differs && <ReasonInput value={reasons[field]} onChange={(v) => setReasons((x) => ({ ...x, [field]: v }))} error={fields[field]} />}
                  </div>
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </Table>
      {fields.prices && <p className="text-sm text-error-fg">{tr(fields.prices)}</p>}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Deposit (% of the price)" helper={t('Default {n}%.', { n: p.defaultDepositPercent })} error={fields.depositPercent}>
          {(id) => <Input id={id} inputMode="decimal" value={deposit} disabled={!editable} onChange={(e) => setDeposit(e.target.value)} />}
        </Field>
        <Field label="Utility Deposit (VND)" helper={t('Default {amount}, collected with the Balance.', { amount: formatVnd(p.defaultUtilityDeposit) })} error={fields.utilityDeposit}>
          {(id) => <Input id={id} inputMode="numeric" value={utility} disabled={!editable} onChange={(e) => setUtility(e.target.value.replace(/\D/g, ''))} />}
        </Field>
      </div>
      <ChangeReason w={w} value={changeReason} onChange={setChangeReason} error={fields.changeReason} />
      <StepActions
        save={save}
        next
        disabled={!editable}
        onSave={() =>
          save.run({
            prices: rows.map((r) => ({ roomTypeId: r.roomTypeId, roomClassId: r.roomClassId, price: r.value === '' ? null : Number(r.value) })),
            depositPercent: deposit === '' ? null : Number(deposit),
            utilityDeposit: utility === '' ? null : Number(utility),
            reasons: Object.fromEntries(Object.entries(reasons).filter(([k]) => k.startsWith('price:'))),
            changeReason,
          })
        }
      />
    </>
  )
}

/* ---------------------------------------------------------------- 5 Rules */

function RulesStep({ w, onSaved }) {
  const { save } = useStep(w, 'rules', onSaved)
  const r = w.rules
  const list = (title, items, link) => (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-h3 font-semibold text-fg">{t(title)}</h3>
        {!r.fixed && link && (
          <Button variant="text" iconAfter={ExternalLink} to={link}>
            Change these rules
          </Button>
        )}
      </div>
      {items}
    </Card>
  )
  return (
    <>
      <SaveError save={save} />
      <Alert type={r.fixed ? 'info' : 'warning'} title={r.fixed ? 'This Term keeps the rules it opened with' : 'Publishing fixes these rules for this Term'}>
        {r.fixed ? t('Later changes of the rules apply to the Terms published after them.') : t('The rules in use now are copied into the Term when you publish it; change them first if needed.')}
      </Alert>
      <div className="grid grid-cols-2 gap-4">
        {list(
          'Who may apply',
          <ul className="flex flex-col gap-1.5 text-base text-fg">
            {r.eligibility.map((e) => (
              <li key={e} className="flex items-center gap-2">
                <CircleCheck size={16} aria-hidden="true" className="shrink-0 text-success" />
                {tr(e)}
              </li>
            ))}
          </ul>,
          '/admin/eligibility',
        )}
        {list(
          'Who is placed first when Beds are short',
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-base text-fg">
            {r.priorityGroups.map((g) => (
              <li key={g}>{tr(g)}</li>
            ))}
          </ol>,
          '/admin/eligibility',
        )}
        {list(
          'How roommates are matched',
          <ul className="flex flex-col gap-1.5 text-base">
            <li className="text-sm text-fg-tertiary">{t('Snapshot {label}', { label: r.matching })}</li>
            {r.weights.map((x) => (
              <li key={x.label} className="flex justify-between">
                <span className="text-fg">{tr(x.label)}</span>
                <span className="text-fg-secondary">{tr(x.level)}</span>
              </li>
            ))}
            <li className="flex justify-between">
              <span className="text-fg">{t('Roommate-preference boost')}</span>
              <span className="text-fg-secondary">{Number(r.boost) > 1 ? `×${r.boost}` : t('Off')}</span>
            </li>
          </ul>,
          '/admin/matching',
        )}
        {list(
          'Refunds',
          <ul className="flex flex-col gap-1.5 text-base">
            {r.refundRules.map((x) => (
              <li key={x.when} className="flex justify-between gap-3">
                <span className="text-fg">{tr(x.when)}</span>
                <span className="shrink-0 text-fg-secondary">{`${x.refundPercent}% · ${tr(x.approver)}`}</span>
              </li>
            ))}
          </ul>,
          '/admin/refunds',
        )}
      </div>
      {!r.fixed && <StepActions save={save} next onSave={() => save.run({})} />}
    </>
  )
}

/* ---------------------------------------------------------------- 6 Information */

function InformationStep({ w, onSaved }) {
  const { save, fields } = useStep(w, 'information', onSaved)
  const [rules, setRules] = useState(w.information.houseRules ?? '')
  const [faq, setFaq] = useState(w.information.faq ?? [])
  const [docs, setDocs] = useState(w.information.documents ?? [])
  const [changeReason, setChangeReason] = useState('')
  const editable = w.editable.information
  return (
    <>
      <SaveError save={save} />
      <Field label="House rules" helper="Students read them on Registration period details." error={fields.houseRules}>
        {(id) => <Textarea id={id} rows={8} value={rules} disabled={!editable} onChange={(e) => setRules(e.target.value)} />}
      </Field>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-fg-secondary">{t('Questions and answers')}</h3>
          <Button size="sm" icon={Plus} disabled={!editable} onClick={() => setFaq((f) => [...f, { question: '', answer: '' }])}>
            Add question
          </Button>
        </div>
        {faq.map((f, i) => (
          <div key={i} className="flex items-start gap-3">
            <Input aria-label={t('Question')} className="flex-1" placeholder="Question" value={f.question} disabled={!editable} onChange={(e) => setFaq((list) => list.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
            <Textarea aria-label={t('Answer')} className="flex-[2]" rows={2} placeholder="Answer" value={f.answer} disabled={!editable} onChange={(e) => setFaq((list) => list.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
            <IconButton icon={Trash2} aria-label={t('Remove question')} disabled={!editable} onClick={() => setFaq((list) => list.filter((_, j) => j !== i))} />
          </div>
        ))}
        {fields.faq && <p className="text-sm text-error-fg">{tr(fields.faq)}</p>}
      </section>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-fg-secondary">{t('Documents')}</h3>
          <Button size="sm" icon={Plus} disabled={!editable} onClick={() => setDocs((d) => [...d, { title: '', url: '' }])}>
            Add document
          </Button>
        </div>
        {docs.map((d, i) => (
          <div key={i} className="flex items-center gap-3">
            <Input aria-label={t('Title')} className="flex-1" placeholder="Title" value={d.title} disabled={!editable} onChange={(e) => setDocs((list) => list.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <Input aria-label={t('Link')} className="flex-[2]" placeholder="https://…" value={d.url} disabled={!editable} onChange={(e) => setDocs((list) => list.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
            <IconButton icon={Trash2} aria-label={t('Remove document')} disabled={!editable} onClick={() => setDocs((list) => list.filter((_, j) => j !== i))} />
          </div>
        ))}
        {fields.documents && <p className="text-sm text-error-fg">{tr(fields.documents)}</p>}
      </section>
      <ChangeReason w={w} value={changeReason} onChange={setChangeReason} error={fields.changeReason} />
      <StepActions save={save} next disabled={!editable} onSave={() => save.run({ houseRules: rules, faq, documents: docs, changeReason })} />
    </>
  )
}

/* ---------------------------------------------------------------- 7 Review and publish */

function ReviewStep({ w, goTo }) {
  const { notify } = useToast()
  const [confirming, setConfirming] = useState(false)
  const publish = useMutation(() => api.admin.terms.publish(w.id), {
    invalidates: ['admin-terms', 'terms', 'term-wizard', 'term-requests'],
    onSuccess: () => {
      setConfirming(false)
      notify({ title: t('{name} published', { name: w.name }), message: 'Every Manager is told; students read the Term announcement on their board.' })
    },
    onError: () => setConfirming(false),
  })
  const prices = w.prices.rows.map((r) => r.price)
  const beds = w.rooms.beds
  const filled = Object.values(timelineForm(w.timeline.values)).filter(Boolean).length
  return (
    <>
      {publish.error && <Alert type="error" title="Could not publish">{publish.error.message}</Alert>}
      <div className="grid grid-cols-3 gap-4">
        <Card className="flex flex-col gap-1">
          <span className="text-sm text-fg-tertiary">{t('Stay')}</span>
          <span className="text-base font-medium text-fg">{`${formatDate(w.general.stayStart)} – ${formatDate(w.general.stayEnd)}`}</span>
          <span className="text-sm text-fg-secondary">{t('{n} milestones set', { n: filled })}</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-sm text-fg-tertiary">{t('Places')}</span>
          <span className="text-base font-medium text-fg">{t('{n} Beds', { n: beds })}</span>
          <span className="text-sm text-fg-secondary">{w.rooms.allBlocks ? t('Every Block') : w.rooms.blocks.filter((b) => b.used).map((b) => b.code).join(', ')}</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-sm text-fg-tertiary">{t('Prices per Bed')}</span>
          <span className="text-base font-medium text-fg">{prices.length ? `${formatVnd(Math.min(...prices))} – ${formatVnd(Math.max(...prices))}` : '—'}</span>
          <span className="text-sm text-fg-secondary">{t('Deposit {n}% · Utility Deposit {amount}', { n: w.prices.depositPercent, amount: formatVnd(w.prices.utilityDeposit) })}</span>
        </Card>
      </div>
      <Card className="flex flex-col gap-2">
        <h3 className="text-h3 font-semibold text-fg">{t('Timeline')}</h3>
        <TimelineStrip form={timelineForm(w.timeline.values)} />
      </Card>
      {w.request && (
        <Card className="flex flex-col gap-2">
          <h3 className="text-h3 font-semibold text-fg">{t('Differences from {code}', { code: w.request.code })}</h3>
          <DifferencesTable differences={w.differences} />
        </Card>
      )}
      {!w.published && (
        <Card className="flex flex-col gap-3">
          <h3 className="text-h3 font-semibold text-fg">{t('Before publishing')}</h3>
          {w.checks.length === 0 ? (
            <p className="flex items-center gap-2 text-base text-success-fg">
              <CircleCheck size={16} aria-hidden="true" />
              {t('Everything is ready.')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {w.checks.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-md bg-warning-bg px-3 py-2">
                  <span className="text-base text-warning-fg">{c.message}</span>
                  <Button size="sm" onClick={() => goTo(c.step)}>
                    {t('Go to {step}', { step: t(STEPS.find((s) => s.key === c.step)?.label ?? c.step) })}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Button variant="primary" icon={Rocket} disabled={w.checks.length > 0 || publish.pending} onClick={() => setConfirming(true)}>
              Publish the Term
            </Button>
          </div>
        </Card>
      )}
      {w.published && (
        <Alert type="success" title={t('Published {date}', { date: formatDate(w.publishedAt) })}>
          {t('Money and policy fields stay editable within the rules: a date that has passed is fixed, an open deadline can only be extended, and money is locked once an Invoice exists. Every change is announced to students.')}
        </Alert>
      )}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('Publish {name}?', { name: w.name })}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="primary" icon={Rocket} disabled={publish.pending} onClick={() => publish.run()}>
              Publish
            </Button>
          </>
        }
      >
        <p className="text-base text-fg-secondary">
          {t('Every student sees {name} on their board and every Manager is told. Its {n} prices, Deposit ({deposit}%), Utility Deposit and rules are fixed from then on.', {
            name: w.name,
            n: prices.length,
            deposit: w.prices.depositPercent,
          })}
        </p>
      </Modal>
    </>
  )
}

/* ---------------------------------------------------------------- the page */

/** Reasons already given for values that differ from the request. */
function reasonsOf(w) {
  return Object.fromEntries((w.differences ?? []).filter((d) => d.reason).map((d) => [d.field, d.reason]))
}

function pick(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([k]) => keys.includes(k)))
}

export default function TermWizard() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const query = useQuery(['term-wizard', id], ({ signal }) => api.admin.terms.wizard(id, { signal }))
  const w = query.data
  const firstOpen = useMemo(() => (w ? (w.published ? 'review' : STEPS[Math.min(w.step ?? 1, 6)].key) : null), [w])
  const step = params.get('step') ?? firstOpen
  const goTo = (key) => setParams({ step: key })
  if (w === undefined) return query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : <LoadingState />
  const index = STEPS.findIndex((s) => s.key === step)
  const next = () => {
    invalidate('term-wizard')
    if (index < STEPS.length - 1) goTo(STEPS[index + 1].key)
  }
  const props = { w, onSaved: next }

  return (
    <>
      <PageHeader
        title={w.name}
        badge={<Tag tone={termTone[w.status] ?? 'neutral'}>{w.status}</Tag>}
        description={`${formatDate(w.general.stayStart)} – ${formatDate(w.general.stayEnd)}${w.request ? ` · ${t('built from {code} ({manager})', { code: w.request.code, manager: w.request.requestedBy })}` : ''}`}
        breadcrumb={
          <Link to="/admin/terms" className="flex items-center gap-1 text-sm text-fg-tertiary hover:text-fg">
            <ArrowLeft size={14} aria-hidden="true" />
            {t('Terms')}
          </Link>
        }
        actions={
          w.request && (
            <Button to={`/admin/term-requests?id=${w.request.id}`} iconAfter={ExternalLink}>
              {t('Open {code}', { code: w.request.code })}
            </Button>
          )
        }
      />
      <nav aria-label={t('Wizard steps')} className="shrink-0">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => {
            const saved = w.published || i < (w.step ?? 1)
            const open = s.key === 'review' ? 0 : (w.checks ?? []).filter((c) => c.step === s.key).length
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => goTo(s.key)}
                  aria-current={s.key === step ? 'step' : undefined}
                  className={cx(
                    'flex items-center gap-2 rounded-full border px-3 py-1.5 text-base',
                    s.key === step ? 'border-primary bg-primary-subtle font-medium text-fg-brand' : 'border-line bg-surface text-fg-secondary hover:border-primary',
                  )}
                >
                  <span className={cx('flex size-5 items-center justify-center rounded-full text-sm', saved ? 'bg-success text-white' : 'bg-subtle text-fg-secondary')}>
                    {saved ? <Check size={12} aria-hidden="true" /> : i + 1}
                  </span>
                  {t(s.label)}
                  {open > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-warning-bg px-1.5 text-sm font-medium text-warning-fg" title={t('{n} to fix in this step', { n: open })}>
                      <TriangleAlert size={12} aria-hidden="true" />
                      <span className="tabular">{open}</span>
                      <span className="sr-only">{t('{n} to fix in this step', { n: open })}</span>
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
      <Card padding="lg" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-h2 font-semibold text-fg">{t(STEPS[index]?.label ?? '')}</h2>
          {STEPS[index]?.why && <p className="text-base text-fg-secondary">{t(STEPS[index].why)}</p>}
        </div>
        {step !== 'review' && !w.published && (w.checks ?? []).some((c) => c.step === step) && (
          <Alert type="warning" title={t('Still to fix in this step')}>
            <ul className="list-disc pl-4">
              {w.checks.filter((c) => c.step === step).map((c, i) => (
                <li key={i}>{c.message}</li>
              ))}
            </ul>
          </Alert>
        )}
        {step === 'general' && <GeneralStep key={`g${w.id}`} {...props} />}
        {step === 'timeline' && <TimelineStep key={`t${w.id}`} {...props} />}
        {step === 'rooms' && <RoomsStep key={`r${w.id}`} {...props} />}
        {step === 'prices' && <PricesStep key={`p${w.id}`} {...props} />}
        {step === 'rules' && <RulesStep key={`u${w.id}`} {...props} />}
        {step === 'information' && <InformationStep key={`i${w.id}`} {...props} />}
        {step === 'review' && <ReviewStep w={w} goTo={goTo} />}
      </Card>
    </>
  )
}
