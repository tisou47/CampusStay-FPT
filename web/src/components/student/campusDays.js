// Calendar days on the campus clock (Asia/Ho_Chi_Minh), for "Closes in N days" texts. Pure: no state, no timers.

const campusDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Midnight UTC of the campus calendar day that contains the moment. */
function dayNumber(value) {
  const [y, m, d] = campusDay.format(new Date(value)).split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/**
 * Whole calendar days from today to the given moment, counted on the campus clock and rounded up
 * (a deadline later today is 0 days away, tomorrow 1). Null without a date.
 */
export function campusDaysUntil(iso, now = new Date()) {
  if (!iso) return null
  return Math.ceil(dayNumber(iso) - dayNumber(now))
}
