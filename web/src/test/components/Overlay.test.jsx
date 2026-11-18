import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal, Drawer } from '@/components/ui/Overlay'

describe('components/ui/Overlay', () => {
  describe('Modal', () => {
    it('does not render into DOM when open=false', () => {
      render(
        <Modal open={false} title="Confirm action">
          <p>Modal body content</p>
        </Modal>
      )
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('renders dialog portal with title, content and footer when open=true', () => {
      render(
        <Modal
          open={true}
          title="Confirm Payment"
          description="Invoice #12345"
          footer={<button>Confirm</button>}
        >
          <p>Please check transfer details.</p>
        </Modal>
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(screen.getByText(/confirm payment|xác nhận thanh toán/i)).toBeInTheDocument()
      expect(screen.getByText('Please check transfer details.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    })

    it('triggers onClose when close icon button is clicked', () => {
      const handleClose = vi.fn()
      render(
        <Modal open={true} onClose={handleClose} title="Notice">
          <p>Content</p>
        </Modal>
      )
      const closeBtn = screen.getByRole('button', { name: /đóng|close/i })
      fireEvent.click(closeBtn)
      expect(handleClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Drawer', () => {
    it('renders drawer dialog with right-hand panel', () => {
      render(
        <Drawer
          open={true}
          title="Edit Room Type"
          description="Configure bed capacity"
          footer={<button>Save</button>}
        >
          <p>Drawer inputs</p>
        </Drawer>
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
      expect(screen.getByText(/edit room type|sửa loại phòng/i)).toBeInTheDocument()
      expect(screen.getByText('Drawer inputs')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    })
  })
})
