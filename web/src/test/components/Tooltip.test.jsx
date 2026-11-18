import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Tooltip, InfoTip, Truncate, isTruncated } from '@/components/ui/Tooltip'

describe('components/ui/Tooltip', () => {
  it('renders child element properly', () => {
    render(<Tooltip label="Tooltip details"><button>Hover target</button></Tooltip>)
    expect(screen.getByRole('button', { name: /hover target/i })).toBeInTheDocument()
  })

  it('InfoTip renders question mark icon button with accessible aria-label', () => {
    render(<InfoTip label="SLA calculation rule" />)
    const btn = screen.getByRole('button')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-label')
    expect(btn.getAttribute('aria-label')).toContain('SLA')
  })

  it('InfoTip returns null when neither label nor title is provided', () => {
    const { container } = render(<InfoTip label="" title="" />)
    expect(container.firstChild).toBeNull()
  })

  it('Truncate renders truncated text component', () => {
    render(<Truncate>Very long text that gets cut off</Truncate>)
    expect(screen.getByText(/very long text that gets cut off/i)).toBeInTheDocument()
  })

  it('isTruncated returns false for null element', () => {
    expect(isTruncated(null)).toBe(false)
  })
})
