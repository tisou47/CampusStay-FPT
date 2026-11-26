import { useEffect, useState } from 'react'
import { ArrowRight, Check, Eye, Info, Moon, ScrollText, Sparkles, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { useOneBlock } from '@/components/layout/BlockPicker'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Select, Textarea } from '@/components/ui/Field'
import { Tag } from '@/components/ui/Tag'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { formatDate } from '@/lib/format'
import { getLang, t } from '@/i18n'

// SCR-CFG-20 Block house rules (Figma 70:1488; review R-08: one card, desk hours dropped as check-in and check-out
// become self-service; a save without them keeps the stored ones)
// GET /block-settings?block → { visitFrom, visitUntil, quiet, houseRules, editedAt, editedBy,
//   limits: { visitWindow, quietStartsBy }, quietOptions }
// PUT /block-settings { block, visitFrom, visitUntil, quiet, houseRules }

const fields = ['visitFrom', 'visitUntil', 'quiet', 'houseRules']

const halfHours = (from, to) => {
  const out = []
  for (let m = from * 60; m <= to * 60; m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`)
  return out
}

// A starting text for a block that has no house rules yet; the manager edits it before saving.
const SAMPLE = {
  vi: [
    'Giữ phòng và khu vực chung sạch sẽ; đổ rác đúng giờ và đúng nơi quy định.',
    'Không nấu ăn bằng bếp điện, bếp gas trong phòng; chỉ dùng khu bếp chung.',
    'Không hút thuốc, không mang chất cấm, chất dễ cháy nổ vào ký túc xá.',
    'Khách chỉ được vào trong giờ thăm và phải đăng ký tại quầy.',
    'Giữ trật tự trong giờ yên tĩnh; không mở nhạc lớn.',
    'Tắt điện, nước, máy lạnh khi ra khỏi phòng.',
    'Báo hư hỏng qua mục Yêu cầu; không tự ý sửa hay di chuyển nội thất.',
  ],
  en: [
    'Keep your room and the common areas clean; take the trash out at the set times and places.',
    'No cooking with hot plates or gas stoves in the rooms; use the shared kitchen.',
    'No smoking, no banned or flammable items in the dormitory.',
    'Visitors only during visiting hours, registered at the desk.',
    'Keep quiet during quiet hours; no loud music.',
    'Turn off the lights, water and air conditioner when you leave the room.',
    'Report damage through Requests; do not repair or move furniture yourself.',
  ],
}

/** One setting of the hours card: an icon, its name, the control and the admin limit under it. */
function HoursRow({ icon: Glyph, label, limit, children }) {
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <span className="flex items-center gap-2 text-base font-medium text-fg">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-secondary">
          <Glyph size={16} aria-hidden="true" />
        </span>
        {label}
      </span>
      {children}
      {limit && <span className="text-sm text-fg-tertiary">{limit}</span>}
    </li>
  )
}

function Form({ saved, block, picker }) {
  const { notify } = useToast()
  const pick = (s) => Object.fromEntries(fields.map((k) => [k, s[k] ?? '']))
  const [form, setForm] = useState(pick(saved))
  useEffect(() => setForm(pick(saved)), [saved])
  const dirty = JSON.stringify(form) !== JSON.stringify(pick(saved))
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const save = useMutation(() => api.blockSettings.save({ block, ...form }), {
    invalidates: ['block-settings'],
    onSuccess: () => notify({ title: 'House rules saved', message: 'Residents see the new hours and house rules in My room on web and Android.' }),
    onError: () => {},
  })
  const withCurrent = (list, value) => (value && !list.includes(value) ? [value, ...list] : list)
  const rules = form.houseRules
    .split('\n')
    .map((l) => l.replace(/^\s*([-•*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
  const edited = saved.editedAt
    ? saved.editedBy
      ? t('Last edited {date} by {name}.', { date: formatDate(saved.editedAt), name: saved.editedBy })
      : t('Last edited {date}.', { date: formatDate(saved.editedAt) })
    : null

  return (
    <>
      <PageHeader
        title={block ? t('House rules · Block {code}', { code: block }) : 'Block house rules'}
        actions={
          <>
            {picker}
            {dirty && <Tag tone="warning">{t('Unsaved changes')}</Tag>}
            <Button onClick={() => setForm(pick(saved))} disabled={!dirty}>
              Cancel
            </Button>
            <Button variant="primary" icon={Check} onClick={() => save.run()} disabled={!dirty || save.pending}>
              Save
            </Button>
          </>
        }
      />
      {save.error && (
        <Alert type="error" title="Could not save" className="shrink-0">
          {save.error.message}
        </Alert>
      )}
      {/* The rules text on the left; the hours, a preview of what residents see and what admin sets on the right. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card padding="none" className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <ScrollText size={18} aria-hidden="true" className="text-fg-brand" />
              <h2 className="text-h3 font-semibold text-fg">{t('House rules')}</h2>
              <Tag dot={false}>{t('{n} rules', { n: rules.length })}</Tag>
            </div>
            {edited && <span className="truncate text-sm text-fg-tertiary">{edited}</span>}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-5">
            <Textarea
              aria-label={t('House rules')}
              value={form.houseRules}
              onChange={set('houseRules')}
              placeholder={t('One rule per line, for example: Keep quiet after 22:00.')}
              className="min-h-0 flex-1 resize-none leading-relaxed"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-fg-tertiary">{t('One rule per line; residents see them as a numbered list in My room (web and Android).')}</span>
              {!form.houseRules.trim() && (
                <Button size="sm" icon={Sparkles} onClick={() => setForm((f) => ({ ...f, houseRules: (SAMPLE[getLang()] ?? SAMPLE.en).join('\n') }))}>
                  Start from a sample
                </Button>
              )}
            </div>
          </div>
        </Card>

        <div className="flex min-h-0 flex-col gap-4 xl:overflow-y-auto">
          <Card className="flex shrink-0 flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">{t('Hours')}</h2>
            <ul className="flex flex-col divide-y divide-line">
              <HoursRow icon={Users} label={t('Visiting hours')} limit={saved.limits?.visitWindow ? t('Admin limit: {value}', { value: saved.limits.visitWindow }) : null}>
                <span className="flex items-center gap-2">
                  <Select aria-label={t('Visitor hours from')} wrapperClassName="flex-1" value={form.visitFrom} onChange={set('visitFrom')} options={withCurrent(halfHours(7, 10), form.visitFrom)} />
                  <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-fg-tertiary" />
                  <Select aria-label={t('Visitor hours until')} wrapperClassName="flex-1" value={form.visitUntil} onChange={set('visitUntil')} options={withCurrent(halfHours(17, 21), form.visitUntil)} />
                </span>
              </HoursRow>
              <HoursRow icon={Moon} label={t('Quiet hours from')} limit={saved.limits?.quietStartsBy ? t('Admin limit: must start by {time}', { time: saved.limits.quietStartsBy }) : null}>
                <Select aria-label={t('Quiet hours')} value={form.quiet} onChange={set('quiet')} options={withCurrent(saved.quietOptions ?? [], form.quiet)} />
              </HoursRow>
            </ul>
          </Card>

          <Card className="flex shrink-0 flex-col gap-3 bg-subtle/40">
            <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
              <Eye size={16} aria-hidden="true" className="text-fg-tertiary" />
              {t('What residents see')}
            </h2>
            <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="flex flex-col">
                  <span className="text-fg-tertiary">{t('Visiting hours')}</span>
                  <span className="font-medium text-fg tabular">
                    {form.visitFrom || '—'} – {form.visitUntil || '—'}
                  </span>
                </span>
                <span className="flex flex-col">
                  <span className="text-fg-tertiary">{t('Quiet hours')}</span>
                  <span className="font-medium text-fg tabular">{form.quiet || '—'}</span>
                </span>
              </div>
              {rules.length > 0 ? (
                <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-fg">
                  {rules.slice(0, 5).map((r, i) => (
                    <li key={i} className="line-clamp-2">
                      {r}
                    </li>
                  ))}
                  {rules.length > 5 && <li className="list-none text-fg-tertiary">{t('… and {n} more', { n: rules.length - 5 })}</li>}
                </ol>
              ) : (
                <p className="text-sm text-fg-tertiary">{t('No house rules yet.')}</p>
              )}
            </div>
          </Card>

          <p className="flex shrink-0 gap-2 px-1 text-sm text-fg-tertiary">
            <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {t('Prices, room types, room tiers, refund rules and check-in windows are set by admin for all blocks.')}
          </p>
        </div>
      </div>
    </>
  )
}

export default function BlockSettings() {
  const { block, picker } = useOneBlock()
  const query = useQuery(['block-settings', block], ({ signal }) => api.blockSettings.get({ block: block ?? undefined }, { signal }), { enabled: Boolean(block), keepPrevious: false })
  if (query.data) return <Form saved={query.data} block={block} picker={picker} />
  return (
    <>
      <PageHeader title="Block house rules" actions={picker} />
      {query.loading ? <LoadingState /> : <ErrorState error={query.error} onRetry={query.reload} />}
    </>
  )
}
