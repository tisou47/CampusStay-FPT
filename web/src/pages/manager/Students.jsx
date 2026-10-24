import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { GraduationCap, Upload, UserCheck } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Display'
import { SearchInput, Select } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr } from '@/i18n'

// SCR-AUTH-13 Students (spec §6.2): every student account with filters; Staff see the residents of their Blocks.
// GET /student-accounts?q&verification&enrollment&gender&cohort&resident&block&page&pageSize →
//   { items: [{ id, studentCode, name, email, gender, cohort, major, enrollment, verification, account, block,
//   residence, demo }], total, counts: { pending }, options: { verifications, enrollments, genders, cohorts, blocks } }

export const verificationTone = { Verified: 'success', 'Pending verification': 'warning', Rejected: 'error', 'Profile needed': 'info' }
export const accountTone = { Active: 'success', Locked: 'error', 'Not signed in yet': 'neutral' }

export default function Students() {
  const navigate = useNavigate()
  const base = useRoleBase()
  const { user } = useSession()
  const manages = user?.role === 'manager' || user?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const filters = {
    verification: params.get('verification') ?? '',
    enrollment: params.get('enrollment') ?? '',
    gender: params.get('gender') ?? '',
    cohort: params.get('cohort') ?? '',
    resident: params.get('resident') ?? '',
    block: params.get('block') ?? '',
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])
  const request = { ...filters, q: search, page, pageSize }
  const query = useQuery(['students', request], ({ signal }) => api.students.list(request, { signal }))
  const d = query.data
  const setFilter = (key) => (e) => {
    const next = new URLSearchParams(params)
    if (e.target.value) next.set(key, e.target.value)
    else next.delete(key)
    setParams(next, { replace: true })
    setPage(1)
  }
  const options = (label, values) => [{ value: '', label: t('{label}: All', { label: t(label) }) }, ...(values ?? []).map((v) => ({ value: v, label: `${t(label)}: ${tr(v)}` }))]
  const pending = d?.counts?.pending ?? 0

  return (
    <>
      <PageHeader
        title="Students"
        description={manages ? 'Every student account: verification, enrollment and where each student lives.' : 'Residents of your Blocks.'}
        actions={
          manages && (
            <>
              {pending > 0 && filters.verification !== 'Pending verification' && (
                <Button icon={UserCheck} onClick={() => setFilter('verification')({ target: { value: 'Pending verification' } })}>
                  {t('{n} waiting for verification', { n: pending })}
                </Button>
              )}
              <Button variant="primary" icon={Upload} onClick={() => navigate(`${base}/student-import`)}>
                Import student list
              </Button>
            </>
          )
        }
      />
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <SearchInput wrapperClassName="w-70" aria-label={t('Search')} placeholder="Search name, email or student code" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select wrapperClassName="w-56" aria-label={t('Verification')} value={filters.verification} onChange={setFilter('verification')} options={options('Verification', d?.options?.verifications)} />
        <Select wrapperClassName="w-48" aria-label={t('Enrollment')} value={filters.enrollment} onChange={setFilter('enrollment')} options={options('Enrollment', d?.options?.enrollments)} />
        <Select wrapperClassName="w-36" aria-label={t('Gender')} value={filters.gender} onChange={setFilter('gender')} options={options('Gender', d?.options?.genders)} />
        <Select wrapperClassName="w-36" aria-label={t('Cohort')} value={filters.cohort} onChange={setFilter('cohort')} options={options('Cohort', d?.options?.cohorts)} />
        <Select
          wrapperClassName="w-40"
          aria-label={t('Resident')}
          value={filters.resident}
          onChange={setFilter('resident')}
          options={[
            { value: '', label: t('Resident: All') },
            { value: 'yes', label: t('Resident: Yes') },
            { value: 'no', label: t('Resident: No') },
          ]}
        />
        <Select wrapperClassName="w-35" aria-label={t('Block')} value={filters.block} onChange={setFilter('block')} options={[{ value: '', label: 'Block: All' }, ...(d?.options?.blocks ?? []).map((b) => ({ value: b, label: t('Block: {b}', { b }) }))]} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill>
          <THead>
            <tr>
              <Th>Student</Th>
              <Th className="w-28">Student code</Th>
              <Th className="w-36">Cohort · Major</Th>
              <Th className="w-32">Enrollment</Th>
              <Th className="w-44">Verification</Th>
              <Th className="w-36">Account</Th>
              <Th className="w-36">Bed</Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={7} emptyIcon={GraduationCap} emptyTitle="No students match these filters" />
            {(d?.items ?? []).map((s) => (
              <Tr key={s.id} className="[&>td]:h-14" onClick={() => navigate(`${base}/students/${s.id}`)}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={s.name} />
                    <TwoLine primary={s.name} secondary={s.email} />
                    {s.demo && <Tag dot={false}>Demo</Tag>}
                  </div>
                </Td>
                <Td className="whitespace-nowrap">{s.studentCode ?? '—'}</Td>
                <Td>{s.cohort ? `${s.cohort} · ${tr(s.major)}` : '—'}</Td>
                <Td>{s.enrollment ? tr(s.enrollment) : '—'}</Td>
                <Td>
                  <Tag tone={verificationTone[s.verification] ?? 'neutral'}>{s.verification}</Tag>
                </Td>
                <Td>
                  <Tag tone={accountTone[s.account] ?? 'neutral'}>{s.account}</Tag>
                </Td>
                <Td className={s.residence ? undefined : 'text-fg-tertiary'}>{s.residence ? tr(s.residence) : '—'}</Td>
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
            noun={['student', 'students']}
          />
        </div>
      </div>
    </>
  )
}
