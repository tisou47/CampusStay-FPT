import { useSession } from '@/app/session'
import { LANGUAGES, t, useI18n } from '@/i18n'
import { cx } from '@/lib/cx'

/**
 * VI | EN switch (ADR-25). Signed in, it also saves the language on the account, so notifications, push and
 * emails follow it; on the sign-in page it only changes the screen.
 */
export function LanguageSwitch({ className, size = 'md' }) {
  const { lang } = useI18n()
  const { setLanguage } = useSession()
  return (
    <div role="radiogroup" aria-label={t('Language')} className={cx('flex shrink-0 rounded-md border border-line-strong bg-surface p-0.5', className)}>
      {LANGUAGES.map((option) => {
        const active = option.value === lang
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.label}
            onClick={() => setLanguage(option.value)}
            className={cx(
              'rounded-sm font-medium transition-colors',
              size === 'sm' ? 'px-2 py-0.5 text-sm' : 'px-2.5 py-0.5 text-sm',
              active ? 'bg-primary text-fg-on-brand' : 'text-fg-secondary hover:text-fg',
            )}
          >
            {option.short}
          </button>
        )
      })}
    </div>
  )
}
