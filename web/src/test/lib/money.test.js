import { describe, it, expect } from 'vitest'
import { floorPercent, collectedNote, COLLECTED_RULE } from '@/lib/money'
import { t } from '@/i18n'

describe('lib/money', () => {
  describe('floorPercent', () => {
    it('floors percentages down to nearest integer without rounding up', () => {
      expect(floorPercent(0.9997)).toBe('99%')
      expect(floorPercent(0.991)).toBe('99%')
      expect(floorPercent(0.5)).toBe('50%')
      expect(floorPercent(1.0)).toBe('100%')
      expect(floorPercent(0)).toBe('0%')
      expect(floorPercent(null)).toBe('—')
    })
  })

  describe('collectedNote', () => {
    it('formats note when outstanding invoices exist', () => {
      const note = collectedNote({
        collectionRate: 0.985,
        outstanding: 15000000,
        outstandingInvoices: 3,
      })
      expect(note).toContain('98%')
      expect(note).toContain('15,0 triệu ₫')
      expect(note).toContain('3')
    })

    it('formats note when everything has been paid', () => {
      const note = collectedNote({
        collectionRate: 1.0,
        outstanding: 0,
        outstandingInvoices: 0,
      })
      expect(note).toContain('100%')
      expect(note).not.toContain('unpaid')
    })
  })

  describe('COLLECTED_RULE', () => {
    it('has a Vietnamese text saying what counts as collected', () => {
      expect(t(COLLECTED_RULE)).toBe('Mọi hóa đơn đã thanh toán, gồm cả tiền đặt cọc điện nước; hoàn tiền tính riêng')
    })
  })
})
