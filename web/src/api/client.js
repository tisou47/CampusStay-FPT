/*
 * HTTP client for the CampusStay API.
 *
 * Base URL: VITE_API_BASE_URL (default "/api"; in development Vite proxies /api to VITE_API_PROXY_TARGET).
 * Auth: the session token is sent as "Authorization: Bearer <token>". A 401 clears the session.
 * Errors: every non-2xx response, network failure or non-JSON body throws an ApiError.
 *   400 VALIDATION_FAILED carries details.fields = { fieldName: message }: forms show error.fields under their
 *   inputs, and error.message also lists them, so screens that only show the message still say what to fix.
 * Language: every request sends Accept-Language with the language in use (ADR-25), so the API answers its
 *   messages in Vietnamese or English; the client's own messages go through t().
 */

import { getLang, t } from '@/i18n'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')
const SESSION_KEY = 'campusstay-session'

export class ApiError extends Error {
  constructor(message, { status = 0, code, details, summary } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    /** Per-field messages of a validation error: { fieldName: message }. */
    this.fields = details?.fields ?? {}
    /** The server's message without the field messages (for forms that show those under the inputs). */
    this.summary = summary ?? message
  }
}

export function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) ?? null
  } catch {
    return null
  }
}

export function writeSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // Storage unavailable (private mode): the session lives only in memory.
  }
  window.dispatchEvent(new Event('campusstay:session'))
}

function buildUrl(path, query) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null || value === '') continue
    if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v))
    else url.searchParams.set(key, value)
  }
  return url
}

export async function request(path, { method = 'GET', query, body, signal, headers } = {}) {
  const token = readSession()?.token
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  let res
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': getLang(),
        ...(body != null && !isForm && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body == null ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(t('Cannot reach the CampusStay server. Check your connection and try again.'))
  }

  if (res.status === 401) writeSession(null)
  if (res.status === 204) return null

  const type = res.headers.get('content-type') ?? ''
  const data = type.includes('application/json') ? await res.json().catch(() => null) : null
  if (!res.ok) {
    const message = data?.message ?? (res.status >= 500 ? t('The server could not complete the request. Try again later.') : t('Request failed ({status}).', { status: res.status }))
    const fieldText = Object.values(data?.details?.fields ?? {}).filter(Boolean).join(' ')
    throw new ApiError(fieldText ? `${message} ${fieldText}` : message, { status: res.status, code: data?.code, details: data?.details, summary: message })
  }
  if (data == null && type && !type.includes('application/json')) {
    throw new ApiError(t('The server returned an unexpected response.'), { status: res.status })
  }
  return data
}

/** Downloads a file response (CSV/XLSX exports) and saves it with the server's file name. */
export async function download(path, { query, fallbackName = 'export.csv' } = {}) {
  const token = readSession()?.token
  let res
  try {
    res = await fetch(buildUrl(path, query), {
      headers: { 'Accept-Language': getLang(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
  } catch {
    throw new ApiError(t('Cannot reach the CampusStay server. Check your connection and try again.'))
  }
  if (!res.ok) throw new ApiError(t('Export failed ({status}).', { status: res.status }), { status: res.status })
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(await res.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const http = {
  get: (path, query, opts) => request(path, { ...opts, query }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  delete: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
}
