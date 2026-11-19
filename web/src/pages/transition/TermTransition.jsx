import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { CalendarClock } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Card } from '@/components/ui/Display'
import { Select } from '@/components/ui/Field'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { useRoleBase } from '@/lib/useRoleBase'
import { t } from '@/i18n'
import Overview from './Overview'
import OpenRequests from './OpenRequests'
import StayRequests from './StayRequests'
import NextTermFees from './NextTermFees'
import Turnover from './Turnover'

// SCR-ASG-20 Term transition — Staff › Residents and Manager › Residents (Change Spec v2 phase 6, spec §5.1, §6.10).
// One screen per requests window of a Term N+1: the overview (milestones M2–M7, continuing residents, open requests,
// reconciliation, Beds left for new students), every open next-Term request with bulk decisions, extensions, the
// next-Term fees (Managers) and the turnover. A Room's class per Term is set in Room tiers by term, not requested.
// GET /renewals → [{ termId, termName, previousTermName, opensAt, closesAt, decisionsDueAt, opened }]

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'requests', label: 'Open requests' },
  { key: 'extensions', label: 'Extensions' },
  { key: 'fees', label: 'Next-term fees', manager: true },
  { key: 'turnover', label: 'Turnover' },
]

export default function TermTransition() {
  const base = useRoleBase()
  const manager = base === '/manager'
  const navigate = useNavigate()
  const { tab = 'overview' } = useParams()
  const [params, setParams] = useSearchParams()
  const windows = useQuery(['renewals'], ({ signal }) => api.renewals.list(undefined, { signal }))
  const list = windows.data ?? []
  const termId = params.get('termId') ?? (list.find((w) => w.opened) ?? list[0])?.termId
  const current = list.find((w) => w.termId === termId)
  // The turnover tab puts its check-out and check-in dates here, beside the term picker.
  const [headerSlot, setHeaderSlot] = useState(null)

  useEffect(() => {
    // A tab that does not exist (e.g. an old link to the removed Room tier changes) opens the overview.
    if ((!manager && tab === 'fees') || !tabs.some((x) => x.key === tab)) navigate(`${base}/next-term`, { replace: true })
  }, [manager, tab, base, navigate])

  const shown = tabs.filter((x) => manager || !x.manager)
  const body = !termId ? null : {
    overview: <Overview termId={termId} />,
    requests: <OpenRequests termId={termId} />,
    extensions: <StayRequests termId={termId} />,
    fees: <NextTermFees termId={termId} />,
    turnover: <Turnover termId={termId} headerSlot={headerSlot} />,
  }[tab]

  return (
    <>
      <PageHeader
        compact
        title={
          <>
            {t('Term transition')}
            {current && (
              <span className="font-semibold text-fg-secondary">
                {' · '}
                {current.previousTermName} → {current.termName}
              </span>
            )}
          </>
        }
        tip={current ? t('{term} · residents of {previous} continue into it', { term: current.termName, previous: current.previousTermName }) : 'Requests window, next-term fees and turnover.'}
        actions={
          <>
            <div ref={setHeaderSlot} className="flex flex-wrap items-center gap-2 empty:hidden" />
            {list.length > 1 && (
            <Select
              wrapperClassName="w-60"
              aria-label={t('Term')}
              value={termId ?? ''}
              onChange={(e) => setParams({ termId: e.target.value })}
              options={list.map((w) => ({ value: w.termId, label: w.termName }))}
            />
            )}
          </>
        }
      />
      <Tabs className="shrink-0" value={tab} items={shown.map((x) => ({ key: x.key, label: x.label, to: `${base}/next-term/${x.key}${termId ? `?termId=${termId}` : ''}` }))} />
      {windows.data === undefined && windows.loading ? (
        <LoadingState />
      ) : windows.data === undefined ? (
        <ErrorState error={windows.error} onRetry={windows.reload} />
      ) : !termId ? (
        <Card padding="none" className="flex min-h-0 flex-1 flex-col">
          <EmptyBlock icon={CalendarClock} title="No term has a requests window yet">
            {t('The admin sets the renewal milestones (M1–M7) of a term in the term wizard. Its window opens at M2.')}
          </EmptyBlock>
        </Card>
      ) : (
        body
      )}
    </>
  )
}
