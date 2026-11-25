import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clock, ExternalLink, Eye, FileCheck2, HandCoins, Paperclip, ReceiptText, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, DescriptionList, Note } from '@/components/ui/Display'
import { Field, SearchInput, Select, Textarea } from '@/components/ui/Field'
import { Drawer, Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine, stop } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDateTime, formatDuration, formatNumber, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'
import { ConfirmPaymentModal } from '../staff/Payments'

// SCR-BIL-13 Payment confirmations — Manager › Finance (ADR-22, spec §6.7). Students report "I have transferred";
// a Manager checks the bank statement and confirms the claims, one by one or in bulk, or rejects them with a reason.
// GET /payment-claims?termId&block&type&since&q&page&pageSize → {
//   items: [{ invoiceId, studentName, studentCode, type, typeLabel, title, amount, claimedAt, dueAt, timeLeftSeconds,
//             reference, rejected, transferContent, receipt: { name, size, url } | null }], total, summary: { count, amount } }
// POST /payment-claims/:invoiceId/receipt (multipart receipt) → { name, size, url }: the transfer receipt of the claim (R-23)
// POST /payment-claims/confirm { invoiceIds } → { confirmed, amount, skipped: [{ invoiceId, reason }] } — claims without
//   a receipt are skipped, so a bulk confirmation needs one receipt per Invoice, attached row by row first.
// POST /payment-claims/reject { invoiceIds, reason } → { rejected, cancelled, skipped }
// Each Invoice is paid and audited on its own; the dialog says what will happen in numbers (spec §11.1).
// A work queue: claims of every Term are listed (a Deposit of the next Term waits too), only the Block filter applies.

/** Compact receipt thumbnail/pill cell: opens attached receipt or uploads/replaces in 1 click. */
function ReceiptCell({ claim }) {
  const { notifyError } = useToast()
  const input = useRef(null)
  const attach = useMutation(
    (file) => {
      const data = new FormData()
      data.set('receipt', file)
      return api.paymentClaims.attachReceipt(claim.invoiceId, data)
    },
    { invalidates: ['payment-claims'], onError: (e) => notifyError(e, 'Could not attach the receipt') },
  )
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {claim.receipt?.url ? (
        <>
          <a
            href={claim.receipt.url}
            target="_blank"
            rel="noreferrer"
            title={claim.receipt.name}
            className="inline-flex max-w-32 items-center gap-1.5 rounded-lg border border-success/20 bg-success-bg px-2.5 py-1 text-xs font-medium text-success-fg transition-colors hover:opacity-90"
          >
            <FileCheck2 size={13} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{claim.receipt.name}</span>
            <ExternalLink size={11} aria-hidden="true" className="shrink-0 opacity-70" />
          </a>
          <button
            type="button"
            disabled={attach.pending}
            onClick={() => input.current?.click()}
            className="rounded-md px-1.5 py-1 text-xs font-medium text-fg-secondary transition-colors hover:bg-subtle hover:text-fg"
          >
            {attach.pending ? t('Uploading…') : t('Replace')}
          </button>
        </>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          icon={Paperclip}
          iconSize={14}
          disabled={attach.pending}
          onClick={() => input.current?.click()}
        >
          {attach.pending ? t('Uploading…') : t('Attach receipt')}
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) attach.run(file)
        }}
      />
    </div>
  )
}

function duration(seconds) {
  if (!seconds) return '—'
  return formatDuration(Math.max(seconds, 3600) * 1000)
}

export default function PaymentClaims() {
  const { block } = useScopeQuery()
  const { notify, notifyError } = useToast()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [since, setSince] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [selected, setSelected] = useState(() => new Set())
  const [dialog, setDialog] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [receipting, setReceipting] = useState(null)
  const [reason, setReason] = useState('')
  const [viewing, setViewing] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const filters = { block, q: search, type, since, page, pageSize }
  const query = useQuery(['payment-claims', filters], ({ signal }) => api.paymentClaims.list(filters, { signal }))
  const items = useMemo(() => query.data?.items ?? [], [query.data])
  const chosen = items.filter((c) => selected.has(c.invoiceId))
  const chosenTotal = chosen.reduce((sum, c) => sum + c.amount, 0)
  // Only claims with their transfer receipt can be confirmed in bulk (R-23).
  const ready = chosen.filter((c) => c.receipt)
  const readyTotal = ready.reduce((sum, c) => sum + c.amount, 0)
  const allChecked = items.length > 0 && chosen.length === items.length
  // The details follow the list (a receipt attached there shows at once).
  const shown = viewing ? items.find((c) => c.invoiceId === viewing) ?? null : null

  // Drop selections that left the list (decided elsewhere).
  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((id) => items.some((c) => c.invoiceId === id))))
  }, [items])

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const filter = (set) => (e) => {
    set(e.target.value)
    setPage(1)
  }
  const done = () => {
    setDialog(null)
    setReason('')
    if (rejectTarget) {
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(rejectTarget.invoiceId)
        return next
      })
      setRejectTarget(null)
    } else {
      setSelected(new Set())
    }
  }

  const confirm = useMutation((ids) => api.paymentClaims.confirm({ invoiceIds: ids }), {
    invalidates: ['payment-claims', 'payments', 'applications', 'dashboard'],
    onSuccess: (r) => {
      notify({
        title: 'Payments confirmed',
        message: t('{n} confirmed, {amount} in all.', { n: formatNumber(r.confirmed), amount: formatVnd(r.amount) })
          + (r.skipped?.length ? ' ' + t('{n} skipped: decided by someone else or without a receipt.', { n: r.skipped.length }) : ''),
      })
      done()
    },
    onError: (e) => notifyError(e, 'Could not confirm the payments'),
  })
  const reject = useMutation((ids) => api.paymentClaims.reject({ invoiceIds: ids, reason: reason.trim() }), {
    invalidates: ['payment-claims', 'payments', 'applications', 'dashboard'],
    onSuccess: (r) => {
      notify({
        type: 'warning',
        title: 'Transfers rejected',
        message: t('{n} rejected; {c} invoices cancelled after too many rejections.', { n: r.rejected, c: r.cancelled }),
      })
      done()
    },
    onError: (e) => notifyError(e, 'Could not reject the transfers'),
  })
  const s = query.data?.summary

  return (
    <>
      {/* Tick claims to confirm or reject them together: the bar beside the filters appears with the choice. */}
      <PageHeader title="Payment confirmations" />

      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" icon={Clock} label="Claims waiting" value={formatNumber(s?.count)} valueTone={s?.count ? 'warning' : undefined} note="The students' deadlines are paused" />
        <KpiTile size="md" icon={HandCoins} label="Amount waiting" value={s ? formatVnd(s.amount) : '—'} note="To find on the bank statement" />
      </div>

      {/* Filter Bar & Prominent Bulk Selection Action Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <SearchInput wrapperClassName="min-w-72 flex-1" aria-label={t('Search')} placeholder="Search invoice, student, transfer content or reference" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select
            fit wrapperClassName="max-w-80"
            aria-label={t('Type')}
            value={type}
            onChange={filter(setType)}
            options={[
              { value: '', label: 'Type: All' },
              { value: 'deposit', label: 'Type: deposit' },
              { value: 'balance', label: 'Type: balance' },
              { value: 'termFee', label: 'Type: Next-term fee' },
              { value: 'utility', label: 'Type: utility' },
              { value: 'damage', label: 'Type: Damage' },
            ]}
          />
          <Select
            fit wrapperClassName="max-w-80"
            aria-label={t('Claimed')}
            value={since}
            onChange={filter(setSince)}
            options={[
              { value: '', label: 'Claimed: any time' },
              { value: 'today', label: 'Claimed: today' },
              { value: '24h', label: 'Claimed: last 24 hours' },
              { value: '7d', label: 'Claimed: last 7 days' },
            ]}
          />
        </div>

        {chosen.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-orange-200 bg-brand-subtle px-3.5 py-2 shadow-xs">
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {chosen.length}
              </span>
              <span className="font-semibold text-fg tabular">{formatVnd(chosenTotal)}</span>
              <span className="text-xs text-fg-secondary">
                ({ready.length}/{chosen.length} {t('Receipt').toLowerCase()})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="text" onClick={() => setSelected(new Set())}>
                {t('Clear')}
              </Button>
              <Button size="sm" icon={X} onClick={() => setDialog('reject')}>
                {t('Reject ({n})', { n: chosen.length })}
              </Button>
              <Button size="sm" variant="primary" icon={Check} onClick={() => setDialog('confirm')}>
                {t('Confirm ({n})', { n: chosen.length })}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Compact 7-Column High-Density Table */}
      <Table fill>
        <THead>
          <tr>
            <Th className="w-56">
              <div className="flex items-center gap-3">
                <Checkbox
                  aria-label={t('Select all')}
                  checked={allChecked}
                  indeterminate={!allChecked && chosen.length > 0}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((c) => c.invoiceId)))}
                />
                <span>{t('Invoice')}</span>
              </div>
            </Th>
            <Th>Student</Th>
            <Th className="w-36" align="right">
              Amount
            </Th>
            <Th className="w-44">Claimed</Th>
            <Th className="w-48">Receipt</Th>
            <Th className="w-[300px]">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={6} emptyIcon={HandCoins} emptyTitle="No payment claims wait for confirmation" />
          {items.map((c) => {
            const isChecked = selected.has(c.invoiceId)
            const urgentTime = c.timeLeftSeconds != null && c.timeLeftSeconds <= 43200
            return (
              <Tr key={c.invoiceId} selected={isChecked} onClick={() => toggle(c.invoiceId)} className="[&>td]:py-2.5">
                {/* Col 1: Checkbox + Invoice ID & Fee Type */}
                <Td onClick={stop}>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      aria-label={t('Select {id}', { id: c.invoiceId })}
                      checked={isChecked}
                      onChange={() => toggle(c.invoiceId)}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-mono text-sm font-semibold text-fg-brand">{c.invoiceId}</span>
                      <span className="truncate text-xs text-fg-secondary">{tr(c.title ?? c.typeLabel)}</span>
                    </div>
                  </div>
                </Td>

                {/* Col 2: Student (Name + MSSV); a claim rejected before says so */}
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <TwoLine primary={c.studentName} secondary={c.studentCode} />
                    {c.rejected > 0 && <Tag tone="warning">{t('Rejected {n}×', { n: c.rejected })}</Tag>}
                  </div>
                </Td>

                {/* Col 3: Amount (Right-aligned, prominent tabular) */}
                <Td align="right" className="whitespace-nowrap">
                  <span className="text-base font-bold text-fg tabular">{formatVnd(c.amount)}</span>
                </Td>

                {/* Col 5: Claimed Time & Remaining Time Badge */}
                <Td className="whitespace-nowrap">
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-xs font-medium text-fg tabular">{formatDateTime(c.claimedAt)}</span>
                    <span
                      className={cx(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                        !c.timeLeftSeconds
                          ? 'bg-subtle text-fg-tertiary'
                          : urgentTime
                            ? 'bg-warning-bg text-warning-fg'
                            : 'bg-subtle text-fg-secondary',
                      )}
                    >
                      <Clock size={11} aria-hidden="true" />
                      {duration(c.timeLeftSeconds)}
                    </span>
                  </div>
                </Td>

                {/* Col 6: Compact Receipt Thumbnail/Button */}
                <Td onClick={stop}>
                  <ReceiptCell claim={c} />
                </Td>

                {/* Col 7: Quick Actions (Confirm with receipt / Quick Reject) */}
                <Td align="right" onClick={stop}>
                  <div className="flex items-center justify-end gap-1.5">
                    <Button size="sm" icon={Eye} iconSize={14} onClick={() => setViewing(c.invoiceId)}>
                      Details
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={ReceiptText}
                      iconSize={14}
                      onClick={() => setReceipting(c)}
                    >
                      Confirm with receipt
                    </Button>
                    <button
                      type="button"
                      title={t('Reject ({n})', { n: 1 })}
                      aria-label={t('Reject ({n})', { n: 1 })}
                      onClick={() => {
                        setRejectTarget(c)
                        setDialog('reject')
                      }}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line text-fg-secondary transition-colors hover:border-red-300 hover:bg-error-bg hover:text-error-fg"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </Table>

      <div className="flex shrink-0 justify-end">
        <Pagination
          total={query.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n)
            setPage(1)
          }}
        />
      </div>

      <Modal
        open={dialog === 'confirm'}
        onClose={() => setDialog(null)}
        title={t('Confirm {n} payments, {amount}', { n: formatNumber(ready.length), amount: formatVnd(readyTotal) })}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" icon={Check} disabled={confirm.pending || !ready.length} onClick={() => confirm.run(ready.map((c) => c.invoiceId))}>
              {confirm.pending ? t('Confirming…') : t('Confirm {n} payments, {amount}', { n: formatNumber(ready.length), amount: formatVnd(readyTotal) })}
            </Button>
          </>
        }
      >
        {ready.length < chosen.length && (
          <Alert type="warning" title={t('{n} selected claims have no receipt', { n: chosen.length - ready.length })}>
            {t('A payment is confirmed only with its transfer receipt. Attach one in the receipt column; these stay waiting: {ids}.', {
              ids: chosen.filter((c) => !c.receipt).map((c) => c.invoiceId).join(', '),
            })}
          </Alert>
        )}
        <p className="text-base text-fg">
          {t('Each invoice is marked Paid at the time its student reported the transfer, written to the audit log and announced to the student.')}
        </p>
        <Note>{t('Confirm only transfers you found on the bank statement with the exact amount and transfer content.')}</Note>
      </Modal>

      <Modal
        open={dialog === 'reject'}
        onClose={() => {
          setDialog(null)
          setRejectTarget(null)
          setReason('')
        }}
        title={t('Reject {n} transfers', { n: formatNumber((rejectTarget ? [rejectTarget] : chosen).length) })}
        footer={
          <>
            <Button
              onClick={() => {
                setDialog(null)
                setRejectTarget(null)
                setReason('')
              }}
            >
              {t('Cancel')}
            </Button>
            <Button
              variant="danger"
              icon={X}
              disabled={!reason.trim() || reject.pending}
              onClick={() => reject.run((rejectTarget ? [rejectTarget] : chosen).map((c) => c.invoiceId))}
            >
              {reject.pending ? t('Rejecting…') : t('Reject transfers')}
            </Button>
          </>
        }
      >
        <Field label="Reason shown to the students" required>
          {(id) => <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="No transfer with this content reached the account." />}
        </Field>
        <Alert type="warning" title="What happens">
          {t('The students are told and their deadline continues with the time that was left (at least 12 hours). A second rejection cancels a deposit or a balance and what depends on it.')}
        </Alert>
      </Modal>
      {shown && (
        <Drawer
          open
          onClose={() => setViewing(null)}
          width={520}
          title={`${shown.invoiceId} · ${tr(shown.title ?? shown.typeLabel)}`}
          description={`${shown.studentName} · ${shown.studentCode}`}
          footer={
            <>
              <Button
                icon={X}
                onClick={() => {
                  setViewing(null)
                  setRejectTarget(shown)
                  setDialog('reject')
                }}
              >
                {t('Reject ({n})', { n: 1 })}
              </Button>
              <Button
                variant="primary"
                icon={ReceiptText}
                onClick={() => {
                  setViewing(null)
                  setReceipting(shown)
                }}
              >
                Confirm with receipt
              </Button>
            </>
          }
        >
          <DescriptionList labelWidth="w-36"
            items={[
              ['Amount', <span key="a" className="font-semibold tabular">{formatVnd(shown.amount)}</span>],
              ['Transfer content', <span key="c" className="font-mono font-semibold text-fg-brand">{shown.transferContent ?? '—'}</span>],
              shown.reference && ['Bank reference', <span key="r" className="font-mono">{shown.reference}</span>],
              ['Claimed', formatDateTime(shown.claimedAt)],
              shown.dueAt && ['Due', formatDateTime(shown.dueAt)],
              ['Time left', duration(shown.timeLeftSeconds)],
              shown.rejected > 0 && ['Rejected before', t('Rejected {n}×', { n: shown.rejected })],
              ['Receipt', <ReceiptCell key="rc" claim={shown} />],
            ].filter(Boolean)}
          />
        </Drawer>
      )}
      <ConfirmPaymentModal payment={receipting} onClose={() => setReceipting(null)} />
    </>
  )
}
