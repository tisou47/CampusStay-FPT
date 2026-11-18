import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tag, SlaBadge, toneForStatus } from '@/components/ui/Tag'

describe('components/ui/Tag', () => {
  it('renders children and default neutral styling', () => {
    render(<Tag>Neutral Tag</Tag>)
    const tag = screen.getByText(/neutral tag/i)
    expect(tag).toBeInTheDocument()
  })

  it('renders with different tone classes', () => {
    const { container, rerender } = render(<Tag tone="success">Active</Tag>)
    expect(container.firstChild.className).toContain('bg-success-bg')

    rerender(<Tag tone="warning">Warning</Tag>)
    expect(container.firstChild.className).toContain('bg-warning-bg')

    rerender(<Tag tone="error">Error</Tag>)
    expect(container.firstChild.className).toContain('bg-error-bg')
  })

  it('renders without dot indicator when dot=false', () => {
    const { container } = render(<Tag dot={false}>No Dot</Tag>)
    const dot = container.querySelector('span[aria-hidden="true"]')
    expect(dot).toBeNull()
  })

  it('renders dot indicator when dot=true', () => {
    const { container } = render(<Tag dot={true}>With Dot</Tag>)
    const dot = container.querySelector('span[aria-hidden="true"]')
    expect(dot).toBeInTheDocument()
  })

  it('SlaBadge renders null when done=true or dueAt is absent', () => {
    const { container: c1 } = render(<SlaBadge done={true} dueAt="2026-11-20T10:00:00Z" />)
    expect(c1.firstChild).toBeNull()

    const { container: c2 } = render(<SlaBadge dueAt={null} />)
    expect(c2.firstChild).toBeNull()
  })

  it('toneForStatus maps statuses to correct tone strings', () => {
    expect(toneForStatus('Resolved')).toBe('success')
    expect(toneForStatus('Overdue')).toBe('error')
    expect(toneForStatus('Assigned')).toBe('info')
  })
})
