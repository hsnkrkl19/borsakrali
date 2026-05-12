import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { getApiBase } from '../config'

const API_BASE_URL = getApiBase() + '/api'

// Capacitor (APK) ortamında Render uyuyorsa ilk istek 30-50sn sürebilir.
const isNative = typeof window !== 'undefined'
  && typeof window.Capacitor?.isNativePlatform === 'function'
  && window.Capacitor.isNativePlatform()

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: isNative ? 60000 : 25000,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
  },
})

// === SERVER WAKEUP: Boot'ta uyandır + arada bir uyandırma garantisi ===
let lastWakeup = 0
function wakeupServer() {
  if (typeof fetch === 'undefined') return
  const now = Date.now()
  if (now - lastWakeup < 30000) return // 30sn'de bir
  lastWakeup = now
  try {
    // AbortController kullan (AbortSignal.timeout eski Android WebView'da yok!)
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 60000)
    fetch(API_BASE_URL.replace(/\/api$/, '') + '/health', {
      method: 'GET',
      signal: ctrl.signal,
    }).catch(() => {})
  } catch (_) {}
}
if (isNative) wakeupServer()

// === REQUEST INTERCEPTOR ===
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // Retry counter
    if (config.__retryCount === undefined) config.__retryCount = 0
    return config
  },
  (error) => Promise.reject(error)
)

// === RESPONSE INTERCEPTOR — RETRY + 401 + GRACEFUL ERROR ===
const MAX_RETRIES = 3
const isRetryable = (error) => {
  // Network error veya timeout
  if (!error.response) return true
  // 5xx, 502, 503, 504 retry
  const status = error.response.status
  return status === 502 || status === 503 || status === 504 || status === 408
}

// Aynı anda birden fazla istek 401 yerse hepsini tek bir refresh promise'ine
// bağlıyoruz — yoksa Supabase her refresh_token'ı tek kullanımlık döndürür ve
// peş peşe gelen refresh çağrıları birbirini geçersiz kılar.
let refreshPromise = null

async function tryRefreshAccessToken() {
  if (refreshPromise) return refreshPromise

  const { refreshToken } = useAuthStore.getState()
  if (!refreshToken) return null

  refreshPromise = (async () => {
    try {
      // services/auth.js'i import etmek yerine doğrudan istek — döngüsel
      // bağımlılığı önlüyor. Native ortamda CapacitorHttp plugin'i fetch'i
      // patch'liyor ama bazen POST gövdesini düşürüyor; bu yüzden native'de
      // CapacitorHttp.request'i doğrudan çağırıyoruz.
      let data = null
      if (isNative) {
        const { CapacitorHttp } = await import('@capacitor/core')
        const res = await CapacitorHttp.request({
          url: `${API_BASE_URL}/auth/refresh`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: { refreshToken },
          connectTimeout: 60000,
          readTimeout: 60000,
        })
        if (res.status < 200 || res.status >= 300) return null
        data = typeof res.data === 'string'
          ? (() => { try { return JSON.parse(res.data) } catch { return null } })()
          : res.data
      } else {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        data = await res.json().catch(() => ({}))
        if (!res.ok) return null
      }

      if (!data?.success || !data?.token) return null
      useAuthStore.getState().updateTokens({
        token: data.token,
        refreshToken: data.refreshToken,
      })
      return data.token
    } catch (_) {
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config

    // 401 → önce refresh dene, başarısızsa logout
    if (error.response?.status === 401 && config && !config.__refreshAttempted) {
      // Demo kullanıcı sahte token ile geziyor; backend her zaman 401 döner.
      // Otomatik logout zincirini başlatmıyoruz; istek sessizce reddedilir.
      const stateNow = useAuthStore.getState()
      if (stateNow.user?.isDemo || stateNow.token === 'demo-token-full-access') {
        return Promise.reject(error)
      }

      // /auth/refresh çağrısının kendisi 401 dönerse sonsuz döngüye girmesin
      if (typeof config.url === 'string' && config.url.includes('/auth/refresh')) {
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          try { useAuthStore.getState().logout() } catch (_) {}
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }

      config.__refreshAttempted = true
      const newToken = await tryRefreshAccessToken()
      if (newToken) {
        config.headers = config.headers || {}
        config.headers.Authorization = `Bearer ${newToken}`
        return apiClient(config)
      }

      // Refresh başarısız — kullanıcıyı login'e yönlendir
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        try { useAuthStore.getState().logout() } catch (_) {}
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }

    // Retry network/5xx errors with exponential backoff
    if (config && isRetryable(error) && config.__retryCount < MAX_RETRIES) {
      config.__retryCount += 1
      const delay = Math.min(1000 * Math.pow(2, config.__retryCount - 1), 8000) // 1s, 2s, 4s
      console.warn(`[api retry ${config.__retryCount}/${MAX_RETRIES}] ${config.url} (${error.message}) - ${delay}ms sonra`)
      // Wake up server on first retry
      if (config.__retryCount === 1 && isNative) wakeupServer()
      await new Promise(r => setTimeout(r, delay))
      return apiClient(config)
    }

    return Promise.reject(error)
  }
)

// Global hata yakalama (uncaught promise rejection) - APK çökmesin
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('[unhandledrejection]', event.reason?.message || event.reason)
    // Network hatası ise sessizce yut
    if (event.reason?.message?.includes('Network Error') ||
        event.reason?.message?.includes('timeout') ||
        event.reason?.code === 'ERR_NETWORK') {
      event.preventDefault()
    }
  })
  window.addEventListener('error', (event) => {
    console.warn('[window.error]', event.message)
  })
}

export default apiClient
