import { useId, useState } from 'react'
import { Link } from 'react-router'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import campusAerial from '@/assets/signin/campus-aerial.png'
import fptLogo from '@/assets/signin/fpt-logo.png'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'

// Shared look of the public pages (Figma 128:58 "dormitory-login"): Sign In, Forgot password,
// Reset password and Set password (invitation).

export const cardClasses =
  'flex w-full flex-col gap-4 rounded-[20px] border border-white/18 bg-white/96 p-5 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.12),0px_20px_60px_0px_rgba(0,0,0,0.3)]'

export const primaryButtonClasses =
  'flex h-10 w-full items-center justify-center rounded-lg bg-primary px-2 text-base leading-5 font-semibold text-fg-on-brand shadow-card transition-colors hover:bg-primary-hover disabled:opacity-60'

export const textLinkClasses = 'text-base leading-5 font-semibold text-fg-link hover:underline'

/** Campus photo, FPT badge and the CampusStay title above the page's card. */
export function AuthShell({ children }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <img src={campusAerial} alt="" className="pointer-events-none absolute inset-0 -z-10 size-full max-w-none object-cover" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[rgba(10,15,26,0.72)]" />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.25 bg-accent" />
      <LanguageSwitch className="absolute top-4 right-4" />

      <main className="flex w-full max-w-105 flex-col items-center gap-6">
        <div className="flex w-full flex-col items-center gap-2.5">
          <div className="flex items-center gap-2.5 rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5">
            <img src={fptLogo} alt="FPT University" className="h-6 w-15.5 shrink-0 object-contain" />
            <p className="text-sm leading-4 font-semibold whitespace-nowrap text-white opacity-90">{t('FPT University • Tân Uyên Campus')}</p>
          </div>
          <h1 className="w-full text-center text-h1 font-bold text-white">CampusStay FPT</h1>
        </div>
        {children}
      </main>
    </div>
  )
}

/** Title and short explanation at the top of a card. */
export function CardTitle({ title, children }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-h2 font-semibold text-fg">{tx(title)}</h2>
      {children && <p className="text-base text-fg-secondary">{tx(children)}</p>}
    </div>
  )
}

export function LoginField({ label, error, helper, ...props }) {
  const id = useId()
  const password = props.type === 'password'
  const [shown, setShown] = useState(false)
  const Glyph = password ? Lock : Mail
  return (
    <div className="flex w-full flex-col gap-0.75">
      <label htmlFor={id} className="text-sm leading-4 font-semibold text-fg">
        {tx(label)}
      </label>
      <div
        className={cx(
          'flex h-10 w-full items-center gap-2 rounded-lg border bg-surface px-3 transition-[border-color,box-shadow] focus-within:shadow-focus',
          error ? 'border-error focus-within:border-error' : 'border-line focus-within:border-focus',
        )}
      >
        <Glyph size={16} aria-hidden="true" className="shrink-0 text-fg-tertiary" />
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-base leading-5 text-fg outline-none placeholder:text-fg-tertiary"
          {...props}
          type={password && shown ? 'text' : props.type}
        />
        {password && (
          <button
            type="button"
            onClick={() => setShown((x) => !x)}
            aria-label={shown ? t('Hide password') : t('Show password')}
            aria-pressed={shown}
            className="-mr-1 shrink-0 rounded-md p-1 text-fg-tertiary hover:text-fg"
          >
            {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          </button>
        )}
      </div>
      {error ? <p className="text-sm text-error-fg">{tx(error)}</p> : helper ? <p className="text-sm text-fg-tertiary">{tx(helper)}</p> : null}
    </div>
  )
}

export function BackToSignIn() {
  return (
    <Link to="/signin" className={cx(textLinkClasses, 'self-center')}>
      {t('Back to sign in')}
    </Link>
  )
}
