import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { Camera, CheckCheck, DoorOpen, LogIn, LogOut, ScanLine, TriangleAlert, UserX, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Breadcrumb, Card } from '@/components/ui/Display'
import { Field, Input, SearchInput, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber, formatTime } from '@/lib/format'
import { t, tr } from '@/i18n'
import { guestStatusLabel, familyDayStatusLabel } from '@/lib/familyDayStatus'

// SCR-VIS-03 Family Day visitor desk — Staff of the Block and Managers (ADR-29, contract A-69). Scan the guest's pass
// (a handheld scanner types it into the field; phones and tablets can use the camera), check the identity paper
// against the name, check the guest in. Each guest is checked in and out on their own, once. Guests still inside
// after their time slot are Overdue; one who left without passing the desk is closed with a note.
// POST /family-day-visitors/verify { token } → { visitor, familyDayTitle, canCheckIn, canCheckOut, problem }
// GET /family-days/:id/visitors?slotId&status&q&page&pageSize → { items: [{ id, fullName, relationship, birthYear,
//   studentName, studentCode, room, slotId, slotStartsAt, slotEndsAt, status, overdue, checkedInAt, checkedInBy,
//   checkedOutAt, checkedOutBy, checkOutNote }], total, counts: { notArrived, inside, overdue, checkedOut, noShow },
//   statuses }
// POST /family-day-visitors/:id/check-in { identityChecked } · POST /family-day-visitors/:id/check-out { note }

const slotText = (v) => `${formatDateTime(v.slotStartsAt)} – ${formatTime(v.slotEndsAt)}`

/** Reads a QR code with the device camera where the browser can (BarcodeDetector); otherwise says so. */
function CameraScanner({ onCode, onClose }) {
  const video = useRef(null)
  const handler = useRef(onCode)
  const [error, setError] = useState(null)
  useEffect(() => {
    handler.current = onCode
  }, [onCode])
  useEffect(() => {
    let stream
    let timer
    let stopped = false
    async function start() {
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
        setError(t('This browser cannot read QR codes with the camera. Use a handheld scanner or type the pass code.'))
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stopped) return
        video.current.srcObject = stream
        await video.current.play()
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        const scan = async () => {
          if (stopped) return
          try {
            const codes = await detector.detect(video.current)
            if (codes.length > 0) {
              handler.current(codes[0].rawValue)
              return
            }
          } catch {
            // a frame that cannot be read: try the next one
          }
          timer = setTimeout(scan, 300)
        }
        scan()
      } catch {
        setError(t('The camera could not be opened. Allow camera access or type the pass code.'))
      }
    }
    start()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])
  return (
    <Modal open onClose={onClose} title="Scan a pass" footer={<Button onClick={onClose}>Close</Button>}>
      {error ? <Alert type="warning" title="Camera not available">{error}</Alert> : <video ref={video} className="aspect-square w-full rounded-lg bg-black object-cover" muted playsInline />}
    </Modal>
  )
}

function CheckInModal({ visitor, onClose }) {
  const { notify } = useToast()
  const [checked, setChecked] = useState(false)
  const run = useMutation(() => api.familyDays.checkIn(visitor.id, { identityChecked: checked }), {
    invalidates: ['family-day-visitors', 'family-day'],
    onSuccess: () => {
      notify({ title: 'Guest checked in', message: t('{name} is inside.', { name: visitor.fullName }) })
      onClose(true)
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={() => onClose(false)}
      title={t('Check in {name}', { name: visitor.fullName })}
      footer={
        <>
          <Button onClick={() => onClose(false)}>Back</Button>
          <Button variant="primary" icon={LogIn} disabled={!checked || run.pending} onClick={() => run.run()}>
            {run.pending ? t('Saving…') : t('Check in')}
          </Button>
        </>
      }
    >
      {run.error && <Alert type="error" title="Could not check in">{run.error.message}</Alert>}
      <p className="text-base text-fg-secondary">
        {t('{relationship} of {student} ({code}, Room {room}) · born {year}', {
          relationship: tr(visitor.relationship),
          student: visitor.studentName,
          code: visitor.studentCode,
          room: visitor.room ?? '—',
          year: visitor.birthYear,
        })}
      </p>
      <Checkbox
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        label="I checked the guest's identity paper against this name"
        description="Guests may only use the common area. They may not enter the Rooms or stay overnight."
      />
    </Modal>
  )
}

function CheckOutModal({ visitor, onClose }) {
  const { notify } = useToast()
  const [unseen, setUnseen] = useState(false)
  const [note, setNote] = useState('')
  const run = useMutation(() => api.familyDays.checkOut(visitor.id, { note: unseen ? note.trim() : null }), {
    invalidates: ['family-day-visitors', 'family-day'],
    onSuccess: () => {
      notify({ title: 'Guest checked out', message: t('{name} has left.', { name: visitor.fullName }) })
      onClose(true)
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={() => onClose(false)}
      title={t('Check out {name}', { name: visitor.fullName })}
      footer={
        <>
          <Button onClick={() => onClose(false)}>Back</Button>
          <Button variant="primary" icon={LogOut} disabled={run.pending || (unseen && !note.trim())} onClick={() => run.run()}>
            {run.pending ? t('Saving…') : t('Check out')}
          </Button>
        </>
      }
    >
      {run.error && <Alert type="error" title="Could not check out">{run.error.message}</Alert>}
      {visitor.overdue && (
        <Alert type="warning" title="Overdue">
          {t('The time slot ended at {time}.', { time: formatTime(visitor.slotEndsAt) })}
        </Alert>
      )}
      <Checkbox
        checked={unseen}
        onChange={(e) => setUnseen(e.target.checked)}
        label="The guest left without passing the desk"
        description="The time recorded is now, when you close the visit; write how you confirmed that the guest left."
      />
      {unseen && (
        <Field label="How did you confirm it?" required>
          {(id) => <Textarea id={id} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      )}
    </Modal>
  )
}

export default function VisitorDesk() {
  const { id } = useParams()
  const { user } = useSession()
  const base = user?.role === 'manager' ? '/manager' : '/staff'
  const [token, setToken] = useState('')
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [checkingIn, setCheckingIn] = useState(null)
  const [checkingOut, setCheckingOut] = useState(null)
  const [status, setStatus] = useState('')
  const [slotId, setSlotId] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const day = useQuery(['family-day', id], ({ signal }) => api.familyDays.get(id, { signal }))
  const filters = { status: status || undefined, slotId: slotId || undefined, q: q.trim() || undefined, page, pageSize }
  const query = useQuery(['family-day-visitors', id, filters], ({ signal }) => api.familyDays.visitors(id, filters, { signal }))
  const items = query.data?.items ?? []
  const counts = query.data?.counts

  const verify = useMutation((value) => api.familyDays.verify({ token: value }), {
    onSuccess: (r) => {
      setResult(r)
      setToken('')
    },
    onError: () => setResult(null),
  })
  const scan = (value) => {
    const v = (value ?? '').trim()
    if (v) verify.run(v)
  }
  const closeModal = (refresh) => {
    setCheckingIn(null)
    setCheckingOut(null)
    if (refresh && result) setResult(null)
  }

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[
              { label: 'Family Days', to: `${base}/family-days` },
              { label: day.data?.title ?? '…', to: `${base}/family-days/${id}` },
              { label: 'Visitor desk' },
            ]}
          />
        }
        title="Visitor desk"
        badge={day.data && <StatusTag status={day.data.status}>{familyDayStatusLabel(day.data.status)}</StatusTag>}
        description={day.data ? t('Block {block} · {area}', { block: day.data.block, area: day.data.area }) : undefined}
      />

      <div className="grid shrink-0 gap-4 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <Card className="flex flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              scan(token)
            }}
          >
            <Input autoFocus aria-label={t('Pass code')} placeholder="Scan or type the pass code" value={token} onChange={(e) => setToken(e.target.value)} />
            <Button type="submit" icon={ScanLine} disabled={!token.trim() || verify.pending}>
              Check
            </Button>
            <Button icon={Camera} aria-label={t('Scan with the camera')} onClick={() => setScanning(true)} />
          </form>
          {verify.error && <Alert type="error" title="Pass refused">{verify.error.message}</Alert>}
          {result && (
            <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
              <div className="flex items-start justify-between gap-3">
                <TwoLine primary={result.visitor.fullName} secondary={t('{relationship} · born {year}', { relationship: tr(result.visitor.relationship), year: result.visitor.birthYear })} />
                <StatusTag status={result.visitor.overdue ? 'Overdue' : result.visitor.status}>{result.visitor.overdue ? t('Overdue') : guestStatusLabel(result.visitor.status)}</StatusTag>
              </div>
              <p className="text-sm text-fg-secondary">
                {t('Guest of {student} ({code}, Room {room})', { student: result.visitor.studentName, code: result.visitor.studentCode, room: result.visitor.room ?? '—' })}
                <br />
                {t('Time slot {slot}', { slot: slotText(result.visitor) })}
              </p>
              {result.problem && <Alert type="warning" title="Cannot check in">{result.problem}</Alert>}
              <div className="flex gap-2">
                {result.canCheckIn && (
                  <Button variant="primary" icon={LogIn} onClick={() => setCheckingIn(result.visitor)}>
                    Check in
                  </Button>
                )}
                {result.canCheckOut && (
                  <Button variant="primary" icon={LogOut} onClick={() => setCheckingOut(result.visitor)}>
                    Check out
                  </Button>
                )}
                <Button variant="text" onClick={() => setResult(null)}>
                  Clear
                </Button>
              </div>
            </div>
          )}
        </Card>
        <div className="grid content-start grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile size="md" icon={Users} label="Not arrived" value={formatNumber(counts?.notArrived)} />
          <KpiTile size="md" icon={DoorOpen} label="Inside now" value={formatNumber(counts?.inside)} />
          <KpiTile size="md" icon={TriangleAlert} label="Overdue" value={formatNumber(counts?.overdue)} valueTone={counts?.overdue ? 'error' : undefined} note="Inside after their time slot" />
          <KpiTile size="md" icon={CheckCheck} label="Left" value={formatNumber(counts?.checkedOut)} note={counts?.noShow ? t('{n} No-shows', { n: formatNumber(counts.noShow) }) : undefined} />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <SearchInput
          wrapperClassName="w-72"
          placeholder="Guest, student or student code"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
        <Select
          wrapperClassName="w-52"
          aria-label={t('Status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          options={[{ value: '', label: 'Status: All' }, ...(query.data?.statuses ?? []).map((s) => ({ value: s, label: t('Status: {s}', { s: guestStatusLabel(s) }) }))]}
        />
        <Select
          wrapperClassName="w-60"
          aria-label={t('Time slot')}
          value={slotId}
          onChange={(e) => {
            setSlotId(e.target.value)
            setPage(1)
          }}
          options={[{ value: '', label: 'Every time slot' }, ...(day.data?.slots ?? []).map((s) => ({ value: s.id, label: `${formatDateTime(s.startsAt)} – ${formatTime(s.endsAt)}` }))]}
        />
      </div>

      {/* The list keeps the height of its rows and the page scrolls: with "fill" it only got what the pass card and
          the tiles left, a few rows on a laptop. */}
      <Table className="shrink-0">
        <THead>
          <tr>
            <Th className="w-56">Guest</Th>
            <Th className="w-56">Student</Th>
            <Th className="w-48">Time slot</Th>
            <Th className="w-32">Status</Th>
            <Th>In and out</Th>
            <Th className="w-32">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={6} emptyIcon={UserX} emptyTitle="No guests" />
          {items.map((v) => (
            <Tr key={v.id} className="[&>td]:h-12">
              <Td>
                <TwoLine primary={v.fullName} secondary={t('{relationship} · born {year}', { relationship: tr(v.relationship), year: v.birthYear })} />
              </Td>
              <Td>
                <TwoLine primary={v.studentName} secondary={[v.studentCode, v.room].filter(Boolean).join(' · ')} />
              </Td>
              <Td className="whitespace-nowrap">{slotText(v)}</Td>
              <Td>
                <StatusTag status={v.overdue ? 'Overdue' : v.status}>{v.overdue ? t('Overdue') : guestStatusLabel(v.status)}</StatusTag>
              </Td>
              <Td className="text-sm text-fg-secondary">
                {[
                  v.checkedInAt ? t('In {time} by {name}', { time: formatTime(v.checkedInAt), name: v.checkedInBy ?? '—' }) : null,
                  v.checkedOutAt ? t('Out {time} by {name}', { time: formatTime(v.checkedOutAt), name: v.checkedOutBy ?? '—' }) : null,
                  v.checkOutNote,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Td>
              <Td>
                {v.status === 'Not arrived' && (
                  <Button size="sm" icon={LogIn} onClick={() => setCheckingIn(v)}>
                    Check in
                  </Button>
                )}
                {v.status === 'Checked in' && (
                  <Button size="sm" icon={LogOut} onClick={() => setCheckingOut(v)}>
                    Check out
                  </Button>
                )}
              </Td>
            </Tr>
          ))}
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

      {scanning && (
        <CameraScanner
          onCode={(value) => {
            setScanning(false)
            scan(value)
          }}
          onClose={() => setScanning(false)}
        />
      )}
      {checkingIn && <CheckInModal visitor={checkingIn} onClose={closeModal} />}
      {checkingOut && <CheckOutModal visitor={checkingOut} onClose={closeModal} />}
    </>
  )
}
