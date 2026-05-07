/**
 * Google Sign-In helper — cross-platform.
 *
 * Web: uses Google Identity Services (GIS) to fetch a Google ID token
 *      via the popup flow. The script is loaded on demand.
 * Native (Capacitor / Android): uses @capgo/capacitor-social-login
 *      which calls the native Google Sign-In SDK and returns an ID token.
 *
 * The resulting ID token is sent to /api/auth/google on the backend, which
 * exchanges it for a Supabase session.
 *
 * Required env (Vite):
 *   VITE_GOOGLE_CLIENT_ID  — OAuth Web Client ID from Google Cloud Console.
 *                            For native to work the same Web Client ID is used
 *                            as the `serverClientId` (we want a server-validated
 *                            ID token, not the Android-only one).
 */

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

let gisLoadPromise = null
let nativePluginPromise = null
let nativeInitDone = false

function getClientId() {
  const id =
    import.meta.env.VITE_GOOGLE_CLIENT_ID
    || import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID
    || ''
  return String(id || '').trim()
}

function isNativePlatform() {
  return typeof window !== 'undefined'
    && typeof window.Capacitor?.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform()
}

/* ─────────────────────────  WEB (GIS)  ───────────────────────── */

function loadGisScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('GIS web ortamı dışında yüklenemez'))
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google)
  }
  if (gisLoadPromise) return gisLoadPromise

  gisLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google))
      existing.addEventListener('error', () => reject(new Error('GIS yüklenemedi')))
      return
    }
    const s = document.createElement('script')
    s.src = GIS_SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve(window.google)
    s.onerror = () => reject(new Error('GIS yüklenemedi'))
    document.head.appendChild(s)
  })
  return gisLoadPromise
}

async function signInWeb() {
  const clientId = getClientId()
  if (!clientId) {
    throw new Error('Google istemci kimliği yapılandırılmamış (VITE_GOOGLE_CLIENT_ID)')
  }

  const google = await loadGisScript()

  return new Promise((resolve, reject) => {
    try {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response?.credential) {
            resolve({ idToken: response.credential, accessToken: null })
          } else {
            reject(new Error('Google girişi iptal edildi'))
          }
        },
        ux_mode: 'popup',
        auto_select: false,
        itp_support: true,
      })

      // Try silent first; fall back to popup via prompt() — GIS handles this.
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
          // User dismissed the One Tap; this is not an error if a button-flow is also wired.
          // We resolve with null so the caller can render an explicit button.
        }
      })
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Renders a Google-branded button into the supplied DOM container and
 * resolves with the ID token when the user completes the flow. This is
 * the most reliable web entrypoint (works around One-Tap dismissals).
 */
export async function renderGoogleButton(container, { theme = 'filled_black', size = 'large', text = 'continue_with', shape = 'rectangular' } = {}) {
  if (!container) throw new Error('Container element gerekli')
  const clientId = getClientId()
  if (!clientId) {
    throw new Error('Google istemci kimliği yapılandırılmamış (VITE_GOOGLE_CLIENT_ID)')
  }

  const google = await loadGisScript()

  return new Promise((resolve, reject) => {
    try {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response?.credential) {
            resolve({ idToken: response.credential, accessToken: null })
          } else {
            reject(new Error('Google girişi iptal edildi'))
          }
        },
        ux_mode: 'popup',
        auto_select: false,
        itp_support: true,
      })

      google.accounts.id.renderButton(container, {
        theme,
        size,
        text,
        shape,
        width: container.clientWidth || 320,
        logo_alignment: 'left',
      })
    } catch (err) {
      reject(err)
    }
  })
}

/* ─────────────────────────  NATIVE (Capacitor)  ───────────────────────── */

async function loadNativePlugin() {
  if (nativePluginPromise) return nativePluginPromise
  nativePluginPromise = (async () => {
    try {
      // Optional dep: only available when the Android shell installs it.
      // eslint-disable-next-line import/no-unresolved
      const mod = await import('@capgo/capacitor-social-login')
      return mod.SocialLogin
    } catch (err) {
      throw new Error(
        'Capacitor Social Login eklentisi kurulu değil. Lütfen şu komutu çalıştırın: '
        + 'npm i @capgo/capacitor-social-login && npx cap sync android'
      )
    }
  })()
  return nativePluginPromise
}

async function ensureNativeInit(SocialLogin) {
  if (nativeInitDone) return
  const clientId = getClientId()
  if (!clientId) {
    throw new Error('Google istemci kimliği yapılandırılmamış (VITE_GOOGLE_CLIENT_ID)')
  }
  await SocialLogin.initialize({
    google: {
      // OAuth Web Client ID — used as serverClientId on Android so we get
      // an ID token signed for our backend, not the Android-only token.
      webClientId: clientId,
    },
  })
  nativeInitDone = true
}

async function signInNative() {
  const SocialLogin = await loadNativePlugin()
  await ensureNativeInit(SocialLogin)
  const result = await SocialLogin.login({
    provider: 'google',
    options: { scopes: ['profile', 'email'] },
  })

  // @capgo/capacitor-social-login wraps payload in { provider, result: {...} }
  const r = result?.result || result
  const idToken = r?.idToken || r?.id_token || null
  const accessToken = r?.accessToken?.token || r?.accessToken || null

  if (!idToken) {
    throw new Error('Google ID token alınamadı')
  }
  return { idToken, accessToken }
}

/* ─────────────────────────  PUBLIC API  ───────────────────────── */

/**
 * Trigger the appropriate sign-in flow for the current platform.
 * Resolves with `{ idToken, accessToken }`.
 */
export async function signInWithGoogle() {
  if (isNativePlatform()) {
    return signInNative()
  }
  return signInWeb()
}

/** Best-effort sign-out for the native SDK (web flow is stateless). */
export async function signOutGoogle() {
  if (isNativePlatform()) {
    try {
      const SocialLogin = await loadNativePlugin()
      await SocialLogin.logout({ provider: 'google' })
    } catch {
      /* ignore */
    }
  } else if (typeof window !== 'undefined' && window.google?.accounts?.id) {
    try { window.google.accounts.id.disableAutoSelect() } catch { /* ignore */ }
  }
}

export function isGoogleConfigured() {
  return Boolean(getClientId())
}
