import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { controlClasses } from './Field'

// Month-calendar pickers for forms in a Modal: one panel with the month, the days as round buttons, the hours as
// chips and shortcuts, confirmed with one button. The panel is drawn in a portal next to its field, so a scrolling
// Modal body never clips it. Values are the strings the native inputs give: "2027-01-20", "09:00",
// "2027-01-20T09:00". Hours are whole hours, as everywhere in the dormitory.

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const locale = () => (document.documentElement.lang === 'vi' ? 'vi-VN' : 'en-GB')

/** "T4, 20/01/2027" */
export function showDay(s) {
  const d = parse(s)
  if (!d) return ''
  return `${t(DAYS[(d.getDay() + 6) % 7])}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** The panel, placed under its field (or above when there is no room below), in a portal over the Modal. */
function Panel({ anchor, onClose, width = 340, children }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const h = ref.current?.offsetHeight ?? 0
      if (!a) return
      const below = window.innerHeight - a.bottom - 8
      const top = below >= h || a.top < h ? Math.min(a.bottom + 6, window.innerHeight - h - 8) : a.top - h - 6
      const left = Math.max(8, Math.min(a.left, window.innerWidth - width - 8))
      setPos({ top: Math.max(8, top), left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, width])

  useEffect(() => {
    const onDown = (e) => !ref.current?.contains(e.target) && !anchor.current?.contains(e.target) && onClose()
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="fixed z-[60] animate-pop-in rounded-xl border border-line bg-surface shadow-dropdown"
    >
      {children}
    </div>,
    document.body,
  )
}

function Trigger({ anchor, id, text, placeholder, icon: Icon, disabled, invalid, open, onClick }) {
  return (
    <button
      ref={anchor}
      id={id}
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-invalid={invalid || undefined}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cx(
        controlClasses({ invalid }),
        'flex items-center justify-between gap-2 text-left',
        !text && 'text-fg-tertiary',
        open && 'border-primary ring-2 ring-primary-subtle',
      )}
    >
      <span className="truncate tabular">{text || tx(placeholder)}</span>
      <Icon size={16} aria-hidden="true" className="shrink-0 text-fg-tertiary" />
    </button>
  )
}

/** The month grid: Monday first, round day buttons, today outlined. */
function Month({ value, min, onPick }) {
  const selected = parse(value)
  const [month, setMonth] = useState(() => {
    const d = selected ?? parse(min) ?? new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const today = iso(new Date())
  const first = addDays(month, -((month.getDay() + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i))
  const weeks = cells[35].getMonth() === month.getMonth() ? 6 : 5
  const step = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const label = month.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label={t('Previous month')} onClick={() => step(-1)} className="rounded-lg border border-line p-1.5 text-fg-secondary hover:bg-subtle">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="text-base font-semibold text-fg capitalize">{label}</span>
        <button type="button" aria-label={t('Next month')} onClick={() => step(1)} className="rounded-lg border border-line p-1.5 text-fg-secondary hover:bg-subtle">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {DAYS.map((d) => (
          <span key={d} className="py-1 text-xs font-semibold text-fg-tertiary">
            {t(d)}
          </span>
        ))}
        {cells.slice(0, weeks * 7).map((d) => {
          const day = iso(d)
          const off = d.getMonth() !== month.getMonth()
          const disabled = min && day < min
          const chosen = day === value
          return (
            <span key={day} className="flex justify-center">
              <button
                type="button"
                disabled={disabled}
                aria-pressed={chosen}
                aria-label={showDay(day)}
                onClick={() => {
                  if (off) setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
                  onPick(day)
                }}
                className={cx(
                  'size-9 rounded-full tabular transition-colors',
                  off && !chosen && 'text-fg-tertiary',
                  day === today && !chosen && 'font-semibold text-fg-brand ring-1 ring-primary',
                  chosen ? 'bg-primary font-semibold text-fg-on-brand' : !disabled && 'hover:bg-primary-subtle',
                  disabled && 'cursor-not-allowed opacity-30',
                )}
              >
                {d.getDate()}
              </button>
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Hour chips "07:00" … "22:00"; hours outside [after, before] are disabled. */
function Hours({ value, from, to, after, onPick }) {
  const hours = Array.from({ length: to - from + 1 }, (_, i) => `${pad(from + i)}:00`)
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {hours.map((h) => {
        const disabled = after != null && h <= after
        return (
          <button
            key={h}
            type="button"
            disabled={disabled}
            aria-pressed={h === value}
            onClick={() => onPick(h)}
            className={cx(
              'rounded-lg border py-1.5 text-sm tabular transition-colors',
              h === value ? 'border-primary bg-primary font-semibold text-fg-on-brand' : 'border-line text-fg hover:border-primary hover:bg-primary-subtle',
              disabled && 'cursor-not-allowed opacity-30 hover:border-line hover:bg-transparent',
            )}
          >
            {h}
          </button>
        )
      })}
    </div>
  )
}

/** A column of hours that scrolls to the chosen one: the time half of the date-time panel. */
function HourList({ value, from, to, onPick }) {
  const list = useRef(null)
  useEffect(() => {
    list.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'center' })
  }, [])
  const hours = Array.from({ length: to - from + 1 }, (_, i) => `${pad(from + i)}:00`)
  return (
    <div ref={list} className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
      {hours.map((h) => (
        <button
          key={h}
          type="button"
          aria-pressed={h === value}
          onClick={() => onPick(h)}
          className={cx(
            'shrink-0 rounded-lg py-1.5 text-sm tabular transition-colors',
            h === value ? 'bg-primary font-semibold text-fg-on-brand' : 'text-fg hover:bg-primary-subtle',
          )}
        >
          {h}
        </button>
      ))}
    </div>
  )
}

function Footer({ onCancel, onConfirm, disabled }) {
  return (
    <div className="flex flex-col gap-1 border-t border-line p-3">
      <button
        type="button"
        disabled={disabled}
        onClick={onConfirm}
        className="w-full rounded-lg bg-primary py-2 font-semibold text-fg-on-brand hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('Confirm')}
      </button>
      <button type="button" onClick={onCancel} className="py-1 text-sm text-fg-secondary hover:underline">
        {t('Cancel')}
      </button>
    </div>
  )
}

function Shortcuts({ items, onPick, value, min }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <button
          key={s.label}
          type="button"
          disabled={!!min && s.value < min.slice(0, 10)}
          onClick={() => onPick(s.value)}
          className={cx(
            'rounded-full border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-30',
            s.value === value ? 'border-primary bg-primary-subtle text-fg-brand' : 'border-line text-fg-secondary enabled:hover:border-primary',
          )}
        >
          {t(s.label)}
        </button>
      ))}
    </div>
  )
}

const dayShortcuts = () => {
  const now = new Date()
  return [
    { label: 'Today', value: iso(now) },
    { label: 'Tomorrow', value: iso(addDays(now, 1)) },
    { label: 'In a week', value: iso(addDays(now, 7)) },
    { label: 'In two weeks', value: iso(addDays(now, 14)) },
  ]
}

/** A day: value "YYYY-MM-DD". */
export function DatePickerField({ id, value, onChange, min, disabled, invalid, placeholder = 'Choose a day' }) {
  const anchor = useRef(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const toggle = () => {
    setDraft(value)
    setOpen((o) => !o)
  }
  return (
    <>
      <Trigger anchor={anchor} id={id} text={showDay(value)} placeholder={placeholder} icon={CalendarDays} disabled={disabled} invalid={invalid} open={open} onClick={toggle} />
      {open && (
        <Panel anchor={anchor} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3 p-4">
            <p className="text-base font-semibold text-fg">{t('Choose a day')}</p>
            <Shortcuts items={dayShortcuts()} value={draft} min={min} onPick={setDraft} />
            <Month key={draft} value={draft} min={min} onPick={setDraft} />
          </div>
          <Footer
            disabled={!draft}
            onCancel={() => setOpen(false)}
            onConfirm={() => {
              onChange?.(draft)
              setOpen(false)
            }}
          />
        </Panel>
      )}
    </>
  )
}

/** A whole hour: value "HH:00". `after` disables that hour and the ones before it (an end after a start). */
export function HourPickerField({ id, value, onChange, after, disabled, invalid, from = 6, to = 22, placeholder = 'Choose a time' }) {
  const anchor = useRef(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <Trigger anchor={anchor} id={id} text={value} placeholder={placeholder} icon={Clock} disabled={disabled} invalid={invalid} open={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <Panel anchor={anchor} width={280} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3 p-4">
            <p className="text-base font-semibold text-fg">{t('Choose a time')}</p>
            <Hours
              value={value}
              from={from}
              to={to}
              after={after}
              onPick={(h) => {
                onChange?.(h)
                setOpen(false)
              }}
            />
          </div>
        </Panel>
      )}
    </>
  )
}

/** A day and a whole hour: value "YYYY-MM-DDTHH:00", chosen in one panel. */
export function DateTimePickerField({ id, value, onChange, min, disabled, invalid, from = 0, to = 23, placeholder = 'Choose a day and time' }) {
  const anchor = useRef(null)
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState('')
  const [hour, setHour] = useState('')
  const toggle = () => {
    setDay(value?.slice(0, 10) ?? '')
    setHour(value?.slice(11, 16) || '08:00')
    setOpen((o) => !o)
  }
  const text = value ? `${showDay(value.slice(0, 10))} · ${value.slice(11, 16)}` : ''
  return (
    <>
      <Trigger anchor={anchor} id={id} text={text} placeholder={placeholder} icon={CalendarDays} disabled={disabled} invalid={invalid} open={open} onClick={toggle} />
      {open && (
        <Panel anchor={anchor} width={460} onClose={() => setOpen(false)}>
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <p className="text-base font-semibold text-fg">{t('Choose a day and time')}</p>
            <span className="text-sm font-medium text-fg-brand tabular">{day ? `${showDay(day)} · ${hour}` : t('Choose a day first')}</span>
          </div>
          <div className="flex gap-4 p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <Shortcuts items={dayShortcuts()} value={day} min={min} onPick={setDay} />
              <Month key={day} value={day} min={min?.slice(0, 10)} onPick={setDay} />
            </div>
            <div className="flex w-20 shrink-0 flex-col gap-2 border-l border-line pl-3">
              <span className="text-xs font-semibold text-fg-tertiary">{t('Time')}</span>
              <HourList value={hour} from={from} to={to} onPick={setHour} />
            </div>
          </div>
          <Footer
            disabled={!day || !hour}
            onCancel={() => setOpen(false)}
            onConfirm={() => {
              onChange?.({ target: { value: `${day}T${hour}` } })
              setOpen(false)
            }}
          />
        </Panel>
      )}
    </>
  )
}
