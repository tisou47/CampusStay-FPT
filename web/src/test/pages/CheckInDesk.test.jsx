import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// The desk talks to the API, the session (Term and Block) and the toasts: each is replaced by a stand-in.
vi.mock('@/api/endpoints', () => ({
  api: {
    desk: {
      checkInToday: vi.fn(),
      checkInLookup: vi.fn(),
      checkIn: vi.fn(),
      recordLateCheckIn: vi.fn(),
    },
  },
}))
vi.mock('@/app/session', () => ({
  useSession: () => ({ term: { id: 'T1', checkInEnd: '2099-12-31' } }),
  useScopeQuery: () => ({ termId: 'T1', block: 'A' }),
}))
vi.mock('@/app/toast', () => ({ useToast: () => ({ notify: vi.fn(), notifyError: vi.fn() }) }))

const { api } = await import('@/api/endpoints')
const { default: CheckInDesk } = await import('@/pages/staff/CheckInDesk')

const READY = {
  name: 'Nguyen Van A',
  studentCode: 'SE180123',
  room: 'A302',
  bed: '1',
  block: 'A',
  floor: 3,
  status: 'ready',
  checks: [
    { label: 'Bed allocated', passed: true },
    { label: 'Balance paid', passed: true },
  ],
  owes: null,
  handOverItems: ['Room key', 'Mattress'],
}

function renderDesk() {
  render(
    <MemoryRouter>
      <CheckInDesk />
    </MemoryRouter>,
  )
  return screen.getByRole('searchbox', { name: 'Mã sinh viên hoặc họ tên' })
}

/** The scanner types the code into the focused box and presses Enter. */
async function scan(box, code) {
  fireEvent.change(box, { target: { value: code } })
  fireEvent.keyDown(box, { key: 'Enter' })
  await screen.findByRole('heading', { name: READY.name })
  // Let the search box's 350 ms debounce settle, as it does at the desk before staff tick anything.
  await new Promise((resolve) => setTimeout(resolve, 400))
  await waitFor(() => expect(api.desk.checkInLookup).toHaveBeenCalled())
}

describe('pages/staff/CheckInDesk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.desk.checkInToday.mockResolvedValue({ date: '2026-11-18', block: 'A', expected: 10, checkedIn: 2, waiting: 1, blocked: 0, recent: [] })
    api.desk.checkInLookup.mockResolvedValue({ student: READY })
    api.desk.checkIn.mockResolvedValue({ checkedInAt: '2026-11-18T02:00:00Z' })
  })

  it('starts with no hand-over item ticked, so staff cannot confirm without checking', async () => {
    const box = renderDesk()
    await scan(box, 'SE180123')

    const items = screen.getAllByRole('checkbox')
    expect(items).toHaveLength(2)
    items.forEach((item) => expect(item).toHaveAttribute('aria-checked', 'false'))
    expect(screen.getByRole('button', { name: /Xác nhận nhận phòng/ })).toBeDisabled()
  })

  it('enables confirm only after every item is ticked and sends the ticked items', async () => {
    const box = renderDesk()
    await scan(box, 'SE180123')
    const confirm = screen.getByRole('button', { name: /Xác nhận nhận phòng/ })

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    expect(confirm).toBeEnabled()

    fireEvent.click(confirm)
    await waitFor(() => expect(api.desk.checkIn).toHaveBeenCalledTimes(1))
    expect(api.desk.checkIn).toHaveBeenCalledWith({ studentCode: 'SE180123', items: ['Room key', 'Mattress'], note: undefined })
  })

  it('clears the search box after a check-in so the next scan starts clean', async () => {
    const box = renderDesk()
    await scan(box, 'SE180123')
    screen.getAllByRole('checkbox').forEach((item) => fireEvent.click(item))
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận nhận phòng/ }))

    await waitFor(() => expect(box).toHaveValue(''))
    await waitFor(() => expect(box).toHaveFocus())
  })
})
