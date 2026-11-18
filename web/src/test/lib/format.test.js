import { describe, it, expect } from 'vitest'
import {
  formatNumber,
  formatCurrency,
  formatVnd,
  formatCompactVnd,
  formatPercent,
  initials,
  campusClock,
  formatDate,
  formatDateTime,
  formatTime,
  formatWeekdayDate,
  formatDateShort,
  formatMonthYear,
  formatMonthShort,
  formatPeriod,
  formatDateRange,
  formatTimeRange,
  formatTimeLeft,
} from '@/lib/format'

describe('lib/format', () => {
  describe('numbers & currency', () => {
    it('formatNumber formats numbers with correct locale and decimals', () => {
      expect(formatNumber(1234)).toBe('1.234')
      expect(formatNumber(1234.56, { decimals: 2 })).toBe('1.234,56')
      expect(formatNumber(0)).toBe('0')
      expect(formatNumber(null)).toBe('—')
      expect(formatNumber(undefined)).toBe('—')
      expect(formatNumber('')).toBe('—')
      expect(formatNumber('invalid')).toBe('—')
    })

    it('formatCurrency and formatVnd format Vietnamese Dong amounts', () => {
      expect(formatCurrency(2588000)).toBe('2.588.000 ₫')
      expect(formatVnd(2588000)).toBe('2.588.000 ₫')
      expect(formatCurrency(2588000, { unit: false })).toBe('2.588.000')
      expect(formatCurrency(0)).toBe('0 ₫')
      expect(formatCurrency(null)).toBe('—')
      expect(formatCurrency('')).toBe('—')
    })

    it('formatCompactVnd formats large sums with compact suffixes', () => {
      expect(formatCompactVnd(1530000000)).toBe('1,53 tỷ ₫')
      expect(formatCompactVnd(2500000)).toBe('2,5 triệu ₫')
      expect(formatCompactVnd(500000)).toBe('500.000 ₫')
      expect(formatCompactVnd(null)).toBe('—')
    })

    it('formatPercent formats fractions to percentages', () => {
      expect(formatPercent(0.297)).toBe('29,7%')
      expect(formatPercent(1)).toBe('100,0%')
      expect(formatPercent(0.85, 0)).toBe('85%')
      expect(formatPercent(null)).toBe('—')
    })

    it('initials extracts uppercase family and given name initials', () => {
      expect(initials('Nguyễn Văn An')).toBe('NA')
      expect(initials('An')).toBe('AN')
      expect(initials('')).toBe('?')
      expect(initials(null)).toBe('?')
      expect(initials('   Trần   Thị   Mai   ')).toBe('TM')
    })
  })

  describe('dates on campus clock', () => {
    it('campusClock correctly decomposes ISO calendar dates', () => {
      const clock = campusClock('2026-11-15')
      expect(clock).not.toBeNull()
      expect(clock.y).toBe(2026)
      expect(clock.m).toBe(11)
      expect(clock.d).toBe(15)
    })

    it('formatDate formats YYYY-MM-DD or ISO datetime', () => {
      expect(formatDate('2026-11-15')).toBe('15/11/2026')
      expect(formatDate(null)).toBe('—')
    })

    it('formatDateTime formats date with time in campus timezone', () => {
      expect(formatDateTime('2026-11-15T01:00:00Z')).toBe('15/11/2026, 08:00')
      expect(formatDateTime(null)).toBe('—')
    })

    it('formatTime formats HH:mm', () => {
      expect(formatTime('2026-11-15T01:00:00Z')).toBe('08:00')
      expect(formatTime(null)).toBe('—')
    })

    it('formatWeekdayDate formats weekday with date', () => {
      expect(formatWeekdayDate('2026-11-16')).toBe('Thứ Hai, 16/11/2026')
      expect(formatWeekdayDate(null)).toBe('—')
    })

    it('formatDateShort formats DD/MM', () => {
      expect(formatDateShort('2026-11-15')).toBe('15/11')
      expect(formatDateShort(null)).toBe('—')
    })

    it('formatMonthYear formats month and year', () => {
      expect(formatMonthYear('2026-11-15')).toBe('Tháng 11/2026')
      expect(formatMonthYear(null)).toBe('—')
    })

    it('formatMonthShort formats short month label', () => {
      expect(formatMonthShort('2026-11-15')).toBe('T11')
      expect(formatMonthShort(null)).toBe('—')
    })

    it('formatPeriod formats billing periods', () => {
      expect(formatPeriod('2026-11')).toBe('Kỳ 11/2026')
      expect(formatPeriod('2026-11-01')).toBe('Kỳ 11/2026')
      expect(formatPeriod(2026, 11)).toBe('Kỳ 11/2026')
      expect(formatPeriod(null)).toBe('—')
    })

    it('formatDateRange formats date intervals', () => {
      expect(formatDateRange('2026-06-26', '2026-07-11')).toBe('26/06 – 11/07/2026')
      expect(formatDateRange('2025-12-25', '2026-01-05')).toBe('25/12/2025 – 05/01/2026')
      expect(formatDateRange('2026-11-15', '2026-11-15')).toBe('15/11/2026')
      expect(formatDateRange(null, null)).toBe('—')
    })

    it('formatTimeRange formats time intervals', () => {
      expect(formatTimeRange('2026-11-15T01:00:00Z', '2026-11-15T03:00:00Z')).toBe('08:00 – 10:00')
    })

    it('formatTimeLeft calculates remaining and overdue time strings', () => {
      const now = new Date('2026-11-15T08:00:00+07:00')
      const future = new Date('2026-11-20T08:00:00+07:00')
      const past = new Date('2026-11-13T05:00:00+07:00')

      const leftFuture = formatTimeLeft(future, now)
      expect(leftFuture).toContain('5 ngày')

      const leftPast = formatTimeLeft(past, now)
      expect(leftPast).toContain('Quá hạn')
    })
  })
})
