import { useState } from 'react'
import { useSession } from '@/app/session'
import { Select } from '@/components/ui/Field'
import { t } from '@/i18n'

/**
 * Block-level pages (routing rules, Block settings, inspection schedules) work on one Block. A Block picked in
 * the top bar, or the only Block of a Staff member, is used as it is; a Manager on "All Blocks" (ADR-19) gets
 * this picker instead, starting at the first Block.
 */
export function useOneBlock() {
  const { block: scopeBlock, blocks } = useSession()
  const [picked, setPicked] = useState(null)
  const block = scopeBlock ?? (blocks.includes(picked) ? picked : blocks[0]) ?? null
  const picker =
    !scopeBlock && blocks.length > 1 ? (
      <Select
        wrapperClassName="w-40"
        aria-label={t('Block')}
        value={block ?? ''}
        onChange={(e) => setPicked(e.target.value)}
        options={blocks.map((b) => ({ value: b, label: t('Block {code}', { code: b }) }))}
      />
    ) : null
  return { block, picker }
}
