import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useMobileBar } from '@/components/layout/MobileBar'
import { StudentContainer } from '@/components/layout/StudentLayout'
import { Button } from '@/components/ui/Button'
import { Breadcrumb, Card, Divider, Note, ProgressBar, Steps } from '@/components/ui/Display'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { formatVnd } from '@/lib/format'

// SCR-APP-01 Application Wizard — shared shell for every step.
// The answers are kept as a draft in this browser tab until the Application is submitted.

const titles = {
  term: 'Term and eligibility',
  room: 'Room preference',
  roommate: 'Roommate',
  personal: 'Personal info',
  review: 'Review and submit',
}

export const stepPaths = {
  term: '/student/apply/term',
  room: '/student/apply/room',
  roommate: '/student/apply/roommate',
  personal: '/student/apply/personal',
  review: '/student/apply/review',
}

const DRAFT_KEY = 'campusstay-application-draft'

export const emptyDraft = {
  roomTypeId: null,
  roomClassId: null,
  roommate: { mode: 'invite', code: '', verifiedCode: null, rejected: false, checksLeft: null, preferencesOn: false, preferences: {} },
  contact: null, // filled from the student profile on the Personal info step
  consent: { matching: false, rules: false },
}

function readDraft() {
  try {
    return { ...emptyDraft, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY)) }
  } catch {
    return emptyDraft
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
}

/** Catalog of the Term being applied for: Room Types, Room Classes, prices, deposit rate, form options. */
export function useCatalog() {
  const { term } = useSession()
  return useQuery(['catalog', term?.id], ({ signal }) => api.catalog.get({ termId: term?.id }, { signal }), { enabled: Boolean(term) })
}

/** Helpers over the catalog response. */
export function catalogHelpers(catalog) {
  const roomType = (id) => catalog?.roomTypes?.find((t) => t.id === id) ?? null
  const roomClass = (id) => catalog?.roomClasses?.find((c) => c.id === id) ?? null
  const termPrice = (typeId, classId) => catalog?.prices?.find((p) => p.roomTypeId === typeId && p.roomClassId === classId)?.termPrice ?? null
  const fromPrice = (typeId) => {
    const list = (catalog?.prices ?? []).filter((p) => p.roomTypeId === typeId).map((p) => p.termPrice)
    return list.length ? Math.min(...list) : null
  }
  const breakdown = (typeId, classId) => {
    const price = termPrice(typeId, classId)
    if (price == null) return { price: null, deposit: null, balance: null }
    const deposit = Math.round(price * (catalog?.depositRate ?? 0))
    return { price, deposit, balance: price - deposit }
  }
  return { roomType, roomClass, termPrice, fromPrice, breakdown }
}

/** A Room Type with two Beds lets the student name or be matched with one roommate. */
export const isTwoBed = (roomType) => roomType?.beds === 2

export function wizardSteps(roomType) {
  return isTwoBed(roomType) ? ['term', 'room', 'roommate', 'personal', 'review'] : ['term', 'room', 'personal', 'review']
}

export function useWizard() {
  const [draft, setDraftState] = useState(readDraft)
  const catalog = useCatalog()
  const helpers = catalogHelpers(catalog.data)
  const roomType = helpers.roomType(draft.roomTypeId)
  const steps = wizardSteps(roomType)

  const setDraft = useCallback((patch) => {
    setDraftState((d) => {
      const next = typeof patch === 'function' ? patch(d) : { ...d, ...patch }
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const next = (key) => stepPaths[steps[steps.indexOf(key) + 1]]
  const prev = (key) => stepPaths[steps[steps.indexOf(key) - 1]]
  return { draft, setDraft, catalog, helpers, roomType, steps, next, prev }
}

// Missing selections read "Not selected" (tertiary); missing prices read "—".
function SummaryRow({ label, value, empty = 'Not selected', brand }) {
  let tone = 'text-fg'
  if (value) tone = brand ? 'font-medium text-fg-brand' : 'text-fg'
  else if (brand) tone = 'font-medium text-fg-tertiary'
  else if (empty !== '—') tone = 'text-fg-tertiary'
  return (
    <div className="flex items-start justify-between gap-3 text-base">
      <span className="shrink-0 text-fg-secondary">{label}</span>
      <span className={cx('min-w-0 text-right', tone)}>{value || empty}</span>
    </div>
  )
}

export function classLabel(roomClass) {
  return roomClass ? `${roomClass.name} (+${Math.round((roomClass.surchargeRate ?? 0) * 100)}%)` : null
}

export function roommateLabel(draft, roomType) {
  if (!isTwoBed(roomType)) return 'Matched automatically'
  if (draft.roommate.mode === 'auto') return draft.roommate.preferencesOn ? 'Automatic · with preferences' : 'Match automatically'
  return draft.roommate.verifiedCode ? `Invite · ${draft.roommate.verifiedCode}` : null
}

export function SelectionSummary({ wizard }) {
  const { draft, catalog, helpers, roomType } = wizard
  const { term } = useSession()
  const { price, deposit, balance } = helpers.breakdown(draft.roomTypeId, draft.roomClassId)
  const depositRate = catalog.data?.depositRate
  return (
    <Card padding="lg" className="flex flex-col gap-3">
      <h2 className="text-h3 font-semibold text-fg">Your selection</h2>
      <SummaryRow label="Term" value={term?.name} />
      <SummaryRow label="Room Type" value={roomType?.name} />
      <SummaryRow label="Room Class" value={classLabel(helpers.roomClass(draft.roomClassId))} />
      {isTwoBed(roomType) && <SummaryRow label="Roommate" value={roommateLabel(draft, roomType)} empty="Not set" />}
      <Divider />
      <SummaryRow label="Term price per Bed" value={price != null && formatVnd(price)} empty="—" />
      <SummaryRow label={`Deposit due on submit${depositRate != null ? ` (${Math.round(depositRate * 100)}%)` : ''}`} value={deposit != null && formatVnd(deposit)} empty="—" brand />
      <SummaryRow label="Balance after Allocation" value={balance != null && formatVnd(balance)} empty="—" />
      <SummaryRow label="Utility Deposit before check-in" value={catalog.data?.utilityDeposit != null && formatVnd(catalog.data.utilityDeposit)} empty="—" />
      <Note>The dormitory assigns your Room and Bed after review. You cannot pick a specific Room.</Note>
    </Card>
  )
}

/**
 * One-screen wizard frame: title and steps on top; the step content scrolls inside its column
 * if it is taller than the window; Back / Continue stay pinned under it; the summary sits on the right.
 */
export function WizardLayout({ wizard, stepKey, actions, children }) {
  const { term } = useSession()
  const { catalog, steps } = wizard
  const current = steps.indexOf(stepKey)
  useMobileBar('New application', '/student/applications')
  return (
    <StudentContainer className="flex flex-col gap-3 pt-2 pb-4 lg:h-full lg:min-h-0 lg:gap-4 lg:py-6">
      <div className="flex shrink-0 flex-col gap-1 max-lg:sr-only">
        <Breadcrumb items={[{ label: 'Application', to: '/student/applications' }, { label: 'New application' }]} />
        <h1 className="text-h1 font-semibold text-fg">Dormitory application{term ? ` · ${term.name}` : ''}</h1>
      </div>
      <Card padding="none" className="hidden h-16 shrink-0 items-center px-5 lg:flex">
        <Steps steps={steps.map((s) => titles[s])} current={current} />
      </Card>
      {/* Phone: the five step labels do not fit, so the current step and a progress bar instead. */}
      <div className="flex flex-col gap-2 lg:hidden">
        <p className="text-sm font-medium text-fg-secondary">
          Step {current + 1} of {steps.length} · <span className="text-fg">{titles[stepKey]}</span>
        </p>
        <ProgressBar value={current + 1} max={steps.length} />
      </div>
      <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
            {catalog.data === undefined && catalog.loading ? (
              <LoadingState />
            ) : catalog.data === undefined && catalog.error ? (
              <ErrorState error={catalog.error} onRetry={catalog.reload} title="Could not load Room Types and prices" />
            ) : (
              children
            )}
          </div>
          <div className="shrink-0">{actions}</div>
        </div>
        <aside className="w-full shrink-0 lg:w-90 lg:overflow-y-auto">
          <SelectionSummary wizard={wizard} />
        </aside>
      </div>
    </StudentContainer>
  )
}

/** Back (or Cancel) on the left, primary Continue on the right. */
export function WizardActions({ backLabel = 'Back', backTo, onNext, nextLabel = 'Continue', nextDisabled, showBackIcon = true }) {
  return (
    <div className="flex items-center justify-between">
      <Button size="lg" to={backTo} icon={showBackIcon ? ArrowLeft : undefined}>
        {backLabel}
      </Button>
      <Button variant="primary" size="lg" onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
      </Button>
    </div>
  )
}

/** Selectable option card used for Room Type and Room Class (selected: 2 px action/primary border). */
export function OptionCard({ name, value, selected, onSelect, title, price, lines = [] }) {
  return (
    <label
      className={cx(
        'flex min-w-0 flex-1 cursor-pointer flex-col gap-1.5 self-stretch rounded-lg transition-colors',
        selected ? 'border-2 border-primary bg-brand-subtle p-3.75' : 'border border-line bg-surface p-4 hover:border-line-strong',
      )}
    >
      <span className="flex items-start gap-2">
        <span className="flex h-6 w-4 shrink-0 items-center">
          <input
            type="radio"
            name={name}
            value={value}
            checked={selected}
            onChange={() => onSelect(value)}
            className="size-4 appearance-none rounded-full border border-line-strong bg-surface checked:border-[5px] checked:border-primary"
          />
        </span>
        <span className="text-h3 font-semibold whitespace-pre text-fg">{title}</span>
      </span>
      {price && <span className="text-base font-medium text-fg">{price}</span>}
      {lines.map((line) => (
        <span key={line} className="text-sm text-fg-secondary">
          {line}
        </span>
      ))}
    </label>
  )
}

/** Fills the contact section from the student profile the first time the step opens. */
export function useProfileDefaults(wizard) {
  const profile = useQuery(['profile'], ({ signal }) => api.me.profile(undefined, { signal }))
  const { draft, setDraft } = wizard
  useEffect(() => {
    if (!draft.contact && profile.data) setDraft({ contact: { phone: '', email: '', emergencyName: '', relationship: '', emergencyPhone: '', ...profile.data.contact } })
  }, [profile.data, draft.contact, setDraft])
  return profile
}
