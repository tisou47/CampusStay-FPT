import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { reuseScreenData } from '@/api/hooks'
import shell from './vi'
import englishOne from './en-plurals'

/*
 * Two languages (ADR-25): Vietnamese (default) and English. Texts in the code are English and are their own
 * keys; ./vi.js gives the Vietnamese text of each one. A key may hold values in braces:
 *   t('Pay {amount} before {date}', { amount, date })
 * tr(text) translates a text the API already filled in ("Late check-in approved until 20/01/2027") by matching
 * the same keys with their values left open. A text without a translation shows in English, never blank.
 *
 * The language is kept in the browser for the sign-in page and saved on the account once signed in
 * (PUT /auth/me/locale), so notifications, push and emails follow it. Changing it rebuilds the screens
 * (LanguageScope) with the data they show, so nothing loads again on screen.
 *
 * The screens' Vietnamese texts (./vi-pages.js, the largest file of the app) are a chunk of their own, loaded by
 * loadLanguage('vi') before the app renders in Vietnamese or switches to it; English never downloads them.
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

// Shell texts first, the screens' texts merged in later: the screens' entries win, as when they were one object.
const vi = { ...shell }
let pagesLoaded = null

/** Loads what `lang` needs before it is shown. A failed load resolves too: the screens then show English. */
export function loadLanguage(lang) {
  if (lang !== 'vi') return Promise.resolve()
  pagesLoaded ??= import('./vi-pages').then(
    ({ default: pages }) => {
      Object.assign(vi, pages)
      patterns = null
    },
    () => {
      pagesLoaded = null
    },
  )
  return pagesLoaded
}

if (current === 'vi') loadLanguage('vi')

if (import.meta.hot) {
  import.meta.hot.accept('./vi-pages', (mod) => {
    if (mod?.default) {
      Object.assign(vi, mod.default)
      patterns = null
    }
  })
}

const fill = (text, vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (whole, name) => (vars[name] == null ? whole : String(vars[name]))) : text

// English plural rules (ICU categories): "one" picks the singular form of ./en-plurals.js.
const englishPlural = new Intl.PluralRules('en-GB')
const countOf = (vars) => {
  const raw = vars?.n ?? vars?.count
  if (raw == null) return null
  const n = Number(String(raw).replace(/[,.\s]/g, ''))
  return Number.isNaN(n) ? null : n
}

/** The text in the current language, with its {values} filled in; in English, "1 request" not "1 requests". */
export function t(text, vars) {
  if (text == null) return ''
  if (current === 'vi') return fill(vi[text] ?? text, vars)
  const n = countOf(vars)
  const singular = n != null && englishOne[text] && englishPlural.select(n) === 'one' ? englishOne[text] : text
  return fill(singular, vars)
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
      return { re: new RegExp(`^${source.join('')}$`, 's'), names, value, fixed: key.replace(/\{\w+\}/g, '').length }
    })
    // The most specific key wins: "The stay of {name} has started…" before "{n} of {total}".
    .sort((a, b) => b.fixed - a.fixed)
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
let requested = current

// Scroll offsets of the screen's scrolled areas, found again after the switch by their place in the page.
function pathOf(el) {
  const steps = []
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    steps.push(Array.prototype.indexOf.call(node.parentElement?.children ?? [], node))
  }
  return steps
}
function find(steps) {
  let node = document.body
  for (let i = steps.length - 1; i >= 0 && node; i--) node = node.children[steps[i]]
  return node
}
function saveScroll() {
  const saved = []
  for (const el of document.querySelectorAll('body *')) {
    if (el.scrollTop > 0 || el.scrollLeft > 0) saved.push({ steps: pathOf(el), top: el.scrollTop, left: el.scrollLeft })
  }
  return saved
}
function restoreScroll(saved) {
  for (const { steps, top, left } of saved) {
    const el = find(steps)
    if (el) el.scrollTo({ top, left, behavior: 'instant' })
  }
}

/**
 * Shows the new language in one step: the screens are rebuilt with the data they already show (no loading
 * state; the queries refresh behind it), the scrolled areas keep their place, and where the browser can, the old
 * and new screens cross-fade while the VI | EN marker slides (View Transitions; index.css).
 */
function switchScreen(update) {
  const swap = () => {
    const scroll = saveScroll()
    reuseScreenData(() => flushSync(update))
    restoreScroll(scroll)
  }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  // A hidden page draws no frames, so a transition would wait until it is shown again: switch at once instead.
  if (!document.startViewTransition || reduced || document.visibilityState !== 'visible') {
    swap()
    return
  }
  try {
    document.startViewTransition(swap)
  } catch {
    swap()
  }
}

/**
 * Holds the language. setLang(lang) loads what the language needs, then shows it; the session's setLanguage also
 * saves it on the account.
 */
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(current)

  const apply = useCallback((next) => {
    if (!isLang(next) || next === current) return
    requested = next
    loadLanguage(next).then(() => {
      // A later choice made while this one loaded wins.
      if (requested !== next || next === current) return
      switchScreen(() => {
        current = next
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {
          // Storage unavailable: the language lasts until the page is closed.
        }
        setLangState(next)
      })
    })
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo(() => ({ lang, setLang: apply }), [lang, apply])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Rebuilds the screens under it in the new language, including texts built outside components. It sits under the
 * session, so the signed-in user, the Term and the Block scope stay as they were.
 */
export function LanguageScope({ children }) {
  const { lang } = useI18n()
  return <Fragment key={lang}>{children}</Fragment>
}

/** { lang, setLang } — setLang only changes the screen; use the session's setLanguage to also save it. */
export const useI18n = () => useContext(I18nContext)
