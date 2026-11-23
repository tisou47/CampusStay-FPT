import { Info } from 'lucide-react'
import { Card } from '@/components/ui/Display'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { CONDITIONS, conditionName, conditionTone, typeName } from '@/lib/furniture'
import { t } from '@/i18n'

// What each condition means, in general and with examples for the common furniture types, so a student filing the
// check-in inventory picks the right one. Matched on the type's English name; other types use the general texts.
const GENERAL = {
  Good: 'Works and looks fine: only light marks from normal use.',
  Worn: 'Used but still works: scratches, faded paint, small marks.',
  Damaged: 'Broken or not working properly: it needs a repair.',
  Missing: 'Not in the Room, or a part of it is gone.',
}

const EXAMPLES = [
  {
    match: /chair|stool/,
    Good: 'Steady, the seat and back are whole.',
    Worn: 'Scratches, a slightly wobbly leg.',
    Damaged: 'A loose or cracked leg, a broken seat or back.',
    Missing: 'No chair in the Room.',
  },
  {
    match: /desk|table/,
    Good: 'Steady top, drawers open and close.',
    Worn: 'Scratches or marks on the top.',
    Damaged: 'Wobbly, a broken drawer or a cracked top.',
    Missing: 'No desk, or a drawer is gone.',
  },
  {
    match: /mattress/,
    Good: 'Clean and firm.',
    Worn: 'Small stains, slightly flattened.',
    Damaged: 'Torn, springs coming out, very sunken.',
    Missing: 'No mattress on the Bed.',
  },
  {
    match: /bed|bunk|ladder/,
    Good: 'Steady frame, every slat in place.',
    Worn: 'Chipped paint, creaks a little.',
    Damaged: 'A broken slat or frame, a loose ladder.',
    Missing: 'A slat or the ladder is gone.',
  },
  {
    match: /wardrobe|locker|cabinet|closet|shelf/,
    Good: 'Doors close, the lock works.',
    Worn: 'Scratches, a door is hard to close.',
    Damaged: 'A door off its hinge, a broken lock.',
    Missing: 'No key, a shelf or the whole unit is gone.',
  },
  {
    match: /air|conditioner|fan|heater/,
    Good: 'Turns on and cools or blows normally.',
    Worn: 'Works but is noisy or dusty.',
    Damaged: 'Does not turn on or cool, leaks water.',
    Missing: 'No unit, or its remote is gone.',
  },
  {
    match: /light|lamp|bulb/,
    Good: 'Turns on, steady light.',
    Worn: 'Dim or a little discoloured.',
    Damaged: 'Does not turn on or flickers.',
    Missing: 'No bulb or no lamp.',
  },
  {
    match: /curtain|blind/,
    Good: 'Whole and slides well.',
    Worn: 'Faded or with small stains.',
    Damaged: 'Torn, the rail or hooks broken.',
    Missing: 'No curtain.',
  },
]

function examplesOf(item) {
  const name = String(item?.type ?? item?.name ?? '').toLowerCase()
  return EXAMPLES.find((e) => e.match.test(name)) ?? null
}

/**
 * The side panel of the check-in inventory: the item being answered and what each condition means for it. Picking a
 * level here answers the item, like the dropdown.
 */
export function ConditionGuide({ item, value, onPick, disabled, photosRequired, levels }) {
  const examples = examplesOf(item)
  return (
    // On a computer it keeps its own height and scrolls inside, so the page never jumps when another item is picked.
    <Card className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
      <div className="flex items-start gap-2">
        <Info size={18} className="mt-0.5 shrink-0 text-fg-brand" aria-hidden="true" />
        <div className="flex min-w-0 flex-col">
          <span className="text-base font-semibold text-fg">{t('Which condition?')}</span>
          <span className="text-sm text-fg-secondary">
            {item ? `${typeName(item)} · ${item.assetCode}` : t('Choose an item’s condition to see what each level means for it.')}
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {CONDITIONS.map((c) => {
          const active = value === c
          const content = (
            <>
              <Tag tone={conditionTone[c] ?? 'neutral'}>{conditionName(c, levels)}</Tag>
              <span className="text-sm text-fg">{t(GENERAL[c])}</span>
              {examples?.[c] && <span className="text-sm text-fg-secondary">{t('E.g. {text}', { text: t(examples[c]) })}</span>}
            </>
          )
          return (
            <li key={c}>
              {item && onPick && !disabled ? (
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  aria-pressed={active}
                  className={cx(
                    'flex w-full flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-colors',
                    active ? 'border-primary bg-brand-subtle' : 'border-line hover:bg-subtle',
                  )}
                >
                  {content}
                </button>
              ) : (
                <div className="flex flex-col items-start gap-1 rounded-lg border border-line px-3 py-2">{content}</div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-fg-tertiary">
        {photosRequired ? t('Damaged or Missing items need a photo and a short note.') : t('Add a short note and a photo when something is worn, damaged or missing.')}
      </p>
    </Card>
  )
}
