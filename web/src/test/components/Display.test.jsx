import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  Avatar,
  Card,
  CardHeader,
  Alert,
  ProgressBar,
  EmptyState,
  StatTile,
  DetailRows,
} from '@/components/ui/Display'

describe('components/ui/Display', () => {
  describe('Avatar', () => {
    it('renders initials from name or fallback', () => {
      render(<Avatar name="Tran Thi Hoa" />)
      expect(screen.getByText('TH')).toBeInTheDocument()
    })

    it('renders custom initials prop when provided', () => {
      render(<Avatar initials="FPT" />)
      expect(screen.getByText('FPT')).toBeInTheDocument()
    })
  })

  describe('Card & CardHeader', () => {
    it('renders card container with content', () => {
      render(
        <Card>
          <CardHeader title="Dormitory Info" description="Block A Details" />
          <p>Card Body</p>
        </Card>
      )
      expect(screen.getByText(/dormitory info|thông tin ktx/i)).toBeInTheDocument()
      expect(screen.getByText(/tòa a details|block a details/i)).toBeInTheDocument()
      expect(screen.getByText('Card Body')).toBeInTheDocument()
    })
  })

  describe('Alert', () => {
    it('renders alert message with role and icon', () => {
      render(<Alert type="warning" title="Deadline approaching">Please pay your invoice.</Alert>)
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(screen.getByText(/deadline approaching|sắp đến hạn/i)).toBeInTheDocument()
      expect(screen.getByText(/please pay your invoice|vui lòng thanh toán hóa đơn/i)).toBeInTheDocument()
    })

    it('triggers onClose when close button clicked', () => {
      const handleClose = vi.fn()
      render(<Alert type="info" onClose={handleClose}>Info Alert</Alert>)
      const dismissBtn = screen.getByRole('button', { name: /đóng|dismiss/i })
      fireEvent.click(dismissBtn)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('ProgressBar', () => {
    it('calculates width percentage and accessibility attributes', () => {
      render(<ProgressBar value={75} max={100} />)
      const bar = screen.getByRole('progressbar')
      expect(bar).toHaveAttribute('aria-valuenow', '75')
      expect(bar).toHaveAttribute('aria-valuemin', '0')
      expect(bar).toHaveAttribute('aria-valuemax', '100')
      expect(bar.firstChild).toHaveStyle({ width: '75%' })
    })

    it('clamps values between 0 and 100 percent', () => {
      render(<ProgressBar value={150} max={100} />)
      const bar = screen.getByRole('progressbar')
      expect(bar.firstChild).toHaveStyle({ width: '100%' })
    })
  })

  describe('EmptyState', () => {
    it('renders title, description and action', () => {
      render(
        <EmptyState title="No requests found" action={<button>Create request</button>}>
          Try adjusting your search criteria
        </EmptyState>
      )
      expect(screen.getByText(/no requests found|không tìm thấy/i)).toBeInTheDocument()
      expect(screen.getByText(/try adjusting your search criteria|thử điều chỉnh/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create request/i })).toBeInTheDocument()
    })
  })

  describe('StatTile & DetailRows', () => {
    it('renders stat tile with value and label', () => {
      render(<StatTile label="Occupancy" value="95%" note="350 of 368 beds" />)
      expect(screen.getByText(/occupancy|tỷ lệ lấp đầy/i)).toBeInTheDocument()
      expect(screen.getByText('95%')).toBeInTheDocument()
    })

    it('renders key-value detail rows', () => {
      const rows = [
        ['Room', 'A-302'],
        ['Bed', '01'],
      ]
      render(<DetailRows rows={rows} />)
      expect(screen.getByText('A-302')).toBeInTheDocument()
      expect(screen.getByText('01')).toBeInTheDocument()
    })
  })
})
