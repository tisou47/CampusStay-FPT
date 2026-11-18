import { describe, it, expect } from 'vitest'
import { attentionText } from '@/lib/attention'

describe('lib/attention', () => {
  it('formats payments attention item', () => {
    const res = attentionText({
      kind: 'payments',
      values: { count: 5 },
      cta: 'Confirm',
    })
    expect(res.title).toBe('5 khoản chuyển khoản cần xác nhận')
    expect(res.body).toBe('Sinh viên đã báo chuyển khoản và đang chờ Quản lý xác nhận.')
    expect(res.cta).toBe('Confirm')
  })

  it('formats maintenance attention item', () => {
    const res = attentionText({
      kind: 'maintenance',
      values: { count: 3 },
    })
    expect(res.title).toBe('3 yêu cầu bảo trì khẩn cấp đang mở')
    expect(res.body).toBe('Ưu tiên cao, chưa được xử lý.')
  })

  it('formats refund attention item with formatted VND amount', () => {
    const res = attentionText({
      kind: 'refund',
      values: { amount: 1500000, source: 'CHECK_OUT' },
    })
    expect(res.title).toBe('Khoản hoàn 1.500.000 ₫')
    expect(res.body).toBe('Trả phòng: quyết toán cọc điện nước')
  })

  it('falls back to translated title and body for custom/escalation items', () => {
    const res = attentionText({
      title: 'Emergency repair needed',
      body: 'Elevator in Block B is broken',
    })
    // Escalations keep the words staff typed
    expect(res.title).toBe('Emergency repair needed')
    expect(res.body).toBe('Elevator in Block B is broken')
  })
})
