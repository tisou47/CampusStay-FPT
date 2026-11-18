import { describe, it, expect } from 'vitest'
import { passwordProblem, newPasswordErrors, PASSWORD_RULE } from '@/lib/password'

describe('lib/password', () => {
  describe('passwordProblem', () => {
    it('returns error when password is empty', () => {
      expect(passwordProblem('')).not.toBeNull()
      expect(passwordProblem(null)).not.toBeNull()
      expect(passwordProblem(undefined)).not.toBeNull()
    })

    it('returns error when password is shorter than 8 characters', () => {
      expect(passwordProblem('Pass1')).not.toBeNull()
      expect(passwordProblem('1234567')).not.toBeNull()
    })

    it('returns error when password lacks letters or numbers', () => {
      // Only numbers
      expect(passwordProblem('1234567890')).not.toBeNull()
      // Only letters
      expect(passwordProblem('abcdefghijk')).not.toBeNull()
      // Special characters only
      expect(passwordProblem('!@#$%^&*()_+')).not.toBeNull()
    })

    it('returns error when password exceeds 64 characters', () => {
      const longPass = 'A1' + 'a'.repeat(65)
      expect(passwordProblem(longPass)).not.toBeNull()
    })

    it('returns null for valid passwords meeting all criteria', () => {
      expect(passwordProblem('SecurePass123')).toBeNull()
      expect(passwordProblem('fptCampus2026!')).toBeNull()
      expect(passwordProblem('p@ssw0rdValid')).toBeNull()
    })
  })

  describe('newPasswordErrors', () => {
    it('detects missing new password', () => {
      const errors = newPasswordErrors('', 'Pass1234')
      expect(errors.newPassword).toBe('Hãy nhập mật khẩu mới.')
    })

    it('detects missing confirmation', () => {
      const errors = newPasswordErrors('SecurePass123', '')
      expect(errors.confirm).toBe('Hãy nhập lại mật khẩu mới.')
      expect(errors.newPassword).toBeUndefined()
    })

    it('detects password mismatch', () => {
      const errors = newPasswordErrors('SecurePass123', 'DifferentPass456')
      expect(errors.confirm).toBe('Hai mật khẩu không khớp.')
    })

    it('returns empty errors object when passwords match and are valid', () => {
      const errors = newPasswordErrors('SecurePass123', 'SecurePass123')
      expect(Object.keys(errors)).toHaveLength(0)
    })
  })
})
