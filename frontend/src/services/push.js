import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { getApiBase } from '../config'
import { useAuthStore } from '../store/authStore'

const PUSH_TOKEN_STORAGE_KEY = 'bk_push_token'
const PUSH_CHANNEL_ID = 'borsa-krali-announcements'

let listenersAttached = false
let initialized = false

function isNativePlatform() {
  return typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform()
}

function getPushEndpoint(path) {
  return `${getApiBase()}/api/push/${path}`
}

function getHeaders() {
  const authToken = useAuthStore.getState().token
  return {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  }
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.success === false) {
    throw new Error(data.error || data.message || 'Push servisi hatasi')
  }
  return data
}

function storePushToken(token) {
  if (typeof window === 'undefined') return
  localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token)
}

function readStoredPushToken() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(PUSH_TOKEN_STORAGE_KEY) || ''
}

function resolveNavigationTarget(rawTarget) {
  const value = String(rawTarget || '').trim()
  if (!value) return ''

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value)
      if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`
      }
      return value
    } catch {
      return value
    }
  }

  return value.startsWith('/') ? value : `/${value}`
}

async function registerTokenWithBackend(pushToken) {
  const payload = {
    pushToken,
    platform: Capacitor.getPlatform(),
    appVersion: '3.1.0',
    bundleId: 'com.borsakrali.app',
  }

  const response = await fetch(getPushEndpoint('register'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  })

  return parseResponse(response)
}

async function ensureChannel() {
  try {
    await PushNotifications.createChannel({
      id: PUSH_CHANNEL_ID,
      name: 'Borsa Krali Duyurular',
      description: 'Admin duyurulari ve sistem bildirimleri',
      importance: 5,
      visibility: 1,
      sound: 'default',
    })
  } catch (error) {
    console.warn('[PUSH] Kanal olusturulamadi:', error?.message || error)
  }
}

async function attachListeners(onNavigate) {
  if (listenersAttached) return
  listenersAttached = true

  await PushNotifications.addListener('registration', async (token) => {
    try {
      storePushToken(token.value)
      await registerTokenWithBackend(token.value)
      console.info('[PUSH] Cihaz bildirime kaydedildi')
    } catch (error) {
      console.warn('[PUSH] Token backend kaydi basarisiz:', error?.message || error)
    }
  })

  await PushNotifications.addListener('registrationError', (error) => {
    console.warn('[PUSH] Kayit hatasi:', error?.error || error)
  })

  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.info('[PUSH] Bildirim alindi:', notification)
  })

  await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const data = event?.notification?.data || {}
    const target = resolveNavigationTarget(data.path || data.url)

    if (!target) return

    if (/^https?:\/\//i.test(target)) {
      window.location.href = target
      return
    }

    if (typeof onNavigate === 'function') {
      onNavigate(target)
    }
  })
}

export async function initializePushNotifications(onNavigate) {
  if (initialized || !isNativePlatform()) {
    return
  }

  initialized = true

  await ensureChannel()
  await attachListeners(onNavigate)

  let permission = await PushNotifications.checkPermissions()
  if (permission.receive === 'prompt') {
    permission = await PushNotifications.requestPermissions()
  }

  if (permission.receive !== 'granted') {
    console.warn('[PUSH] Bildirim izni verilmedi')
    return
  }

  await PushNotifications.register()
}

export async function syncStoredPushToken() {
  if (!isNativePlatform()) return

  const storedToken = readStoredPushToken()
  if (!storedToken) return

  try {
    await registerTokenWithBackend(storedToken)
  } catch (error) {
    console.warn('[PUSH] Sakli token esitlemesi basarisiz:', error?.message || error)
  }
}
