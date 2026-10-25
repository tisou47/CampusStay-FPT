import { useEffect, useState } from 'react'
import { Layers, Lock } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Card } from '@/components/ui/Display'
import { Field, SearchInput, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { countLines } from '@/lib/furniture'
import { formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-INV-11 Room Classes by Term (Change Spec v2 phase 3, ADR-24). Managers set the Room Class of Rooms for a
// Term that has not started; a class set for a Term stays for the Terms after it.
// GET /inventory/room-classes?termId&block&floor&roomClassId&match&q&page&pageSize → { term: { id, name, stayStart,
//   current, editable }, terms, items: [{ room, block, floor, roomType, roomClassId, roomClass, previousClass, setForTerm,
//   locked, conformance: { status, missing: [{ typeId, type, typeVi, quantity }], extra } }], total,
//   summary: [{ roomClassId, roomClass, rooms }], roomClasses: [{ id, name }], blocks, note }
// PUT /inventory/room-classes { termId, rooms, roomClassId } → { changed, unchanged }

function ConfirmModal({ term, rooms, roomClass, onClose, onDone }) {
  const { notify } = useToast()
  const save = useMutation(() => api.inventory.setRoomClass({ termId: term.id, rooms, roomClassId: roomClass.id }), {
    invalidates: ['room-classes', 'inventory'],
    onSuccess: (res) => {
      notify({
        title: t(res?.changed === 1 ? '{n} Room set to {roomClass}' : '{n} Rooms set to {roomClass}', { n: formatNumber(res?.changed ?? 0), roomClass: tr(roomClass.name) }),
        message: res?.unchanged ? t(res.unchanged === 1 ? '{n} Room already had this Room Class.' : '{n} already had this Room Class.', { n: formatNumber(res.unchanged) }) : 'Next-Term prices use the new Room Class.',
      })
      onDone()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={t(rooms.length === 1 ? 'Set {n} Room to {roomClass}' : 'Set {n} Rooms to {roomClass}', { n: formatNumber(rooms.length), roomClass: tr(roomClass.name) })}
      description={t('From {term} on. Rooms keep this class in later Terms until another one is set.', { term: term.name })}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Layers} onClick={() => save.run()} disabled={save.pending}>
            Set Room Class
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not set the Room Class">{save.error.message}</Alert>}
      <p className="text-base text-fg-secondary">{rooms.slice(0, 12).join(', ')}{rooms.length > 12 ? ` ${t('and {n} more', { n: rooms.length - 12 })}` : ''}</p>
      <Alert title="Check the furniture">Each Room must have the furniture its Room Class requires before the Term starts. Plan the moves in Furniture.</Alert>
    </Modal>
  )
}

export default function RoomClassesByTerm() {
  const { block: scopeBlock, user } = useSession()
  const manages = user?.role === 'manager'
  const [termId, setTermId] = useState('')
  const [block, setBlock] = useState(scopeBlock ?? '')
  const [roomClassId, setRoomClassId] = useState('')
  const [match, setMatch] = useState('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [selected, setSelected] = useState([])
  const [target, setTarget] = useState('')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])
  const request = { termId: termId || undefined, block: block || undefined, roomClassId: roomClassId || undefined, match: match || undefined, q: search || undefined, page, pageSize }
  const query = useQuery(['room-classes', request], ({ signal }) => api.inventory.roomClasses(request, { signal }))
  const d = query.data
  const term = d?.term
  const editable = manages && term?.editable
  useEffect(() => setSelected([]), [termId, block, roomClassId, match, search, page, pageSize])

  const items = d?.items ?? []
  const selectable = items.filter((r) => !r.locked)
  const allOnPage = selectable.length > 0 && selectable.every((r) => selected.includes(r.room))
  const toggle = (room) => setSelected((s) => (s.includes(room) ? s.filter((x) => x !== room) : [...s, room]))
  const filterChange = (setter) => (e) => {
    setter(e.target.value)
    setPage(1)
  }
  const chosenClass = (d?.roomClasses ?? []).find((c) => c.id === target)

  return (
    <>
      <PageHeader title="Room Classes by Term" description="The Room Class of every Room for a Term. A class set for a Term stays for the Terms after it." />
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Select
          wrapperClassName="w-60"
          aria-label={t('Term')}
          value={termId || term?.id || ''}
          onChange={filterChange(setTermId)}
          options={(d?.terms ?? []).map((x) => ({ value: x.id, label: `${x.name} · ${t(x.editable ? 'can change' : 'fixed')}` }))}
          disabled={!d?.terms?.length}
        />
        <Select
          wrapperClassName="w-36"
          aria-label={t('Block')}
          value={block}
          onChange={filterChange(setBlock)}
          options={[{ value: '', label: 'Block: All' }, ...(d?.blocks ?? []).map((b) => ({ value: b, label: t('Block: {b}', { b }) }))]}
        />
        <Select
          wrapperClassName="w-48"
          aria-label={t('Room Class')}
          value={roomClassId}
          onChange={filterChange(setRoomClassId)}
          options={[{ value: '', label: t('{label}: All', { label: t('Room Class') }) }, ...(d?.roomClasses ?? []).map((c) => ({ value: c.id, label: `${t('Room Class')}: ${tr(c.name)}` }))]}
        />
        <Select
          wrapperClassName="w-52"
          aria-label={t('Furniture')}
          value={match}
          onChange={filterChange(setMatch)}
          options={[
            { value: '', label: t('{label}: All', { label: t('Furniture') }) },
            { value: 'Matches', label: `${t('Furniture')}: ${t('Matches')}` },
            { value: 'Does not match', label: `${t('Furniture')}: ${t('Does not match')}` },
          ]}
        />
        <SearchInput wrapperClassName="w-52" aria-label={t('Search')} placeholder="Room code" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          {(d?.summary ?? []).map((s) => (
            <Tag key={s.roomClassId} tone="brand" dot={false}>
              {`${tr(s.roomClass)} · ${formatNumber(s.rooms)}`}
            </Tag>
          ))}
        </div>
      </div>

      {d?.note && <Alert title={term ? 'This Term is running' : 'No Term yet'}>{tr(d.note)}</Alert>}
      {editable && selected.length > 0 && (
        <Card className="flex shrink-0 flex-wrap items-center gap-3" padding="sm">
          <span className="text-base font-medium text-fg">{t(selected.length === 1 ? '{n} Room selected' : '{n} Rooms selected', { n: formatNumber(selected.length) })}</span>
          <Field label="New Room Class" className="w-56">
            {(id) => (
              <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)} options={[{ value: '', label: 'Choose…' }, ...(d?.roomClasses ?? []).map((c) => ({ value: c.id, label: tr(c.name) }))]} />
            )}
          </Field>
          <span className="flex-1" />
          <Button onClick={() => setSelected([])}>Clear selection</Button>
          <Button variant="primary" icon={Layers} onClick={() => setConfirming(true)} disabled={!chosenClass}>
            Set Room Class
          </Button>
        </Card>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill>
          <THead>
            <tr>
              {editable && (
                <Th className="w-10">
                  <Checkbox aria-label={t('Select all on this page')} checked={allOnPage} onChange={() => setSelected(allOnPage ? [] : selectable.map((r) => r.room))} />
                </Th>
              )}
              <Th className="w-28">Room</Th>
              <Th className="w-20">Floor</Th>
              <Th className="w-24">Room Type</Th>
              <Th className="w-64">Room Class</Th>
              <Th>Furniture</Th>
              <Th className="w-44">Change</Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={editable ? 7 : 6} rows={items} emptyIcon={Layers} emptyTitle="No Rooms match these filters" />
            {items.map((r) => {
              const changed = r.previousClass && r.previousClass !== r.roomClass
              const c = r.conformance
              return (
                <Tr key={r.room} selected={selected.includes(r.room)} className="[&>td]:h-14">
                  {editable && (
                    <Td>
                      <Checkbox aria-label={t('Select Room {code}', { code: r.room })} checked={selected.includes(r.room)} disabled={r.locked} onChange={() => toggle(r.room)} />
                    </Td>
                  )}
                  <Td className="font-medium">{r.room}</Td>
                  <Td>{t('Floor {n}', { n: r.floor })}</Td>
                  <Td>{tr(r.roomType)}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      {changed && <span className="text-sm text-fg-tertiary line-through">{tr(r.previousClass)}</span>}
                      <span className="font-medium text-fg">{tr(r.roomClass)}</span>
                      {r.setForTerm && <Tag tone="info" dot={false}>Set for this Term</Tag>}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <StatusTag status={c?.status} className="self-start" />
                      {c?.missing?.length > 0 && <span className="truncate text-sm text-fg-secondary">{t('Missing: {items}', { items: countLines(c.missing) })}</span>}
                      {c?.extra?.length > 0 && <span className="truncate text-sm text-fg-secondary">{t('Remove: {items}', { items: countLines(c.extra) })}</span>}
                    </div>
                  </Td>
                  <Td>
                    {r.locked ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-fg-secondary">
                        <Lock size={14} aria-hidden="true" />
                        {t('Beds already given')}
                      </span>
                    ) : term?.editable ? (
                      <span className="text-sm text-fg-tertiary">{t('Can change')}</span>
                    ) : (
                      <span className="text-sm text-fg-tertiary">{t('Fixed')}</span>
                    )}
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

      {confirming && chosenClass && term && (
        <ConfirmModal
          term={term}
          rooms={selected}
          roomClass={chosenClass}
          onClose={() => setConfirming(false)}
          onDone={() => {
            setConfirming(false)
            setSelected([])
            setTarget('')
          }}
        />
      )}
    </>
  )
}
