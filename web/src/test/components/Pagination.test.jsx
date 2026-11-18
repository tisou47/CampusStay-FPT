import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Pagination } from '@/components/ui/Pagination'

describe('components/ui/Pagination', () => {
  it('renders total count and pagination nav', () => {
    render(<Pagination total={100} page={1} pageSize={20} />)
    const nav = screen.getByRole('navigation')
    expect(nav).toBeInTheDocument()
    expect(screen.getByText(/tổng 100|total 100/i)).toBeInTheDocument()
  })

  it('disables previous button on first page', () => {
    render(<Pagination total={100} page={1} pageSize={20} />)
    const prevBtn = screen.getByRole('button', { name: /trang trước|previous page/i })
    expect(prevBtn).toBeDisabled()
  })

  it('disables next button on last page', () => {
    render(<Pagination total={100} page={5} pageSize={20} />)
    const nextBtn = screen.getByRole('button', { name: /trang sau|next page/i })
    expect(nextBtn).toBeDisabled()
  })

  it('calls onChange when clicking a page number', () => {
    const handleChange = vi.fn()
    render(<Pagination total={100} page={1} pageSize={20} onChange={handleChange} />)
    const page2Btn = screen.getByRole('button', { name: '2' })
    fireEvent.click(page2Btn)
    expect(handleChange).toHaveBeenCalledWith(2)
  })

  it('calls onChange with page + 1 when clicking next button', () => {
    const handleChange = vi.fn()
    render(<Pagination total={100} page={2} pageSize={20} onChange={handleChange} />)
    const nextBtn = screen.getByRole('button', { name: /trang sau|next page/i })
    fireEvent.click(nextBtn)
    expect(handleChange).toHaveBeenCalledWith(3)
  })

  it('marks current page with aria-current="page"', () => {
    render(<Pagination total={100} page={3} pageSize={20} />)
    const page3Btn = screen.getByRole('button', { name: '3' })
    expect(page3Btn).toHaveAttribute('aria-current', 'page')
  })
})
