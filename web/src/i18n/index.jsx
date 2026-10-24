import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import vi from './vi'

/*
 * Two languages (ADR-25): Vietnamese (default) and English. Texts in the code are English and are their own
 * keys; ./vi.js gives the Vietnamese text of each one. A key may hold values in braces:
 *   t('Pay {amount} before {date}', { amount, date })
 * tr(text) translates a text the API already filled in ("Late check-in approved until 20/01/2027") by matching
 * the same keys with their values left open. A text without a translation shows in English, never blank.
 *
 * The language is kept in the browser for the sign-in page and saved on the account once signed in
 * (PUT /auth/me/locale), so notifications, push and emails follow it. Changing it re-renders the app.
 */

export const LANGUAGES = [
  { value: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { value: 'en', label: 'English', short: 'EN' },
]
const STORAGE_KEY = 'campusstay-lang'
const isLang = (value) => value === 'vi' || value === 'en'

function stored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isLang(value) ? value : null
  } catch {
    return null
  }
}

let current = stored() ?? 'vi'

/** The language in use: 'vi' or 'en'. Also sent as Accept-Language with every API request. */
export const getLang = () => current

const fill = (text, vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (whole, name) => (vars[name] == null ? whole : String(vars[name]))) : text

/** The text in the current language, with its {values} filled in. */
export function t(text, vars) {
  if (text == null) return ''
  const translated = current === 'vi' ? (vi[text] ?? text) : text
  return fill(translated, vars)
}

let patterns = null
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function compiled() {
  if (patterns) return patterns
  patterns = Object.entries(vi)
    .filter(([key]) => /\{\w+\}/.test(key))
    .map(([key, value]) => {
      const names = []
      const source = key.split(/(\{\w+\})/).map((part) => {
        const m = /^\{(\w+)\}$/.exec(part)
        if (!m) return escape(part)
        names.push(m[1])
        return '(.+?)'
      })
      return { re: new RegExp(`^${source.join('')}$`, 's'), names, value }
    })
  return patterns
}

/** A text from the API in the current language: exact match first, then a key with open values. */
export function tr(text) {
  if (text == null || current !== 'vi' || typeof text !== 'string') return text ?? ''
  if (vi[text] != null) return vi[text]
  for (const p of compiled()) {
    const m = p.re.exec(text)
    if (m) {
      // Values are API texts too ("Escalated: Past the 8-hour limit"): each one is translated the same way.
      const vars = Object.fromEntries(p.names.map((name, i) => [name, tr(m[i + 1])]))
      return fill(p.value, vars)
    }
  }
  return text
}

/**
 * A text that a component shows from its props (a title, a label, a button's text): strings go through tr(),
 * so pages can pass the English text; other React nodes are left as they are.
 */
export const tx = (node) => (typeof node === 'string' ? tr(node) : node)

const I18nContext = createContext({ lang: current, setLang: () => {} })

/**
 * Holds the language. `onChange(lang)` is told about every change the person makes (the session saves it on
 * the account); `follow(lang)` lets the account's language take over after sign-in without saving it back.
 */
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(current)

  const apply = useCallback((next) => {
    if (!isLang(next) || next === current) return
    current = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage unavailable: the language lasts until the page is closed.
    }
    setLangState(next)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo(() => ({ lang, setLang: apply }), [lang, apply])
  // The key re-renders every screen in the new language, including texts built outside components.
  return (
    <I18nContext.Provider value={value}>
      <Fragment key={lang}>{children}</Fragment>
    </I18nContext.Provider>
  )
}

/** { lang, setLang } — setLang only changes the screen; use the session's setLanguage to also save it. */
export const useI18n = () => useContext(I18nContext)
