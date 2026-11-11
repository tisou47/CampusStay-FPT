import { t, tr } from '@/i18n'

// Family Day statuses share their English words with other screens ("Checked in", "In progress", "Completed") whose
// Vietnamese means something else there ("Đã nhận phòng" is a student taking a room). These read the Family Day
// meaning first ("Family Day guest: Checked in" → "Đã vào") and fall back to the shared word, so English is unchanged.
function inContext(context, status) {
  if (!status) return status
  const key = `${context}: ${status}`
  const translated = t(key)
  return translated === key ? tr(status) : translated
}

/** A guest's status: Not arrived, Checked in, Checked out, No-show, Cancelled (and Overdue). */
export const guestStatusLabel = (status) => inContext('Family Day guest', status)

/** A Family Day's status: Draft, Published, Registration open, Registration closed, In progress, Completed, Cancelled. */
export const familyDayStatusLabel = (status) => inContext('Family Day', status)
