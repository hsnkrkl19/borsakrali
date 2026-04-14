function stripApiSuffix(url) {
  return normalizeUrl(url).replace(/\/api$/i, '')
}

// Runtime-configurable server URL (stored in localStorage for mobile)
const DEFAULT_API_URL = stripApiSuffix(
  import.meta.env.VITE_API_BASE_URL
  || import.meta.env.VITE_API_URL
  || '',
)
const DEFAULT_NATIVE_API_URL = stripApiSuffix(
  import.meta.env.VITE_NATIVE_API_BASE_URL
  || import.meta.env.VITE_API_URL
  || DEFAULT_API_URL
  || 'https://borsakrali.com',
)

function normalizeUrl(url) {
  return (url || '').trim().replace(/\/$/, '')
}

function isLocalHostName(hostname = '') {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || /^192\.168\./.test(hostname)
    || /^10\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
}

function isLocalApiBase(url = '') {
  try {
    const parsed = new URL(url)
    return isLocalHostName(parsed.hostname)
  } catch {
    return /localhost|127\.0\.0\.1|10\.0\.2\.2/.test(url)
  }
}

function getStoredApiBase() {
  if (typeof window === 'undefined') return ''

  const stored = localStorage.getItem('borsakrali_server_url')
  return stripApiSuffix(stored)
}

function isNativePlatform() {
  return typeof window !== 'undefined'
    && typeof window.Capacitor?.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform()
}

function getNativeFallbackApiBase() {
  if (!import.meta.env.DEV) {
    return DEFAULT_NATIVE_API_URL
  }

  if (typeof navigator === 'undefined') return 'http://127.0.0.1:5000'

  const userAgent = navigator.userAgent || ''
  if (/Android/i.test(userAgent)) {
    // Android emulator routes host machine localhost through 10.0.2.2.
    return 'http://10.0.2.2:5000'
  }

  return 'http://127.0.0.1:5000'
}

export function getApiBase() {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    // On a real domain (not localhost/LAN), always use relative URLs.
    const isLocalNetwork = isLocalHostName(hostname)
    if (!isLocalNetwork) return ''

    const stored = getStoredApiBase()
    if (stored) {
      const invalidNativeLocalTarget = isNativePlatform()
        && !import.meta.env.DEV
        && isLocalApiBase(stored)
      if (!invalidNativeLocalTarget) return stored
    }

    if (isNativePlatform()) return getNativeFallbackApiBase()
    if (DEFAULT_API_URL) return DEFAULT_API_URL
    return 'http://127.0.0.1:5000'
  }
  return DEFAULT_API_URL || DEFAULT_NATIVE_API_URL
}

export function setApiBase(url) {
  localStorage.setItem('borsakrali_server_url', stripApiSuffix(url))
}

export function getSocketBase() {
  if (typeof window === 'undefined') return DEFAULT_API_URL

  return getApiBase() || window.location.origin
}

export const API_BASE = getApiBase()
