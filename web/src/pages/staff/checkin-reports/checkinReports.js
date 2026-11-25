// Staff › Check-in inventories: the logic of every screen in one place — the three reports compared (diffReports),
// the severity, the words of a difference (diffText), the API reads (hooks), the photo setting and the keyboard.
// Named exports only. The pure parts are tested by checkinReports.test.js (npm test).
import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { t } from '@/i18n'
import { conditionName, typeName } from '@/lib/furniture'
import { formatNumber } from '@/lib/format'

/* ------------------------------------------------------------------------------------------------ diffReports */

// The three reports side by side, from GET /handovers/:id. Every screen counts "N differences" from here so the
// numbers never disagree. What differs is the backend's call (it uses the Admin's limits, System parameters › Room
// handover): an item differs when the API says `differs`, a meter when the API's `differences` has a line for it
// (beyond the accepted use, or lower than the record). The web never re-derives it with limits of its own.

const METERS = [
  { key: 'electricity', label: 'Electricity', unit: 'kWh', line: 'Electricity ' },
  { key: 'water', label: 'Water', unit: 'm³', line: 'Water ' },
]

const num = (v) => (v == null || v === '' ? null : Number(v))

/** Whether the Final report (Report 3) exists: recorded in the Room OR confirmed as Final by Staff at the desk. */
export function hasFinal(detail) {
  if (!detail) return false
  if (detail.row?.status === 'Final') return true
  return (
    (detail.items ?? []).some((i) => i.verified != null) ||
    detail.electricity?.verified != null ||
    detail.water?.verified != null
  )
}

/**
 * @param detail GET /handovers/:id
 * @returns {{ meters: Array, items: Array, diffCount: number, final: boolean }}
 *   meters: [{ key, label, unit, base, student, final, delta, isDiff, note }]
 *   items:  [{ key, label, bed, base, student, final, isDiff, raw }]
 */
export function diffReports(detail) {
  const final = hasFinal(detail)
  const lines = detail?.differences ?? []
  const meters = METERS.map((m) => {
    const v = detail?.[m.key] ?? {}
    const base = num(v.baseline)
    const student = num(v.student)
    const note = lines.find((l) => typeof l === 'string' && l.startsWith(m.line)) ?? null
    return {
      key: m.key,
      label: m.label,
      unit: m.unit,
      base,
      student,
      final: final ? (num(v.verified) ?? student) : null,
      baseAt: v.baselineAt ?? null,
      delta: base != null && student != null ? Math.round((student - base) * 1000) / 1000 : null,
      isDiff: note != null,
      note,
    }
  })
  const items = (detail?.items ?? []).map((i) => ({
    key: String(i.itemId),
    label: i.type ?? '',
    bed: i.bed ?? null,
    base: i.baseline ?? null,
    student: i.condition ?? null,
    final: final ? (i.verified ?? i.condition ?? null) : null,
    isDiff: Boolean(i.differs),
    raw: i,
  }))
  const diffCount = meters.filter((m) => m.isDiff).length + items.filter((i) => i.isDiff).length
  return { meters, items, diffCount, final }
}

/** The differences only: meters first, then items (the order of the summary strip and the evidence list). */
export function differences(diff) {
  return [...diff.meters.filter((m) => m.isDiff), ...diff.items.filter((i) => i.isDiff)]
}

/**
 * Whether students may attach photos this Term. TODO(api): Staff cannot read the Admin parameter
 * `handover.photos_required`; until GET /handovers/:id returns it, photos count as on when the student sent any.
 */
export function photosOn(detail) {
  if (!detail) return false
  if (typeof detail.photosRequired === 'boolean') return detail.photosRequired || hasPhotos(detail)
  return hasPhotos(detail)
}

export function hasPhotos(detail) {
  return (detail?.meterPhotos?.length ?? 0) > 0 || (detail?.items ?? []).some((i) => (i.photos?.length ?? 0) > 0)
}

export function photoCount(detail) {
  return (detail?.meterPhotos?.length ?? 0) + (detail?.items ?? []).reduce((n, i) => n + (i.photos?.length ?? 0), 0)
}

/* --------------------------------------------------------------------------------------------------- severity */

// How far a check-in inventory is from the Room's record. The level is the backend's comparison (Matched, Minor difference, Major difference), which it computes with the
// Admin's limits; the web only maps it. Without a comparison yet (a draft), the differences give a fallback:
// an item reported Missing where the record had it is major, any other difference minor.

export const LEVELS = ['none', 'minor', 'major']

const FROM_API = { Matched: 'none', 'Minor difference': 'minor', 'Major difference': 'major' }

/** Label and tone (Tag tones) of a level. */
export const SEVERITY = {
  none: { label: 'Matched', tone: 'success' },
  minor: { label: 'Minor difference', tone: 'warning' },
  major: { label: 'Major difference', tone: 'error' },
}

/**
 * @param comparison the API's comparison label, or null
 * @param diff       diffReports(...) result, used only when comparison is null
 */
export function severityOf(comparison, diff) {
  if (comparison && FROM_API[comparison]) return FROM_API[comparison]
  if (!diff) return null
  const missing = diff.items.some((i) => i.isDiff && i.student === 'Missing')
  if (missing) return 'major'
  return diff.diffCount > 0 ? 'minor' : 'none'
}

/** Rows sorted for the queue: major first, then the longest waiting (oldest submittedAt, else openedAt). */
export function queueOrder(rows) {
  const rank = (r) => ({ major: 0, minor: 1, none: 2 })[severityOf(r.comparison)] ?? 3
  const since = (r) => new Date(r.submittedAt ?? r.openedAt ?? 0).getTime()
  return [...rows].sort((a, b) => rank(a) - rank(b) || since(a) - since(b))
}

/* --------------------------------------------------------------------------------------------------- diffText */

/** "+45 kWh" / "−253 kWh": a meter's change against the record. */
export function signedDelta(delta, unit) {
  if (delta == null) return null
  const n = formatNumber(Math.abs(delta), { decimals: Number.isInteger(delta) ? 0 : 2 })
  return `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${n} ${unit}`
}

/** An item's name with its Bed: "Wardrobe · Bed B". */
export function itemLabel(raw) {
  return `${typeName(raw)}${raw?.bed ? ` · ${t('Bed {bed}', { bed: raw.bed })}` : ''}`
}

/** One difference in words: "Wardrobe · Bed B: Good → Missing" or "Electricity +45 kWh". */
export function diffText(x) {
  if (x.unit) return `${t(x.label)} ${signedDelta(x.delta, x.unit) ?? '—'}`
  return `${itemLabel(x.raw)}: ${conditionName(x.base) || t('No record')} → ${conditionName(x.student)}`
}

/* ------------------------------------------------------------------------------------------------- API hooks */

// Staff › Check-in › Inventories (also Manager › Check-in inventories): reads of the check-in inventories.
// GET /handovers?block&status&comparison&page&pageSize → { items, total, counts: { Draft, Submitted, Verifying, Final } }
// GET /handovers/:id → see diffReports above

/** The queue tabs: key in the URL (?tab=), the API status, the label. */
export const TABS = [
  { key: 'review', status: 'Submitted', label: 'To review', hint: 'Filed with a difference: confirm or check the Room' },
  { key: 'visit', status: 'Verifying', label: 'Room visits', hint: 'A time is set to check the Room with the student' },
  { key: 'live', status: 'Draft', label: 'In progress', hint: 'Students filling in the inventory now' },
  { key: 'late', status: 'Late report', label: 'Late reports', hint: 'Sent after the deadline closed the inventory' },
  { key: 'done', status: 'Final', label: 'Final', hint: 'Signed: kept until check-out' },
]

export const tabOf = (key) => TABS.find((x) => x.key === key) ?? TABS[0]

/** The base path of these screens for the role in use: /staff/check-in/inventories or /manager/…. */
export function useReportsBase() {
  const { pathname } = useLocation()
  const at = pathname.indexOf('/check-in/inventories')
  return `${at >= 0 ? pathname.slice(0, at) : '/staff'}/check-in/inventories`
}

/** One page of a queue tab. Large pages: the queue is short (one Term, the user's Blocks). */
export function useQueue(tabKey, { comparison, q, pageSize = 100, page = 1 } = {}) {
  const scope = useScopeQuery()
  const tab = tabOf(tabKey)
  // q: a student code or name, a Room or a report code (searched by the API).
  const query = useQuery(['handovers', 'list', scope, tab.status, comparison ?? null, q || null, page, pageSize], ({ signal }) =>
    api.handover.list({ ...scope, status: tab.status, comparison: comparison || undefined, q: q || undefined, page, pageSize }, { signal }),
  )
  const rows = useMemo(() => queueOrder(query.data?.items ?? []), [query.data])
  return { query, rows, total: query.data?.total ?? 0, counts: query.data?.counts ?? {} }
}

/** The counts of every status (the progress bar and the KPI cards), and the late reports' total. */
export function useCounts() {
  const scope = useScopeQuery()
  const late = useQuery(['handovers', 'list', scope, 'Late report', 'count'], ({ signal }) =>
    api.handover.list({ ...scope, status: 'Late report', page: 1, pageSize: 1 }, { signal }),
  )
  const all = useQuery(['handovers', 'list', scope, 'Submitted', 'count'], ({ signal }) =>
    api.handover.list({ ...scope, status: 'Submitted', page: 1, pageSize: 1 }, { signal }),
  )
  const counts = all.data?.counts ?? {}
  return {
    loading: all.loading,
    counts: {
      review: counts.Submitted ?? 0,
      visit: counts.Verifying ?? 0,
      live: counts.Draft ?? 0,
      late: late.data?.total ?? 0,
      done: counts.Final ?? 0,
    },
  }
}

/** One inventory with its three reports compared. */
export function useReport(id) {
  const query = useQuery(['handovers', 'detail', id], ({ signal }) => api.handover.detail(id, { signal }), { enabled: Boolean(id) })
  const diff = useMemo(() => (query.data ? diffReports(query.data) : null), [query.data])
  const severity = query.data ? severityOf(query.data.row?.comparison, diff) : null
  return { query, detail: query.data, diff, severity }
}

/**
 * Where this inventory sits in the queue it was opened from (?from=<tab>): its position and the ids before and after,
 * so Staff move to the next student without going back to the list.
 */
export function useQueuePosition(id) {
  const [params] = useSearchParams()
  const from = params.get('from') ?? 'review'
  const { rows } = useQueue(from)
  const index = rows.findIndex((r) => r.id === id)
  return {
    from,
    index,
    total: rows.length,
    prev: index > 0 ? rows[index - 1].id : null,
    next: index >= 0 && index < rows.length - 1 ? rows[index + 1].id : null,
    afterDone: index >= 0 ? (rows[index + 1]?.id ?? rows[index - 1]?.id ?? null) : rows[0]?.id ?? null,
  }
}

/* ---------------------------------------------------------------------------------------- photo capture setting */

/**
 * Whether students attach photos this Term (System parameters › Room handover › photos required, set by Admin).
 * TODO(api): Staff cannot read Admin parameters and GET /handovers/:id does not return the setting yet; until it
 * does, photos count as on when the student sent any (`source: 'inferred'`).
 */
export function usePhotoCaptureConfig(detail) {
  const known = typeof detail?.photosRequired === 'boolean'
  return {
    enabled: photosOn(detail),
    required: known ? detail.photosRequired : null,
    hasPhotos: hasPhotos(detail),
    source: known ? 'admin' : 'inferred',
  }
}

/* ------------------------------------------------------------------------------------------------- shortcuts */

const typing = (el) => {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/**
 * Keyboard shortcuts of one screen: { j: fn, k: fn, Escape: fn, … } (keys as KeyboardEvent.key, letters lower case).
 * Ignored while typing in a field, with a modifier held, or while a dialog is open.
 */
export function useShortcuts(map, enabled = true) {
  const ref = useRef(map)
  ref.current = map
  useEffect(() => {
    if (!enabled) return undefined
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      if (document.querySelector('[role="dialog"]')) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const fn = ref.current[key]
      if (fn) {
        e.preventDefault()
        fn(e)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
