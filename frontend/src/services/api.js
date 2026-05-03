import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { getApiBase } from '../config'

const API_BASE_URL = getApiBase() + '/api'

// Capacitor (APK) ortamında Render uyuyorsa ilk istek 30-50sn sürebilir.
// Web (borsakrali.com) için kısa timeout yeterli.
const isNative = typeof window !== 'undefined'
  && typeof window.Capacitor?.isNativePlatform === 'function'
  && window.Capacitor.isNativePlatform()

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: isNative ? 60000 : 25000, // APK: 60s, Web: 25s
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
  },
})

// Ekstra: APK ilk açıldığında server'ı uyandır (fire-and-forget)
if (isNative && typeof fetch !== 'undefined') {
  try {
    fetch(API_BASE_URL.replace(/\/api$/, '') + '/health', {
      method: 'GET',
      signal: AbortSignal.timeout(60000),
    }).catch(() => { /* sessizce yut */ })
  } catch (_) { /* noop */ }
}

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor - Handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
