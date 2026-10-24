import { useEffect, useState } from 'react'
import { Repeat } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { Field, Select } from '@/components/ui/Field'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDate, formatVnd } from '@/lib/format'
import { useCatalog } from './apply/wizard'
import { StudentPage } from './shared'
import { SwapModePicker, YourRoomNow } from './swap'
import { t, tr } from '@/i18n'

// SCR-REQ-04 Swap Board (Figma 104:2254). Posts are anonymous: no names or Student codes.
// GET /swap-board?termId → { blocks: ['A','B'], myPost: { block, roomTypeId, roomClassId, expiresAt } | null,
//   items: [{ id, offeredRoomTypeName, offeredRoomClassName, floor, block, wants, priceDifference, requested }] }
// PUT /swap-board/my-post { block, roomTypeId, roomClassId } · POST /swap-board/posts/:id/request

const signed = (n) => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatVnd(Math.abs(n))}`)

export default function SwapBoard() {
  const { term } = useSession()
  const { notify, notifyError } = useToast()
  const catalog = useCatalog()
  const board = useQuery(['swap-board', term?.id], ({ signal }) => api.swaps.board({ termId: term?.id }, { signal }))
  const [want, setWant] = useState({ block: '', roomTypeId: '', roomClassId: '' })
  const myPost = board.data?.myPost

  useEffect(() => {
    if (myPost) setWant({ block: myPost.block ?? '', roomTypeId: myPost.roomTypeId ?? '', roomClassId: myPost.roomClassId ?? '' })
  }, [myPost])

  const save = useMutation(() => api.swaps.savePost({ termId: term?.id, block: want.block || null, roomTypeId: want.roomTypeId, roomClassId: want.roomClassId }), {
    invalidates: ['swap-board'],
    onSuccess: () => notify({ title: 'Swap post saved', message: 'Compatible posts are listed below.' }),
    onError: (e) => notifyError(e, 'Could not save your post'),
  })
  const request = useMutation((post) => api.swaps.requestPost(post.id), {
    invalidates: ['swap-board', 'requests'],
    onSuccess: (_, post) => notify({ title: 'Swap requested', message: post.crossBlock ? 'If they request you back, a Manager approves the cross-Block swap.' : 'If they request you back, Staff approve the swap.' }),
    onError: (e) => notifyError(e, 'Could not request this swap'),
  })

  const items = board.data?.items ?? []
  const blocks = board.data?.blocks ?? []
  const set = (k) => (e) => setWant((w) => ({ ...w, [k]: e.target.value }))
  const dirty = !myPost || myPost.block !== (want.block || null) || myPost.roomTypeId !== want.roomTypeId || myPost.roomClassId !== want.roomClassId

  return (
    <StudentPage breadcrumb={[{ label: 'Requests', to: '/student/requests' }, { label: 'Swap board' }]} title="Swap board">
      <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Card padding="lg" className="flex shrink-0 flex-col gap-4">
            <SwapModePicker value="board" />
            <div className="flex items-end gap-4">
              <Field label="Block I want" className="flex-1">
                {(id) => <Select id={id} size="lg" value={want.block} onChange={set('block')} options={[{ value: '', label: 'Any Block' }, ...blocks.map((b) => ({ value: b, label: t('Block {code}', { code: b }) }))]} />}
              </Field>
              <Field label="Room Type" className="flex-1">
                {(id) => (
                  <Select
                    id={id}
                    size="lg"
                    value={want.roomTypeId}
                    onChange={set('roomTypeId')}
                    options={[{ value: '', label: 'Choose…', disabled: true }, ...(catalog.data?.roomTypes ?? []).map((type) => ({ value: type.id, label: type.name }))]}
                  />
                )}
              </Field>
              <Field label="Room Class" className="flex-1">
                {(id) => (
                  <Select
                    id={id}
                    size="lg"
                    value={want.roomClassId}
                    onChange={set('roomClassId')}
                    options={[{ value: '', label: 'Choose…', disabled: true }, ...(catalog.data?.roomClasses ?? []).map((c) => ({ value: c.id, label: c.name }))]}
                  />
                )}
              </Field>
              <Button variant="primary" size="lg" onClick={() => save.run()} disabled={!want.roomTypeId || !want.roomClassId || !dirty || save.pending}>
                {myPost ? t('Update post') : t('Post')}
              </Button>
            </div>
            {myPost?.expiresAt && (
              <Tag tone="info" className="self-start">
                {t('Your post is live until {date}', { date: formatDate(myPost.expiresAt) })}
              </Tag>
            )}
          </Card>

          <Card padding="lg" className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex shrink-0 flex-col gap-1">
              <h2 className="text-h3 font-semibold text-fg">{t('Compatible posts')}{board.data ? ` (${items.length})` : ''}</h2>
              <p className="text-base text-fg-secondary">{t('Posts that want your Room and offer what you want. No names or Student codes are shown.')}</p>
            </div>
            <Table fill>
              <THead>
                <tr>
                  <Th>Offered Room</Th>
                  <Th className="w-18">Block</Th>
                  <Th className="w-50">Wants</Th>
                  <Th className="w-36">Difference</Th>
                  <Th className="w-35">
                    <span className="sr-only">{t('Actions')}</span>
                  </Th>
                </tr>
              </THead>
              <TBody>
                <TableStatus query={board} colSpan={5} emptyIcon={Repeat} emptyTitle={myPost ? 'No compatible posts yet' : 'Post what you want first'} emptyText={myPost ? 'We notify you when a matching post appears.' : 'Choose the Room you want and press Post.'} />
                {items.map((p) => (
                  <Tr key={p.id}>
                    <Td className="py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">
                          {tr(p.offeredRoomTypeName)} · {tr(p.offeredRoomClassName)}
                        </span>
                        {p.floor && <span className="text-sm text-fg-tertiary">{t('Floor {n}', { n: p.floor })}</span>}
                      </div>
                    </Td>
                    <Td>{p.block}</Td>
                    <Td>{tr(p.wants)}</Td>
                    <Td className="font-medium text-fg-brand">{signed(p.priceDifference)}</Td>
                    <Td>
                      <Button onClick={() => request.run(p)} disabled={p.requested || request.pending}>
                        {p.requested ? t('Requested') : t('Request swap')}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <p className="shrink-0 text-sm text-fg-tertiary">{t('When both sides request each other, the swap goes to Staff (same Block) or a Manager (cross-Block) for approval.')}</p>
          </Card>
        </div>
        <YourRoomNow />
      </div>
    </StudentPage>
  )
}
