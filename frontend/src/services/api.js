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
    fetch(API_BASE_URL.replace(/\/api$/, '') + '/health', {
      method: 'GET',
      signal: AbortSignal.timeout(60000),
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

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config

    // 401 → logout
    if (error.response?.status === 401) {
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
