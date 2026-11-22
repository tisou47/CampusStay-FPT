// The three reports of a check-in inventory side by side, from GET /handovers/:id. Pure: no imports, tested with
// `node --test` (npm test). Every screen counts "N differences" from here so the numbers never disagree.
//
// What differs is the backend's call (it uses the Admin's limits, System parameters › Room handover): an item differs
// when the API says `differs`, a meter when the API's `differences` has a line for it (beyond the accepted use, or
// lower than the record). The web never re-derives it with limits of its own.

const METERS = [
  { key: 'electricity', label: 'Electricity', unit: 'kWh', line: 'Electricity ' },
  { key: 'water', label: 'Water', unit: 'm³', line: 'Water ' },
]

const num = (v) => (v == null || v === '' ? null : Number(v))

/** Whether Staff recorded anything in the Room: the Final report (Report 3) exists. */
export function hasFinal(detail) {
  if (!detail) return false
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
      final: num(v.verified),
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
