import { t } from '@/i18n'
/*
 * "Sign in with Google" for FPT University accounts (Google Identity Services, authorization-code flow).
 * The browser only receives a one-time code; the backend exchanges it, checks that the account
 * ends with @fpt.edu.vn and returns the CampusStay session (POST /auth/google).
 *
 * The code comes from a popup. When the browser blocks popups (a pop-up setting, an extension, the in-app
 * browser of a chat app on a phone), this tab goes to Google instead and comes back to Sign In with the code
 * (redirect flow, contract change A-22). The return address `/signin` must be an authorized redirect URI of
 * the OAuth client; a random `state` kept in sessionStorage ties the answer to this tab.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
export const GOOGLE_DOMAIN = 'fpt.edu.vn'
export const googleConfigured = Boolean(CLIENT_ID)
const SCOPE = 'openid email profile'
const RETURN_KEY = 'campusstay-google-return'

let loading = null

/** Loads the Google Identity Services script once. Call it early so the popup opens on the first click. */
export function loadGoogle() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null
      reject(new Error(t('Could not load Google sign-in. Check your connection and try again.')))
    }
    document.head.appendChild(script)
  })
  return loading
}

/** The page Google's redirect flow returns to. */
export const googleReturnUri = () => `${window.location.origin}/signin`

function randomState() {
  const bytes = new Uint8Array(16)
  window.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** No popup: this tab goes to Google and comes back to /signin with the code (see takeGoogleRedirect). */
function redirectToGoogle(context) {
  const state = randomState()
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ state, remember: Boolean(context.remember), from: context.from ?? null }))
  } catch {
    // Without storage the answer cannot be checked; takeGoogleRedirect will refuse it.
  }
  window.google.accounts.oauth2
    .initCodeClient({ client_id: CLIENT_ID, scope: SCOPE, ux_mode: 'redirect', redirect_uri: googleReturnUri(), state, hd: GOOGLE_DOMAIN })
    .requestCode()
}

function openPopup(resolve, reject, context) {
  const client = window.google.accounts.oauth2.initCodeClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    ux_mode: 'popup',
    hd: GOOGLE_DOMAIN, // Google only offers accounts of this domain
    callback: (response) => (response.error ? reject(new Error(t('Google sign-in was not completed.'))) : resolve(response.code)),
    error_callback: (error) => {
      // The promise stays open: the page leaves for Google and Sign In finishes when it comes back.
      if (error?.type === 'popup_failed_to_open') redirectToGoogle(context)
      else reject(new Error(error?.type === 'popup_closed' ? t('Google sign-in was closed before it finished.') : t('Google sign-in could not open. Allow pop-ups for this site and try again.')))
    },
  })
  client.requestCode()
}

/**
 * Opens the Google popup and resolves with the authorization code. `context` ({ remember, from }) is kept for the
 * redirect flow, which finishes on the next page load.
 */
export function requestGoogleCode(context = {}) {
  if (!googleConfigured) return Promise.reject(new Error(t('Google sign-in is not set up for this site yet. Use your email and password.')))
  return new Promise((resolve, reject) => {
    // Open the popup in the same click when the script is ready, so browsers do not block it.
    if (window.google?.accounts?.oauth2) openPopup(resolve, reject, context)
    else loadGoogle().then(() => openPopup(resolve, reject, context), reject)
  })
}

/**
 * When Google's redirect flow has just returned to this page: { code, remember, from, redirectUri } to finish
 * signing in, or { error }. Null otherwise. The answer is read once and removed from the address bar.
 */
export function takeGoogleRedirect() {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('state') || !(params.has('code') || params.has('error'))) return null
  let saved = null
  try {
    saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? 'null')
    sessionStorage.removeItem(RETURN_KEY)
  } catch {
    saved = null
  }
  window.history.replaceState(window.history.state, '', window.location.pathname)
  if (!saved || saved.state !== params.get('state')) return { error: t('Google sign-in expired. Try again.') }
  if (params.has('error') || !params.get('code')) return { error: t('Google sign-in was not completed.') }
  return { code: params.get('code'), remember: saved.remember, from: saved.from, redirectUri: googleReturnUri() }
}
