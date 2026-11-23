import { Bed, Building, Calendar, CalendarCheck, Check, CheckCircle2, Circle, Clock, CreditCard, ExternalLink, FileText, KeyRound, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, Note, ProgressBar } from '@/components/ui/Display'
import { cx } from '@/lib/cx'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDate, formatDateRange, formatDateTime, formatVnd } from '@/lib/format'
import { t, tr, tx } from '@/i18n'
import { InfoRow } from './RoomAccessAndFinance'

/**
 * Thẻ thông tin Hợp đồng lưu trú KTX hiện tại của sinh viên:
 * Hiển thị số hợp đồng/mã đơn, thời hạn hợp đồng, số kỳ cam kết, giá phòng, và các điều khoản cơ bản.
 */
export function StayContractCard({ data }) {
  const { allocation: a, term: tm, balance, stay, stayTerms, application: app } = data
  if (!a) return null

  // The Application id is the real reference; a number built here would look official but match nothing (WEB-STU-23).
  const contractCode = app?.id ? `HD-${app.id}` : null
  const resident = a.status === 'Resident'
  const isPaid = balance?.status === 'Paid'

  return (
    <Card padding="lg" className="flex shrink-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-fg-brand">
            <FileText size={18} aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 className="text-h3 font-semibold text-fg">
              {t('Dormitory stay contract')}
            </h2>
            {contractCode && (
              <span className="text-sm font-medium text-fg-tertiary tabular">
                {contractCode}
              </span>
            )}
          </div>
        </div>
        <StatusTag status={resident ? 'Resident' : a.status ?? 'Allocated'} />
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <InfoRow
          icon={Building}
          label="Assigned room & bed"
          value={t('{room} · Bed {bed}', { room: a.room, bed: a.bed }) + ` (${t('Block {code}', { code: a.blockLabel ?? a.block })})`}
        />
        <InfoRow
          icon={Calendar}
          label="Contract validity period"
          value={tm ? `${tm.name} (${formatDateRange(tm.stayStart, tm.stayEnd)})` : '—'}
        />
        <InfoRow
          icon={Bed}
          label="Room class & type"
          value={`${tr(a.roomTypeName) || t('Standard')} · ${tr(a.roomClassName) || t('Standard')}`}
        />
        <InfoRow icon={CalendarCheck} label="Allocated on" value={a.allocatedAt ? formatDate(a.allocatedAt) : '—'} />
        <InfoRow
          icon={KeyRound}
          label="Moved in"
          value={
            a.residentSince
              ? formatDateTime(a.residentSince)
              : data.checkIn?.start
                ? t('Check-in {range}', { range: formatDateRange(data.checkIn.start, data.checkIn.end) })
                : t('Not yet')
          }
        />
        <InfoRow
          icon={Clock}
          label="Stay commitment"
          value={
            stay
              ? stay.termsLeft != null
                ? t('{used} of {total} terms used · {left} terms left', { used: stay.termsUsed ?? 1, total: stay.committedTerms ?? 1, left: stay.termsLeft })
                : t('{used} of {total} terms used', { used: stay.termsUsed ?? 1, total: stay.committedTerms ?? 1 })
              : stayTerms
                ? t('{n} terms', { n: stayTerms })
                : t('{n} terms', { n: 1 })
          }
        />
      </div>

      {balance && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-subtle/50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <CreditCard size={18} aria-hidden="true" className="shrink-0 text-fg-secondary" />
            <div className="flex flex-col">
              <span className="text-xs text-fg-tertiary">{t('Current term room fee')}</span>
              <span className="text-base font-semibold text-fg tabular">{formatVnd(balance.amount)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tag tone={isPaid ? 'success' : 'warning'}>
              {isPaid ? t('Paid') : t('Unpaid')}
            </Tag>
            {balance.invoiceId && (
              <Button size="sm" variant="default" to={`/student/invoices/${balance.invoiceId}`}>
                {t('View invoice')}
              </Button>
            )}
          </div>
        </div>
      )}

      {data.rulesUrl && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <Note icon={ShieldCheck}>
            {t('Residents must strictly follow dormitory regulations, safety and curfew policies.')}
          </Note>
          <Button
            variant="text"
            size="sm"
            href={data.rulesUrl}
            target="_blank"
            rel="noreferrer"
            iconAfter={ExternalLink}
            iconSize={14}
            className="shrink-0"
          >
            {t('Dormitory rules')}
          </Button>
        </div>
      )}
    </Card>
  )
}

/**
 * Thẻ dòng thời gian & nhật ký mốc lưu trú của phòng:
 * Theo dõi quá trình: Đăng ký -> Duyệt & Xếp phòng -> Nộp tiền -> Nhận phòng -> Lưu trú.
 */
export function StayActivityLogCard({ data }) {
  const { allocation: a, term: tm, balance, checkIn, application: app } = data
  if (!a) return null

  const isResident = a.status === 'Resident'
  const isCheckedIn = Boolean(checkIn?.checkedInAt)
  // Paid when the balance invoice is paid, or when there is none left to pay once the student lives in the room
  // (a resident cannot owe the room fee: an unpaid balance blocks check-in).
  const isPaid = balance?.status === 'Paid' || (!balance && (isResident || isCheckedIn))

  const milestones = [
    {
      id: 'app',
      title: t('Application & eligibility'),
      subtitle: app?.id ? t('Application {code} verified and approved', { code: app.id }) : t('Application submitted and verified'),
      time: a.allocatedAt ? formatDate(a.allocatedAt) : null,
      done: true,
      current: false,
    },
    {
      id: 'allocation',
      title: t('Room & bed allocation'),
      subtitle: t('Allocated to {room} · Bed {bed} (Block {block})', { room: a.room, bed: a.bed, block: a.blockLabel ?? a.block }),
      time: a.allocatedAt ? formatDateTime(a.allocatedAt) : null,
      done: true,
      current: false,
    },
    {
      id: 'payment',
      title: t('Room fee payment'),
      subtitle: isPaid
        ? balance
          ? t('Paid {amount} successfully', { amount: formatVnd(balance.amount) })
          : t('Room fee paid')
        : t('Room fee {amount} awaiting payment', { amount: formatVnd(balance?.amount) }),
      time: balance?.paidAt ? formatDate(balance.paidAt) : balance?.dueAt ? t('Due {date}', { date: formatDate(balance.dueAt) }) : null,
      done: isPaid,
      current: !isPaid,
    },
    {
      id: 'checkin',
      title: t('Key handover & check-in'),
      subtitle: isCheckedIn
        ? t('Checked in at dormitory desk, key & room inventory handed over', { date: formatDateTime(checkIn.checkedInAt) })
        : isResident
          ? t('Door code received: you moved in')
          : checkIn?.start
          ? t('Check-in window: {range}', { range: formatDateRange(checkIn.start, checkIn.end) })
          : t('Prepare check-in pass on mobile app'),
      time: checkIn?.checkedInAt ? formatDateTime(checkIn.checkedInAt) : a.residentSince ? formatDateTime(a.residentSince) : null,
      done: isCheckedIn || isResident,
      current: !isCheckedIn && isPaid && !isResident,
    },
    {
      id: 'stay',
      title: t('Active residency'),
      subtitle: isResident
        ? t('Currently residing in room until {date}', { date: formatDate(tm?.stayEnd) })
        : t('Begins upon check-in desk completion'),
      time: tm?.stayStart ? `${formatDate(tm.stayStart)} – ${formatDate(tm.stayEnd)}` : null,
      done: false,
      current: isResident,
    },
  ]

  const doneCount = milestones.filter((m) => m.done).length

  return (
    <Card padding="none" className="flex shrink-0 flex-col overflow-hidden">
      <div className="flex flex-col gap-2.5 border-b border-line px-5 py-4 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
            <Clock size={18} aria-hidden="true" className="text-fg-brand" />
            {t('Stay milestones & activity')}
          </h2>
          <span className="rounded-full bg-subtle px-2.5 py-0.5 text-sm font-medium text-fg-secondary tabular">{t('{n}/{total} steps done', { n: doneCount, total: milestones.length })}</span>
        </div>
        <ProgressBar value={doneCount} max={milestones.length} tone="success" />
      </div>

      <ol className="flex flex-col px-5 py-4 lg:px-6">
        {milestones.map((m, idx) => {
          const isLast = idx === milestones.length - 1
          return (
            <li key={m.id} className="relative flex gap-4 pb-4 last:pb-0">
              {!isLast && <span aria-hidden="true" className={cx('absolute top-8 bottom-0 left-[15px] w-0.5', m.done ? 'bg-success/50' : 'bg-line')} />}
              <span
                className={cx(
                  'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full',
                  m.done ? 'bg-success text-white' : m.current ? 'border-2 border-primary bg-surface text-fg-brand ring-4 ring-primary/15' : 'border border-line-strong bg-surface text-fg-tertiary',
                )}
              >
                {m.done ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : m.current ? <span className="size-2.5 animate-pulse rounded-full bg-primary" /> : <span className="text-xs font-semibold">{idx + 1}</span>}
              </span>
              <div className={cx('flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg', m.current ? '-mt-1 bg-brand-subtle/60 px-3 py-2' : 'pt-1')}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className={cx('text-base font-semibold', m.current ? 'text-fg-brand' : m.done ? 'text-fg' : 'text-fg-secondary')}>
                    {tx(m.title)}
                    {m.current && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 align-middle text-xs font-medium text-fg-on-brand">{t('Happening now')}</span>}
                  </span>
                  {m.time && <span className="text-sm text-fg-tertiary tabular">{m.time}</span>}
                </div>
                <p className="text-sm text-fg-secondary [text-wrap:pretty]">{tx(m.subtitle)}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
