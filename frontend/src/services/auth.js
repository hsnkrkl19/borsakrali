import { getApiBase } from '../config'
import api from './api'

function getAuthEndpoint(path) {
  return `${getApiBase()}/api/auth/${path}`
}

function isNativePlatform() {
  return typeof window !== 'undefined'
    && typeof window.Capacitor?.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform()
}

/**
 * Capacitor Android'de native WebView'ın fetch() implementasyonu, CapacitorHttp
 * plugin'i ile sarılınca POST gövdesini sessizce düşürebiliyor (özellikle
 * Cloudflare üzerinden 307 / TLS handshake'leri öncesinde). Login + Register
 * + Google login bu yüzden "Bilinmeyen hata" ya da boş yanıt üretiyordu. Bu
 * sebeple native ortamda CapacitorHttp'i doğrudan çağırıp gövdeyi obje olarak
 * teslim ediyoruz. Web'de standart fetch yolu korunur (Vite proxy / browser).
 */
async function nativeHttpJson(url, { method = 'POST', headers = {}, body = null } = {}) {
  const { CapacitorHttp } = await import('@capacitor/core')
  const data = body && typeof body === 'string'
    ? safeParseJson(body)
    : (body || undefined)

  const response = await CapacitorHttp.request({
    url,
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    // CapacitorHttp Content-Type application/json olunca JSON.stringify yapıyor
    data,
    // Render free instance uyanırken 30sn+ sürebiliyor
    connectTimeout: 60000,
    readTimeout: 60000,
  })

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    rawData: response.data,
  }
}

function safeParseJson(str) {
  try { return JSON.parse(str) } catch { return undefined }
}

async function httpPostJson(url, payload, { token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  if (isNativePlatform()) {
    const { ok, status, rawData } = await nativeHttpJson(url, {
      method: 'POST',
      headers,
      body: payload,
    })
    const data = typeof rawData === 'string' ? safeParseJson(rawData) || {} : (rawData || {})
    if (!ok || !data.success) {
      const message = data.error || data.message
        || (status === 0 ? 'Sunucuya ulaşılamıyor (ağ hatası)' : `Sunucu hatası (${status})`)
      throw new Error(message)
    }
    return data
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  return parseJsonResponse(response)
}

async function parseJsonResponse(response) {
  const data = await response.json().catch(() => ({}))

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || 'İşlem başarısız')
  }

  return data
}

function buildAuthHeaders(token) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// Auth-protected çağrılar için axios sarmalayıcısı — interceptor'daki refresh
// akışından faydalansın diye. Eski Error.message imzasını koruyoruz.
function unwrapAxios(promise) {
  return promise.then((r) => {
    const data = r.data || {}
    if (data.success === false) {
      throw new Error(data.error || data.message || 'İşlem başarısız')
    }
    return data
  }).catch((err) => {
    if (err?.response) {
      const data = err.response.data || {}
      throw new Error(data.error || data.message || 'İşlem başarısız')
    }
    throw err
  })
}

export async function loginWithPassword({ email, password }) {
  return httpPostJson(getAuthEndpoint('login'), {
    email: email.trim().toLowerCase(),
    password,
  })
}

export async function registerWithPassword(payload) {
  return httpPostJson(getAuthEndpoint('register'), {
    ...payload,
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone?.replace(/\D/g, '') || '',
  })
}

// token parametresi geriye uyumluluk için duruyor — apiClient interceptor
// store'dan otomatik ekliyor ve 401'de refresh deniyor.
export async function fetchCurrentUser(_token) {
  return unwrapAxios(api.get('/auth/me'))
}

// Refresh akışı api.js interceptor tarafından 401 görüldüğünde çağrılıyor.
// Token süresi dolmuş kullanıcı yeniden login'e atılmadan önce burada bir
// kez refresh denenmeli — başarısızsa logout.
export async function refreshAccessToken(refreshToken) {
  return httpPostJson(getAuthEndpoint('refresh'), { refreshToken })
}

export async function loginWithGoogle({ idToken, accessToken } = {}) {
  return httpPostJson(getAuthEndpoint('google'), { idToken, accessToken })
}

export async function changePassword({ currentPassword, newPassword }, _token) {
  return unwrapAxios(api.post('/auth/change-password', { currentPassword, newPassword }))
}
