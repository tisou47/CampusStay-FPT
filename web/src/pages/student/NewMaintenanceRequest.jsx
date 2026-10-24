import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, Upload, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Checkbox, Radio } from '@/components/ui/Choice'
import { Alert, Card, StepIndicator } from '@/components/ui/Display'
import { Field, Input, Select, StaticField, Textarea } from '@/components/ui/Field'
import { StudentPage } from './shared'
import { useMyAllocation } from './swap'
import { t, tr } from '@/i18n'
import { formatNumber } from '@/lib/format'

// SCR-MNT-02 New Maintenance Request (Figma 41:1719)
// GET /maintenance-requests/options → { categories, locations }
// POST /maintenance-requests (multipart) title, description, category, location, urgency, staffMayEnter, photos[] → { id }
const MAX_DESCRIPTION = 1000
const MAX_PHOTOS = 3
const nextSteps = ['Submitted', 'Assigned to Staff', 'In progress', 'Resolved', 'You confirm the fix']

export default function NewMaintenanceRequest() {
  const navigate = useNavigate()
  const { notify } = useToast()
  const fileInput = useRef(null)
  const options = useQuery(['maintenance-options'], ({ signal }) => api.maintenance.options({ for: 'student' }, { signal }))
  const allocation = useMyAllocation()
  const a = allocation.data?.allocation
  const [form, setForm] = useState({ category: '', location: '', title: '', description: '', urgency: 'Normal', entry: true })
  const [photos, setPhotos] = useState([]) // { file, url }
  const [touched, setTouched] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const titleError = touched && !form.title.trim() ? t('Enter a short title.') : undefined
  const descriptionError = touched && !form.description.trim() ? t('Describe the problem.') : undefined
  const categoryError = touched && !form.category ? t('Choose a category.') : undefined

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos])

  const addPhotos = (e) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    setPhotos((list) => [...list, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS))
    e.target.value = ''
  }

  const submit = useMutation(
    () => {
      const data = new FormData()
      data.set('title', form.title.trim())
      data.set('description', form.description.trim())
      data.set('category', form.category)
      data.set('location', form.location)
      data.set('urgency', form.urgency)
      data.set('staffMayEnter', String(form.entry))
      photos.forEach((p) => data.append('photos', p.file))
      return api.maintenance.create(data)
    },
    {
      invalidates: ['requests', 'home'],
      onSuccess: (result) => {
        notify({ title: 'Request submitted', message: t('{id} was sent to the maintenance staff.', { id: result?.id ?? t('Your request') }) })
        navigate('/student/requests')
      },
      onError: () => {},
    },
  )

  const onSubmit = () => {
    setTouched(true)
    if (!form.title.trim() || !form.description.trim() || !form.category) return
    submit.run()
  }

  return (
    <StudentPage breadcrumb={[{ label: 'Requests', to: '/student/requests' }, { label: 'New maintenance request' }]} title="New maintenance request">
      <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
        <Card padding="lg" className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
            {submit.error && (
              <Alert type="error" title="Could not submit the request">
                {submit.error.message}
              </Alert>
            )}
            {!a && allocation.data && (
              <Alert type="warning" title="You have no Room this Term">
                Maintenance requests are for the Room you live in.
              </Alert>
            )}
            <Field label="Location" helper="Filled in from your Allocation.">
              <StaticField size="lg" className="text-fg-disabled">
                {a ? [t('{room} · Bed {bed}', { room: a.room, bed: a.bed }), tr(a.block), tr(a.floor)].filter(Boolean).join(' · ') : '—'}
              </StaticField>
            </Field>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
              <Field label="Category" required className="flex-1" error={categoryError}>
                {(id) => (
                  <Select
                    id={id}
                    size="lg"
                    value={form.category}
                    onChange={set('category')}
                    invalid={Boolean(categoryError)}
                    options={[{ value: '', label: 'Choose…', disabled: true }, ...(options.data?.categories ?? [])]}
                  />
                )}
              </Field>
              <Field label="Where in the Room" className="flex-1">
                {(id) => <Select id={id} size="lg" value={form.location} onChange={set('location')} options={[{ value: '', label: 'Choose…', disabled: true }, ...(options.data?.locations ?? [])]} />}
              </Field>
            </div>
            <Field label="Title" required error={titleError}>
              {(id) => <Input id={id} size="lg" value={form.title} onChange={set('title')} invalid={Boolean(titleError)} maxLength={120} placeholder="e.g. Shower drain is blocked" />}
            </Field>
            <Field label="Description" required error={descriptionError} helper={t('{n} / {max} characters', { n: formatNumber(form.description.length), max: formatNumber(MAX_DESCRIPTION) })}>
              {(id) => <Textarea id={id} size="lg" rows={3} value={form.description} onChange={set('description')} invalid={Boolean(descriptionError)} maxLength={MAX_DESCRIPTION} />}
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-base font-medium text-fg">{t('How urgent is it?')}</legend>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
                <Radio name="urgency" label="Normal" checked={form.urgency === 'Normal'} onChange={() => setForm((f) => ({ ...f, urgency: 'Normal' }))} />
                <Radio name="urgency" label="Urgent: water leak, no power, safety risk" checked={form.urgency === 'Urgent'} onChange={() => setForm((f) => ({ ...f, urgency: 'Urgent' }))} />
              </div>
              <p className="text-sm text-fg-tertiary">{t('Staff set the final priority.')}</p>
            </fieldset>

            <div className="flex flex-col gap-2">
              <p className="text-base font-medium text-fg">{t('Photos (optional, up to {n})', { n: MAX_PHOTOS })}</p>
              <div className="flex items-start gap-3">
                {photos.map((p) => (
                  <button
                    key={p.url}
                    type="button"
                    title={t('Remove {name}', { name: p.file.name })}
                    onClick={() => setPhotos((list) => list.filter((x) => x !== p))}
                    className="group relative size-20 overflow-hidden rounded-md border border-line bg-subtle"
                  >
                    <img src={p.url} alt={p.file.name} className="size-full object-cover" />
                    <span className="absolute inset-0 hidden items-center justify-center bg-gray-900/45 text-white group-hover:flex">
                      <X size={20} aria-hidden="true" />
                    </span>
                  </button>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-fg-secondary hover:border-primary hover:text-fg-brand"
                  >
                    <Upload size={20} aria-hidden="true" />
                    <span className="text-sm">{t('Add photo')}</span>
                  </button>
                )}
                <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={addPhotos} />
              </div>
            </div>

            <Checkbox label="Staff may enter the Room to fix this when I am not there" checked={form.entry} onChange={(e) => setForm((f) => ({ ...f, entry: e.target.checked }))} />
          </div>

          <div className="flex shrink-0 justify-end gap-3">
            <Button size="lg" to="/student/requests">
              Cancel
            </Button>
            <Button variant="primary" size="lg" icon={Check} onClick={onSubmit} disabled={submit.pending || !a}>
              {submit.pending ? t('Submitting…') : t('Submit request')}
            </Button>
          </div>
        </Card>

        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-90 lg:gap-4 lg:overflow-y-auto">
          <Alert type="error" title="Emergency?" className="shrink-0">
            {a?.block
              ? t('For fire, flooding or electrical danger, go to the {block} desk on Floor 1 right away. Do not wait for this form.', { block: tr(a.block) })
              : t('For fire, flooding or electrical danger, go to the desk on Floor 1 right away. Do not wait for this form.')}
          </Alert>
          <Card padding="lg" className="flex shrink-0 flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">{t('What happens next')}</h2>
            <ol className="flex flex-col gap-3">
              {nextSteps.map((title, i) => (
                <li key={title} className="flex items-center gap-2">
                  <StepIndicator state={i === 0 ? 'current' : 'upcoming'} number={i + 1} />
                  <span className={i === 0 ? 'text-base font-medium text-fg' : 'text-base text-fg-tertiary'}>{t(title)}</span>
                </li>
              ))}
            </ol>
            <p className="text-sm text-fg-tertiary">{t('You get a notification at each step.')}</p>
          </Card>
        </div>
      </div>
    </StudentPage>
  )
}
