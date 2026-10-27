import { useMemo } from 'react'
import { Printer } from 'lucide-react'
import qrcode from 'qrcode-generator'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Overlay'
import { typeName } from '@/lib/furniture'
import { t } from '@/i18n'

// Printable labels of furniture asset codes (spec §6.19): one QR code per item, encoding the asset code, which the
// search and the furniture list find. Only the labels are printed (index.css › .print-area).
function Qr({ text }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    return qr.createSvgTag(4, 0)
  }, [text])
  return <span aria-hidden="true" className="block size-24 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
}

export function FurnitureLabels({ items, placeLabel, onClose }) {
  return (
    <Modal
      open
      onClose={onClose}
      width={760}
      title={t(items.length === 1 ? 'QR label of {n} item' : 'QR labels of {n} items', { n: items.length })}
      description="Stick each label on its item; scanning it gives the asset code."
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={Printer} onClick={() => window.print()} disabled={!items.length}>
            Print
          </Button>
        </>
      }
    >
      <div className="print-area grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto">
        {items.map((i) => (
          <div key={i.id} className="flex break-inside-avoid items-center gap-3 rounded-md border border-line p-2">
            <Qr text={i.assetCode} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-base font-semibold text-fg">{i.assetCode}</span>
              <span className="truncate text-sm text-fg-secondary">{typeName(i)}</span>
              <span className="truncate text-sm text-fg-tertiary">{placeLabel(i.location)}</span>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
