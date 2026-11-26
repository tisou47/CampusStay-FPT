import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, Download, Eye, KeyRound, Shuffle, Upload, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Radio } from '@/components/ui/Choice'
import { Alert, Note } from '@/components/ui/Display'
import { Field, Input, SearchInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { t, tr } from '@/i18n'
import { useRoleBase } from '@/lib/useRoleBase'

// SCR-INV-12 Door codes (Change Spec v2 phase 3, ADR-23, spec §6.8). Shared by Staff (their Blocks) and Managers.
// GET /door-codes?block&status&q&page&pageSize → { items: [{ room, block, floor, status (Change needed, Not set, Active),
//   proposed, proposedAt, activeSince, task: { reason, since } | null, residents }], total,
//   counts: { toChange, notSet, proposed, active }, statuses }
// POST /door-codes/:room { code? } → { room, code } · POST /door-codes/:room/confirm · POST /door-codes/:room/cancel
// POST /door-codes/:room/reveal → { room, active, proposed }
// POST /door-codes/import (multipart file: CSV room,code) → { proposed }

function CodeText({ code }) {
  return <span className="font-mono text-h1 font-semibold tracking-[0.3em] text-fg tabular">{code}</span>
}

export function SetCodeModal({ room, onClose }) {
  const { notify } = useToast()
  const [mode, setMode] = useState('random')
  const [code, setCode] = useState('')
  const [proposed, setProposed] = useState(null)
  const propose = useMutation(() => api.doorCodes.propose(room.room, mode === 'typed' ? { code: code.trim() } : {}), {
    invalidates: ['door-codes', 'inventory'],
    onSuccess: (res) => setProposed(res.code),
    onError: () => {},
  })
  const confirm = useMutation(() => api.doorCodes.confirm(room.room), {
    invalidates: ['door-codes', 'inventory'],
    onSuccess: () => {
      notify({ title: t('Door code of Room {code} changed', { code: room.room }), message: 'Its residents are told that the code changed (never the code itself).' })
      onClose()
    },
    onError: () => {},
  })
  const error = propose.error ?? confirm.error
  return (
    <Modal
      open
      onClose={onClose}
      title={t('New door code · Room {code}', { code: room.room })}
      description={proposed ? 'Set this code on the lock, try it, then confirm it here.' : 'The current code stays active until you confirm the new one.'}
      footer={
        proposed ? (
          <>
            <Button onClick={onClose}>Confirm later</Button>
            <Button variant="primary" icon={Check} onClick={() => confirm.run()} disabled={confirm.pending}>
              The lock uses this code
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={KeyRound} onClick={() => propose.run()} disabled={propose.pending || (mode === 'typed' && !/^\d{6}$/.test(code.trim()))}>
              {mode === 'random' ? t('Draw a code') : t('Use this code')}
            </Button>
          </>
        )
      }
    >
      {error && <Alert type="error" title="Could not change the door code">{error.summary}</Alert>}
      {proposed ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-subtle p-5">
          <CodeText code={proposed} />
          <span className="text-sm text-fg-tertiary">{t('Shown to you only; the audit log records that a code was set.')}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3" role="radiogroup" aria-label={t('New door code')}>
          <Radio name="mode" label="Draw a random code" description="Never the same as the current code." checked={mode === 'random'} onChange={() => setMode('random')} />
          <Radio name="mode" label="Type the code" description="For a code already set on the lock." checked={mode === 'typed'} onChange={() => setMode('typed')} />
          {mode === 'typed' && (
            <Field label="Door code" helper="6 digits" error={propose.error?.fields?.code}>
              {(id) => (
                <Input
                  id={id}
                  value={code}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="off"
                  onBeforeInput={(e) => {
                    if (!e.data) return
                    const hasSelection = e.currentTarget.selectionStart !== e.currentTarget.selectionEnd
                    if (!/^\d+$/.test(e.data) || (!hasSelection && e.currentTarget.value.length >= 6)) {
                      e.preventDefault()
                    }
                  }}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, 6)
                    e.target.value = next
                    setCode(next)
                  }}
                />
              )}
            </Field>
          )}
        </div>
      )}
    </Modal>
  )
}

function RevealModal({ codes: d, onClose }) {
  return (
    <Modal open onClose={onClose} title={t('Door code · Room {code}', { code: d.room })} description="This view is written to the audit log." footer={<Button onClick={onClose}>Close</Button>}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-line p-4">
          <span className="text-base text-fg-secondary">{t('Current code')}</span>
          {d.active ? <CodeText code={d.active} /> : <span className="text-fg-tertiary">{t('Not set')}</span>}
        </div>
        {d.proposed && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-info bg-info-bg p-4">
            <span className="text-base text-fg-secondary">{t('New code waiting for confirmation')}</span>
            <CodeText code={d.proposed} />
          </div>
        )}
      </div>
    </Modal>
  )
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function xmlEscape(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Builds a minimal valid one-sheet .xlsx workbook (same structure as backend XlsxFile.java) so Excel/WPS always opens columns A & B cleanly regardless of Windows regional delimiter. */
function buildXlsxBytes(sheetName, rows) {
  const enc = new TextEncoder()
  const colName = (idx) => {
    let name = ''
    for (let i = idx + 1; i > 0; i = Math.floor((i - 1) / 26)) {
      name = String.fromCharCode(65 + ((i - 1) % 26)) + name
    }
    return name
  }
  const width = rows[0]?.length ?? 2
  let sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="${width}" width="20" customWidth="1"/></cols><sheetData>`
  rows.forEach((row, r) => {
    sheetXml += `<row r="${r + 1}">`
    row.forEach((val, c) => {
      sheetXml += `<c r="${colName(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlEscape(val)}</t></is></c>`
    })
    sheetXml += '</row>'
  })
  sheetXml += '</sheetData></worksheet>'

  const parts = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ],
    [
      'xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>',
    ],
    ['xl/worksheets/sheet1.xml', sheetXml],
  ].map(([name, content]) => {
    const nameBytes = enc.encode(name)
    const dataBytes = enc.encode(content)
    return { nameBytes, dataBytes, crc: crc32(dataBytes) }
  })

  const localChunks = []
  const centralChunks = []
  let offset = 0
  for (const p of parts) {
    const local = new Uint8Array(30 + p.nameBytes.length + p.dataBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint32(14, p.crc, true)
    lv.setUint32(18, p.dataBytes.length, true)
    lv.setUint32(22, p.dataBytes.length, true)
    lv.setUint16(26, p.nameBytes.length, true)
    local.set(p.nameBytes, 30)
    local.set(p.dataBytes, 30 + p.nameBytes.length)
    localChunks.push(local)

    const central = new Uint8Array(46 + p.nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint32(16, p.crc, true)
    cv.setUint32(20, p.dataBytes.length, true)
    cv.setUint32(24, p.dataBytes.length, true)
    cv.setUint16(28, p.nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(p.nameBytes, 46)
    centralChunks.push(central)
    offset += local.length
  }

  const centralSize = centralChunks.reduce((s, c) => s + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, parts.length, true)
  ev.setUint16(10, parts.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  return new Blob([...localChunks, ...centralChunks, eocd], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/** If the uploaded file is an .xlsx workbook, converts its first sheet into a "Room,Code" CSV File for POST /door-codes/import. */
async function normalizeDoorCodeUpload(file) {
  const buf = new Uint8Array(await file.arrayBuffer())
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
  if (!isZip) return file

  const dec = new TextDecoder()
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  // Locate End of Central Directory (EOCD)
  let eocdOffset = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) return file
  const entryCount = view.getUint16(eocdOffset + 10, true)
  let cdOffset = view.getUint32(eocdOffset + 16, true)
  const entries = new Map()
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break
    const method = view.getUint16(cdOffset + 10, true)
    const compSize = view.getUint32(cdOffset + 20, true)
    const nameLen = view.getUint16(cdOffset + 28, true)
    const extraLen = view.getUint16(cdOffset + 30, true)
    const commentLen = view.getUint16(cdOffset + 32, true)
    const localOffset = view.getUint32(cdOffset + 42, true)
    const name = dec.decode(buf.subarray(cdOffset + 46, cdOffset + 46 + nameLen))
    entries.set(name, { method, compSize, localOffset })
    cdOffset += 46 + nameLen + extraLen + commentLen
  }

  const readEntryText = async (name) => {
    const info = entries.get(name)
    if (!info) return null
    const lNameLen = view.getUint16(info.localOffset + 26, true)
    const lExtraLen = view.getUint16(info.localOffset + 28, true)
    const start = info.localOffset + 30 + lNameLen + lExtraLen
    const slice = buf.subarray(start, start + info.compSize)
    if (info.method === 0) return dec.decode(slice)
    if (info.method === 8) {
      const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return await new Response(stream).text()
    }
    return null
  }

  const sharedXml = await readEntryText('xl/sharedStrings.xml')
  const shared = []
  if (sharedXml) {
    const sDoc = new DOMParser().parseFromString(sharedXml, 'application/xml')
    sDoc.querySelectorAll('si').forEach((si) => {
      shared.push([...si.querySelectorAll('t')].map((tNode) => tNode.textContent ?? '').join(''))
    })
  }

  const sheetXml = (await readEntryText('xl/worksheets/sheet1.xml')) ?? (await readEntryText('xl/worksheets/sheet.xml'))
  if (!sheetXml) return file
  const doc = new DOMParser().parseFromString(sheetXml, 'application/xml')
  const csvLines = []
  doc.querySelectorAll('sheetData > row, row').forEach((rowEl) => {
    const cols = []
    rowEl.querySelectorAll('c').forEach((cEl) => {
      const ref = cEl.getAttribute('r') || ''
      const colLetters = ref.replace(/\d+/g, '')
      let colIdx = 0
      for (let i = 0; i < colLetters.length; i++) colIdx = colIdx * 26 + (colLetters.charCodeAt(i) - 64)
      colIdx = Math.max(0, colIdx - 1)
      const type = cEl.getAttribute('t')
      let val = ''
      if (type === 's') {
        const idx = Number(cEl.querySelector('v')?.textContent ?? -1)
        val = shared[idx] ?? ''
      } else if (type === 'inlineStr') {
        val = [...cEl.querySelectorAll('t')].map((tNode) => tNode.textContent ?? '').join('')
      } else {
        val = cEl.querySelector('v')?.textContent ?? ''
      }
      cols[colIdx] = val.trim()
    })
    if (cols.some(Boolean)) csvLines.push(`${cols[0] ?? ''},${cols[1] ?? ''}`)
  })

  return new File([csvLines.join('\r\n')], file.name.replace(/\.xlsx$/i, '.csv'), { type: 'text/csv;charset=utf-8' })
}

function randomSixDigitCode(used) {
  const arr = new Uint32Array(1)
  for (let attempt = 0; attempt < 20; attempt++) {
    crypto.getRandomValues(arr)
    const code = String(100000 + (arr[0] % 900000))
    if (!used.has(code)) {
      used.add(code)
      return code
    }
  }
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function downloadDoorCodeTemplate(items, block, status) {
  const b = block || 'A'
  let pool = items ?? []
  try {
    const res = await api.doorCodes.list({ block: block ?? undefined, status: status || undefined, page: 1, pageSize: 200 })
    if (res?.items?.length) pool = res.items
  } catch {
    // Fallback to currently loaded items if fetching all rooms fails.
  }
  const urgent = pool.filter((r) => r.status === 'Change needed' || r.status === 'Not set').map((r) => r.room)
  const rooms = status ? pool.map((r) => r.room) : urgent.length ? urgent : pool.map((r) => r.room)
  const list = rooms.length ? rooms : [`${b}-101`, `${b}-102`]
  const used = new Set()
  const rows = [['Room', 'Code'], ...list.map((room) => [room, randomSixDigitCode(used)])]
  const blob = buildXlsxBytes('Door codes', rows)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `door-codes-template-${b.toLowerCase()}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function ImportModal({ items, block, status, onClose }) {
  const { notify } = useToast()
  const input = useRef(null)
  const run = useMutation(
    async (file) => {
      const normalized = await normalizeDoorCodeUpload(file)
      const form = new FormData()
      form.append('file', normalized)
      return api.doorCodes.import(form)
    },
    {
      invalidates: ['door-codes'],
      onSuccess: (res) => {
        notify({ title: t(res?.proposed === 1 ? '{n} new door code to confirm' : '{n} new door codes to confirm', { n: res?.proposed ?? 0 }), message: 'Set each code on its lock, then confirm it.' })
        onClose()
      },
      onError: () => {},
    },
  )
  const problems = Object.values(run.error?.fields ?? {})
  return (
    <Modal
      open
      onClose={onClose}
      title="Import door codes"
      description="A CSV file with the columns room and Code (6 digits), one room per line. Every line is checked first; nothing is saved while a line has a problem."
      footer={
        <>
          <Button icon={Download} onClick={() => downloadDoorCodeTemplate(items, block, status)}>
            Download template
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) run.run(file)
              e.target.value = ''
            }}
          />
          <Button variant="primary" icon={Upload} onClick={() => input.current?.click()} disabled={run.pending}>
            {run.pending ? t('Reading the file…') : t('Choose a CSV file')}
          </Button>
        </>
      }
    >
      <pre className="rounded-lg border border-line bg-subtle p-3 text-sm text-fg-secondary">{'Room,Code\nA-101,482915\nA-102,730164'}</pre>
      {run.error && (
        <Alert type="error" title="The file was not imported">
          {problems.length ? (
            <ul className="flex list-disc flex-col gap-0.5 pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            run.error.message
          )}
        </Alert>
      )}
      <Note>Imported codes wait for confirmation, like codes typed one by one.</Note>
    </Modal>
  )
}

export default function DoorCodes() {
  const atManager = useRoleBase() === '/manager'
  const { block } = useSession()
  const { notify, notifyError } = useToast()
  const [params] = useSearchParams()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState(params.get('room') ?? '')
  const [search, setSearch] = useState(params.get('room') ?? '')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [modal, setModal] = useState(null)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])
  const request = { block: block ?? undefined, status: status || undefined, q: search || undefined, page, pageSize }
  const query = useQuery(['door-codes', request], ({ signal }) => api.doorCodes.list(request, { signal }))
  const d = query.data
  const counts = d?.counts
  const cancel = useMutation((room) => api.doorCodes.cancel(room), {
    invalidates: ['door-codes'],
    onSuccess: (_, room) => notify({ title: t('New code of Room {code} dropped', { code: room }), message: 'The current code stays active.' }),
    onError: (e) => notifyError(e, 'Could not drop the new code'),
  })
  const reveal = useMutation((room) => api.doorCodes.reveal(room), {
    onSuccess: (codes) => setModal({ type: 'reveal', codes }),
    onError: (e) => notifyError(e, 'Could not show the code'),
  })
  const confirm = useMutation((room) => api.doorCodes.confirm(room), {
    invalidates: ['door-codes', 'inventory'],
    onSuccess: (_, room) => notify({ title: t('Door code of Room {code} changed', { code: room }), message: 'Its residents are told that the code changed (never the code itself).' }),
    onError: (e) => notifyError(e, 'Could not confirm the code'),
  })

  return (
    <>
      <PageHeader
        title="Door codes"
        description={atManager ? undefined : "One 6-digit code per room. Set the new code on the lock, then confirm it here; residents are told without the code."}
        actions={
          <>
            <Button icon={Download} onClick={() => downloadDoorCodeTemplate(d?.items, block, status)}>
              Download template
            </Button>
            <Button icon={Upload} onClick={() => setModal({ type: 'import' })}>
              Import codes
            </Button>
          </>
        }
      />
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <Tabs
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
          items={[
            // All rooms first, then by urgency: rooms to re-key, codes set on the lock but unconfirmed, rooms with no code, done.
            { key: '', label: 'All rooms', count: counts ? (counts.toChange ?? 0) + (counts.notSet ?? 0) + (counts.active ?? 0) : undefined },
            { key: 'Change needed', label: 'Change needed', count: counts?.toChange },
            { key: 'Waiting for confirmation', label: 'Waiting for confirmation', count: counts?.proposed },
            { key: 'Not set', label: 'Not set', count: counts?.notSet },
            { key: 'Active', label: 'Active', count: counts?.active },
          ]}
        />
        <SearchInput wrapperClassName="w-60" aria-label={t('Search')} placeholder="Room code" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill tableClassName="min-w-4xl table-fixed">
          <THead>
            <tr>
              <Th className="w-36">Room</Th>
              <Th className="w-52">Status</Th>
              <Th className="w-28" align="center">
                Living here
              </Th>
              <Th>Why · since</Th>
              <Th className="w-80" align="right">
                Actions
              </Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={5} rows={d?.items} emptyIcon={KeyRound} emptyTitle="No rooms here" emptyText={status === 'Change needed' ? 'No door code needs to change.' : undefined} />
            {(d?.items ?? []).map((r) => {
              const why = r.task
                ? t('{reason} · {date}', { reason: tr(r.task.reason), date: formatDateTime(r.task.since) })
                : r.activeSince
                  ? t('Active since {date}', { date: formatDateTime(r.activeSince) })
                  : '—'
              return (
                <Tr key={r.room} className="[&>td]:h-16 [&>td]:align-middle">
                  <Td>
                    <TwoLine primary={r.room} secondary={t('Block {code} · Floor {n}', { code: r.block, n: r.floor })} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusTag status={r.status} />
                      {r.proposed && (
                        <Tag tone="info" dot={false}>
                          New code pending
                        </Tag>
                      )}
                    </div>
                  </Td>
                  <Td align="center" className="font-medium text-fg tabular">
                    {r.residents}
                  </Td>
                  <Td wrap={false} className="text-sm text-fg-secondary">
                    <span className="block truncate" title={why}>
                      {why}
                    </span>
                  </Td>
                  <Td align="right">
                    {/* Three sized slots (show · drop · main action) so buttons stay aligned vertically across all rows without clipping. */}
                    <div className="ml-auto grid w-fit grid-cols-[6.5rem_4.5rem_6.75rem] items-center gap-1.5">
                      <div>
                        {(r.status === 'Active' || r.proposed) && (
                          <Button block className="px-2" tip="Show the current code. Every view is written to the audit log." variant="text" size="sm" icon={Eye} iconSize={15} onClick={() => reveal.run(r.room)} disabled={reveal.pending}>
                            Show code
                          </Button>
                        )}
                      </div>
                      <div>
                        {r.proposed && (
                          <Button block className="px-2" tip="Discard the new code that is not on the lock yet. The current code stays." variant="text" size="sm" icon={X} iconSize={15} onClick={() => cancel.run(r.room)} disabled={cancel.pending}>
                            Drop
                          </Button>
                        )}
                      </div>
                      <div>
                        {r.proposed ? (
                          <Button block className="px-2.5" tip="Confirm once the new code is set on the lock. Residents are told, without the code." variant="primary" size="sm" icon={Check} iconSize={15} onClick={() => confirm.run(r.room)} disabled={confirm.pending}>
                            Confirm
                          </Button>
                        ) : (
                          <Button block className="px-2.5" tip="Generate or type a new 6-digit code for this room." size="sm" icon={Shuffle} iconSize={15} onClick={() => setModal({ type: 'set', room: r })}>
                            Set new code
                          </Button>
                        )}
                      </div>
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
        <div className="flex shrink-0 justify-end">
          <Pagination
            total={d?.total ?? 0}
            page={page}
            pageSize={pageSize}
            onChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n)
              setPage(1)
            }}
            noun={['room', 'rooms']}
          />
        </div>
      </div>
      {modal?.type === 'set' && <SetCodeModal room={modal.room} onClose={() => setModal(null)} />}
      {modal?.type === 'reveal' && <RevealModal codes={modal.codes} onClose={() => setModal(null)} />}
      {modal?.type === 'import' && <ImportModal items={d?.items} block={block} status={status} onClose={() => setModal(null)} />}
    </>
  )
}
