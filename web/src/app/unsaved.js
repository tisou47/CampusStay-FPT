import { useEffect } from 'react'
import { useBlocker } from 'react-router'
import { t } from '@/i18n'

/*
 * Unsaved edits on a form (Admin configuration, checklists, wizard steps). While a form says it is dirty:
 * leaving the page, closing the tab or switching the language (which rebuilds every screen, i18n LanguageScope)
 * asks first, so an edit is never dropped without a word.
 */

let dirtyForms = 0

/** True while some mounted form has unsaved edits (LanguageSwitch asks before switching). */
export const hasUnsavedChanges = () => dirtyForms > 0

/** Asks the person to confirm dropping unsaved edits; true when they agree. */
export const confirmDiscard = () => window.confirm(t('You have unsaved changes. Leave and lose them?'))

export function useUnsavedChanges(dirty) {
  useEffect(() => {
    if (!dirty) return undefined
    dirtyForms++
    const onUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      dirtyForms--
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [dirty])
  // Only a move to another page asks; a change of ?query or #hash on the same page keeps the form.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (confirmDiscard()) blocker.proceed()
    else blocker.reset()
  }, [blocker])
}
