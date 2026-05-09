import { getApiBase } from '../config'
import api from './api'

function getAuthEndpoint(path) {
  return `${getApiBase()}/api/auth/${path}`
}

async function parseJsonResponse(response) {
  const data = await response.json().catch(() => ({}))

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || 'Islem basarisiz')
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
      throw new Error(data.error || data.message || 'Islem basarisiz')
    }
    return data
  }).catch((err) => {
    if (err?.response) {
      const data = err.response.data || {}
      throw new Error(data.error || data.message || 'Islem basarisiz')
    }
    throw err
  })
}

export async function loginWithPassword({ email, password }) {
  const response = await fetch(getAuthEndpoint('login'), {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  })

  return parseJsonResponse(response)
}

export async function registerWithPassword(payload) {
  const response = await fetch(getAuthEndpoint('register'), {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({
      ...payload,
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone?.replace(/\D/g, '') || '',
    }),
  })

  return parseJsonResponse(response)
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
  const response = await fetch(getAuthEndpoint('refresh'), {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ refreshToken }),
  })

  return parseJsonResponse(response)
}

export async function loginWithGoogle({ idToken, accessToken } = {}) {
  const response = await fetch(getAuthEndpoint('google'), {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ idToken, accessToken }),
  })

  return parseJsonResponse(response)
}

export async function changePassword({ currentPassword, newPassword }, _token) {
  return unwrapAxios(api.post('/auth/change-password', { currentPassword, newPassword }))
}
