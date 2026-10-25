import { useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronDown, CircleCheck, Ellipsis, Eye } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatPercent } from '@/lib/format'
import { ConfigPage, useConfigForm } from './shared'
import { t, tr } from '@/i18n'

// SCR-CFG-06 Rules › Roommate matching (spec §6.17, D-06): the processing order when Beds are short, and how much
// each shared attribute counts as a level (Very important counts twice as much as Important); the roommate-preference
// boost under Advanced. The preview runs the draft and the rules in use on the approved Applications.
// GET /admin/matching → { snapshot, hardConstraints, order: [{ key, title, note }],
//   weights: [{ key, label, note, on, value, level }], boost }
// PUT /admin/matching { order, weights: [{ key, level }], boost } (a new snapshot)
// POST /admin/matching/preview (same body) → { students, moved, inUse, draft: { placed, averageFit, priorityPlaced,
//   priorityStudents }, example: { room, students, fit, attributes: [{ key, label, value, sharing }] }, toRound2, source }

const LEVELS = ['Very important', 'Important', 'Not used']

/** Whole percentages the levels give (Very important = 2 points, Important = 1), as the server computes them. */
function percents(weights) {
  const points = weights.map((w) => (w.level === 'Very important' ? 2 : w.level === 'Important' ? 1 : 0))
  const total = points.reduce((a, b) => a + b, 0)
  if (!total) return weights.map(() => 0)
  const values = points.map((p) => Math.floor((p * 100) / total))
  const first = points.findIndex((p) => p > 0)
  values[first] += 100 - values.reduce((a, b) => a + b, 0)
  return values
}

function PreviewTable({ preview }) {
  const rows = [
    ['Students placed', (r) => (r ? `${r.placed} / ${preview.students}` : '—')],
    ['Average fit', (r) => (r?.averageFit != null ? `${r.averageFit} / 100` : '—')],
    ['Priority students with a Bed', (r) => (r ? `${r.priorityPlaced} / ${r.priorityStudents}` : '—')],
  ]
  return (
    <table className="w-full text-base">
      <thead>
        <tr className="text-left text-sm text-fg-tertiary">
          <th className="py-1 font-medium" />
          <th className="py-1 text-right font-medium">{t('Rules in use')}</th>
          <th className="py-1 text-right font-medium">{t('This draft')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-t border-line">
            <td className="py-1.5 text-fg-secondary">{t(label)}</td>
            <td className="py-1.5 text-right text-fg tabular">{value(preview.inUse)}</td>
            <td className="py-1.5 text-right font-medium text-fg tabular">{value(preview.draft)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function MatchingCriteria() {
  const { notify, notifyError } = useToast()
  const cfg = useConfigForm('matching', api.admin.matching, {
    onSaved: (res) => notify({ title: t('Snapshot v{n} saved', { n: res?.snapshot ?? '' }), message: 'Terms published from now on use it. A published Term and the runs already made keep their snapshot.' }),
  })
  const { draft } = cfg
  const [preview, setPreview] = useState(null)
  const [advanced, setAdvanced] = useState(false)
  const body = () => ({ order: draft.order, weights: draft.weights.map((w) => ({ key: w.key, level: w.level })), boost: Number(draft.boost) || 1 })
  const dryRun = useMutation(() => api.admin.matching.preview(body()), {
    onSuccess: (res) => setPreview(res),
    onError: (e) => notifyError(e, 'Preview failed'),
  })
  const weights = draft?.weights ?? []
  const shares = percents(weights)
  const anyUsed = weights.some((w) => w.level !== 'Not used')
  const setLevel = (key, level) => cfg.setValue('weights', draft.weights.map((w) => (w.key === key ? { ...w, level } : w)))
  const move = (i, dir) => {
    const order = [...draft.order]
    ;[order[i], order[i + dir]] = [order[i + dir], order[i]]
    cfg.setValue('order', order)
  }

  return (
    <ConfigPage
      form={cfg}
      title="Roommate matching"
      description="Who is placed first when Beds are short, and what roommates should share. Publishing a Term fixes these rules for it."
      actions={
        <>
          <Button onClick={cfg.reset} disabled={!cfg.dirty}>
            Cancel
          </Button>
          <Button variant="primary" icon={Check} disabled={!cfg.dirty || !anyUsed || cfg.saving} onClick={() => cfg.save(body())}>
            {t('Save as snapshot v{n}', { n: (draft?.snapshot ?? 0) + 1 })}
          </Button>
        </>
      }
    >
      {draft && (
        <div className="flex min-h-0 flex-1 items-stretch gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
            <Card className="flex shrink-0 flex-col gap-2.5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-h3 font-semibold text-fg">{t('Always true')}</h2>
                  <p className="text-sm text-fg-tertiary">{t('A Bed that breaks any of these is never proposed.')}</p>
                </div>
                <Tag>Locked</Tag>
              </div>
              <ul className="flex flex-col gap-2.5">
                {(draft.hardConstraints ?? []).map((h) => (
                  <li key={h} className="flex items-center gap-2.5 text-base text-fg">
                    <CircleCheck size={16} aria-hidden="true" className="shrink-0 text-success" />
                    {tr(h)}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="flex shrink-0 flex-col gap-2.5">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-h3 font-semibold text-fg">{t('Who is placed first when Beds are short?')}</h2>
                <p className="text-sm text-fg-tertiary">{t('The engine takes the Applications in this order. Use the arrows to reorder.')}</p>
              </div>
              <ol className="flex flex-col gap-2.5">
                {(draft.order ?? []).map((o, i) => (
                  <li key={o.key} className="flex items-center gap-3 rounded-md bg-subtle px-3 py-2">
                    <Ellipsis size={16} aria-hidden="true" className="shrink-0 text-fg-secondary" />
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-medium text-fg">{i + 1}</span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-base font-medium text-fg">{tr(o.title)}</span>
                      <span className="text-sm text-fg-tertiary">{tr(o.note)}</span>
                    </div>
                    <IconButton icon={ArrowUp} size="sm" aria-label={t('Move {item} up', { item: tr(o.title) })} disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-30" />
                    <IconButton icon={ArrowDown} size="sm" aria-label={t('Move {item} down', { item: tr(o.title) })} disabled={i === draft.order.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-30" />
                  </li>
                ))}
              </ol>
            </Card>
            <Card className="flex shrink-0 flex-col gap-4">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-h3 font-semibold text-fg">{t('How are roommates matched?')}</h2>
                <p className="text-sm text-fg-tertiary">{t('For 4-bed and 6-bed Rooms, and 2-bed students who chose automatic matching. Very important counts twice as much as Important.')}</p>
              </div>
              {weights.map((w, i) => (
                <div key={w.key} className="flex items-center gap-4">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className={cx('text-base font-medium', w.level === 'Not used' ? 'text-fg-tertiary' : 'text-fg')}>{tr(w.label)}</span>
                    <span className="text-sm text-fg-tertiary">{w.level === 'Not used' ? t('Not used') : `${tr(w.note)} · ${shares[i]}%`}</span>
                  </div>
                  <Segmented options={LEVELS.map((l) => ({ value: l, label: t(l) }))} value={w.level} onChange={(level) => setLevel(w.key, level)} />
                </div>
              ))}
              {!anyUsed && <p className="text-sm text-error-fg">{t('Use at least one matching criterion.')}</p>}
              <button type="button" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced} className="flex items-center gap-1 self-start text-sm font-medium text-fg-link">
                <ChevronDown size={16} aria-hidden="true" className={cx('transition-transform', advanced && 'rotate-180')} />
                {t('Advanced')}
              </button>
              {advanced && (
                <Field label="Roommate-preference boost" helper="When a student's roommate preferences (region, semester, major) all match the Room, their fit is multiplied by this. 1 = off, at most 5.">
                  {(id) => <Input id={id} inputMode="decimal" value={draft.boost ?? 1} onChange={(e) => cfg.setValue('boost', e.target.value)} className="w-32" />}
                </Field>
              )}
            </Card>
          </div>
          <div className="flex w-120 shrink-0 flex-col gap-4 overflow-y-auto">
            <div className="flex shrink-0 flex-col gap-3 rounded-lg border border-line bg-subtle p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-medium text-fg">{t('Preview against the rules in use')}</p>
                <Button icon={Eye} disabled={!anyUsed || dryRun.pending} onClick={() => dryRun.run()}>
                  {dryRun.pending ? t('Running…') : t('Run preview')}
                </Button>
              </div>
              {preview?.draft ? (
                <>
                  <PreviewTable preview={preview} />
                  <p className="text-base text-fg">{t('{n} of {total} students get another Bed (or none) with this draft.', { n: preview.moved, total: preview.students })}</p>
                  {preview.sameMajorRate != null && (
                    <p className="text-sm text-fg-secondary">{t('Rooms with 2+ students of the same major: {rate}', { rate: formatPercent(preview.sameMajorRate, 0) })}</p>
                  )}
                  {preview.example && (
                    <div className="flex flex-col gap-1 rounded-md bg-surface p-3">
                      <p className="text-base font-medium text-fg">{t('Example: Room {room} · fit {fit}/100', { room: preview.example.room, fit: preview.example.fit ?? '—' })}</p>
                      <ul className="flex flex-col gap-0.5 text-sm text-fg-secondary">
                        {preview.example.attributes.map((a) => (
                          <li key={a.key}>{t('{label}: {n} of {total} share {value}', { label: t(a.label), n: a.sharing, total: preview.example.students, value: tr(a.value) })}</li>
                        ))}
                        {preview.example.attributes.length === 0 && <li>{t('No criterion is used, so every Room fits the same.')}</li>}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-fg-tertiary">{preview?.source ? tr(preview.source) : t('Run the preview to compare these settings with the rules in use. Nothing is allocated.')}</p>
              )}
              {preview?.draft && <p className="text-sm text-fg-tertiary">{tr(preview.source)}</p>}
            </div>
          </div>
        </div>
      )}
    </ConfigPage>
  )
}
