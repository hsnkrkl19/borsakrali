import { getApiBase } from '../config'

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

export async function loginWithPassword({ email, password }) {
  const response = await fetch(getAuthEndpoint('login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone?.replace(/\D/g, '') || '',
    }),
  })

  return parseJsonResponse(response)
}

export async function fetchCurrentUser(token) {
  const response = await fetch(getAuthEndpoint('me'), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return parseJsonResponse(response)
}
