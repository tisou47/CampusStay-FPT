import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Button } from '@/components/ui/Button'

describe('components/ui/Button', () => {
  it('renders button element with default properties', () => {
    render(<Button>Click Me</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('handles click events', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Action</Button>)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('renders disabled state and ignores clicks', () => {
    const handleClick = vi.fn()
    render(<Button disabled onClick={handleClick}>Action</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('gives primary and danger buttons their colour tokens', () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-primary')

    rerender(<Button variant="danger">Danger</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-error')
  })

  it('renders as anchor tag when href is passed', () => {
    render(<Button href="https://fpt.edu.vn">External</Button>)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://fpt.edu.vn')
  })

  it('renders as router Link when to is passed', () => {
    render(
      <MemoryRouter>
        <Button to="/manager/dashboard">Dashboard</Button>
      </MemoryRouter>
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/manager/dashboard')
  })

  it('renders disabled link with aria-disabled="true"', () => {
    render(
      <MemoryRouter>
        <Button to="/manager/dashboard" disabled>Disabled Link</Button>
      </MemoryRouter>
    )
    const disabledLink = screen.getByRole('link')
    expect(disabledLink).toHaveAttribute('aria-disabled', 'true')
  })
})
