import { t } from '@/i18n'

/*
 * The CampusStay password rule, checked in the browser before the server checks it again
 * (the server also rejects a password that contains the email name: 400 WEAK_PASSWORD).
 */

// English key; Field helpers and errors show it with tx().
export const PASSWORD_RULE = 'Use 8 to 64 characters with at least one letter and one number.'

/** Returns what is wrong with a new password, or null when it follows the rule. */
export function passwordProblem(password) {
  if (!password) return t('Enter a new password.')
  const tooLong = password.length > 64 || new TextEncoder().encode(password).length > 72
  if (password.length < 8 || tooLong || !/\p{L}/u.test(password) || !/\p{Nd}/u.test(password)) return t(PASSWORD_RULE)
  return null
}

/** Field errors for a "new password + confirm" pair: { newPassword?, confirm? }. */
export function newPasswordErrors(newPassword, confirm) {
  const errors = {}
  const problem = passwordProblem(newPassword)
  if (problem) errors.newPassword = problem
  if (!confirm) errors.confirm = t('Enter the new password again.')
  else if (confirm !== newPassword) errors.confirm = t('The two passwords do not match.')
  return errors
}
