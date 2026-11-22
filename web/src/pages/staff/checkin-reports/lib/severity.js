// How far a check-in inventory is from the Room's record. Pure: tested with `node --test`.
//
// The level is the backend's comparison (Matched, Minor difference, Major difference), which it computes with the
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
