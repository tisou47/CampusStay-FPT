import { Tag } from '@/components/ui/Tag'
import { conditionName, conditionTone } from '@/lib/furniture'
import { SEVERITY } from '../checkinReports'

/** A furniture item's condition (Good, Worn, Damaged, Missing) as a Tag with its word; "—" when there is none. */
export function StatusBadge({ value, className }) {
  if (!value) return <span className="text-sm text-fg-tertiary">—</span>
  return (
    <Tag tone={conditionTone[value] ?? 'neutral'} className={className}>
      {conditionName(value)}
    </Tag>
  )
}

/** Matched / Minor difference / Major difference, from severityOf(); the status word when there is no comparison. */
export function SeverityBadge({ severity, fallback, className }) {
  const s = SEVERITY[severity]
  if (!s) return fallback ? <Tag tone="neutral" className={className}>{fallback}</Tag> : null
  return (
    <Tag tone={s.tone} className={className}>
      {s.label}
    </Tag>
  )
}
