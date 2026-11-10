import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ClipboardList, Hammer, MessageSquare, Pencil, Plus, Send, Trash2, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Card, DescriptionList } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Drawer, Modal } from '@/components/ui/Overlay'
import { EmptyBlock, LoadingState, ErrorState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Segmented } from '@/components/ui/Tabs'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { DifferencesTable, ExcludedRoomsField, MILESTONES, RequestStatus, showValue, TimelineFields, timelineBody, timelineForm } from './shared'
import { t, tr } from '@/i18n'
import { DateInput } from '@/components/ui/DatePicker'

// SCR-CFG-22 Registration-period requests (spec §6.3, D-10, D-11): Managers ask the Admin to open a Term; Managers
// and the Admin read and comment; the Admin answers and builds the Term from a request in the wizard.
// GET /term-requests?status&q&page&pageSize → { items: [{ id, code, termName, stayStart, stayEnd, status, requestedBy,
//   requestedAt, updatedAt, comments, termId }], total, counts }
// GET /term-requests/:id → { …, timeline, blocks, excludedRooms, places, prices, notes, decisionNote, term, differences,
//   history: [{ kind, actor, note, at }], actions: { edit, comment, decide, build } }
// POST /term-requests · PUT /term-requests/:id · POST /term-requests/:id/comments { text } ·
// POST /term-requests/:id/decision { status, note } · POST /admin/terms/drafts { requestId } (Build the Term from this request)

const FILTERS = [
  { value: 'Open', label: 'Open' },
  { value: '', label: 'All' },
  { value: 'Done', label: 'Done' },
  { value: 'Rejected', label: 'Rejected' },
]

const GENDERS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
]

/** BR-10: base × (1 + surcharge), rounded up to the pricing step. */
const priceOf = (base, percent, step) => Math.ceil((Number(base) * (100 + Number(percent))) / 100 / step) * step

const digits = (v) => String(v ?? '').replace(/\D/g, '')
const decimal = (v) => String(v ?? '').replace(/[^\d.]/g, '')

/** Ticked ids, or every option when the request offers every one (empty list). */
const tickedOf = (sent, options) => new Set(sent?.length ? sent : options.map((o) => o.id))

/**
 * The Manager's form (spec §6.3 step 1, review R-02, R-03): dates and milestones, what the Term offers (Blocks, Rooms,
 * Room Types, Room Classes), places, prices as a base price per Room Type and a surcharge per Room Class, money and
 * information for students.
 */
function RequestForm({ request, onClose, onSaved }) {
  const { blocks } = useSession()
  const defaults = useQuery(['term-request-defaults'], ({ signal }) => api.termRequests.defaults(undefined, { signal }))
  if (!defaults.data) {
    return (
      <Drawer open onClose={onClose} width={880} title={request?.id ? t('Change {code}', { code: request.code }) : 'Request a registration period'}>
        {defaults.error ? <ErrorState error={defaults.error} onRetry={defaults.reload} /> : <LoadingState />}
      </Drawer>
    )
  }
  return <RequestFormBody request={request} defaults={defaults.data} blocks={blocks} onClose={onClose} onSaved={onSaved} />
}

function RequestFormBody({ request, defaults, blocks, onClose, onSaved }) {
  const types = defaults.roomTypes
  const classes = defaults.roomClasses
  const settings = request?.settings
  const [form, setForm] = useState(() => ({
    termName: request?.termName ?? '',
    stayStart: request?.stayStart ?? '',
    stayEnd: request?.stayEnd ?? '',
    timeline: timelineForm(request?.timeline),
    blocks: new Set(request?.blocks ?? []),
    excludedRooms: request?.excludedRooms ?? [],
    roomTypes: tickedOf(settings?.roomTypes?.map((x) => x.id), types),
    roomClasses: tickedOf(settings?.roomClasses?.map((x) => x.id), classes),
    places: request?.places?.map((p) => ({ roomTypeId: p.roomTypeId, roomClassId: p.roomClassId, gender: p.gender, places: String(p.places) })) ?? [],
    basePrices: Object.fromEntries(types.map((x) => [x.id, String(request?.basePrices?.find((b) => b.roomTypeId === x.id)?.price ?? x.basePrice)])),
    surcharges: Object.fromEntries(classes.map((x) => [x.id, String(request?.surcharges?.find((c) => c.roomClassId === x.id)?.percent ?? x.surchargePercent)])),
    depositPercent: String(settings?.depositPercent ?? defaults.depositPercent),
    utilityDeposit: String(settings?.utilityDeposit ?? defaults.utilityDeposit),
    reservedNewPercent: String(settings?.reservedNewPercent ?? defaults.reservedNewPercent),
    houseRules: settings?.houseRules ?? defaults.houseRules ?? '',
    faq: settings?.faq ?? defaults.faq ?? [],
    notes: request?.notes ?? '',
  }))
  const [fields, setFields] = useState({})
  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    setFields((f) => ({ ...f, [key]: undefined }))
  }
  const offeredTypes = types.filter((x) => form.roomTypes.has(x.id))
  const offeredClasses = classes.filter((x) => form.roomClasses.has(x.id))
  const all = (ticked, options) => ticked.size === options.length
  const body = () => ({
    termName: form.termName.trim(),
    stayStart: form.stayStart || null,
    stayEnd: form.stayEnd || null,
    timeline: timelineBody(form.timeline),
    blocks: blocks.filter((b) => form.blocks.has(b)),
    excludedRooms: form.excludedRooms,
    roomTypes: all(form.roomTypes, types) ? [] : [...form.roomTypes],
    roomClasses: all(form.roomClasses, classes) ? [] : [...form.roomClasses],
    places: form.places.filter((p) => p.places !== '' && form.roomTypes.has(p.roomTypeId) && form.roomClasses.has(p.roomClassId)).map((p) => ({ ...p, places: Number(p.places) })),
    basePrices: offeredTypes.filter((x) => form.basePrices[x.id] !== '').map((x) => ({ roomTypeId: x.id, price: Number(form.basePrices[x.id]) })),
    surcharges: offeredClasses.filter((x) => form.surcharges[x.id] !== '').map((x) => ({ roomClassId: x.id, percent: Number(form.surcharges[x.id]) })),
    reservedNewPercent: form.reservedNewPercent === '' ? null : Number(form.reservedNewPercent),
    depositPercent: form.depositPercent === '' ? null : Number(form.depositPercent),
    utilityDeposit: form.utilityDeposit === '' ? null : Number(form.utilityDeposit),
    houseRules: form.houseRules.trim() || null,
    faq: form.faq,
    notes: form.notes.trim(),
  })
  const save = useMutation(() => (request?.id ? api.termRequests.update(request.id, body()) : api.termRequests.create(body())), {
    invalidates: ['term-requests'],
    onSuccess: (res) => onSaved(res?.id ?? request?.id),
    onError: (err) => setFields(err.fields ?? {}),
  })
  const toggle = (key, id) => {
    const next = new Set(form[key])
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set(key, next)
  }
  const fieldError = (key) => fields[key] && <p className="text-sm text-error-fg">{tr(fields[key])}</p>

  return (
    <Drawer
      open
      onClose={onClose}
      width={880}
      title={request?.id ? t('Change {code}', { code: request.code }) : 'Request a registration period'}
      description="The Admin and the other Managers are told. The Admin builds the Term from it and tells you every value that changes."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Send} disabled={!form.termName.trim() || save.pending} onClick={() => save.run()}>
            {request?.status === 'Needs changes' ? t('Send again') : request?.id ? t('Save changes') : t('Send request')}
          </Button>
        </>
      }
    >
      {save.error && !Object.keys(save.error.fields ?? {}).length && <Alert type="error" title="Could not send the request">{save.error.message}</Alert>}
      {request?.decisionNote && request.status === 'Needs changes' && (
        <Alert type="warning" title="The Admin asked for changes">{request.decisionNote}</Alert>
      )}
      <div className="grid grid-cols-3 gap-4">
        <Field label="Term" required error={fields.termName} helper="e.g. Spring 2027">
          {(id) => <Input id={id} value={form.termName} onChange={(e) => set('termName', e.target.value)} />}
        </Field>
        <Field label="Stay starts" required error={fields.stayStart}>
          {(id) => <DateInput id={id} value={form.stayStart} onChange={(e) => set('stayStart', e.target.value)} />}
        </Field>
        <Field label="Stay ends" required error={fields.stayEnd}>
          {(id) => <DateInput id={id} value={form.stayEnd} onChange={(e) => set('stayEnd', e.target.value)} />}
        </Field>
      </div>
      <TimelineFields
        form={form.timeline}
        onChange={(timeline) => set('timeline', timeline)}
        errors={fields}
        showRenewal
        renewalNote="Fill these in when residents of the Term before continue into this one; leave them empty otherwise."
      />
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium text-fg-secondary">{t('What the Term offers')}</h3>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {blocks.map((b) => (
            <Checkbox key={b} label={t('Block {code}', { code: b })} checked={form.blocks.has(b)} onChange={() => toggle('blocks', b)} />
          ))}
        </div>
        <p className="text-sm text-fg-tertiary">{t('No Block ticked: every Block.')}</p>
        {fieldError('blocks')}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-fg-secondary">{t('Room Types offered')}</span>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {types.map((x) => (
                <Checkbox key={x.id} label={tr(x.name)} checked={form.roomTypes.has(x.id)} onChange={() => toggle('roomTypes', x.id)} />
              ))}
            </div>
            {fieldError('roomTypes')}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-fg-secondary">{t('Room Classes offered')}</span>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {classes.map((x) => (
                <Checkbox key={x.id} label={tr(x.name)} checked={form.roomClasses.has(x.id)} onChange={() => toggle('roomClasses', x.id)} />
              ))}
            </div>
            {fieldError('roomClasses')}
          </div>
        </div>
        <ExcludedRoomsField label="Rooms to leave out" helper="One column of Room codes in an Excel or CSV file; the assignment and Round 2 never use these Rooms." codes={form.excludedRooms} onChange={(v) => set('excludedRooms', v)} error={fields.excludedRooms} />
      </section>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-fg-secondary">{t('Places for new students')}</h3>
          <Button
            icon={Plus}
            size="sm"
            disabled={!offeredTypes.length || !offeredClasses.length}
            onClick={() => set('places', [...form.places, { roomTypeId: offeredTypes[0]?.id, roomClassId: offeredClasses[0]?.id, gender: 'M', places: '' }])}
          >
            Add line
          </Button>
        </div>
        {form.places.length === 0 && <p className="text-sm text-fg-tertiary">{t('Optional: the places you want per Room Type, Room Class and gender.')}</p>}
        {form.places.map((p, i) => (
          <div key={i} className="flex items-end gap-3">
            <Select wrapperClassName="flex-1" aria-label={t('Room Type')} value={p.roomTypeId} options={offeredTypes.map((x) => ({ value: x.id, label: x.name }))} onChange={(e) => set('places', form.places.map((x, j) => (j === i ? { ...x, roomTypeId: e.target.value } : x)))} />
            <Select wrapperClassName="flex-1" aria-label={t('Room Class')} value={p.roomClassId} options={offeredClasses.map((x) => ({ value: x.id, label: x.name }))} onChange={(e) => set('places', form.places.map((x, j) => (j === i ? { ...x, roomClassId: e.target.value } : x)))} />
            <Select wrapperClassName="w-32" aria-label={t('Gender')} value={p.gender} options={GENDERS} onChange={(e) => set('places', form.places.map((x, j) => (j === i ? { ...x, gender: e.target.value } : x)))} />
            <div className="w-28 shrink-0">
              <Input aria-label={t('Places')} inputMode="numeric" value={p.places} placeholder="Places" onChange={(e) => set('places', form.places.map((x, j) => (j === i ? { ...x, places: digits(e.target.value) } : x)))} />
            </div>
            <IconButton icon={Trash2} aria-label={t('Remove line')} onClick={() => set('places', form.places.filter((_, j) => j !== i))} />
          </div>
        ))}
        {fieldError('places')}
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base font-medium text-fg-secondary">{t('Proposed prices')}</h3>
          <p className="text-sm text-fg-tertiary">{t('A base price per Bed for each Room Type and a surcharge for each Room Class; the price per Bed is base × (1 + surcharge), rounded up to {step}. Filled with today’s values.', { step: formatVnd(defaults.priceStep) })}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            {offeredTypes.map((x) => (
              <Field key={x.id} label={t('Base price · {name} (VND)', { name: tr(x.name) })} helper={Number(form.basePrices[x.id]) !== x.basePrice ? t('Today {amount}', { amount: formatVnd(x.basePrice) }) : undefined}>
                {(id) => <Input id={id} inputMode="numeric" value={form.basePrices[x.id]} onChange={(e) => set('basePrices', { ...form.basePrices, [x.id]: digits(e.target.value) })} />}
              </Field>
            ))}
            {fieldError('basePrices')}
          </div>
          <div className="flex flex-col gap-2">
            {offeredClasses.map((x) => (
              <Field key={x.id} label={t('Surcharge · {name} (%)', { name: tr(x.name) })} helper={Number(form.surcharges[x.id]) !== Number(x.surchargePercent) ? t('Today {n}%', { n: x.surchargePercent }) : undefined}>
                {(id) => <Input id={id} inputMode="decimal" value={form.surcharges[x.id]} onChange={(e) => set('surcharges', { ...form.surcharges, [x.id]: decimal(e.target.value) })} />}
              </Field>
            ))}
            {fieldError('surcharges')}
          </div>
        </div>
        {offeredTypes.length > 0 && offeredClasses.length > 0 && (
          <Table>
            <THead>
              <tr>
                <Th>Price per Bed</Th>
                {offeredClasses.map((c) => (
                  <Th key={c.id} align="right">
                    {`${tr(c.name)} (+${form.surcharges[c.id] || 0}%)`}
                  </Th>
                ))}
              </tr>
            </THead>
            <TBody>
              {offeredTypes.map((x) => (
                <Tr key={x.id}>
                  <Td>{tr(x.name)}</Td>
                  {offeredClasses.map((c) => (
                    <Td key={c.id} align="right" className="tabular">
                      {form.basePrices[x.id] && form.surcharges[c.id] !== '' ? formatVnd(priceOf(form.basePrices[x.id], form.surcharges[c.id], defaults.priceStep)) : '—'}
                    </Td>
                  ))}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        {fieldError('prices')}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-base font-medium text-fg-secondary">{t('Money and capacity')}</h3>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Deposit (% of the price)" error={fields.depositPercent} helper={t('Today {n}%', { n: defaults.depositPercent })}>
            {(id) => <Input id={id} inputMode="decimal" value={form.depositPercent} onChange={(e) => set('depositPercent', decimal(e.target.value))} />}
          </Field>
          <Field label="Utility Deposit (VND)" error={fields.utilityDeposit} helper={t('Today {amount}', { amount: formatVnd(defaults.utilityDeposit) })}>
            {(id) => <Input id={id} inputMode="numeric" value={form.utilityDeposit} onChange={(e) => set('utilityDeposit', digits(e.target.value))} />}
          </Field>
          <Field label="Beds kept for new students (%)" error={fields.reservedNewPercent} helper={t('Today {n}%', { n: defaults.reservedNewPercent })}>
            {(id) => <Input id={id} inputMode="decimal" value={form.reservedNewPercent} onChange={(e) => set('reservedNewPercent', decimal(e.target.value))} />}
          </Field>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-base font-medium text-fg-secondary">{t('Information for students')}</h3>
        <Field label="House rules" error={fields.houseRules} helper="Filled with the latest Term’s rules; students read them before they apply.">
          {(id) => <Textarea id={id} rows={4} value={form.houseRules} onChange={(e) => set('houseRules', e.target.value)} />}
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-fg-secondary">{t('Questions and answers')}</span>
          <Button size="sm" icon={Plus} onClick={() => set('faq', [...form.faq, { question: '', answer: '' }])}>
            Add question
          </Button>
        </div>
        {form.faq.map((f, i) => (
          <div key={i} className="flex items-start gap-3">
            <Input aria-label={t('Question')} className="flex-1" placeholder="Question" value={f.question} onChange={(e) => set('faq', form.faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
            <Textarea aria-label={t('Answer')} className="flex-[2]" rows={2} placeholder="Answer" value={f.answer} onChange={(e) => set('faq', form.faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
            <IconButton icon={Trash2} aria-label={t('Remove question')} onClick={() => set('faq', form.faq.filter((_, j) => j !== i))} />
          </div>
        ))}
        {fieldError('faq')}
      </section>
      <Field label="Notes for the Admin" error={fields.notes}>
        {(id) => <Textarea id={id} rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
      </Field>
    </Drawer>
  )
}

/** In progress, Needs changes (with a note) or Rejected (with a reason). */
function DecisionModal({ request, status, onClose }) {
  const { notify } = useToast()
  const [note, setNote] = useState('')
  const decide = useMutation(() => api.termRequests.decide(request.id, { status, note: note.trim() }), {
    invalidates: ['term-requests', 'term-request'],
    onSuccess: () => {
      notify({ title: t('{code}: {status}', { code: request.code, status: t(status) }), message: 'The Manager who sent it is told.' })
      onClose()
    },
    onError: () => {},
  })
  const needsNote = status !== 'In progress'
  return (
    <Modal
      open
      onClose={onClose}
      title={status === 'Rejected' ? t('Reject {code}', { code: request.code }) : t('Ask for changes to {code}', { code: request.code })}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={status === 'Rejected' ? 'danger' : 'primary'} disabled={(needsNote && !note.trim()) || decide.pending} onClick={() => decide.run()}>
            {status === 'Rejected' ? 'Reject request' : 'Send back'}
          </Button>
        </>
      }
    >
      {decide.error && <Alert type="error" title="Could not save">{decide.error.message}</Alert>}
      <Field label={status === 'Rejected' ? 'Reason' : 'What should change?'} required>
        {(id) => <Textarea id={id} rows={4} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
    </Modal>
  )
}

const percent = (n) => `${n}%`

/** What the Term offers and the money and information the Manager proposed (review R-03). */
function SettingsCard({ settings: s }) {
  if (!s) return null
  const row = (label, value, today) => (
    <li key={label} className="flex justify-between gap-3 text-base">
      <span className="text-fg-secondary">{t(label)}</span>
      <span className="flex flex-col items-end">
        <span className="font-medium text-fg">{value ?? '—'}</span>
        {value != null && today != null && today !== value && <span className="text-sm text-fg-tertiary">{t('Today {value}', { value: today })}</span>}
      </span>
    </li>
  )
  return (
    <Card className="flex flex-col gap-2">
      <h3 className="text-h3 font-semibold text-fg">{t('Offer and money')}</h3>
      <ul className="flex flex-col gap-1.5">
        {row('Room Types offered', s.roomTypes.length ? s.roomTypes.map((x) => tr(x.name)).join(', ') : t('All'))}
        {row('Room Classes offered', s.roomClasses.length ? s.roomClasses.map((x) => tr(x.name)).join(', ') : t('All'))}
        {row('Deposit', s.depositPercent != null ? percent(s.depositPercent) : null, percent(s.defaultDepositPercent))}
        {row('Utility Deposit', s.utilityDeposit != null ? formatVnd(s.utilityDeposit) : null, formatVnd(s.defaultUtilityDeposit))}
        {row('Beds kept for new students', s.reservedNewPercent != null ? percent(s.reservedNewPercent) : null, percent(s.defaultReservedNewPercent))}
      </ul>
      {s.houseRules && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-fg-secondary">{t('House rules')}</span>
          <p className="text-base whitespace-pre-wrap text-fg">{s.houseRules}</p>
        </div>
      )}
      {s.faq?.length > 0 && <p className="text-sm text-fg-tertiary">{t(s.faq.length === 1 ? '{n} question and answer' : '{n} questions and answers', { n: s.faq.length })}</p>}
    </Card>
  )
}

/** Base prices and surcharges with the price table they give (read-only, BR-10). */
function PricesCard({ r }) {
  if (!r.prices?.length) {
    return (
      <Card className="flex flex-col gap-2">
        <h3 className="text-h3 font-semibold text-fg">{t('Prices per Bed')}</h3>
        <p className="text-sm text-fg-tertiary">{t('No prices proposed.')}</p>
      </Card>
    )
  }
  const types = [...new Map(r.prices.map((p) => [p.roomTypeId, p.roomType])).entries()]
  const classes = [...new Map(r.prices.map((p) => [p.roomClassId, p.roomClass])).entries()]
  const price = (type, cls) => r.prices.find((p) => p.roomTypeId === type && p.roomClassId === cls)
  const base = (type) => r.basePrices?.find((b) => b.roomTypeId === type)
  const surcharge = (cls) => r.surcharges?.find((c) => c.roomClassId === cls)
  return (
    <Card className="flex flex-col gap-2">
      <h3 className="text-h3 font-semibold text-fg">{t('Prices per Bed')}</h3>
      {r.basePrices?.length > 0 && <p className="text-sm text-fg-tertiary">{t('Price per Bed = base price × (1 + Room Class surcharge), rounded up. Today’s values in grey.')}</p>}
      <Table>
        <THead>
          <tr>
            <Th>Room Type</Th>
            {classes.map(([id, name]) => {
              const c = surcharge(id)
              return (
                <Th key={id} align="right">
                  {c ? `${tr(name)} (+${c.percent}%)` : tr(name)}
                  {c && c.percent !== c.defaultPercent && <span className="block text-sm font-normal text-fg-tertiary">{t('Today {n}%', { n: c.defaultPercent })}</span>}
                </Th>
              )
            })}
          </tr>
        </THead>
        <TBody>
          {types.map(([id, name]) => {
            const b = base(id)
            return (
              <Tr key={id}>
                <Td>
                  <div className="flex flex-col gap-0.5 py-1">
                    <span className="font-medium text-fg">{tr(name)}</span>
                    {b && <span className="text-sm text-fg-tertiary">{t('base {amount}', { amount: formatVnd(b.price) })}{b.price !== b.defaultPrice ? ` · ${t('Today {amount}', { amount: formatVnd(b.defaultPrice) })}` : ''}</span>}
                  </div>
                </Td>
                {classes.map(([cls]) => {
                  const p = price(id, cls)
                  return (
                    <Td key={cls} align="right" className="tabular">
                      {p ? (
                        <span className="flex flex-col items-end">
                          <span className="font-medium text-fg">{formatVnd(p.price)}</span>
                          {p.defaultPrice != null && p.defaultPrice !== p.price && <span className="text-sm text-fg-tertiary">{t('Default {price}', { price: formatVnd(p.defaultPrice) })}</span>}
                        </span>
                      ) : (
                        '—'
                      )}
                    </Td>
                  )
                })}
              </Tr>
            )
          })}
        </TBody>
      </Table>
    </Card>
  )
}

function RequestDetail({ id, onEdit }) {
  const { notify } = useToast()
  const navigate = useNavigate()
  const query = useQuery(['term-request', id], ({ signal }) => api.termRequests.get(id, { signal }))
  const [comment, setComment] = useState('')
  const [deciding, setDeciding] = useState(null)
  const send = useMutation(() => api.termRequests.comment(id, { text: comment.trim() }), {
    invalidates: ['term-request', 'term-requests'],
    onSuccess: () => setComment(''),
    onError: () => {},
  })
  const progress = useMutation(() => api.termRequests.decide(id, { status: 'In progress' }), {
    invalidates: ['term-request', 'term-requests'],
    onSuccess: () => notify({ title: 'Taken in progress', message: 'The Manager is told that you are working on it.' }),
    onError: () => {},
  })
  const build = useMutation(() => api.admin.terms.createDraft({ requestId: id }), {
    invalidates: ['term-requests', 'admin-terms'],
    onSuccess: (res) => navigate(`/admin/terms/${res.id}`),
    onError: () => {},
  })

  if (query.data === undefined) return query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : <LoadingState />
  const r = query.data
  const filled = MILESTONES.filter((m) => r.timeline?.[m.key] != null)
  const error = send.error ?? progress.error ?? build.error
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-3">
            <h2 className="text-h2 font-semibold text-fg">{r.termName}</h2>
            <RequestStatus status={r.status} />
          </div>
          <p className="text-sm text-fg-tertiary">
            {t('{code} · sent by {name} on {date}', { code: r.code, name: r.requestedBy, date: formatDateTime(r.requestedAt) })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.actions.edit && (
            <Button icon={Pencil} onClick={() => onEdit(r)}>
              Change
            </Button>
          )}
          {r.actions.decide && r.status === 'Submitted' && (
            <Button onClick={() => progress.run()} disabled={progress.pending}>
              Take in progress
            </Button>
          )}
          {r.actions.decide && r.status !== 'Needs changes' && <Button onClick={() => setDeciding('Needs changes')}>Ask for changes</Button>}
          {r.actions.decide && (
            <Button variant="danger" icon={X} onClick={() => setDeciding('Rejected')}>
              Reject
            </Button>
          )}
          {r.actions.build && (
            <Button variant="primary" icon={Hammer} onClick={() => (r.term ? navigate(`/admin/terms/${r.term.id}`) : build.run())} disabled={build.pending}>
              {r.term ? t('Open the Term') : t('Build the Term from this request')}
            </Button>
          )}
        </div>
      </div>
      {error && <Alert type="error" title="Could not save">{error.message}</Alert>}
      {r.decisionNote && (
        <Alert type={r.status === 'Rejected' ? 'error' : 'warning'} title={r.status === 'Rejected' ? 'Rejected' : 'Changes asked'}>
          {r.decisionNote}
        </Alert>
      )}
      {r.term && (
        <Alert type={r.term.status === 'Published' ? 'success' : 'info'} title={r.term.status === 'Published' ? t('{name} is published', { name: r.term.name }) : t('Draft built: {name}', { name: r.term.name })}>
          {r.term.status === 'Published' ? t('The Term opened with the values below; differences from this request are listed with their reasons.') : t('The Admin is building the Term; differences from this request appear below.')}
        </Alert>
      )}
      <DescriptionList
        columns={2}
        items={[
          ['Stay', `${formatDate(r.stayStart)} – ${formatDate(r.stayEnd)}`],
          ['Blocks', r.blocks?.length ? r.blocks.map((b) => t('Block {code}', { code: b })).join(', ') : t('Every Block')],
          ['Rooms left out', r.excludedRooms?.length ? r.excludedRooms.join(', ') : '—'],
          ['Notes', r.notes || '—'],
        ]}
      />
      <Card className="flex flex-col gap-2">
        <h3 className="text-h3 font-semibold text-fg">{t('Milestones')}</h3>
        {filled.length ? (
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {filled.map((m) => (
              <li key={m.key} className="flex justify-between gap-3 text-base">
                <span className="text-fg-secondary">{t(m.label)}</span>
                <span className="font-medium text-fg tabular">{showValue(m.type, r.timeline[m.key])}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-tertiary">{t('No milestone proposed.')}</p>
        )}
      </Card>
      <div className="grid grid-cols-2 gap-4">
        <Card className="flex flex-col gap-2">
          <h3 className="text-h3 font-semibold text-fg">{t('Places')}</h3>
          {r.places?.length ? (
            <ul className="flex flex-col gap-1.5">
              {r.places.map((p) => (
                <li key={`${p.roomTypeId}:${p.roomClassId}:${p.gender}`} className="flex justify-between text-base">
                  <span className="text-fg-secondary">{`${tr(p.roomType)} · ${tr(p.roomClass)} · ${t(p.gender === 'M' ? 'Male' : 'Female')}`}</span>
                  <span className="font-medium text-fg tabular">{p.places}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-tertiary">{t('No places proposed.')}</p>
          )}
        </Card>
        <SettingsCard settings={r.settings} />
      </div>
      <PricesCard r={r} />
      {r.term && (
        <Card className="flex flex-col gap-2">
          <h3 className="text-h3 font-semibold text-fg">{t('What the Admin changed')}</h3>
          <DifferencesTable differences={r.differences} />
        </Card>
      )}
      <Card className="flex flex-col gap-3">
        <h3 className="text-h3 font-semibold text-fg">{t('History and comments')}</h3>
        <ol className="flex flex-col gap-3">
          {r.history.map((h, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
              <div className="flex min-w-0 flex-col">
                <span className="text-base text-fg">
                  <span className="font-medium">{tr(h.kind)}</span>
                  {h.actor ? ` · ${h.actor}` : ''}
                </span>
                {h.note && <span className="text-base whitespace-pre-wrap text-fg-secondary">{h.note}</span>}
                <span className="text-sm text-fg-tertiary">{formatDateTime(h.at)}</span>
              </div>
            </li>
          ))}
        </ol>
        {r.actions.comment && (
          <div className="flex items-end gap-2">
            <Field label="Comment" className="flex-1">
              {(fieldId) => <Textarea id={fieldId} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Everyone on this request is told." />}
            </Field>
            <Button icon={MessageSquare} disabled={!comment.trim() || send.pending} onClick={() => send.run()}>
              Comment
            </Button>
          </div>
        )}
      </Card>
      {deciding && <DecisionModal request={r} status={deciding} onClose={() => setDeciding(null)} />}
    </div>
  )
}

export default function TermRequests() {
  const { user } = useSession()
  const { notify } = useToast()
  const manager = user?.role === 'manager'
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState('Open')
  const [editing, setEditing] = useState(null)
  const query = useQuery(['term-requests', status], ({ signal }) => api.termRequests.list({ status: status || undefined, pageSize: 100 }, { signal }))
  const items = useMemo(() => query.data?.items ?? [], [query.data])
  const selected = params.get('id') ?? items[0]?.id ?? null
  const counts = query.data?.counts ?? {}
  const open = (counts.Submitted ?? 0) + (counts['In progress'] ?? 0) + (counts['Needs changes'] ?? 0)

  return (
    <>
      <PageHeader
        title="Registration-period requests"
        description={manager ? 'Ask the Admin to open a Term with its dates, Rooms, places and prices; follow every answer here.' : 'Requests from Managers to open a Term. Build the Term from one in the wizard.'}
        actions={
          manager && (
            <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
              Request a registration period
            </Button>
          )
        }
      />
      <div className="flex shrink-0 items-center gap-3">
        <Segmented
          options={FILTERS.map((f) => ({ value: f.value, label: f.value === 'Open' ? `${t('Open')} · ${open}` : f.value ? `${t(f.label)} · ${counts[f.value] ?? 0}` : t(f.label) }))}
          value={status}
          onChange={setStatus}
        />
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 w-120 shrink-0 flex-col">
          <Table fill>
            <THead>
              <tr>
                <Th>Request</Th>
                <Th className="w-36">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={query} colSpan={2} emptyIcon={ClipboardList} emptyTitle="No requests" emptyText={manager ? 'Request a registration period to start one.' : undefined} />
              {items.map((r) => (
                <Tr key={r.id} selected={r.id === selected} onClick={() => setParams({ id: r.id })}>
                  <Td>
                    <TwoLine
                      primary={`${r.code} · ${r.termName}`}
                      secondary={`${formatDate(r.stayStart)} – ${formatDate(r.stayEnd)} · ${r.requestedBy ?? ''}${r.comments ? ` · ${t(r.comments === 1 ? '{n} comment' : '{n} comments', { n: r.comments })}` : ''}`}
                    />
                  </Td>
                  <Td>
                    <RequestStatus status={r.status} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
        <Card padding="lg" className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selected ? <RequestDetail key={selected} id={selected} onEdit={(r) => setEditing(r)} /> : <EmptyBlock icon={ClipboardList} title="Select a request" />}
        </Card>
      </div>
      {editing && (
        <RequestForm
          request={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            notify({ title: editing.id ? t('Request updated') : t('Request sent'), message: 'The Admin and the other Managers are told.' })
            setEditing(null)
            setParams({ id })
          }}
        />
      )}
    </>
  )
}
