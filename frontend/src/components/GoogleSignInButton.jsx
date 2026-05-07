import { useEffect, useRef, useState } from 'react'
import { Loader } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { loginWithGoogle } from '../services/auth'
import {
  signInWithGoogle,
  renderGoogleButton,
  isGoogleConfigured,
} from '../services/googleAuth'

function isNativePlatform() {
  return typeof window !== 'undefined'
    && typeof window.Capacitor?.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform()
}

/**
 * Drop-in Google Sign-In button.
 *
 * - On native (Android Capacitor): renders our own styled button that
 *   triggers the native Google Sign-In SDK.
 * - On web: mounts the official Google-branded button via GIS for trust
 *   + automatic localization, and falls back to a styled button if GIS
 *   can't render (e.g. blocked, hidden iframe, container width 0).
 */
export default function GoogleSignInButton({
  onError,
  redirectTo = '/',
  label = 'Google ile devam et',
}) {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const containerRef = useRef(null)
  const native = isNativePlatform()
  const configured = isGoogleConfigured()

  const completeLogin = async ({ idToken, accessToken }) => {
    setLoading(true)
    try {
      const data = await loginWithGoogle({ idToken, accessToken })
      if (data?.user && data?.token) {
        login(data.user, data.token)
        navigate(redirectTo)
      } else {
        throw new Error(data?.error || 'Google girişi başarısız')
      }
    } catch (err) {
      onError?.(err?.message || 'Google girişi başarısız')
    } finally {
      setLoading(false)
    }
  }

  // Web: mount official GIS button. On any failure, fall back to our styled button.
  useEffect(() => {
    if (native || useFallback || !configured) return
    if (!containerRef.current) return

    let cancelled = false
    renderGoogleButton(containerRef.current, {
      theme: 'filled_black',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
    })
      .then((tokens) => {
        if (cancelled) return
        completeLogin(tokens)
      })
      .catch(() => {
        // GIS never resolves until the user clicks; this catch only triggers on render errors.
        if (!cancelled) setUseFallback(true)
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native, useFallback, configured])

  const handleManualClick = async () => {
    if (loading) return
    try {
      const tokens = await signInWithGoogle()
      if (tokens?.idToken) {
        await completeLogin(tokens)
      }
    } catch (err) {
      onError?.(err?.message || 'Google girişi başarısız')
    }
  }

  if (!configured) {
    // Don't render anything if Google client id wasn't configured — keeps the UI clean.
    return null
  }

  // Native or fallback: render our own styled button.
  if (native || useFallback) {
    return (
      <button
        type="button"
        onClick={handleManualClick}
        disabled={loading}
        className="w-full relative overflow-hidden rounded-xl py-3 px-4 flex items-center justify-center gap-2.5 font-semibold text-[13px] transition-all group disabled:opacity-60"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          color: '#1f2937',
        }}
        aria-label={label}
      >
        {loading ? (
          <>
            <Loader className="w-4 h-4 animate-spin text-slate-700" />
            <span>Bağlanıyor…</span>
          </>
        ) : (
          <>
            <GoogleGlyph />
            <span>{label}</span>
          </>
        )}
      </button>
    )
  }

  // Web: container that GIS will render the official button into. We also overlay
  // a loading state once a credential is received and we're hitting our backend.
  return (
    <div className="relative w-full">
      <div ref={containerRef} className="w-full flex justify-center" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-[1px]">
          <Loader className="w-4 h-4 animate-spin text-white" />
        </div>
      )}
    </div>
  )
}

function GoogleGlyph() {
  // Multi-color "G" — the only Google asset allowed for sign-in buttons.
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.094 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  )
}
