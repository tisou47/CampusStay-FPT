import { useLayoutEffect, useRef } from 'react'
import { useSession } from '@/app/session'
import { LANGUAGES, t, useI18n } from '@/i18n'
import { cx } from '@/lib/cx'

// Where the switch last clicked sits in the page. Its marker carries the view-transition name before and after the
// screens are rebuilt, so the marker slides from the old language to the new one while the screen cross-fades
// (i18n switchScreen, index.css). Only one element may carry the name.
let clicked = null
const placeOf = (el) => {
  const steps = []
  for (let node = el; node?.parentElement; node = node.parentElement) steps.push(Array.prototype.indexOf.call(node.parentElement.children, node))
  return steps.join('.')
}

/**
 * VI | EN switch (ADR-25). Signed in, it also saves the language on the account, so notifications, push and
 * emails follow it; on the sign-in page it only changes the screen. Both options have the same width and the
 * orange marker slides between them, so the switch keeps its size and place in either language.
 */
export function LanguageSwitch({ className, size = 'md' }) {
  const marker = useRef(null)
  const { lang } = useI18n()
  const { setLanguage } = useSession()
  const index = Math.max(0, LANGUAGES.findIndex((option) => option.value === lang))
  const sm = size === 'sm'

  // The rebuilt switch in the clicked one's place takes the name while the new screen is captured.
  useLayoutEffect(() => {
    const el = marker.current
    if (!el || clicked === null || placeOf(el) !== clicked) return undefined
    el.style.viewTransitionName = 'lang-marker'
    const timer = setTimeout(() => {
      el.style.viewTransitionName = ''
      clicked = null
    }, 600)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      role="radiogroup"
      aria-label={t('Language')}
      className={cx('relative grid shrink-0 grid-cols-2 rounded-xl border border-line-strong bg-surface p-0.5 shadow-card', className)}
    >
      <span
        ref={marker}
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-lg bg-primary transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {LANGUAGES.map((option) => {
        const active = option.value === lang
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.label}
            onClick={() => {
              if (active) return
              if (marker.current) {
                clicked = placeOf(marker.current)
                marker.current.style.viewTransitionName = 'lang-marker'
              }
              setLanguage(option.value)
            }}
            className={cx(
              'relative z-10 rounded-lg text-center text-sm font-medium transition-colors duration-200',
              sm ? 'w-9 py-0.5' : 'w-10 py-1',
              active ? 'text-fg-on-brand' : 'text-fg-secondary hover:text-fg',
            )}
          >
            {option.short}
          </button>
        )
      })}
    </div>
  )
}
