import { Link } from 'react-router'
import { ArrowRight, Banknote, Bed, Calendar, Check, TriangleAlert, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { stageStates } from '@/app/adminFlow'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { KpiTile, Meter } from '@/components/ui/Charts'
import { Card } from '@/components/ui/Display'
import { QueryState, StaleNotice } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatCompactVnd, formatDate, formatNumber, formatPercent } from '@/lib/format'
import { COLLECTED_RULE, collectedNote } from '@/lib/money'
import { t, tr } from '@/i18n'

// SCR-HOME-04 Admin Dashboard (Figma 63:1768)
// GET /dashboards/admin?termId → { term: { name, statusLabel, endsAt }, nextTerm: { name, registrationOpensAt } | null,
//   kpis: { residents, beds, collected, collectionRate, activeUsers, students, staff, managers },
//   funnel: [{ label, value }], funnelNote, blocks: [{ block, gender, allocated, beds }],
//   checks: [{ ok, text, link }], integrations: [{ name, status, tone }] }

const STATE_LABEL = { done: 'Done', now: 'Do this now', waiting: 'Waiting', later: 'Later' }

/**
 * "Set up a Term" (spec §6.3, §6.4): the five stages in the order they happen, each with its state in words,
 * why it matters and one way in. Only the stage to do now gets the primary button.
 */
function TermSetupFlow({ checks }) {
  const requests = useQuery(['term-requests', 'Open'], ({ signal }) => api.termRequests.list({ status: 'Open', pageSize: 1 }, { signal }))
  const terms = useQuery(['admin-terms'], ({ signal }) => api.admin.terms.list(undefined, { signal }))
  if (!checks || !terms.data) return null
  const stages = stageStates({ checks, requestCounts: requests.data?.counts ?? {}, terms: terms.data.items ?? [] })
  const lead = stages.findIndex((s) => s.state === 'now')
  const say = (x) => (x ? t(x.text, x.date ? { ...x.vars, date: formatDate(x.vars.date) } : x.vars) : null)
  return (
    <section aria-labelledby="term-setup" className="flex shrink-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="term-setup" className="text-h3 font-semibold text-fg">{t('Set up a Term')}</h2>
        <span className="text-sm text-fg-tertiary">{t('In the order it happens. Each stage opens its screen.')}</span>
      </div>
      <ol className="grid grid-cols-5 gap-3">
        {stages.map((s, i) => {
          const now = s.state === 'now'
          return (
            <li key={s.key} className={cx('flex min-w-0 flex-col gap-2 rounded-md p-3', now ? 'bg-primary-subtle ring-1 ring-primary' : 'bg-canvas')}>
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cx(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular',
                    s.state === 'done' ? 'bg-success text-white' : now ? 'bg-primary text-fg-on-brand' : 'bg-subtle text-fg-secondary ring-1 ring-line-strong',
                  )}
                >
                  {s.state === 'done' ? <Check size={14} /> : i + 1}
                </span>
                <span className={cx('text-sm font-semibold', s.state === 'done' ? 'text-success-fg' : now ? 'text-fg-brand' : 'text-fg-tertiary')}>{t(STATE_LABEL[s.state])}</span>
              </div>
              <p className="text-base font-semibold text-fg">{t(s.label)}</p>
              <p className="text-sm text-fg-secondary">{say(s.detail)}</p>
              {s.key === 'ready' && s.items?.some((c) => !c.ok) && (
                <ul className="flex flex-col gap-1">
                  {s.items
                    .filter((c) => !c.ok)
                    .slice(0, 3)
                    .map((c) => (
                      <li key={c.text} className="flex items-start gap-1.5 text-sm">
                        <TriangleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
                        {c.link ? (
                          <Link to={c.link} className="text-fg hover:text-fg-brand hover:underline">
                            {tr(c.text)}
                          </Link>
                        ) : (
                          <span className="text-fg">{tr(c.text)}</span>
                        )}
                      </li>
                    ))}
                </ul>
              )}
              <p className="text-sm text-fg-tertiary">{t(s.why)}</p>
              <div className="mt-auto pt-1">
                {i === lead ? (
                  <Button variant="primary" size="sm" to={s.action.to} iconAfter={ArrowRight} iconSize={16}>
                    {tr(s.action.label)}
                  </Button>
                ) : (
                  <Link to={s.action.to} className="text-sm font-medium text-fg-link hover:underline">
                    {tr(s.action.label)}
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Head({ title, note }) {
  return (
    <div className="flex shrink-0 items-start justify-between">
      <h2 className="text-h3 font-semibold text-fg">{tr(title)}</h2>
      {note && <span className="text-sm text-fg-tertiary">{tr(note)}</span>}
    </div>
  )
}

export default function AdminDashboard() {
  const { term } = useSession()
  const query = useQuery(['dashboard', 'admin', term?.id], ({ signal }) => api.dashboards.admin({ termId: term?.id }, { signal }))
  const d = query.data
  const k = d?.kpis
  const funnelTop = d?.funnel?.[0]?.value || 1

  return (
    <>
      <PageHeader
        title="System overview"
        description={[
          formatDate(new Date()),
          d?.term && `${d.term.name} · ${tr(d.term.statusLabel)}`,
          d?.nextTerm?.registrationOpensAt && t('{term} registration opens {date}', { term: d.nextTerm.name, date: formatDate(d.nextTerm.registrationOpensAt) }),
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <StaleNotice query={query} />
      <TermSetupFlow checks={d?.checks} />

      <div className="flex shrink-0 gap-4">
        <KpiTile icon={Calendar} label="Current Term" value={<span className="text-h1">{d?.term?.name ?? '—'}</span>} note={d?.term?.endsAt ? t('Ends {date}', { date: formatDate(d.term.endsAt) }) : null} />
        <KpiTile icon={Bed} label="Living in" value={<span className="text-h1">{formatNumber(k?.residents)}</span>} note={k ? t('{n} Beds held of {total}', { n: formatNumber(k.allocated), total: formatNumber(k.beds) }) : null} />
        <KpiTile icon={Banknote} label="Collected this Term" value={<span className="text-h1" title={t(COLLECTED_RULE)}>{formatCompactVnd(k?.collected)}</span>} note={k ? collectedNote(k) : null} />
        <KpiTile
          icon={Users}
          label="Active users"
          value={<span className="text-h1">{formatNumber(k?.activeUsers)}</span>}
          note={k ? t('{s} students · {st} Staff · {m} Managers', { s: formatNumber(k.students), st: formatNumber(k.staff), m: formatNumber(k.managers) }) : null}
        />
      </div>

      <div className="grid min-h-72 flex-1 grid-cols-[minmax(0,1fr)_420px] grid-rows-[minmax(0,1fr)_auto] gap-4">
        <Card className="row-span-2 flex min-h-0 flex-col gap-2.5">
          <Head title={d?.term ? t('{term} application funnel', { term: d.term.name }) : 'Application funnel'} note="All Blocks" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.funnel?.length}>
              {(data) => (
                <ul className="flex flex-col gap-2.5" aria-label={t('Application funnel')}>
                  {data.funnel.map((f, i) => {
                    const rate = i > 0 && data.funnel[i - 1].value ? f.value / data.funnel[i - 1].value : null
                    return (
                      <li key={f.label} className="flex items-center gap-3" title={`${tr(f.label)}: ${formatNumber(f.value)}${rate != null ? ` (${t('{p} of previous stage', { p: formatPercent(rate, 0) })})` : ''}`}>
                        <span className="w-28 shrink-0 text-base text-fg-secondary">{tr(f.label)}</span>
                        <span className="relative h-6 min-w-0 flex-1">
                          <span className={cx('absolute inset-y-0 left-0 rounded-sm', i === data.funnel.length - 1 ? 'bg-accent' : 'bg-orange-200')} style={{ width: `${(f.value / funnelTop) * 100}%` }} />
                        </span>
                        <span className="w-14 shrink-0 text-right text-base font-medium text-fg tabular">{formatNumber(f.value)}</span>
                        <span className="w-10 shrink-0 text-sm text-fg-tertiary">{rate != null ? formatPercent(rate, 0) : ''}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </QueryState>
          </div>
          {d?.funnelOutside && Object.values(d.funnelOutside).some((n) => n > 0) ? (
            <p className="shrink-0 text-sm text-fg-tertiary">
              {t('Not in the funnel: {c} continuing residents (no Application this Term) · {w} waitlisted · {r} rejected · {e} expired', {
                c: formatNumber(d.funnelOutside.continuing),
                w: formatNumber(d.funnelOutside.waitlisted),
                r: formatNumber(d.funnelOutside.rejected),
                e: formatNumber(d.funnelOutside.expired),
              })}
            </p>
          ) : (
            d?.funnelNote && <p className="shrink-0 text-sm text-fg-tertiary">{tr(d.funnelNote)}</p>
          )}
        </Card>

        <Card className="flex min-h-0 flex-col gap-3">
          <Head title="Allocated Beds by Block" />
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.blocks?.length}>
              {(data) =>
                data.blocks.map((b) => (
                  <div key={b.block} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-medium text-fg">{t('Block {code}', { code: b.block })}</span>
                        {b.gender && <Tag>{b.gender}</Tag>}
                      </div>
                      <span className="text-base text-fg-secondary tabular">
                        {formatNumber(b.allocated)} / {formatNumber(b.beds)}
                      </span>
                    </div>
                    <Meter value={b.allocated} max={b.beds} label={t('Block {code} allocated Beds', { code: b.block })} className="h-2" />
                  </div>
                ))
              }
            </QueryState>
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col gap-2">
          <Head title="Integrations" />
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.integrations?.length}>
              {(data) =>
                data.integrations.map((i) => (
                  <div key={i.name} className="flex items-center justify-between gap-3">
                    <span className="text-base text-fg-secondary">{tr(i.name)}</span>
                    <Tag tone={i.tone ?? 'neutral'}>{i.status}</Tag>
                  </div>
                ))
              }
            </QueryState>
          </div>
        </Card>
      </div>
    </>
  )
}
