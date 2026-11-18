import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Table, THead, TBody, Th, Td, Tr } from '@/components/ui/Table'

describe('components/ui/Table', () => {
  it('renders table with semantic headers and data cells', () => {
    render(
      <Table>
        <THead>
          <Tr>
            <Th>Tòa</Th>
            <Th align="right">Chỗ trống</Th>
          </Tr>
        </THead>
        <TBody>
          <Tr>
            <Td>Tòa A</Td>
            <Td align="right">15</Td>
          </Tr>
          <Tr>
            <Td>Tòa B</Td>
            <Td align="right">22</Td>
          </Tr>
        </TBody>
      </Table>
    )

    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()

    const headers = screen.getAllByRole('columnheader')
    expect(headers).toHaveLength(2)
    expect(headers[0]).toHaveTextContent('Tòa')
    expect(headers[1]).toHaveTextContent('Chỗ trống')

    const rows = screen.getAllByRole('row')
    // 1 header row + 2 data rows = 3 rows
    expect(rows).toHaveLength(3)

    const cells = screen.getAllByRole('cell')
    expect(cells).toHaveLength(4)
    expect(cells[0]).toHaveTextContent('Tòa A')
    expect(cells[1]).toHaveTextContent('15')
  })

  it('applies bare and fill styling props', () => {
    const { container, rerender } = render(
      <Table bare>
        <TBody><Tr><Td>Content</Td></Tr></TBody>
      </Table>
    )
    const tableEl = container.querySelector('table')
    expect(tableEl.className).not.toContain('border border-line')

    rerender(
      <Table fill>
        <TBody><Tr><Td>Content</Td></Tr></TBody>
      </Table>
    )
    const wrapper = container.firstChild
    expect(wrapper.className).toContain('min-h-0 flex-1')
  })
})
