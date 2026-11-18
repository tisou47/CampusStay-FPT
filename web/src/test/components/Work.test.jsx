import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Panel, WorkList, DetailTip } from '@/components/ui/Work'

describe('components/ui/Work', () => {
  describe('Panel', () => {
    it('renders title, subtitle, and children', () => {
      render(
        <Panel
          title="Action required"
          subtitle="Every decision that needs a manager"
          badge={<span>3</span>}
        >
          <p>Panel items</p>
        </Panel>
      )
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Cần xử lý3$/)
      expect(screen.getByText('Every decision that needs a manager')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('Panel items')).toBeInTheDocument()
    })
  })

  describe('WorkList', () => {
    it('renders empty fallback when items array is empty', () => {
      render(
        <WorkList
          items={[]}
          empty={<p>Nothing to handle</p>}
        />
      )
      expect(screen.getByText('Nothing to handle')).toBeInTheDocument()
    })

    it('renders list of work items', () => {
      const items = [
        {
          id: 'item-1',
          to: '/manager/requests/1',
          title: 'SE180123 · Nguyen Van A',
          meta: 'Block A · Room 302',
          action: { to: '/manager/requests/1/review', label: 'Review' },
        },
      ]

      render(
        <MemoryRouter>
          <WorkList items={items} />
        </MemoryRouter>
      )

      expect(screen.getByText('SE180123 · Nguyen Van A')).toBeInTheDocument()
      expect(screen.getByText('Tòa A · Phòng 302')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Xét duyệt' })).toBeInTheDocument()
    })
  })

  describe('DetailTip', () => {
    it('renders title and non-empty rows', () => {
      const rows = [
        { label: 'Student', value: 'Le Van C' },
        { label: 'Note', value: '' }, // empty, should be filtered
      ]
      render(<DetailTip title="Request Info" rows={rows} />)
      expect(screen.getByText(/request info/i)).toBeInTheDocument()
      expect(screen.getByText(/sinh viên|student/i)).toBeInTheDocument()
      expect(screen.getByText('Le Van C')).toBeInTheDocument()
      expect(screen.queryByText(/note/i)).toBeNull()
    })
  })
})
