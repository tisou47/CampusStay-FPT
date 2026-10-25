import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowRight, Check, MoveRight, Package, Plus, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Note } from '@/components/ui/Display'
import { Field, Input, SearchInput, Select, Textarea } from '@/components/ui/Field'
import { Drawer, Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine, stop } from '@/components/ui/Table'
import { Segmented, Tabs } from '@/components/ui/Tabs'
import { StatusTag } from '@/components/ui/Tag'
import { typeName } from '@/lib/furniture'
import { formatDateTime, formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-INV-13 Furniture (Change Spec v2 phase 3, spec §6.19). Shared by Staff (their Blocks: status, store, moves
// inside the Block) and Managers (also register items and transfer them between Blocks).
// GET /furniture?block&room&location(room|store)&typeId&status&q&page&pageSize → { items: [{ id, assetCode, typeId, type,
//   typeVi, category, status, location: { kind, room, block }, note, plannedMove: { id, to, reason } | null, updatedAt }],
//   total, counts: { [status]: n }, options: { types: [{ id, name, nameVi }], statuses, blocks } }
// GET /furniture/:id → { item, history: [{ at, kind, from, to, reason, by }] } · PUT /furniture/:id { status, note, reason }
// POST /furniture { typeId, block, room?, quantity, note? } → { assetCodes }
// GET /furniture/moves?block&status&page&pageSize · POST /furniture/moves { items, toRoom | toStore, reason, planned }
// POST /furniture/moves/:id/done · POST /furniture/moves/:id/cancel

export const placeLabel = (loc) => (!loc ? '—' : loc.kind === 'Room' ? t('Room {code}', { code: loc.room }) : t('Block {code} store', { code: loc.block }))

function MoveModal({ items, blocks, onClose, onDone }) {
  const { notify } = useToast()
  const [kind, setKind] = useState('room')
  const [room, setRoom] = useState('')
  const [store, setStore] = useState(blocks[0] ?? '')
  const [reason, setReason] = useState('')
  const [planned, setPlanned] = useState(false)
  const move = useMutation(
    () => api.furniture.move({ items: items.map((i) => i.id), toRoom: kind === 'room' ? room.trim() : undefined, toStore: kind === 'store' ? store : undefined, reason: reason.trim(), planned }),
    {
      invalidates: ['furniture', 'furniture-moves', 'inventory', 'room-classes'],
      onSuccess: (res) => {
        notify(res?.planned ? { title: t(res.planned === 1 ? '{n} move planned' : '{n} moves planned', { n: res.planned }), message: 'Mark each one done in Planned moves when it happens.' } : { title: t(res?.moved === 1 ? '{n} item moved' : '{n} items moved', { n: res?.moved ?? 0 }), message: 'Their history shows the move.' })
        onDone()
      },
      onError: () => {},
    },
  )
  return (
    <Modal
      open
      onClose={onClose}
      title={t(items.length === 1 ? 'Move {code}' : 'Move {n} items', { code: items[0]?.assetCode, n: items.length })}
      description="Inside your Blocks you move items yourself; moving to another Block is a Manager's transfer."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={MoveRight} onClick={() => move.run()} disabled={move.pending || !reason.trim() || (kind === 'room' ? !room.trim() : !store)}>
            {planned ? t('Plan the move') : t('Move now')}
          </Button>
        </>
      }
    >
      {move.error && <Alert type="error" title="Could not move the items">{move.error.summary}</Alert>}
      <Segmented value={kind} onChange={setKind} options={[{ value: 'room', label: 'To a Room' }, { value: 'store', label: 'To a Block store' }]} />
      {kind === 'room' ? (
        <Field label="Room" error={move.error?.fields?.room}>
          {(id) => <Input id={id} value={room} placeholder="e.g. A-305" onChange={(e) => setRoom(e.target.value)} />}
        </Field>
      ) : (
        <Field label="Block store">{(id) => <Select id={id} value={store} onChange={(e) => setStore(e.target.value)} options={blocks.map((b) => ({ value: b, label: t('Block {code} store', { code: b }) }))} />}</Field>
      )}
      <Field label="Reason" required error={move.error?.fields?.reason}>
        {(id) => <Textarea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Room Class change for next Term" />}
      </Field>
      <Checkbox label="Plan the move for later" description="A task for the turnover; the items stay where they are until it is marked done." checked={planned} onChange={(e) => setPlanned(e.target.checked)} />
    </Modal>
  )
}

function RegisterModal({ types, blocks, onClose }) {
  const { notify } = useToast()
  const [form, setForm] = useState({ typeId: types[0]?.id ?? '', block: blocks[0] ?? '', room: '', quantity: '1', note: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = useMutation(() => api.furniture.register({ ...form, room: form.room.trim() || undefined, quantity: Number(form.quantity) || 0, note: form.note.trim() || undefined }), {
    invalidates: ['furniture', 'inventory', 'room-classes'],
    onSuccess: (res) => {
      const codes = res?.assetCodes ?? []
      notify({ title: t(codes.length === 1 ? '{n} item registered' : '{n} items registered', { n: codes.length }), message: codes.length > 3 ? `${codes.slice(0, 3).join(', ')} …` : codes.join(', ') })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="Register furniture"
      description="New items get asset codes to print on their labels."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Plus} onClick={() => save.run()} disabled={save.pending || !form.typeId || !form.block}>
            Register
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not register the items">{save.error.summary}</Alert>}
      <Field label="Furniture type" error={save.error?.fields?.typeId}>
        {(id) => <Select id={id} value={form.typeId} onChange={set('typeId')} options={types.map((x) => ({ value: x.id, label: typeName(x) }))} />}
      </Field>
      <div className="flex gap-3">
        <Field label="Block" className="flex-1">
          {(id) => <Select id={id} value={form.block} onChange={set('block')} options={blocks.map((b) => ({ value: b, label: t('Block {code}', { code: b }) }))} />}
        </Field>
        <Field label="Room" helper="Blank = the Block store." className="flex-1" error={save.error?.fields?.room}>
          {(id) => <Input id={id} value={form.room} onChange={set('room')} placeholder="e.g. A-305" />}
        </Field>
      </div>
      <Field label="Quantity" helper="1 to 100" error={save.error?.fields?.quantity}>
        {(id) => <Input id={id} value={form.quantity} inputMode="numeric" onChange={set('quantity')} />}
      </Field>
      <Field label="Note">{(id) => <Textarea id={id} rows={2} value={form.note} onChange={set('note')} placeholder="e.g. Delivery of 25/10/2026" />}</Field>
    </Modal>
  )
}

function ItemDrawer({ id, statuses, onClose }) {
  const { notify } = useToast()
  const query = useQuery(['furniture', 'item', id], ({ signal }) => api.furniture.get(id, { signal }))
  const item = query.data?.item
  const [status, setStatus] = useState(null)
  const [reason, setReason] = useState('')
  const save = useMutation(() => api.furniture.update(id, { status: status ?? item.status, reason: reason.trim() || undefined }), {
    invalidates: ['furniture', 'inventory', 'room-classes'],
    onSuccess: () => {
      notify({ title: t('{code} saved', { code: item.assetCode }), message: 'The change is in its history.' })
      setStatus(null)
      setReason('')
    },
    onError: () => {},
  })
  const disposed = item?.status === 'Disposed'
  return (
    <Drawer
      open
      width={560}
      onClose={onClose}
      title={item ? `${item.assetCode} · ${typeName(item)}` : t('Furniture')}
      description={item ? placeLabel(item.location) : undefined}
      footer={
        !disposed && (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" icon={Check} onClick={() => save.run()} disabled={!item || save.pending || (status ?? item.status) === item.status}>
              Save status
            </Button>
          </>
        )
      }
    >
      <QueryState query={query} compact>
        {(data) => (
          <>
            {save.error && <Alert type="error" title="Could not save">{save.error.summary}</Alert>}
            {data.item.plannedMove && (
              <Note icon={ArrowRight}>{t('Planned move to {place}: {reason}', { place: placeLabel(data.item.plannedMove.to), reason: data.item.plannedMove.reason })}</Note>
            )}
            {disposed ? (
              <Alert title="Disposed">A disposed item cannot change any more.</Alert>
            ) : (
              <div className="flex gap-3">
                <Field label="Status" className="w-48" error={save.error?.fields?.status}>
                  {(fid) => <Select id={fid} value={status ?? data.item.status} onChange={(e) => setStatus(e.target.value)} options={statuses.map((s) => ({ value: s, label: tr(s) }))} />}
                </Field>
                <Field label="Reason" className="flex-1">
                  {(fid) => <Input id={fid} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Does not cool" />}
                </Field>
              </div>
            )}
            {data.item.note && <Note>{data.item.note}</Note>}
            <p className="text-base font-medium text-fg">{t('History')}</p>
            <ol className="flex flex-col gap-3">
              {data.history.map((h, i) => (
                <li key={i} className="flex flex-col gap-0.5 border-l-2 border-line pl-3">
                  <span className="text-base text-fg">
                    {tr(h.kind)}
                    {': '}
                    {h.from ? `${tr(h.from)} → ${tr(h.to)}` : tr(h.to)}
                  </span>
                  <span className="text-sm text-fg-tertiary">{[formatDateTime(h.at), h.by, h.reason].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
              {!data.history.length && <li className="text-sm text-fg-tertiary">{t('No changes recorded yet.')}</li>}
            </ol>
          </>
        )}
      </QueryState>
    </Drawer>
  )
}

function Items({ manages }) {
  const { block } = useSession()
  const [params] = useSearchParams()
  const [location, setLocation] = useState('')
  const [typeId, setTypeId] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState(params.get('room') ?? '')
  const [search, setSearch] = useState(params.get('room') ?? '')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selected, setSelected] = useState([])
  const [modal, setModal] = useState(null)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])
  const request = { block: block ?? undefined, location: location || undefined, typeId: typeId || undefined, status: status || undefined, q: search || undefined, page, pageSize }
  const query = useQuery(['furniture', request], ({ signal }) => api.furniture.list(request, { signal }))
  const d = query.data
  useEffect(() => setSelected([]), [block, location, typeId, status, search, page, pageSize])
  const items = d?.items ?? []
  const movable = items.filter((i) => i.status !== 'Disposed' && !i.plannedMove)
  const allOnPage = movable.length > 0 && movable.every((i) => selected.includes(i.id))
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const counts = d?.counts ?? {}

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Segmented
          value={location}
          onChange={(v) => {
            setLocation(v)
            setPage(1)
          }}
          options={[
            { value: '', label: 'All' },
            { value: 'room', label: 'In Rooms' },
            { value: 'store', label: 'In stores' },
          ]}
        />
        <Select
          wrapperClassName="w-52"
          aria-label={t('Furniture type')}
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value)
            setPage(1)
          }}
          options={[{ value: '', label: t('{label}: All', { label: t('Type') }) }, ...(d?.options?.types ?? []).map((x) => ({ value: x.id, label: `${t('Type')}: ${typeName(x)}` }))]}
        />
        <Select
          wrapperClassName="w-48"
          aria-label={t('Status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          options={[{ value: '', label: t('{label}: All', { label: t('Status') }) }, ...(d?.options?.statuses ?? []).map((s) => ({ value: s, label: `${t('Status')}: ${tr(s)}${counts[s] != null ? ` · ${formatNumber(counts[s])}` : ''}` }))]}
        />
        <SearchInput wrapperClassName="w-64" aria-label={t('Search')} placeholder="Asset code, Room or type" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="flex-1" />
        <Button icon={MoveRight} onClick={() => setModal({ type: 'move' })} disabled={!selected.length}>
          {selected.length ? t(selected.length === 1 ? 'Move {n} item' : 'Move {n} items', { n: selected.length }) : t('Move')}
        </Button>
        {manages && (
          <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'register' })} disabled={!d}>
            Register furniture
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill>
          <THead>
            <tr>
              <Th className="w-10">
                <Checkbox aria-label={t('Select all on this page')} checked={allOnPage} onChange={() => setSelected(allOnPage ? [] : movable.map((i) => i.id))} />
              </Th>
              <Th className="w-40">Asset code</Th>
              <Th>Type</Th>
              <Th className="w-32">Status</Th>
              <Th className="w-44">Where</Th>
              <Th className="w-56">Planned move</Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={6} rows={items} emptyIcon={Package} emptyTitle="No furniture matches these filters" />
            {items.map((i) => (
              <Tr key={i.id} selected={selected.includes(i.id)} onClick={() => setModal({ type: 'item', id: i.id })} className="[&>td]:h-12">
                <Td onClick={stop}>
                  <Checkbox aria-label={t('Select {code}', { code: i.assetCode })} checked={selected.includes(i.id)} disabled={!movable.includes(i)} onChange={() => toggle(i.id)} />
                </Td>
                <Td className="font-medium whitespace-nowrap">{i.assetCode}</Td>
                <Td>
                  <TwoLine primary={typeName(i)} secondary={tr(i.category)} />
                </Td>
                <Td>
                  <StatusTag status={i.status} />
                </Td>
                <Td>{placeLabel(i.location)}</Td>
                <Td className="text-sm text-fg-secondary">{i.plannedMove ? t('To {place}', { place: placeLabel(i.plannedMove.to) }) : '—'}</Td>
              </Tr>
            ))}
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
            noun={['furniture item', 'furniture items']}
          />
        </div>
      </div>
      {modal?.type === 'move' && (
        <MoveModal
          items={items.filter((i) => selected.includes(i.id))}
          blocks={d?.options?.blocks ?? []}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null)
            setSelected([])
          }}
        />
      )}
      {modal?.type === 'register' && <RegisterModal types={d?.options?.types ?? []} blocks={d?.options?.blocks ?? []} onClose={() => setModal(null)} />}
      {modal?.type === 'item' && <ItemDrawer id={modal.id} statuses={d?.options?.statuses ?? []} onClose={() => setModal(null)} />}
    </>
  )
}

function Moves() {
  const { block } = useSession()
  const { notify, notifyError } = useToast()
  const [status, setStatus] = useState('Planned')
  const [page, setPage] = useState(1)
  const request = { block: block ?? undefined, status, page, pageSize: 20 }
  const query = useQuery(['furniture-moves', request], ({ signal }) => api.furniture.moves(request, { signal }))
  const d = query.data
  const done = useMutation((id) => api.furniture.finishMove(id), {
    invalidates: ['furniture-moves', 'furniture', 'inventory', 'room-classes'],
    onSuccess: () => notify({ title: 'Move done', message: 'The item is now at its new place.' }),
    onError: (e) => notifyError(e, 'Could not record the move'),
  })
  const cancel = useMutation((id) => api.furniture.cancelMove(id), {
    invalidates: ['furniture-moves', 'furniture'],
    onSuccess: () => notify({ title: 'Move cancelled', message: 'The item stays where it is.' }),
    onError: (e) => notifyError(e, 'Could not cancel the move'),
  })
  return (
    <>
      <div className="flex shrink-0 items-center gap-3">
        <Segmented
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
          options={(d?.statuses ?? ['Planned', 'Done', 'Cancelled']).map((s) => ({ value: s, label: s }))}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill>
          <THead>
            <tr>
              <Th className="w-56">Item</Th>
              <Th>From → to</Th>
              <Th>Reason</Th>
              <Th className="w-56">By</Th>
              <Th className="w-56">
                <span className="sr-only">{t('Actions')}</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={5} rows={d?.items} emptyIcon={MoveRight} emptyTitle={status === 'Planned' ? 'No planned moves' : 'No moves'} />
            {(d?.items ?? []).map((m) => (
              <Tr key={m.id} className="[&>td]:h-14">
                <Td>
                  <TwoLine primary={m.assetCode} secondary={typeName(m)} />
                </Td>
                <Td>{`${placeLabel(m.from)} → ${placeLabel(m.to)}`}</Td>
                <Td className="text-sm text-fg-secondary">{m.reason}</Td>
                <Td>
                  <TwoLine primary={m.createdBy} secondary={formatDateTime(m.createdAt)} />
                </Td>
                <Td>
                  {m.status === 'Planned' ? (
                    <div className="flex justify-end gap-1">
                      <Button variant="text" icon={X} onClick={() => cancel.run(m.id)} disabled={cancel.pending}>
                        Cancel move
                      </Button>
                      <Button size="sm" variant="primary" icon={Check} onClick={() => done.run(m.id)} disabled={done.pending}>
                        Done
                      </Button>
                    </div>
                  ) : (
                    <TwoLine primary={tr(m.status)} secondary={[m.closedBy, formatDateTime(m.closedAt)].filter(Boolean).join(' · ')} />
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <div className="flex shrink-0 justify-end">
          <Pagination total={d?.total ?? 0} page={page} pageSize={20} onChange={setPage} showSizeChanger={false} noun={['move', 'moves']} />
        </div>
      </div>
    </>
  )
}

export default function Furniture() {
  const { user } = useSession()
  const manages = user?.role === 'manager'
  const [tab, setTab] = useState('items')
  return (
    <>
      <PageHeader
        title="Furniture"
        description={manages ? 'Every item with its status and place, the Block stores, moves and transfers between Blocks.' : 'Items of your Blocks: their status, the Block store and moves between Rooms.'}
      />
      <Tabs
        className="shrink-0"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'items', label: 'Furniture items' },
          { key: 'moves', label: 'Planned moves' },
        ]}
      />
      {tab === 'items' ? <Items manages={manages} /> : <Moves />}
    </>
  )
}
