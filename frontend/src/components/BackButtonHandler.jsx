import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Android hardware back-button handler.
 *
 * Behaviour (matches the user's spec):
 *   • If the user is NOT on the home page (`/`), the back button navigates
 *     back to `/` (i.e. it never closes the app from a sub-page).
 *   • If the user IS on the home page, the first press shows a toast
 *     "Çıkmak için tekrar geri tuşuna basın" and only the SECOND press
 *     within 2 seconds actually exits the app.
 *
 * Implementation notes:
 *   • Uses @capacitor/app's `backButton` event. The event is only emitted on
 *     the native Android shell — so this is a no-op on web / iOS.
 *   • If a sidebar / modal is open we also let the back button close it
 *     first by dispatching a synthetic Escape key event (the existing UI
 *     listens to clicks on the overlay; pressing Escape is the standard
 *     fallback). This keeps the UX consistent without requiring every
 *     modal to register its own listener.
 */
export default function BackButtonHandler() {
  const navigate = useNavigate()
  const location = useLocation()
  const exitArmedAt = useRef(0)
  const toastTimerRef = useRef(null)

  // Keep the latest location accessible inside the (long-lived) listener.
  const locationRef = useRef(location)
  useEffect(() => { locationRef.current = location }, [location])

  useEffect(() => {
    let cleanup = () => {}
    let cancelled = false

    ;(async () => {
      // Web / iOS: no-op
      if (typeof window === 'undefined') return
      const isNative =
        typeof window.Capacitor?.isNativePlatform === 'function'
        && window.Capacitor.isNativePlatform()
      if (!isNative) return

      let App
      try {
        const mod = await import('@capacitor/app')
        App = mod.App
      } catch {
        // Plugin not installed — silently do nothing.
        return
      }
      if (cancelled || !App) return

      const handler = await App.addListener('backButton', () => {
        const path = locationRef.current?.pathname || '/'

        // 1) If a mobile drawer / modal is open, close it first.
        //    (Detect via document.body overflow lock or the standard data attr.)
        const drawer = document.querySelector('.fixed.inset-0.bg-black\\/60')
        if (drawer) {
          // Click the overlay to close — this is what the existing UI uses.
          drawer.click?.()
          return
        }

        // 2) Not on home → go home (always).
        if (path !== '/' && path !== '') {
          // Reset the double-press exit timer if the user navigates away.
          exitArmedAt.current = 0
          if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current)
            toastTimerRef.current = null
          }
          navigate('/')
          return
        }

        // 3) On home → require two presses within 2 s to exit.
        const now = Date.now()
        if (exitArmedAt.current && (now - exitArmedAt.current) < 2000) {
          exitArmedAt.current = 0
          if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current)
            toastTimerRef.current = null
          }
          // Try the official exitApp first; some Capacitor builds also
          // expose `minimizeApp` which is friendlier on Android.
          try {
            if (typeof App.exitApp === 'function') {
              App.exitApp()
              return
            }
          } catch { /* ignore */ }
          try {
            if (typeof App.minimizeApp === 'function') {
              App.minimizeApp()
            }
          } catch { /* ignore */ }
          return
        }

        // First press on home → arm + show toast.
        exitArmedAt.current = now
        showExitToast()
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        toastTimerRef.current = setTimeout(() => {
          exitArmedAt.current = 0
          toastTimerRef.current = null
        }, 2000)
      })

      cleanup = () => {
        try { handler?.remove?.() } catch { /* ignore */ }
        if (toastTimerRef.current) {
          clearTimeout(toastTimerRef.current)
          toastTimerRef.current = null
        }
      }
    })()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [navigate])

  return null
}

/* ───────────  Lightweight, dependency-free toast  ─────────── */

const TOAST_ID = 'bk-exit-toast'

function showExitToast(message = 'Çıkmak için tekrar geri tuşuna basın') {
  if (typeof document === 'undefined') return

  let el = document.getElementById(TOAST_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = TOAST_ID
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    el.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:84px',
      'transform:translateX(-50%) translateY(8px)',
      'background:rgba(15,23,42,0.92)',
      'color:#fde68a',
      'border:1px solid rgba(212,175,55,0.35)',
      'padding:10px 16px',
      'border-radius:12px',
      'font-size:13px',
      'font-weight:600',
      'letter-spacing:0.01em',
      'box-shadow:0 8px 24px rgba(0,0,0,0.45)',
      'z-index:9999',
      'opacity:0',
      'pointer-events:none',
      'transition:opacity 160ms ease, transform 160ms ease',
      'backdrop-filter:blur(6px)',
      '-webkit-backdrop-filter:blur(6px)',
      'max-width:88vw',
      'text-align:center',
    ].join(';')
    document.body.appendChild(el)
  }

  el.textContent = message
  // Trigger transition
  requestAnimationFrame(() => {
    el.style.opacity = '1'
    el.style.transform = 'translateX(-50%) translateY(0)'
  })

  clearTimeout(el._hideTimer)
  el._hideTimer = setTimeout(() => {
    el.style.opacity = '0'
    el.style.transform = 'translateX(-50%) translateY(8px)'
  }, 1800)
}
