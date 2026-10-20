/*
 * "Sign in with Google" for FPT University accounts (Google Identity Services, authorization-code popup).
 * The browser only receives a one-time code; the backend exchanges it, checks that the account
 * ends with @fpt.edu.vn and returns the CampusStay session (POST /auth/google).
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
export const GOOGLE_DOMAIN = 'fpt.edu.vn'
export const googleConfigured = Boolean(CLIENT_ID)

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
      reject(new Error('Could not load Google sign-in. Check your connection and try again.'))
    }
    document.head.appendChild(script)
  })
  return loading
}

function openPopup(resolve, reject) {
  const client = window.google.accounts.oauth2.initCodeClient({
    client_id: CLIENT_ID,
    scope: 'openid email profile',
    ux_mode: 'popup',
    hd: GOOGLE_DOMAIN, // Google only offers accounts of this domain
    callback: (response) => (response.error ? reject(new Error('Google sign-in was not completed.')) : resolve(response.code)),
    error_callback: (error) => reject(new Error(error?.type === 'popup_closed' ? 'Google sign-in was closed before it finished.' : 'Google sign-in could not open. Allow pop-ups for this site and try again.')),
  })
  client.requestCode()
}

/** Opens the Google popup and resolves with the authorization code. */
export function requestGoogleCode() {
  if (!googleConfigured) return Promise.reject(new Error('Google sign-in is not set up for this site yet. Use your username and password.'))
  return new Promise((resolve, reject) => {
    // Open the popup in the same click when the script is ready, so browsers do not block it.
    if (window.google?.accounts?.oauth2) openPopup(resolve, reject)
    else loadGoogle().then(() => openPopup(resolve, reject), reject)
  })
}
