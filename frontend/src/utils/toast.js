/**
 * Parça 4 — Toast helpers.
 *
 * Sade global toast — bağımlılık (react-hot-toast vb.) yok. Custom event
 * dispatch eder; ToastHost component'i bunu dinler ve render eder.
 *
 * Kullanım:
 *   import { showError, showSuccess } from '../utils/toast'
 *   try { ... } catch (e) { showError(e) }
 *   showSuccess('THYAO takip listene eklendi.')
 */

import { mapApiError } from './locale'

const EVENT_NAME = 'bk-toast'

/** Hatadan veya stringten kullanıcıya uygun mesaj çıkar */
export function showError(errOrMessage) {
  const message = typeof errOrMessage === 'string'
    ? errOrMessage
    : mapApiError(errOrMessage)
  dispatch({ kind: 'error', message })
}

export function showSuccess(message) {
  if (!message) return
  dispatch({ kind: 'success', message: String(message) })
}

export function showInfo(message) {
  if (!message) return
  dispatch({ kind: 'info', message: String(message) })
}

function dispatch(detail) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { ...detail, id: Date.now() + Math.random() } }))
  } catch { /* ignore */ }
}

export const TOAST_EVENT = EVENT_NAME
