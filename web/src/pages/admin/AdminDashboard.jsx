import { Link } from 'react-router'
import { Banknote, Bed, Calendar, CircleCheck, TriangleAlert, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { KpiTile, Meter } from '@/components/ui/Charts'
import { Card } from '@/components/ui/Display'
import { QueryState, StaleNotice } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatNumber, formatPercent } from '@/lib/format'

// SCR-HOME-04 Admin Dashboard (Figma 63:1768)
// GET /dashboards/admin?termId → { term: { name, statusLabel, endsAt }, nextTerm: { name, registrationOpensAt } | null,
//   kpis: { residents, beds, collected, collectionRate, activeUsers, students, staff, managers },
//   funnel: [{ label, value }], funnelNote, blocks: [{ block, gender, allocated, beds }],
//   checks: [{ ok, text, link }], integrations: [{ name, status, tone }] }

function compactVnd(n) {
  if (n == null) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} bn VND`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} m VND`
  return `${formatNumber(n)} VND`
}

function Head({ title, note }) {
  return (
    <div className="flex shrink-0 items-start justify-between">
      <h2 className="text-h3 font-semibold text-fg">{title}</h2>
      {note && <span className="text-sm text-fg-tertiary">{note}</span>}
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
          d?.term && `${d.term.name} ${d.term.statusLabel ?? ''}`.trim(),
          d?.nextTerm?.registrationOpensAt && `${d.nextTerm.name} registration opens ${formatDate(d.nextTerm.registrationOpensAt)}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <StaleNotice query={query} />

      <div className="flex shrink-0 gap-4">
        <KpiTile icon={Calendar} label="Current Term" value={<span className="text-h1">{d?.term?.name ?? '—'}</span>} note={d?.term?.endsAt ? `Ends ${formatDate(d.term.endsAt)}` : null} />
        <KpiTile icon={Bed} label="Residents" value={<span className="text-h1">{formatNumber(k?.residents)}</span>} note={k ? `of ${formatNumber(k.beds)} Beds · ${formatPercent(k.beds ? k.residents / k.beds : null, 0)}` : null} />
        <KpiTile icon={Banknote} label="Collected" value={<span className="text-h1">{compactVnd(k?.collected)}</span>} note={k ? `${formatPercent(k.collectionRate, 0)} of invoiced` : null} />
        <KpiTile
          icon={Users}
          label="Active users"
          value={<span className="text-h1">{formatNumber(k?.activeUsers)}</span>}
          note={k ? `${formatNumber(k.students)} students · ${formatNumber(k.staff)} Staff · ${formatNumber(k.managers)} Managers` : null}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px] grid-rows-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
        <Card className="flex min-h-0 flex-col gap-2.5">
          <Head title={d?.term ? `${d.term.name} application funnel` : 'Application funnel'} note="All Blocks" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.funnel?.length}>
              {(data) => (
                <ul className="flex flex-col gap-2.5" aria-label="Application funnel">
                  {data.funnel.map((f, i) => {
                    const rate = i > 0 && data.funnel[i - 1].value ? f.value / data.funnel[i - 1].value : null
                    return (
                      <li key={f.label} className="flex items-center gap-3" title={`${f.label}: ${formatNumber(f.value)}${rate != null ? ` (${formatPercent(rate, 0)} of previous stage)` : ''}`}>
                        <span className="w-28 shrink-0 text-base text-fg-secondary">{f.label}</span>
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
          {d?.funnelNote && <p className="shrink-0 text-sm text-fg-tertiary">{d.funnelNote}</p>}
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
                        <span className="text-base font-medium text-fg">Block {b.block}</span>
                        {b.gender && <Tag>{b.gender}</Tag>}
                      </div>
                      <span className="text-base text-fg-secondary tabular">
                        {formatNumber(b.allocated)} / {formatNumber(b.beds)}
                      </span>
                    </div>
                    <Meter value={b.allocated} max={b.beds} label={`Block ${b.block} allocated Beds`} className="h-2" />
                  </div>
                ))
              }
            </QueryState>
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col gap-2">
          <Head title={d?.nextTerm ? `Configuration to check before ${d.nextTerm.name}` : 'Configuration to check'} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.checks?.length}>
              {(data) => (
                <ul className="flex flex-col gap-2">
                  {data.checks.map((c) => (
                    <li key={c.text} className="flex items-center gap-2 text-base">
                      {c.ok ? <CircleCheck size={16} aria-hidden="true" className="shrink-0 text-success" /> : <TriangleAlert size={16} aria-hidden="true" className="shrink-0 text-warning" />}
                      {c.link ? (
                        <Link to={c.link} className="text-fg hover:text-fg-brand hover:underline">
                          {c.text}
                        </Link>
                      ) : (
                        <span className="text-fg">{c.text}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
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
                    <span className="text-base text-fg-secondary">{i.name}</span>
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
