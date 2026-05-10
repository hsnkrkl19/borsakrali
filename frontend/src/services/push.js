/**
 * Push Notifications — @capacitor/push-notifications + FCM
 *
 * Akış:
 *  1) Native cihazda izin iste, FCM register et, listener'ları kur.
 *  2) Token alındıktan sonra backend /api/push/register'a gönder.
 *  3) Login state değişince syncStoredPushToken: yeni access token ile aynı
 *     FCM token'ı tekrar kaydet (kullanıcı eşlemesi backend'de güncellensin).
 *  4) pushNotificationActionPerformed: bildirime tıklayınca data.path'a navigate.
 *
 * Web platformunda hiç çalışmaz — Capacitor.isNativePlatform false ise no-op.
 */

import { PushNotifications } from '@capacitor/push-notifications'
import { getApiBase } from '../config'
import { useAuthStore } from '../store/authStore'

const STORAGE_KEY = 'bk-push-token'

function isNativePlatform() {
  return typeof window !== 'undefined'
    && typeof window.Capacitor?.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform()
}

async function postRegister(tokenValue) {
  const url = `${getApiBase()}/api/push/register`
  const accessToken = useAuthStore.getState().token
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        pushToken: tokenValue,
        platform: 'android',
        bundleId: 'com.borsakrali.app',
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

let initialized = false
let cachedToken = null

/**
 * Push notification altyapısını başlat. Sadece native platformda çalışır.
 * @param {(targetPath: string) => void} onNavigate — bildirime tıklayınca çağrılır
 */
export async function initializePushNotifications(onNavigate) {
  if (!isNativePlatform() || initialized) return
  initialized = true

  if (!PushNotifications) return

  // Mevcut izin durumu
  let permission
  try {
    permission = await PushNotifications.checkPermissions()
  } catch { /* ignore */ }

  // Henüz reddedilmemişse iste
  if (!permission || permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
    try {
      permission = await PushNotifications.requestPermissions()
    } catch { return }
  }

  if (permission?.receive !== 'granted') return

  // Listener'ları kur
  try {
    await PushNotifications.addListener('registration', async (token) => {
      const tokenValue = token?.value
      if (!tokenValue) return
      cachedToken = tokenValue
      try { localStorage.setItem(STORAGE_KEY, tokenValue) } catch { /* ignore */ }
      await postRegister(tokenValue)
    })

    await PushNotifications.addListener('registrationError', () => { /* sessiz */ })

    // Uygulama AÇIKKEN gelen bildirim — sistem tepsisine düşmez, in-app banner için
    // event yayınla (UI dispatch eder).
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      try { window.dispatchEvent(new CustomEvent('bk-push-foreground', { detail: notification })) } catch { /* ignore */ }
    })

    // Bildirime tıklandığında — uygulama açılır veya foreground'a gelir.
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action?.notification?.data || {}
      const path = data.path || ''
      if (typeof onNavigate === 'function' && path && path.startsWith('/')) {
        setTimeout(() => onNavigate(path), 50)
      }
    })
  } catch { /* ignore */ }

  // FCM token al
  try {
    await PushNotifications.register()
  } catch { /* ignore */ }
}

/**
 * Login state değişince mevcut FCM token'ı backend'e yeniden kaydet —
 * kullanıcı eşlemesi (userId) güncel kalsın.
 */
export async function syncStoredPushToken() {
  if (!isNativePlatform()) return
  let stored
  try { stored = localStorage.getItem(STORAGE_KEY) } catch { stored = null }
  const tokenValue = cachedToken || stored
  if (!tokenValue) return
  await postRegister(tokenValue)
}
