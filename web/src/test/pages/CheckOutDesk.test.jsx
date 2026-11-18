import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('@/api/endpoints', () => ({
  api: {
    desk: {
      checkOutList: vi.fn(),
      checkOutDetail: vi.fn(),
      checkOut: vi.fn(),
      roomReadings: vi.fn(),
      saveRoomReadings: vi.fn(),
      uploadRoomReadings: vi.fn(),
      roomReadingsTemplate: vi.fn(),
    },
  },
}))
vi.mock('@/app/session', () => ({
  useSession: () => ({ term: { id: 'T1' } }),
  useScopeQuery: () => ({ termId: 'T1', block: 'A' }),
}))
vi.mock('@/app/toast', () => ({ useToast: () => ({ notify: vi.fn(), notifyError: vi.fn() }) }))

const { api } = await import('@/api/endpoints')
const { default: CheckOutDesk } = await import('@/pages/staff/CheckOutDesk')

const ROW = { allocationId: 'AL-1', name: 'Tran Thi B', studentCode: 'SE180456', room: 'A305', bed: '2', reason: 'End of term', status: 'Pending check-out' }
const DETAIL = {
  ...ROW,
  roomTypeName: '4 beds',
  roomClassName: 'Standard',
  reading: { electricity: 1250, water: 80 },
  furniture: [],
  // 1.000.000 held − 300.000 share − 0 unpaid = 700.000 refund
  settlement: { held: 1000000, share: 300000, unpaid: 0, damage: 0 },
}

async function renderDesk() {
  render(
    <MemoryRouter>
      <CheckOutDesk />
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { name: DETAIL.name })
  return screen.getByRole('button', { name: /^Xác nhận trả phòng/ })
}

describe('pages/staff/CheckOutDesk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.desk.checkOutList.mockResolvedValue({ items: [ROW], total: 1, pendingCount: 1 })
    api.desk.checkOutDetail.mockResolvedValue(DETAIL)
    api.desk.checkOut.mockResolvedValue({ refund: 700000 })
  })

  it('starts with the key not returned and no room condition chosen, so confirm is blocked', async () => {
    const confirm = await renderDesk()
    expect(screen.getByRole('checkbox', { name: 'Đã trả chìa khóa' })).not.toBeChecked()
    screen.getAllByRole('radio').forEach((radio) => expect(radio).not.toBeChecked())
    expect(confirm).toBeDisabled()
  })

  it('needs both the key and a room condition before confirm', async () => {
    const confirm = await renderDesk()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Đã trả chìa khóa' }))
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getAllByRole('radio')[0])
    expect(confirm).toBeEnabled()
  })

  it('shows the settlement first and checks out only after the second confirmation', async () => {
    const confirm = await renderDesk()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Đã trả chìa khóa' }))
    fireEvent.click(screen.getAllByRole('radio')[0])
    fireEvent.click(confirm)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText('700.000 ₫').length).toBeGreaterThan(0)
    expect(api.desk.checkOut).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận và hoàn tất' }))
    await waitFor(() => expect(api.desk.checkOut).toHaveBeenCalledTimes(1))
    expect(api.desk.checkOut).toHaveBeenCalledWith('AL-1', expect.objectContaining({ keyReturned: true, conditionGood: true, damages: [], draft: false }))
  })
})
