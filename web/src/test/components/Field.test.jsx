import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Field, Input, Textarea, Select, SearchInput } from '@/components/ui/Field'

describe('components/ui/Field', () => {
  it('renders label, input, and helper text', () => {
    render(
      <Field label="Full name" helper="Enter your official student name">
        {(id) => <Input id={id} defaultValue="Nguyen Van An" />}
      </Field>
    )

    const label = screen.getByText('Họ tên')
    expect(label).toBeInTheDocument()

    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('Nguyen Van An')

    const helper = screen.getByText(/official student name|tên chính thức/i)
    expect(helper).toBeInTheDocument()
  })

  it('renders required asterisk when required=true', () => {
    render(
      <Field label="Email" required>
        {(id) => <Input id={id} />}
      </Field>
    )
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('renders error message and aria-invalid on Input', () => {
    render(
      <Field label="Student code" error="Enter a new password.">
        {(id) => <Input id={id} invalid />}
      </Field>
    )
    const errorMsg = screen.getByText('Hãy nhập mật khẩu mới.')
    expect(errorMsg).toBeInTheDocument()

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('Textarea receives value and handles change events', () => {
    const handleChange = vi.fn()
    render(<Textarea placeholder="Note" onChange={handleChange} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Water leak in bathroom' } })
    expect(handleChange).toHaveBeenCalled()
    expect(textarea).toHaveValue('Water leak in bathroom')
  })

  it('Select renders options and allows selection', () => {
    const handleChange = vi.fn()
    const options = [
      { value: 'A', label: 'Tòa A' },
      { value: 'B', label: 'Tòa B' },
    ]
    render(<Select options={options} defaultValue="A" onChange={handleChange} />)
    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('A')

    fireEvent.change(select, { target: { value: 'B' } })
    expect(handleChange).toHaveBeenCalled()
    expect(select).toHaveValue('B')
  })

  it('SearchInput renders search field with search glyph', () => {
    render(<SearchInput placeholder="Search students..." />)
    const search = screen.getByRole('searchbox')
    expect(search).toBeInTheDocument()
  })
})
