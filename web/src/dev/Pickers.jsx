import { useState } from 'react'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { DatePicker, DateRangePicker, DateTimePicker, DateTimeRangePicker, TimePicker, TimeRangePicker } from '@/components/ui/date-time'
import { slotErrors } from '@/lib/datetime'

// /dev/pickers (development builds only): every variant of the date and time pickers, in Vietnamese and English.

function Demo({ title, note, value, children }) {
  return (
    <Card className="flex min-w-0 flex-col gap-2">
      <p className="text-base font-semibold text-fg">{title}</p>
      {note && <p className="text-sm text-fg-tertiary">{note}</p>}
      {children}
      <code className="truncate rounded bg-subtle px-2 py-1 text-xs text-fg-secondary">value: {JSON.stringify(value ?? '')}</code>
    </Card>
  )
}

function useValue(initial = '') {
  return useState(initial)
}

export default function Pickers() {
  const { lang, setLang } = useI18n()
  // Labels in both languages as nodes, so the demo's own texts need no translation keys.
  const l = (vi, en) => <span>{lang === 'vi' ? vi : en}</span>
  const [day, setDay] = useValue()
  const [deadline, setDeadline] = useValue()
  const [inspected, setInspected] = useValue()
  const [week, setWeek] = useValue()
  const [block, setBlock] = useValue()
  const [broken, setBroken] = useValue('2026-11-10')
  const [range, setRange] = useValue({ start: '', end: '' })
  const [time, setTime] = useValue()
  const [quarter, setQuarter] = useValue()
  const [hours, setHours] = useValue({ start: '', end: '' })
  const [opens, setOpens] = useValue()
  const [done, setDone] = useValue()
  const [hourly, setHourly] = useValue()
  const [slots, setSlots] = useValue([
    { start: '2026-11-21T01:00:00.000Z', end: '2026-11-21T03:00:00.000Z' },
    { start: '2026-11-21T02:00:00.000Z', end: '2026-11-21T04:00:00.000Z' },
  ])
  const [modal, setModal] = useState(false)
  const [modalValue, setModalValue] = useValue()
  const problems = slotErrors(slots)

  return (
    <div className="min-h-screen bg-canvas p-4 sm:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-h2 font-semibold text-fg">Date &amp; time pickers</h1>
            <p className="text-sm text-fg-tertiary">components/ui/date-time · every input can be typed: "16112026" → 16/11/2026, "830" → 08:30</p>
          </div>
          <div className="flex gap-2">
            <Button variant={lang === 'vi' ? 'primary' : undefined} onClick={() => setLang('vi')}>
              Tiếng Việt
            </Button>
            <Button variant={lang === 'en' ? 'primary' : undefined} onClick={() => setLang('en')}>
              English
            </Button>
          </div>
        </header>

        <h2 className="text-h3 font-semibold text-fg">DatePicker</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Demo title="Default (future chips)" value={day}>
            <DatePicker label={l('Ngày đến', 'Arrives on')} value={day} onChange={setDay} />
          </Demo>
          <Demo title="disablePast + max" note="Days before today and after the 20th of next month are faded." value={deadline}>
            <DatePicker label={l('Hạn nhận phòng mới', 'New check-in deadline')} value={deadline} onChange={setDeadline} disablePast max="2026-12-20" />
          </Demo>
          <Demo title="showNow (a day that already happened)" note="'Today' fills today; later days are blocked." value={inspected}>
            <DatePicker label={l('Ngày kiểm tra phòng', 'Room inspected on')} value={inspected} onChange={setInspected} showNow />
          </Demo>
          <Demo title="showWeekNumbers" value={week}>
            <DatePicker label={l('Tuần của ngày', 'Week of')} value={week} onChange={setWeek} showWeekNumbers />
          </Demo>
          <Demo title="Disabled with a reason" note="Hover the field." value={block}>
            <DatePicker label={l('Ngày kiểm tra', 'Inspection day')} value={block} onChange={setBlock} disabled disabledReason={lang === 'vi' ? 'Chọn tòa trước' : 'Choose a block first'} />
          </Demo>
          <Demo title="Error from the form" value={broken}>
            <DatePicker label={l('Hạn tiền phòng còn lại', 'Balance deadline')} value={broken} onChange={setBroken} error="The Balance is paid before check-in: choose a day up to the new check-in deadline." invalid />
          </Demo>
        </div>

        <h2 className="text-h3 font-semibold text-fg">DateRangePicker</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Demo title="Range of days" note="Chips: this week, next week, this month." value={range}>
            <DateRangePicker label={l('Kỳ báo cáo', 'Report period')} value={range} onChange={setRange} />
          </Demo>
        </div>

        <h2 className="text-h3 font-semibold text-fg">TimePicker · TimeRangePicker</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Demo title="Time, every 30 min, showNow" value={time}>
            <TimePicker label={l('Giờ chốt chỉ số', 'Meter read at')} value={time} onChange={setTime} showNow />
          </Demo>
          <Demo title="minuteStep 15, 07:00–12:00" value={quarter}>
            <TimePicker label={l('Giờ đến', 'Visit at')} value={quarter} onChange={setQuarter} minuteStep={15} minTime="07:00" maxTime="12:00" />
          </Demo>
          <Demo title="Start – end of one day" value={hours}>
            <TimeRangePicker label={l('Giờ mở quầy', 'Desk opening hours')} value={hours} onChange={setHours} />
          </Demo>
        </div>

        <h2 className="text-h3 font-semibold text-fg">DateTimePicker · DateTimeRangePicker</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Demo title="Day and time, disablePast" note="The time column waits for a day." value={opens}>
            <DateTimePicker label={l('Mở đăng ký', 'Registration opens')} value={opens} onChange={setOpens} disablePast />
          </Demo>
          <Demo title="showNow (a moment that already happened)" note="'Now' fills the current minute; the future is blocked." value={done}>
            <DateTimePicker label={l('Thời điểm hoàn thành sửa chữa', 'Repair finished at')} value={done} onChange={setDone} showNow />
          </Demo>
          <Demo title="minuteStep 60, no chips" value={hourly}>
            <DateTimePicker label={l('Hiển thị đến', 'Shown until')} value={hourly} onChange={setHourly} minuteStep={60} quickOptions={false} />
          </Demo>
          <Demo title="Time slots of one day (overlap checked)" value={slots}>
            {slots.map((s, i) => {
              const p = problems[i]
              const error = p?.code === 'overlap' ? `Overlaps time slot ${p.with + 1}` : p?.code === 'end-before-start' ? 'The end time must be after the start time' : undefined
              return (
                <Field key={i} label={l(`Khung giờ ${i + 1}`, `Time slot ${i + 1}`)} error={error}>
                  {(id) => <DateTimeRangePicker id={id} value={s} invalid={!!error} onChange={(v) => setSlots((all) => all.map((x, j) => (j === i ? v : x)))} />}
                </Field>
              )
            })}
          </Demo>
          <Demo title="Inside a Modal (portal, Esc closes only the picker)" value={modalValue}>
            <Button onClick={() => setModal(true)}>Open a Modal</Button>
          </Demo>
        </div>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Edit the announcement" footer={<Button onClick={() => setModal(false)}>Close</Button>}>
        <Field label={l('Hiển thị đến', 'Shown until')}>{(id) => <DateTimePicker id={id} value={modalValue} onChange={setModalValue} disablePast />}</Field>
      </Modal>
    </div>
  )
}
