import { useEffect, useMemo, useState } from 'react'
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
import { formatDate, formatDateRange, formatVnd } from '@/lib/format'
import { parseDecimal } from '@/lib/numbers'
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
  { key: 'general', label: 'General', why: 'The term’s name and stay dates; everything else hangs on them.' },
  { key: 'timeline', label: 'Timeline', why: 'When registration opens and closes and when each later milestone falls; deadlines and reminders follow these dates.' },
  { key: 'rooms', label: 'Rooms and places', why: 'Which blocks and rooms this term offers; the assignment can only use these beds.' },
  { key: 'prices', label: 'Prices', why: 'The price of each room type and room tier for this term; fixed once published.' },
  { key: 'rules', label: 'Rules', why: 'Who may apply, who goes first and how roommates are matched for this term.' },
  { key: 'information', label: 'Information', why: 'What students read about the term on their board before they apply.' },
  { key: 'review', label: 'Review and publish', why: 'Check what is still missing, then publish: students see the term and managers are told.' },
]

const GENDER = { M: 'Male', F: 'Female' }

/** Fields of the request that other steps than the Timeline answer for. */
const NOT_TIMELINE = ['name', 'stayStart', 'stayEnd', 'blocks', 'excludedRooms', 'roomTypes', 'roomClasses', 'reservedNewPercent', 'depositPercent', 'utilityDeposit', 'houseRules', 'faq']

/** Ids of the ticked options, sorted; '' when every option is ticked (the Term offers every one). */
const offerKey = (options, ticked) => (ticked.size === options.length ? '' : [...ticked].sort().join(','))

/** Room Types or Room Classes the Term offers (review R-03). */
function OfferField({ title, options, ticked, onChange, disabled, error }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-base font-semibold text-fg">{t(title)}</h3>
      <div className="flex flex-wrap gap-x-6 gap-y-2.5">
        {options.map((o) => (
          <Checkbox
            key={o.id}
            disabled={disabled}
            label={tr(o.name)}
            checked={ticked.has(o.id)}
            onChange={() => {
              const next = new Set(ticked)
              if (next.has(o.id)) next.delete(o.id)
              else next.add(o.id)
              onChange(next)
            }}
          />
        ))}
      </div>
      {error && <p className="text-sm text-error-fg">{tr(error)}</p>}
    </section>
  )
}

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
    <div className="rounded-xl border border-warning/30 bg-warning-bg p-4">
      <Field label="Why does this published term change?" required error={error} helper="Students read it in the change announcement.">
        {(id) => <Textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />}
      </Field>
    </div>
  )
}

/** Sticky navigation footer with Back, Step Indicator, and Save/Continue. */
function StepActions({ save, onSave, next, onPrev, stepIndex, disabled, customAction }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line bg-surface/95 px-6 py-3.5 shadow-card backdrop-blur-md lg:-mx-6 lg:-mb-6">
      <div className="flex items-center gap-3">
        {onPrev ? (
          <Button
            variant="default"
            icon={ArrowLeft}
            disabled={save?.pending}
            onClick={onPrev}
          >
            {t('Previous')}
          </Button>
        ) : (
          <span className="text-sm text-fg-tertiary">{t('First step')}</span>
        )}
        {stepIndex != null && (
          <span className="hidden sm:inline-block text-sm font-medium text-fg-secondary">
            {t('Step {step} of {total}', { step: stepIndex + 1, total: STEPS.length })} · <strong className="text-fg">{t(STEPS[stepIndex]?.label)}</strong>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        {customAction}
        {onSave && (
          <Button
            variant="primary"
            icon={next ? ArrowRight : Check}
            disabled={disabled || save?.pending}
            onClick={onSave}
          >
            {next ? t('Save and continue') : t('Save')}
          </Button>
        )}
      </div>
    </div>
  )
}

function SaveError({ save }) {
  if (!save.error || Object.keys(save.error.fields ?? {}).length) return null
  return <Alert type="error" title="Could not save this step">{save.error.message}</Alert>
}

/* ---------------------------------------------------------------- 1 General */

function GeneralStep({ w, onSaved, onPrev, stepIndex }) {
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
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
          <h3 className="text-base font-semibold text-fg">{t('Term identification')}</h3>
          {input('name', 'Name')}
          <div className="rounded-lg bg-subtle p-3 text-sm text-fg-secondary">
            <span className="font-medium text-fg">{t('Internal code:')}</span>{' '}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-mono font-semibold text-fg-brand">{w.code}</code>
            <p className="mt-1 text-xs text-fg-tertiary">{t('Used for student application IDs and invoice prefixes.')}</p>
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
          <h3 className="text-base font-semibold text-fg">{t('Stay duration')}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {input('stayStart', 'Stay starts', 'date')}
            {input('stayEnd', 'Stay ends', 'date')}
          </div>
          {form.stayStart && form.stayEnd && (
            <div className="rounded-lg bg-subtle p-3 text-sm text-fg-secondary">
              <span className="font-medium text-fg">{t('Total period:')}</span>{' '}
              <span className="font-semibold text-fg">{formatDateRange(form.stayStart, form.stayEnd)}</span>
            </div>
          )}
        </div>
      </div>
      <ChangeReason w={w} value={changeReason} onChange={setChangeReason} error={fields.changeReason} />
      <StepActions
        save={save}
        next
        onPrev={onPrev}
        stepIndex={stepIndex}
        disabled={!w.editable.general}
        onSave={() => save.run({ ...form, reasons: pick(reasons, ['name', 'stayStart', 'stayEnd']), changeReason })}
      />
    </>
  )
}

/* ---------------------------------------------------------------- 2 Timeline */

function TimelineStep({ w, onSaved, onPrev, stepIndex }) {
  const { save, fields } = useStep(w, 'timeline', onSaved)
  const [form, setForm] = useState(() => timelineForm(w.timeline.values))
  const [reasons, setReasons] = useState(reasonsOf(w))
  const [changeReason, setChangeReason] = useState('')
  const proposed = w.request?.proposal?.timeline ?? null
  const renewal = Boolean(w.timeline.previousTerm)
  return (
    <>
      <SaveError save={save} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
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
                ? t('For the residents of {term} (stay ends {end}) who continue into this term. Optional until the renewal flow is in use.', {
                    term: w.timeline.previousTerm,
                    end: formatDate(w.timeline.previousStayEnd),
                  })
                : undefined
            }
            proposed={proposed}
            reasonFor={(key) => <ReasonInput value={reasons[key]} onChange={(v) => setReasons((r) => ({ ...r, [key]: v }))} error={fields[key] && !reasons[key] ? fields[key] : undefined} />}
          />
          {!renewal && <p className="mt-4 text-sm text-fg-tertiary">{t('No term runs before this one, so it has no renewal milestones.')}</p>}
        </div>
        <div className="lg:col-span-4 lg:sticky lg:top-24">
          <Card className="flex flex-col gap-3">
            <h3 className="text-h3 font-semibold text-fg">{t('In time order')}</h3>
            <TimelineStrip form={form} />
            {w.timeline.previousCheckOutBy && (
              <p className="mt-2 text-xs text-fg-tertiary">
                {t('Residents of {term} leave by {date}: check-in starts on or after that day.', { term: w.timeline.previousTerm, date: formatDate(w.timeline.previousCheckOutBy) })}
              </p>
            )}
          </Card>
        </div>
      </div>
      <ChangeReason w={w} value={changeReason} onChange={setChangeReason} error={fields.changeReason} />
      <StepActions
        save={save}
        next
        onPrev={onPrev}
        stepIndex={stepIndex}
        disabled={!w.editable.timeline}
        onSave={() => save.run({ timeline: timelineBody(form), reasons: Object.fromEntries(Object.entries(reasons).filter(([k]) => !k.startsWith('price:') && !NOT_TIMELINE.includes(k))), changeReason })}
      />
    </>
  )
}

/* ---------------------------------------------------------------- 3 Rooms and places */

function RoomsStep({ w, onSaved, onPrev, stepIndex }) {
  const { save, fields } = useStep(w, 'rooms', onSaved)
  const [used, setUsed] = useState(() => new Set(w.rooms.blocks.filter((b) => b.used).map((b) => b.id)))
  const [excluded, setExcluded] = useState(w.rooms.excludedRooms)
  const [reserved, setReserved] = useState(String(w.rooms.reservedNewPercent ?? 0))
  const [types, setTypes] = useState(() => new Set(w.rooms.roomTypes.filter((x) => x.used).map((x) => x.id)))
  const [classes, setClasses] = useState(() => new Set(w.rooms.roomClasses.filter((x) => x.used).map((x) => x.id)))
  const [reasons, setReasons] = useState(reasonsOf(w))
  const [changeReason, setChangeReason] = useState('')
  const proposal = w.request?.proposal
  const offerDiffers = (asked, options, ticked) => asked?.length > 0 && [...asked].sort().join(',') !== offerKey(options, ticked)
  const typesDiffer = offerDiffers(proposal?.roomTypes, w.rooms.roomTypes, types)
  const classesDiffer = offerDiffers(proposal?.roomClasses, w.rooms.roomClasses, classes)
  const reservedDiffers = proposal?.reservedNewPercent != null && Number(proposal.reservedNewPercent) !== Number(reserved || 0)
  const offerFixed = w.rooms.offerFixed || !w.editable.rooms
  const names = (ids, options) => options.filter((o) => ids.includes(o.id)).map((o) => tr(o.name)).join(', ')
  const codes = (list) => [...list].map((c) => c.trim().toUpperCase()).filter(Boolean).sort().join(', ')
  const chosenCodes = w.rooms.blocks.filter((b) => used.has(b.id)).map((b) => b.code)
  const blocksDiffer = proposal?.blocks?.length > 0 && codes(proposal.blocks) !== (used.size === w.rooms.blocks.length ? codes(w.rooms.blocks.map((b) => b.code)) : codes(chosenCodes))
  const roomsDiffer = proposal?.excludedRooms?.length > 0 && codes(proposal.excludedRooms) !== codes(excluded)
  const supply = w.rooms.supply

  return (
    <>
      <SaveError save={save} />
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-fg">{t('Blocks used')}</h3>
            <p className="text-sm text-fg-tertiary">{t('Select the dormitory buildings available for this term.')}</p>
          </div>
          <Tag tone={used.size > 0 ? 'brand' : 'warning'}>
            {t('{n} of {total} blocks selected', { n: used.size, total: w.rooms.blocks.length })}
          </Tag>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {w.rooms.blocks.map((b) => (
            <div
              key={b.id}
              className={cx(
                'rounded-lg border p-3 transition-colors',
                used.has(b.id) ? 'border-primary/50 bg-brand-subtle/30' : 'border-line bg-canvas/50',
              )}
            >
              <Checkbox
                disabled={!w.editable.rooms}
                label={`${b.name} · ${t(GENDER[b.gender])}`}
                description={t('{rooms} rooms · {beds} beds', { rooms: b.rooms, beds: b.beds })}
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
            </div>
          ))}
        </div>
        {fields.blockIds && <p className="text-sm text-error-fg">{tr(fields.blockIds)}</p>}
        {blocksDiffer && (
          <div className="mt-2 rounded-lg border border-warning/20 bg-warning-bg p-3">
            <p className="text-sm text-fg-tertiary">{t('The request asked for Blocks {codes}.', { codes: codes(proposal.blocks) })}</p>
            <ReasonInput value={reasons.blocks} onChange={(v) => setReasons((r) => ({ ...r, blocks: v }))} error={fields.blocks} />
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <OfferField title="Room types offered" options={w.rooms.roomTypes} ticked={types} onChange={setTypes} disabled={offerFixed} error={fields.roomTypeIds} />
          {typesDiffer && (
            <div className="rounded-lg border border-warning/20 bg-warning-bg p-3">
              <p className="text-sm text-fg-tertiary">{t('The request asked for {names}.', { names: names(proposal.roomTypes, w.rooms.roomTypes) })}</p>
              <ReasonInput value={reasons.roomTypes} onChange={(v) => setReasons((r) => ({ ...r, roomTypes: v }))} error={fields.roomTypes} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <OfferField title="Room tiers offered" options={w.rooms.roomClasses} ticked={classes} onChange={setClasses} disabled={offerFixed} error={fields.roomClassIds} />
          {classesDiffer && (
            <div className="rounded-lg border border-warning/20 bg-warning-bg p-3">
              <p className="text-sm text-fg-tertiary">{t('The request asked for {names}.', { names: names(proposal.roomClasses, w.rooms.roomClasses) })}</p>
              <ReasonInput value={reasons.roomClasses} onChange={(v) => setReasons((r) => ({ ...r, roomClasses: v }))} error={fields.roomClasses} />
            </div>
          )}
        </div>
      </div>
      {w.rooms.offerFixed && <p className="text-sm text-fg-tertiary">{t('A published term keeps the room types and room tiers it offers.')}</p>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <ExcludedRoomsField label="Rooms left out" helper="One column of room codes in an Excel or CSV file; the assignment and Round 2 never use these rooms." codes={excluded} disabled={!w.editable.rooms} onChange={setExcluded} error={fields.excludedRooms} />
          {roomsDiffer && (
            <div className="rounded-lg border border-warning/20 bg-warning-bg p-3">
              <p className="text-sm text-fg-tertiary">{t('The request asked to leave out {codes}.', { codes: codes(proposal.excludedRooms) })}</p>
              <ReasonInput value={reasons.excludedRooms} onChange={(v) => setReasons((r) => ({ ...r, excludedRooms: v }))} error={fields.excludedRooms} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <h3 className="text-base font-semibold text-fg">{t('New student reservation')}</h3>
          <Field
            label="Beds kept for new students (%)"
            helper={reservedDiffers ? t('The request asked for {value}%.', { value: proposal.reservedNewPercent }) : t('{n} of {beds} beds now.', { n: w.rooms.reservedBeds, beds: w.rooms.beds })}
            error={Number.isNaN(parseDecimal(reserved)) ? t('Enter a number, e.g. 12,5') : fields.reservedNewPercent}
          >
            {(id) => <Input id={id} inputMode="decimal" value={reserved} disabled={!w.editable.rooms} onChange={(e) => setReserved(e.target.value)} />}
          </Field>
          {reservedDiffers && <ReasonInput value={reasons.reservedNewPercent} onChange={(v) => setReasons((r) => ({ ...r, reservedNewPercent: v }))} />}
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-base font-semibold text-fg">{t('Supply and demand')}</h3>
            <p className="text-sm text-fg-tertiary">{t('Beds the term offers with the room tier of each room in this term (Managers set them in room tiers by term), next to the places asked for and the applications so far. Saved blocks and rooms count.')}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <Th>Room type</Th>
                <Th>Room tier</Th>
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
        </div>
      </section>

      <ChangeReason w={w} value={changeReason} onChange={setChangeReason} error={fields.changeReason} />
      <StepActions
        save={save}
        next
        onPrev={onPrev}
        stepIndex={stepIndex}
        disabled={!w.editable.rooms || Number.isNaN(parseDecimal(reserved))}
        onSave={() =>
          save.run({
            blockIds: [...used],
            excludedRooms: excluded,
            reservedNewPercent: parseDecimal(reserved) ?? 0,
            roomTypeIds: [...types],
            roomClassIds: [...classes],
            reasons: pick(reasons, ['blocks', 'excludedRooms', 'roomTypes', 'roomClasses', 'reservedNewPercent']),
            changeReason,
          })
        }
      />
    </>
  )
}

/* ---------------------------------------------------------------- 4 Prices */

function PricesStep({ w, onSaved, onPrev, stepIndex }) {
  const { save, fields } = useStep(w, 'prices', onSaved)
  const p = w.prices
  const [rows, setRows] = useState(() => p.rows.map((r) => ({ ...r, value: String(r.price) })))
  const [deposit, setDeposit] = useState(String(p.depositPercent))
  const [utility, setUtility] = useState(String(p.utilityDeposit))
  const [reasons, setReasons] = useState(reasonsOf(w))
  const [changeReason, setChangeReason] = useState('')
  const editable = w.editable.prices
  const asked = w.request?.proposal
  const depositDiffers = asked?.depositPercent != null && Number(asked.depositPercent) !== Number(deposit || 0)
  const utilityDiffers = asked?.utilityDeposit != null && Number(asked.utilityDeposit) !== Number(utility || 0)
  const fill = (source) => setRows((list) => list.map((r) => (r[source] != null ? { ...r, value: String(r[source]) } : r)))

  return (
    <>
      <SaveError save={save} />
      {p.locked && (
        <Alert type="info" title="Prices are locked">
          Invoices of this term exist, so its prices, deposit and utility deposit stay as they are.
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3.5">
        <span className="text-sm font-medium text-fg-secondary">{t('Quick price presets:')}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!editable} onClick={() => fill('defaultPrice')}>
            {t('Use the default prices')}
          </Button>
          {p.previousTerm && (
            <Button size="sm" disabled={!editable} onClick={() => fill('previousPrice')}>
              {t("Use {term}'s prices", { term: p.previousTerm })}
            </Button>
          )}
          {w.request && (
            <Button size="sm" disabled={!editable} onClick={() => fill('requested')}>
              {t('Use the requested prices')}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <Table>
          <THead>
            <tr>
              <Th>Room type</Th>
              <Th>Room tier</Th>
              <Th align="right">Default</Th>
              {p.previousTerm && <Th align="right">{p.previousTerm}</Th>}
              {w.request && <Th align="right">Requested</Th>}
              <Th className="w-64">This term (₫ per bed)</Th>
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
      </div>
      {fields.prices && <p className="text-sm text-error-fg">{tr(fields.prices)}</p>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <Field
            label="Deposit (% of the price)"
            helper={depositDiffers ? t('The request asked for {value}%.', { value: asked.depositPercent }) : t('Default {n}%.', { n: p.defaultDepositPercent })}
            error={Number.isNaN(parseDecimal(deposit)) ? t('Enter a number, e.g. 12,5') : fields.depositPercent}
          >
            {(id) => <Input id={id} inputMode="decimal" value={deposit} disabled={!editable} onChange={(e) => setDeposit(e.target.value)} />}
          </Field>
          {depositDiffers && <ReasonInput value={reasons.depositPercent} onChange={(v) => setReasons((x) => ({ ...x, depositPercent: v }))} />}
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <Field
            label="Utility deposit (₫)"
            helper={utilityDiffers ? t('The request asked for {value}.', { value: formatVnd(asked.utilityDeposit) }) : t('Default {amount}, collected with the balance.', { amount: formatVnd(p.defaultUtilityDeposit) })}
            error={fields.utilityDeposit}
          >
            {(id) => <Input id={id} inputMode="numeric" value={utility} disabled={!editable} onChange={(e) => setUtility(e.target.value.replace(/\D/g, ''))} />}
          </Field>
          {utilityDiffers && <ReasonInput value={reasons.utilityDeposit} onChange={(v) => setReasons((x) => ({ ...x, utilityDeposit: v }))} />}
        </div>
      </div>

      <ChangeReason w={w} value={changeReason} onChange={setChangeReason} error={fields.changeReason} />
      <StepActions
        save={save}
        next
        onPrev={onPrev}
        stepIndex={stepIndex}
        disabled={!editable || Number.isNaN(parseDecimal(deposit))}
        onSave={() =>
          save.run({
            prices: rows.map((r) => ({ roomTypeId: r.roomTypeId, roomClassId: r.roomClassId, price: r.value === '' ? null : Number(r.value) })),
            depositPercent: parseDecimal(deposit),
            utilityDeposit: utility === '' ? null : Number(utility),
            reasons: Object.fromEntries(Object.entries(reasons).filter(([k]) => k.startsWith('price:') || k === 'depositPercent' || k === 'utilityDeposit')),
            changeReason,
          })
        }
      />
    </>
  )
}

/* ---------------------------------------------------------------- 5 Rules */

function RulesStep({ w, onSaved, onPrev, stepIndex }) {
  const { save } = useStep(w, 'rules', onSaved)
  const r = w.rules
  const list = (title, items, link) => (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between border-b border-line pb-2.5">
        <h3 className="text-h3 font-semibold text-fg">{t(title)}</h3>
        {!r.fixed && link && (
          <Button variant="text" size="sm" iconAfter={ExternalLink} to={link}>
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
      <Alert type={r.fixed ? 'info' : 'warning'} title={r.fixed ? 'This term keeps the rules it opened with' : 'Publishing fixes these rules for this term'}>
        {r.fixed ? t('Later changes of the rules apply to the terms published after them.') : t('The rules in use now are copied into the term when you publish it; change them first if needed.')}
      </Alert>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {list(
          'Who may apply',
          <ul className="flex flex-col gap-2 text-base text-fg">
            {r.eligibility.map((e) => (
              <li key={e} className="flex items-center gap-2">
                <CircleCheck size={16} aria-hidden="true" className="shrink-0 text-success" />
                <span>{tr(e)}</span>
              </li>
            ))}
          </ul>,
          '/admin/eligibility',
        )}
        {list(
          'Who is placed first when beds are short',
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-base text-fg">
            {r.priorityGroups.map((g) => (
              <li key={g}>{tr(g)}</li>
            ))}
          </ol>,
          '/admin/eligibility',
        )}
        {list(
          'How roommates are matched',
          <ul className="flex flex-col gap-2 text-base">
            <li className="text-sm font-medium text-fg-tertiary">{t('Snapshot {label}', { label: r.matching })}</li>
            {r.weights.map((x) => (
              <li key={x.label} className="flex justify-between">
                <span className="text-fg">{tr(x.label)}</span>
                <span className="font-medium text-fg-secondary">{tr(x.level)}</span>
              </li>
            ))}
            <li className="flex justify-between border-t border-line pt-2">
              <span className="font-medium text-fg">{t('Roommate-preference boost')}</span>
              <span className="font-semibold text-fg-brand">{Number(r.boost) > 1 ? `×${r.boost}` : t('Off')}</span>
            </li>
          </ul>,
          '/admin/matching',
        )}
        {list(
          'Refunds',
          <ul className="flex flex-col gap-2 text-base">
            {r.refundRules.map((x) => (
              <li key={x.when} className="flex justify-between gap-3">
                <span className="text-fg">{tr(x.when)}</span>
                <span className="shrink-0 font-medium text-fg-secondary">{`${x.refundPercent}% · ${tr(x.approver)}`}</span>
              </li>
            ))}
          </ul>,
          '/admin/refunds',
        )}
      </div>
      <StepActions
        save={save}
        next
        onPrev={onPrev}
        stepIndex={stepIndex}
        disabled={false}
        onSave={r.fixed ? () => onSaved() : () => save.run({})}
      />
    </>
  )
}

/* ---------------------------------------------------------------- 6 Information */

function InformationStep({ w, onSaved, onPrev, stepIndex }) {
  const { save, fields } = useStep(w, 'information', onSaved)
  const [rules, setRules] = useState(w.information.houseRules ?? '')
  const [faq, setFaq] = useState(w.information.faq ?? [])
  const [docs, setDocs] = useState(w.information.documents ?? [])
  const [changeReason, setChangeReason] = useState('')
  const [reasons, setReasons] = useState(reasonsOf(w))
  const editable = w.editable.information
  const asked = w.request?.proposal
  const rulesDiffer = asked?.houseRules != null && asked.houseRules !== rules.trim()
  const lines = (list) => JSON.stringify(list.map((f) => ({ question: f.question.trim(), answer: f.answer.trim() })).filter((f) => f.question || f.answer))
  const faqDiffers = asked?.faq != null && lines(asked.faq) !== lines(faq)

  return (
    <>
      <SaveError save={save} />
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <h3 className="text-base font-semibold text-fg">{t('House rules')}</h3>
        <Field label="House rules content" helper="Students read them on Registration period details." error={fields.houseRules}>
          {(id) => <Textarea id={id} rows={7} value={rules} disabled={!editable} onChange={(e) => setRules(e.target.value)} />}
        </Field>
        {rulesDiffer && (
          <div className="rounded-lg border border-warning/20 bg-warning-bg p-3">
            <p className="text-sm text-fg-tertiary">{t('The request proposed other house rules.')}</p>
            <ReasonInput value={reasons.houseRules} onChange={(v) => setReasons((x) => ({ ...x, houseRules: v }))} error={fields.houseRules} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <h3 className="text-base font-semibold text-fg">{t('Questions and answers')}</h3>
            <Button size="sm" icon={Plus} disabled={!editable} onClick={() => setFaq((f) => [...f, { question: '', answer: '' }])}>
              {t('Add question')}
            </Button>
          </div>
          {faq.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-tertiary">{t('No FAQ entries added yet.')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {faq.map((f, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-lg border border-line bg-canvas/60 p-2.5">
                  <div className="flex flex-1 flex-col gap-2">
                    <Input aria-label={t('Question')} placeholder={t('Question')} value={f.question} disabled={!editable} onChange={(e) => setFaq((list) => list.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
                    <Textarea aria-label={t('Answer')} rows={2} placeholder={t('Answer')} value={f.answer} disabled={!editable} onChange={(e) => setFaq((list) => list.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
                  </div>
                  <IconButton icon={Trash2} aria-label={t('Remove question')} disabled={!editable} onClick={() => setFaq((list) => list.filter((_, j) => j !== i))} />
                </div>
              ))}
            </div>
          )}
          {fields.faq && <p className="text-sm text-error-fg">{tr(fields.faq)}</p>}
          {faqDiffers && (
            <div className="rounded-lg border border-warning/20 bg-warning-bg p-3">
              <p className="text-sm text-fg-tertiary">{t('The request proposed other questions and answers.')}</p>
              <ReasonInput value={reasons.faq} onChange={(v) => setReasons((x) => ({ ...x, faq: v }))} />
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <h3 className="text-base font-semibold text-fg">{t('Documents')}</h3>
            <Button size="sm" icon={Plus} disabled={!editable} onClick={() => setDocs((d) => [...d, { title: '', url: '' }])}>
              {t('Add document')}
            </Button>
          </div>
          {docs.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-tertiary">{t('No documents attached yet.')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {docs.map((d, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-lg border border-line bg-canvas/60 p-2.5">
                  <Input aria-label={t('Title')} className="flex-1" placeholder={t('Title')} value={d.title} disabled={!editable} onChange={(e) => setDocs((list) => list.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <Input aria-label={t('Link')} className="flex-[2]" placeholder="https://…" value={d.url} disabled={!editable} onChange={(e) => setDocs((list) => list.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                  <IconButton icon={Trash2} aria-label={t('Remove document')} disabled={!editable} onClick={() => setDocs((list) => list.filter((_, j) => j !== i))} />
                </div>
              ))}
            </div>
          )}
          {fields.documents && <p className="text-sm text-error-fg">{tr(fields.documents)}</p>}
        </section>
      </div>

      <ChangeReason w={w} value={changeReason} onChange={setChangeReason} error={fields.changeReason} />
      <StepActions
        save={save}
        next
        onPrev={onPrev}
        stepIndex={stepIndex}
        disabled={!editable}
        onSave={() => save.run({ houseRules: rules, faq, documents: docs, reasons: pick(reasons, ['houseRules', 'faq']), changeReason })}
      />
    </>
  )
}

/* ---------------------------------------------------------------- 7 Review and publish */

function ReviewStep({ w, goTo, onPrev, stepIndex }) {
  const { notify } = useToast()
  const [confirming, setConfirming] = useState(false)
  const publish = useMutation(() => api.admin.terms.publish(w.id), {
    invalidates: ['admin-terms', 'terms', 'term-wizard', 'term-requests'],
    onSuccess: () => {
      setConfirming(false)
      notify({ title: t('{name} published', { name: w.name }), message: 'Every manager is told; students read the term announcement on their board.' })
    },
    onError: () => setConfirming(false),
  })
  const prices = w.prices.rows.map((r) => r.price)
  const beds = w.rooms.beds
  const filled = Object.values(timelineForm(w.timeline.values)).filter(Boolean).length

  return (
    <>
      {publish.error && <Alert type="error" title="Could not publish">{publish.error.message}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-1.5 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">{t('Stay')}</span>
          <span className="text-base font-bold text-fg">{formatDateRange(w.general.stayStart, w.general.stayEnd)}</span>
          <span className="text-sm text-fg-secondary">{t('{n} milestones set', { n: filled })}</span>
        </Card>
        <Card className="flex flex-col gap-1.5 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">{t('Places')}</span>
          <span className="text-base font-bold text-fg">{t('{n} beds', { n: beds })}</span>
          <span className="text-sm text-fg-secondary">{w.rooms.allBlocks ? t('Every block') : w.rooms.blocks.filter((b) => b.used).map((b) => b.code).join(', ')}</span>
        </Card>
        <Card className="flex flex-col gap-1.5 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">{t('Prices per bed')}</span>
          <span className="text-base font-bold text-fg">{prices.length ? `${formatVnd(Math.min(...prices))} – ${formatVnd(Math.max(...prices))}` : '—'}</span>
          <span className="text-sm text-fg-secondary">{t('Deposit {n}% · Utility Deposit {amount}', { n: w.prices.depositPercent, amount: formatVnd(w.prices.utilityDeposit) })}</span>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <h3 className="text-h3 font-semibold text-fg">{t('Timeline')}</h3>
        <TimelineStrip form={timelineForm(w.timeline.values)} />
      </Card>

      {w.request && (
        <Card className="flex flex-col gap-3 p-4">
          <h3 className="text-h3 font-semibold text-fg">{t('Differences from {code}', { code: w.request.code })}</h3>
          <DifferencesTable differences={w.differences} />
        </Card>
      )}

      {!w.published && (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h3 className="text-h3 font-semibold text-fg">{t('Before publishing')}</h3>
            <Tag tone={w.checks.length === 0 ? 'success' : 'warning'}>
              {w.checks.length === 0 ? t('Ready to publish') : t('{n} issues to resolve', { n: w.checks.length })}
            </Tag>
          </div>
          {w.checks.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-bg p-3 text-base font-medium text-success-fg">
              <CircleCheck size={18} aria-hidden="true" />
              <span>{t('Everything is ready. All configuration requirements have been met.')}</span>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {w.checks.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning-bg px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <TriangleAlert size={16} className="shrink-0 text-warning-fg" aria-hidden="true" />
                    <span className="text-sm font-medium text-warning-fg">{c.message}</span>
                  </div>
                  <Button size="sm" onClick={() => goTo(c.step)}>
                    {t('Go to {step}', { step: t(STEPS.find((s) => s.key === c.step)?.label ?? c.step) })}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {w.published && (
        <Alert type="success" title={t('Published {date}', { date: formatDate(w.publishedAt) })}>
          {t('Money and policy fields stay editable within the rules: a date that has passed is fixed, an open deadline can only be extended, and money is locked once an invoice exists. Every change is announced to students.')}
        </Alert>
      )}

      {/* Sticky footer for review & publish */}
      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line bg-surface/95 px-6 py-3.5 shadow-card backdrop-blur-md lg:-mx-6 lg:-mb-6">
        <div className="flex items-center gap-3">
          {onPrev && (
            <Button
              variant="default"
              icon={ArrowLeft}
              onClick={onPrev}
            >
              {t('Previous')}
            </Button>
          )}
          <span className="hidden sm:inline-block text-sm font-medium text-fg-secondary">
            {t('Step {step} of {total}', { step: stepIndex + 1, total: STEPS.length })} · <strong className="text-fg">{t(STEPS[stepIndex]?.label)}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {!w.published && (
            <Button
              tip="Students see the term, its prices and its rules once it is published. Fix every check listed here first."
              variant="primary"
              icon={Rocket}
              disabled={w.checks.length > 0 || publish.pending}
              onClick={() => setConfirming(true)}
            >
              {t('Publish the term')}
            </Button>
          )}
        </div>
      </div>

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
          {t('Every student sees {name} on their board and every manager is told. Its {n} prices, deposit ({deposit}%), utility deposit and rules are fixed from then on.', {
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
  // The next step opens once the wizard is read again after the save: its form starts from the saved data (WEB-ADM-21).
  const [pendingStep, setPendingStep] = useState(null)
  useEffect(() => {
    if (pendingStep && !query.loading) {
      setParams({ step: pendingStep })
      setPendingStep(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w])
  if (w === undefined) return query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : <LoadingState />
  const index = STEPS.findIndex((s) => s.key === step)
  const next = () => {
    if (index < STEPS.length - 1) setPendingStep(STEPS[index + 1].key)
    invalidate('term-wizard')
  }
  const prev = () => {
    if (index > 0) goTo(STEPS[index - 1].key)
  }
  const props = {
    w,
    onSaved: next,
    onPrev: index > 0 ? prev : undefined,
    stepIndex: index,
  }

  return (
    <>
      <PageHeader
        title={w.name}
        badge={<Tag tone={termTone[w.status] ?? 'neutral'}>{w.status}</Tag>}
        description={`${formatDateRange(w.general.stayStart, w.general.stayEnd)}${w.request ? ` · ${t('built from {code} ({manager})', { code: w.request.code, manager: w.request.requestedBy })}` : ''}`}
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

      {/* Sticky Stepper Bar */}
      <div className="sticky top-0 z-20 -mt-2 bg-canvas/95 py-2 backdrop-blur-md">
        <nav aria-label={t('Wizard steps')} className="rounded-xl border border-line bg-surface p-2 shadow-xs">
          <ol className="flex flex-wrap items-center gap-2">
            {STEPS.map((s, i) => {
              const saved = w.published || i < (w.step ?? 1)
              const current = s.key === step
              const open = s.key === 'review' ? 0 : (w.checks ?? []).filter((c) => c.step === s.key).length
              return (
                <li key={s.key} className="flex-1 min-w-[130px]">
                  <button
                    type="button"
                    onClick={() => goTo(s.key)}
                    aria-current={current ? 'step' : undefined}
                    className={cx(
                      'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-all',
                      current
                        ? 'border-primary bg-primary-subtle font-semibold text-fg-brand shadow-xs ring-1 ring-primary/20'
                        : saved
                          ? 'border-line/70 bg-surface text-fg hover:border-primary/50 hover:bg-subtle'
                          : 'border-transparent bg-subtle/50 text-fg-secondary hover:border-line hover:text-fg',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/* A saved step is only "done" (green check) when nothing is left to fix in it; otherwise a warning. */}
                      <span
                        className={cx(
                          'flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                          current
                            ? 'bg-primary text-white'
                            : saved && open > 0
                              ? 'bg-warning-bg text-warning-fg'
                              : saved
                                ? 'bg-success text-white'
                                : 'bg-subtle text-fg-secondary',
                        )}
                      >
                        {current || !saved ? (
                          i + 1
                        ) : open > 0 ? (
                          <TriangleAlert size={12} strokeWidth={2.5} aria-label={t('{n} to fix in this step', { n: open })} />
                        ) : (
                          <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                        )}
                      </span>
                      <span className="truncate">{t(s.label)}</span>
                    </div>
                    {open > 0 && (
                      <span
                        className="flex shrink-0 items-center gap-1 rounded-full bg-warning-bg px-1.5 py-0.5 text-xs font-semibold text-warning-fg"
                        title={t('{n} to fix in this step', { n: open })}
                      >
                        <TriangleAlert size={12} aria-hidden="true" />
                        <span className="tabular">{open}</span>
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
      </div>

      {/* Main Wizard Form Card */}
      <Card padding="lg" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-brand-subtle text-xs font-bold text-fg-brand">
                {index + 1}
              </span>
              <h2 className="text-h2 font-bold tracking-tight text-fg">{t(STEPS[index]?.label ?? '')}</h2>
            </div>
            {STEPS[index]?.why && <p className="text-sm text-fg-secondary">{t(STEPS[index].why)}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Tag tone={w.published ? 'success' : 'neutral'}>
              {w.published ? t('Published') : t('Draft')}
            </Tag>
          </div>
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
        {step === 'review' && <ReviewStep w={w} goTo={goTo} onPrev={index > 0 ? prev : undefined} stepIndex={index} />}
      </Card>
    </>
  )
}
