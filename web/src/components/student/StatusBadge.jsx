import { memo } from 'react'
import { Tag, toneForStatus } from '@/components/ui/Tag'

// The student tones map onto the design-system Tag tones; status → tone lives in ONE static table
// (toneForStatus in components/ui/Tag.jsx), so every page colours the same status the same way.
const TAG_TONE = { success: 'success', warning: 'warning', danger: 'error', info: 'info', neutral: 'neutral', brand: 'brand' }

/** A status pill that always carries text (colour is never the only signal). */
export const StatusBadge = memo(function StatusBadge({ status, tone, label, className }) {
  const tagTone = tone ? (TAG_TONE[tone] ?? 'neutral') : toneForStatus(status)
  return (
    <Tag tone={tagTone} className={className}>
      {label ?? status}
    </Tag>
  )
})
