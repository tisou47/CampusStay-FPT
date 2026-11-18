import { describe, it, expect } from 'vitest'
import { guestStatusLabel, familyDayStatusLabel } from '@/lib/familyDayStatus'

describe('lib/familyDayStatus', () => {
  it('translates guest status labels in Family Day context', () => {
    // Family Day meaning, not the room check-in word "Đã nhận phòng"
    expect(guestStatusLabel('Checked in')).toBe('Đã vào')
    expect(guestStatusLabel('Not arrived')).toBe('Chưa đến')
    expect(guestStatusLabel(null)).toBeNull()
  })

  it('translates Family Day event status labels', () => {
    expect(familyDayStatusLabel('Draft')).toBe('Nháp')
    expect(familyDayStatusLabel('Published')).toBe('Đã công bố')
    expect(familyDayStatusLabel('Registration open')).toBe('Đang mở đăng ký')
    expect(familyDayStatusLabel('Completed')).toBe('Đã kết thúc')
  })
})
