import { t } from '@/i18n'
import { formatDate } from './format'

const DAY = 24 * 60 * 60 * 1000
const startOf = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`) : null)
const endOf = (d) => (d ? new Date(new Date(`${String(d).slice(0, 10)}T00:00:00`).getTime() + DAY) : null)
const at = (v) => (v ? new Date(v) : null)

/**
 * The stages of a Term from its own dates (GET /terms): registration, review and assignment, the Balance, the
 * check-in window and the stay. Each stage is done, current or to come; `notes` (by key) adds what a role waits
 * for at a stage, e.g. { assignment: '12 Applications to review' }.
 */
export function termJourney(term, notes = {}, now = new Date()) {
  if (!term) return []
  const stages = [
    { key: 'registration', label: 'Registration', from: at(term.registrationOpensAt), to: at(term.registrationClosesAt) },
    { key: 'assignment', label: 'Review and assignment', from: at(term.registrationClosesAt), to: at(term.resultsPublishedAt) },
    { key: 'payment', label: 'Balance payment', from: at(term.resultsPublishedAt), to: at(term.balanceDueAt) },
    { key: 'checkin', label: 'Check-in', from: startOf(term.checkInStart), to: endOf(term.checkInEnd) },
    { key: 'stay', label: 'Living in', from: startOf(term.stayStart), to: endOf(term.stayEnd) },
  ]
  let currentSeen = false
  return stages.map((s) => {
    const done = s.to && now >= s.to
    let state = done ? 'done' : 'todo'
    if (!done && !currentSeen) {
      state = 'current'
      currentSeen = true
    }
    const range = s.from && s.to ? `${formatDate(s.from)} – ${formatDate(new Date(s.to.getTime() - (s.key === 'checkin' || s.key === 'stay' ? DAY : 0)))}` : s.to ? formatDate(s.to) : null
    let note = notes[s.key] ?? null
    if (!note && state === 'current' && s.to) {
      const before = s.from && now < s.from
      const days = Math.max(0, Math.ceil(((before ? s.from : s.to) - now) / DAY))
      note = before ? t('Starts in {n} days', { n: days }) : days <= 1 ? t('Ends today') : t('{n} days left', { n: days })
    }
    return { key: s.key, label: s.label, date: range, state, note }
  })
}
