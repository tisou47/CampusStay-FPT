import { Bed, Building, Calendar, CheckCircle2, Circle, Clock, CreditCard, ExternalLink, FileText, KeyRound, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, Note } from '@/components/ui/Display'
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

  const contractCode = app?.code ? `HD-${app.code}` : `HD-${a.block ?? 'KTX'}-${a.room ?? '000'}-${a.bed ?? '0'}`
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
            <span className="text-sm font-medium text-fg-tertiary tabular">
              {contractCode}
            </span>
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
  const isPaid = balance?.status === 'Paid'
  const isCheckedIn = Boolean(checkIn?.checkedInAt)

  const milestones = [
    {
      id: 'app',
      title: t('Application & eligibility'),
      subtitle: app?.code ? t('Application {code} verified and approved', { code: app.code }) : t('Application submitted and verified'),
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
        ? t('Paid {amount} successfully', { amount: formatVnd(balance?.amount) })
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
        : checkIn?.start
          ? t('Check-in window: {range}', { range: formatDateRange(checkIn.start, checkIn.end) })
          : t('Prepare check-in pass on mobile app'),
      time: checkIn?.checkedInAt ? formatDateTime(checkIn.checkedInAt) : null,
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

  return (
    <Card padding="lg" className="flex shrink-0 flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <Clock size={16} aria-hidden="true" className="text-fg-secondary" />
          <h2 className="text-h3 font-semibold text-fg">
            {t('Stay milestones & activity')}
          </h2>
        </div>
        <span className="text-xs text-fg-tertiary">
          {t('Real-time timeline')}
        </span>
      </div>

      <ol className="flex flex-col gap-3 pt-1">
        {milestones.map((m, idx) => {
          const isLast = idx === milestones.length - 1
          return (
            <li key={m.id} className="flex items-start gap-3.5">
              {/* Marker & connector rail */}
              <div className="flex flex-col items-center">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    m.done
                      ? 'bg-success text-white shadow-xs'
                      : m.current
                        ? 'border-2 border-primary bg-primary-subtle text-fg-brand ring-4 ring-primary/10'
                        : 'border border-line-strong bg-subtle text-fg-tertiary'
                  }`}
                >
                  {m.done ? (
                    <CheckCircle2 size={14} aria-hidden="true" />
                  ) : m.current ? (
                    <span className="size-2 rounded-full bg-primary" />
                  ) : (
                    <Circle size={8} aria-hidden="true" />
                  )}
                </span>
                {!isLast && (
                  <span
                    className={`w-0.5 min-h-6 flex-1 my-1 ${
                      m.done ? 'bg-success/50' : 'bg-line'
                    }`}
                  />
                )}
              </div>

              {/* Content */}
              <div className="flex min-w-0 flex-1 flex-col pb-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className={`text-base font-semibold ${m.current ? 'text-fg-brand' : 'text-fg'}`}>
                    {tx(m.title)}
                  </span>
                  {m.time && (
                    <span className="text-xs text-fg-tertiary tabular">
                      {m.time}
                    </span>
                  )}
                </div>
                <p className="text-sm text-fg-secondary [text-wrap:pretty]">
                  {tx(m.subtitle)}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
