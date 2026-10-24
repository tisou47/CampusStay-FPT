import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Check, CircleCheck, Ellipsis, Eye } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button, IconButton } from '@/components/ui/Button'
import { Checkbox, Switch } from '@/components/ui/Choice'
import { Card } from '@/components/ui/Display'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatNumber, formatPercent } from '@/lib/format'
import { ConfigPage, useConfigForm } from './shared'
import { t, tr } from '@/i18n'

// SCR-CFG-06 Matching Criteria (Figma 38:1552)
// GET /admin/matching → { snapshot, hardConstraints: [string], order: [{ key, title, note }],
//   weights: [{ key, label, note, on, value }], boost, preview: { averageFit, sameMajorRate, toRound2, source } | null }
// PUT /admin/matching (saves a new snapshot) · POST /admin/matching/preview (dry run, nothing allocated)

export default function MatchingCriteria() {
  const { notify, notifyError } = useToast()
  const cfg = useConfigForm('matching', api.admin.matching, {
    onSaved: (res) => notify({ title: t('Snapshot v{n} saved', { n: res?.snapshot ?? '' }), message: 'The next assignment run uses it. Runs already made keep their snapshot.' }),
  })
  const { draft } = cfg
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    if (cfg.saved?.preview) setPreview(cfg.saved.preview)
  }, [cfg.saved])
  const dryRun = useMutation(() => api.admin.matching.preview({ order: draft.order, weights: draft.weights, boost: draft.boost }), {
    onSuccess: (res) => {
      setPreview(res)
      notify({ type: 'info', title: 'Dry run finished', message: 'It used these unsaved settings. Nothing was allocated.' })
    },
    onError: (e) => notifyError(e, 'Dry run failed'),
  })

  const total = (draft?.weights ?? []).reduce((n, w) => n + (w.on ? Number(w.value) : 0), 0)
  const setWeight = (key, patch) => cfg.setValue('weights', draft.weights.map((w) => (w.key === key ? { ...w, ...patch } : w)))
  const move = (i, dir) => {
    const order = [...draft.order]
    ;[order[i], order[i + dir]] = [order[i + dir], order[i]]
    cfg.setValue('order', order)
  }

  return (
    <ConfigPage
      form={cfg}
      title="Matching Criteria"
      description="Rules the assignment engine uses. Each run freezes a snapshot, so later edits never change a past proposal."
      actions={
        <>
          <Button onClick={cfg.reset} disabled={!cfg.dirty}>
            Cancel
          </Button>
          <Button variant="primary" icon={Check} disabled={!cfg.dirty || total !== 100 || cfg.saving} onClick={() => cfg.save()}>
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
                  <h2 className="text-h3 font-semibold text-fg">{t('Hard constraints')}</h2>
                  <p className="text-sm text-fg-tertiary">{t('Always applied. A Bed that breaks any of these is never proposed.')}</p>
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
                <h2 className="text-h3 font-semibold text-fg">{t('Processing order')}</h2>
                <p className="text-sm text-fg-tertiary">{t('Who gets a Bed first when a Room Type and Room Class run short. Use the arrows to reorder.')}</p>
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
          </div>
          <div className="flex w-120 shrink-0 flex-col gap-4 overflow-y-auto">
            <Card className="flex shrink-0 flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-h3 font-semibold text-fg">{t('Roommate matching')}</h2>
                  <p className="text-sm text-fg-tertiary">{t('For 4-bed and 6-bed Rooms, and 2-bed Students who chose automatic matching. Weights must total 100%.')}</p>
                </div>
                <Tag tone={total === 100 ? 'success' : 'error'}>{t('Total {n}%', { n: total })}</Tag>
              </div>
              {(draft.weights ?? []).map((w) => (
                <div key={w.key} className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className={cx('text-base font-medium', w.on ? 'text-fg' : 'text-fg-tertiary')}>{tr(w.label)}</span>
                      <span className="text-sm text-fg-tertiary">{w.on ? tr(w.note) : t('Off')}</span>
                    </div>
                    <Switch aria-label={tr(w.label)} checked={w.on} onChange={(on) => setWeight(w.key, { on, value: on ? w.value : 0 })} />
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={w.value}
                      disabled={!w.on}
                      aria-label={t('{label} weight', { label: tr(w.label) })}
                      onChange={(e) => setWeight(w.key, { value: Number(e.target.value) })}
                      className="h-1.5 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed"
                    />
                    <span className={cx('flex h-7 w-14 items-center justify-center rounded-md border border-line-strong text-base font-medium tabular', w.on ? 'text-fg' : 'text-fg-tertiary')}>{w.value}%</span>
                  </div>
                </div>
              ))}
              <Checkbox
                label="Boost ×1.5 when a 2-bed Student's Roommate preferences match (free add-on service)"
                checked={Boolean(draft.boost)}
                onChange={(e) => cfg.setValue('boost', e.target.checked)}
              />
            </Card>
            <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-line bg-subtle p-5">
              <div className="flex items-center justify-between">
                <p className="text-base font-medium text-fg">{t('Preview with these settings')}</p>
                <Button icon={Eye} disabled={total !== 100 || dryRun.pending} onClick={() => dryRun.run()}>
                  {dryRun.pending ? t('Running…') : t('Run dry run')}
                </Button>
              </div>
              {[
                ['Average Room fit', preview?.averageFit != null ? `${preview.averageFit} / 100` : '—'],
                ['Rooms with 2+ students of the same major', preview?.sameMajorRate != null ? formatPercent(preview.sameMajorRate, 0) : '—'],
                ['To Round 2 (no capacity or roommates)', formatNumber(preview?.toRound2)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-base">
                  <span className="text-fg-secondary">{t(label)}</span>
                  <span className="font-medium text-fg tabular">{value}</span>
                </div>
              ))}
              <p className="text-sm text-fg-tertiary">{preview?.source ? tr(preview.source) : t('Run a dry run to see the effect of these settings.')}</p>
            </div>
          </div>
        </div>
      )}
    </ConfigPage>
  )
}
