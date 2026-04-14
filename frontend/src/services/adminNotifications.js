import { getApiBase } from '../config'

function getAdminEndpoint(path) {
  return `${getApiBase()}/api/admin/${path}`
}

async function parseJsonResponse(response) {
  const data = await response.json().catch(() => ({}))

  if (!response.ok || data.success === false) {
    throw new Error(data.error || data.message || 'Islem basarisiz')
  }

  return data
}

function buildHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

export async function fetchAdminNotificationSummary(token) {
  const response = await fetch(getAdminEndpoint('notifications/summary'), {
    headers: buildHeaders(token),
  })

  return parseJsonResponse(response)
}

export async function sendBroadcastNotification(payload, token) {
  const response = await fetch(getAdminEndpoint('notifications/broadcast'), {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  })

  return parseJsonResponse(response)
}
