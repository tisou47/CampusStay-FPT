import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge, statusVariant, variantOf } from '@/components/ui/StatusBadge'

describe('components/ui/StatusBadge', () => {
  it('renders status text', () => {
    render(<StatusBadge status="Resolved" />)
    expect(screen.getByText(/đã xử lý|resolved/i)).toBeInTheDocument()
  })

  it('statusVariant maps status strings to variants accurately', () => {
    expect(statusVariant('Resolved')).toBe('done')
    expect(statusVariant('In progress')).toBe('in_progress')
    expect(statusVariant('Overdue')).toBe('overdue')
    expect(statusVariant('Rejected')).toBe('overdue')
    expect(statusVariant('Approved')).toBe('assigned')
    expect(statusVariant('Draft')).toBe('neutral')
    expect(statusVariant('Cancelled')).toBe('cancelled')
  })

  it('variantOf handles alias tones', () => {
    expect(variantOf('success')).toBe('done')
    expect(variantOf('warning')).toBe('pending')
    expect(variantOf('error')).toBe('overdue')
    expect(variantOf('info')).toBe('assigned')
  })

  it('applies variant classes correctly', () => {
    const { container: c1 } = render(<StatusBadge status="Resolved" />)
    expect(c1.firstChild.className).toContain('bg-success-bg')

    const { container: c2 } = render(<StatusBadge status="Rejected" />)
    expect(c2.firstChild.className).toContain('bg-error-bg')
  })
})
