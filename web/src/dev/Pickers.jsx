import { useState } from 'react'
import { DatePicker, DateTimePicker, TimePicker, TimeRangePicker } from '@/components/ui/date-time'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { campusToday } from '@/lib/format'
import { addDays } from '@/components/ui/date-time/values'

/*
 * Development page (/dev/pickers, not in production builds): the four date and time pickers in every state —
 * empty, with a value, disabled, error, min/max, today — plus a scrolling panel and a Modal near the bottom of the
 * window, where the panel must flip above its field and never be clipped. The last value each picker sent is
 * printed under it, to check the format a form receives.
 */

function Demo({ label, error, children, initial = '' }) {
  const [value, setValue] = useState(initial)
  return (
    <Field label={label} error={typeof error === 'string' ? error : undefined}>
      {(id) => (
        <div className="flex flex-col gap-1">
          {children({ id, value, onChange: setValue })}
          <code className="text-sm text-fg-tertiary">onChange → {JSON.stringify(value)}</code>
        </div>
      )}
    </Field>
  )
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 shadow-card">
      <h2 className="text-h3 font-semibold text-fg">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}

export default function Pickers() {
  const today = campusToday()
  const [modal, setModal] = useState(false)
  const weekend = (day) => [5, 6].includes((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7)
  return (
    <div className="min-h-screen bg-canvas p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-h1 font-semibold text-fg">Date and time pickers</h1>
            <p className="text-base text-fg-secondary">components/ui/date-time · today on the campus clock: {today}</p>
          </div>
          <LanguageSwitch />
        </header>

        <Section title="DatePicker">
          <Demo label="Empty">{(p) => <DatePicker {...p} />}</Demo>
          <Demo label="With a value, clearable" initial="2026-11-20">{(p) => <DatePicker {...p} clearable />}</Demo>
          <Demo label="Disabled" initial="2026-11-20">{(p) => <DatePicker {...p} disabled />}</Demo>
          <Demo label="Error" error="Choose a day after the start.">{(p) => <DatePicker {...p} error />}</Demo>
          <Demo label={`Min today, max today + 30`}>{(p) => <DatePicker {...p} minDate={today} maxDate={addDays(today, 30)} />}</Demo>
          <Demo label="Today, no weekends" initial={today}>{(p) => <DatePicker {...p} disabledDates={weekend} />}</Demo>
          <Demo label='valueFormat "DD/MM/YYYY", size sm'>{(p) => <DatePicker {...p} valueFormat="DD/MM/YYYY" size="sm" />}</Demo>
        </Section>

        <Section title="TimePicker">
          <Demo label="Empty (06:00–22:00, every hour)">{(p) => <TimePicker {...p} />}</Demo>
          <Demo label="With a value, clearable" initial="08:00">{(p) => <TimePicker {...p} clearable />}</Demo>
          <Demo label="Disabled" initial="08:00">{(p) => <TimePicker {...p} disabled />}</Demo>
          <Demo label="Error" error="Choose a time.">{(p) => <TimePicker {...p} error />}</Demo>
          <Demo label="08:00–12:00 every 15 min, 10:00 taken">{(p) => <TimePicker {...p} minTime="08:00" maxTime="12:00" stepMinutes={15} disabledTimes={(s) => s === '10:00'} />}</Demo>
          <Demo label="A value off the grid (09:10)" initial="09:10">{(p) => <TimePicker {...p} />}</Demo>
        </Section>

        <Section title="DateTimePicker">
          <Demo label="Empty">{(p) => <DateTimePicker {...p} />}</Demo>
          <Demo label="With a value" initial="2026-11-20T08:00">{(p) => <DateTimePicker {...p} clearable />}</Demo>
          <Demo label="Disabled" initial="2026-11-20T08:00">{(p) => <DateTimePicker {...p} disabled />}</Demo>
          <Demo label="Error" error="The registration closes after it opens.">{(p) => <DateTimePicker {...p} error />}</Demo>
          <Demo label="Min today (past hours of today off)">{(p) => <DateTimePicker {...p} minDate={today} />}</Demo>
          <Demo label='valueFormat "iso", 00:00–23:00, every 30 min'>{(p) => <DateTimePicker {...p} valueFormat="iso" minTime="00:00" maxTime="23:30" stepMinutes={30} />}</Demo>
        </Section>

        <Section title="TimeRangePicker">
          <Demo label="Empty" initial={{ start: '', end: '' }}>{(p) => <TimeRangePicker {...p} />}</Demo>
          <Demo label="With a value" initial={{ start: '08:00', end: '10:00' }}>{(p) => <TimeRangePicker {...p} clearable />}</Demo>
          <Demo label="Disabled" initial={{ start: '08:00', end: '10:00' }}>{(p) => <TimeRangePicker {...p} disabled />}</Demo>
          <Demo label="Error" error="Choose the hours." initial={{ start: '', end: '' }}>{(p) => <TimeRangePicker {...p} error />}</Demo>
          <Demo label="Every 30 min, 07:00–11:00" initial={{ start: '07:30', end: '09:00' }}>{(p) => <TimeRangePicker {...p} minTime="07:00" maxTime="11:00" stepMinutes={30} />}</Demo>
        </Section>

        <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 shadow-card">
          <h2 className="text-h3 font-semibold text-fg">Inside a scrolling panel</h2>
          <div className="h-48 overflow-y-auto rounded-lg border border-line p-4" data-testid="scroll-panel">
            <p className="h-32 text-base text-fg-secondary">Scroll down: the pickers below sit at the panel's bottom edge.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Demo label="Date in a scrolling panel">{(p) => <DatePicker {...p} />}</Demo>
              <Demo label="Date and time in a scrolling panel">{(p) => <DateTimePicker {...p} />}</Demo>
            </div>
            <div className="h-6" />
          </div>
          <button type="button" onClick={() => setModal(true)} className="self-start rounded-md bg-primary px-4 py-1.5 text-base font-semibold text-fg-on-brand hover:bg-primary-hover">
            Open a Modal with pickers at its bottom
          </button>
        </section>
        <div className="h-[60vh]" />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Pickers in a Modal">
        <p className="h-[40vh] text-base text-fg-secondary">The fields are at the bottom of the Modal: the panels open above them.</p>
        <Demo label="Day">{(p) => <DatePicker {...p} />}</Demo>
        <Demo label="Day and time">{(p) => <DateTimePicker {...p} />}</Demo>
        <Demo label="Hours" initial={{ start: '', end: '' }}>{(p) => <TimeRangePicker {...p} />}</Demo>
      </Modal>
    </div>
  )
}
