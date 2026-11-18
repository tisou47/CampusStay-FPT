import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Checkbox, Radio, Switch } from '@/components/ui/Choice'

describe('components/ui/Choice', () => {
  describe('Checkbox', () => {
    it('renders label and description', () => {
      render(
        <Checkbox
          label="Good condition"
          description="All room items intact and clean"
        />
      )
      expect(screen.getByText(/good condition|tình trạng tốt/i)).toBeInTheDocument()
      expect(screen.getByText(/all room items intact and clean|mọi tài sản phòng nguyên vẹn/i)).toBeInTheDocument()
    })

    it('toggles checked state when clicked', () => {
      const handleChange = vi.fn()
      render(<Checkbox label="Key returned" onChange={handleChange} />)
      const input = screen.getByRole('checkbox')
      expect(input).not.toBeChecked()

      fireEvent.click(input)
      expect(handleChange).toHaveBeenCalledTimes(1)
      expect(input).toBeChecked()
    })

    it('handles indeterminate state correctly', () => {
      const { container } = render(<Checkbox label="Select all" indeterminate={true} />)
      const input = screen.getByRole('checkbox')
      expect(input.indeterminate).toBe(true)
    })
  })

  describe('Radio', () => {
    it('renders radio input with label', () => {
      render(<Radio name="status" value="good" label="No damage" />)
      const radio = screen.getByRole('radio')
      expect(radio).toBeInTheDocument()
      expect(screen.getByText(/no damage|không hư hại/i)).toBeInTheDocument()
    })

    it('handles radio selection within group', () => {
      render(
        <div>
          <Radio name="condition" value="good" label="Good" defaultChecked />
          <Radio name="condition" value="damaged" label="Damaged" />
        </div>
      )
      const radios = screen.getAllByRole('radio')
      expect(radios[0]).toBeChecked()
      expect(radios[1]).not.toBeChecked()

      fireEvent.click(radios[1])
      expect(radios[1]).toBeChecked()
      expect(radios[0]).not.toBeChecked()
    })
  })

  describe('Switch', () => {
    it('renders switch toggle with accessible role="switch"', () => {
      render(<Switch label="Auto assign rooms" checked={false} />)
      const toggle = screen.getByRole('switch')
      expect(toggle).toBeInTheDocument()
      expect(toggle).not.toBeChecked()
    })

    it('calls onChange callback with boolean state', () => {
      const handleChange = vi.fn()
      render(<Switch label="Night curfew" checked={false} onChange={handleChange} />)
      const toggle = screen.getByRole('switch')

      fireEvent.click(toggle)
      expect(handleChange).toHaveBeenCalledWith(true)
    })
  })
})
